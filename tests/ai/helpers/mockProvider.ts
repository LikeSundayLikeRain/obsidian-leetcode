// tests/ai/helpers/mockProvider.ts
// Phase 07 Plan 01 Task 1 — shared test helper consumed by Plans 02–06 tests.
//
// Provides:
//   - `makeFetcherMock()`: vi.fn() typed to the FetchFn signature used by the
//     Vercel AI SDK custom-fetcher hook (Plan 07-02 swaps `requestUrl` in via
//     the same signature for CORS-bypassed live calls).
//   - `mockResponse(body, init)`: stringifies a JSON body into a real Response
//     so Plan 07-04 (probe) tests can assert on `.ok`/`.status`.
//
// The signature deliberately matches global `fetch` so test fixtures can be
// passed directly to any adapter that accepts a `FetchFn`-shaped argument.

import { vi } from 'vitest';

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Returns a vitest mock function typed to the FetchFn signature. Default
 * behavior is undefined — callers must `mockResolvedValueOnce(...)` (or
 * similar) before exercising the code under test.
 */
export function makeFetcherMock(): ReturnType<typeof vi.fn<FetchFn>> {
  return vi.fn<FetchFn>();
}

/**
 * Build a real `Response` object backed by a JSON-stringified body. Matches
 * the shape that real LC / provider adapters return after a successful HTTP
 * call. Used by Plans 04 (probe) and 02 (adapter) tests.
 */
export function mockResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}
