// tests/solve/mocks/fakeFetcher.ts
// Scripted-response fake for `requestUrl` from `obsidian`. Tests queue responses
// per URL pattern, then drive the code under test and assert request shape via
// the returned spy. Modeled on the `mockRequestUrl` pattern in
// tests/fetcher-install.test.ts (lines 6-32) — this helper adds a per-URL FIFO
// queue so polling tests can script a terminal-state payload on the Nth call.
//
// Example — polling terminal state:
//   const { fetcher, queue, spy } = makeFakeFetcher();
//   queue(/check\/$/, [
//     { status: 200, json: { state: 'STARTED' } },
//     { status: 200, json: { state: 'STARTED' } },
//     { status: 200, json: acceptedFixture },      // from fixtures/accepted.json
//   ]);
//   // ... drive code under test; assert on spy.mock.calls
//
// Example — submit shape:
//   const { fetcher, queue, spy } = makeFakeFetcher();
//   queue('https://leetcode.com/problems/two-sum/submit/', [
//     { status: 200, json: { submission_id: 42 } },
//   ]);
//   await submit({ fetcher, slug: 'two-sum', ... });
//   expect(spy).toHaveBeenCalledWith(expect.objectContaining({
//     url: 'https://leetcode.com/problems/two-sum/submit/',
//     method: 'POST',
//     headers: expect.objectContaining({ 'x-csrftoken': expect.any(String) }),
//   }));
//
// Example — 429 rate-limit simulation:
//   queue('https://leetcode.com/graphql', [{ status: 429, headers: { 'retry-after': '5' } }]);
//
// Example — session-expiry simulation:
//   queue('https://leetcode.com/problems/two-sum/submit/', [{ status: 302, headers: { location: '/accounts/login/' } }]);
//
// Example — unqueued URL throws loudly:
//   const { fetcher } = makeFakeFetcher();
//   await expect(fetcher({ url: 'https://x.example', method: 'GET' }))
//     .rejects.toThrow(/no response queued/);

import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { vi, type Mock } from 'vitest';

/** A scripted response to be returned by the fake fetcher. */
export interface MockResponse {
  status: number;
  headers?: Record<string, string>;
  /** If provided and `text` is not, `text` defaults to `JSON.stringify(json)`. */
  json?: unknown;
  /** If provided and `json` is not, `json` defaults to `{}`. */
  text?: string;
}

/** Public facade returned by `makeFakeFetcher`. */
export interface FakeFetcher {
  /** Drop-in for obsidian's `requestUrl`: `(params) => Promise<RequestUrlResponse>`. */
  fetcher: (params: RequestUrlParam) => Promise<RequestUrlResponse>;
  /** Append N responses for URLs matching `url` (exact string or RegExp). FIFO. */
  queue: (url: string | RegExp, responses: MockResponse[]) => void;
  /** Vitest spy wrapping `fetcher`. Use for `expect(spy).toHaveBeenCalledWith(...)`. */
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

/**
 * Build a fake fetcher with a scripted per-URL response queue.
 *
 * Multiple calls to `queue()` for the same URL pattern ACCUMULATE into a FIFO.
 * Each invocation of `fetcher({ url, ... })` consumes ONE response from the
 * first matching queue. If NO queue matches, the fetcher throws loudly — this
 * prevents silent test passes caused by forgetting to script a response.
 *
 * Returned `spy` is a `vi.fn()` wrapping the fetcher so tests can assert on
 * request parameters directly: `expect(spy).toHaveBeenCalledWith(...)`.
 */
export function makeFakeFetcher(): FakeFetcher {
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
      `fakeFetcher: no response queued for ${url} (method: ${params.method ?? 'GET'}). ` +
        `Queue matching responses via fakeFetcher.queue(url, [...]) BEFORE the code under ` +
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
