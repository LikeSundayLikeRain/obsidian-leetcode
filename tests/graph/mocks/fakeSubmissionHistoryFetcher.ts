// tests/graph/mocks/fakeSubmissionHistoryFetcher.ts
//
// Phase 4 Wave 0 — FIFO-queue fake for the LC submission-history surface.
// Mirrors tests/solve/mocks/fakeFetcher.ts (Phase 3 pattern) verbatim and adds
// two fixture-loader helpers that read from tests/fixtures/lc-submissions/.
//
// Scripted shape (per URL regex or exact string) — copy-paste compatible with
// Phase 3's makeFakeFetcher so tests reading submissions are ergonomically
// indistinguishable from tests reading /submit/ or /check/:
//
//   const { fetcher, queue, spy } = makeFakeSubmissionHistoryFetcher();
//   queue(/api\/submissions\/two-sum/, [
//     { status: 200, json: loadListFixture('list-many') },
//   ]);
//   queue(/submissions\/detail\/123/, [
//     { status: 200, text: loadDetailFixture('detail-ac') },
//   ]);
//   // ... drive submissionHistoryClient; assert on spy.mock.calls
//
// Fixture loader helpers read live-captured JSON/HTML from
// tests/fixtures/lc-submissions/ — the files are captured by the plugin
// author against their own LC account in Task 2 of Plan 04-01 and scrubbed
// of PII before commit.

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

export type ListFixtureName = 'list-many' | 'list-empty';
export type DetailFixtureName = 'detail-ac' | 'detail-wa' | 'list-session-expired';

/** Load a list-shaped JSON fixture. Returns the parsed JSON body LC serves
 *  at GET /api/submissions/{slug}. */
export function loadListFixture(name: ListFixtureName): unknown {
  const path = resolve(FIXTURE_DIR, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** Load a detail-shaped HTML fixture. Returns the raw HTML LC serves at
 *  GET /submissions/detail/{id}/ — contains the `var pageData = {...};`
 *  block the production scraper parses. `list-session-expired` returns
 *  the login-redirect HTML body. */
export function loadDetailFixture(name: DetailFixtureName): string {
  const path = resolve(FIXTURE_DIR, `${name}.html`);
  return readFileSync(path, 'utf-8');
}
