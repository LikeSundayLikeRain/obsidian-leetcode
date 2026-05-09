// tests/graph/mocks/fakeSubmissionHistoryFetcher.ts
//
// Phase 4 Wave 0 — FIFO-queue fake for the LC submission-history GraphQL surface.
// Mirrors tests/solve/mocks/fakeFetcher.ts (Phase 3 pattern) and exposes fixture
// loaders that read from tests/fixtures/lc-submissions/. Post-2026-05-09 GraphQL
// drift: LC's list + detail surfaces both use POST /graphql/ — operations
// `submissionList` (questionSubmissionList) and `submissionDetails`. Legacy REST
// JSON fixtures (list-many.json, list-empty.json, list-session-expired.json)
// remain accessible for the D-30 JSON-401 session-expiry subtest.

import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi, type Mock } from 'vitest';

/** Scripted response. Matches MockResponse in tests/solve/mocks/fakeFetcher.ts. */
export interface MockResponse {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
}

/** Public facade returned by makeFakeSubmissionHistoryFetcher. */
export interface FakeSubmissionHistoryFetcher {
  fetcher: (params: RequestUrlParam) => Promise<RequestUrlResponse>;
  queue: (url: string | RegExp, responses: MockResponse[]) => void;
  spy: Mock<(params: RequestUrlParam) => Promise<RequestUrlResponse>>;
}

interface ScriptEntry {
  matcher: string | RegExp;
  queue: MockResponse[];
}

function urlMatches(matcher: string | RegExp, url: string): boolean {
  if (typeof matcher === 'string') return url === matcher;
  return matcher.test(url);
}

function normalize(resp: MockResponse): RequestUrlResponse {
  const headers = resp.headers ?? { 'content-type': 'application/json' };
  let text: string;
  let json: unknown;
  if (resp.text !== undefined && resp.json !== undefined) {
    text = resp.text;
    json = resp.json;
  } else if (resp.json !== undefined) {
    json = resp.json;
    text = JSON.stringify(resp.json);
  } else if (resp.text !== undefined) {
    text = resp.text;
    json = {};
  } else {
    text = '';
    json = {};
  }
  return {
    status: resp.status,
    headers,
    text,
    json,
    arrayBuffer: new ArrayBuffer(0),
  } as RequestUrlResponse;
}

export function makeFakeSubmissionHistoryFetcher(): FakeSubmissionHistoryFetcher {
  const scripts: ScriptEntry[] = [];

  const impl = async (params: RequestUrlParam): Promise<RequestUrlResponse> => {
    const url = typeof params.url === 'string' ? params.url : String(params.url);
    for (const entry of scripts) {
      if (urlMatches(entry.matcher, url)) {
        const next = entry.queue.shift();
        if (next !== undefined) {
          return normalize(next);
        }
      }
    }
    throw new Error(
      `fakeSubmissionHistoryFetcher: no response queued for ${url} (method: ${params.method ?? 'GET'}). ` +
        `Queue matching responses via fakeSubmissionHistoryFetcher.queue(url, [...]) BEFORE the code under ` +
        `test calls requestUrl.`
    );
  };

  const spy = vi.fn(impl);

  return {
    fetcher: spy as unknown as (params: RequestUrlParam) => Promise<RequestUrlResponse>,
    queue(matcher: string | RegExp, responses: MockResponse[]): void {
      const existing = scripts.find((s) => s.matcher === matcher);
      if (existing) {
        existing.queue.push(...responses);
      } else {
        scripts.push({ matcher, queue: [...responses] });
      }
    },
    spy,
  };
}

// ─── Fixture loaders ─────────────────────────────────────────────────────────
// Fixtures live at tests/fixtures/lc-submissions/ and are captured from live LC
// in Plan 04-01 Task 2. These helpers simply read + parse so test bodies don't
// repeat the fs dance.

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/lc-submissions');

export type FixtureName =
  | 'list-many'
  | 'list-empty'
  | 'list-session-expired'
  | 'list-many.graphql'
  | 'detail-ac.graphql'
  | 'detail-wa.graphql';

export type ListFixtureName = FixtureName;
export type DetailFixtureName = FixtureName;

/** Load a JSON fixture. All fixtures on disk are JSON (post-2026-05-09 drift).
 *  Caller casts the returned `unknown` to the appropriate shape. */
export function loadListFixture(name: FixtureName): unknown {
  const path = resolve(FIXTURE_DIR, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** Alias for `loadListFixture` — kept for ergonomic symmetry in detail tests. */
export function loadDetailFixture(name: FixtureName): unknown {
  return loadListFixture(name);
}
