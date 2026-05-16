// tests/helpers/electronNetStub.ts
//
// Phase 08 Plan 02 Task 1 — mock helper for electron.net.fetch with signal-
// aware abort behavior. Reused by 08-02 (per-provider abortSignal tests +
// electronNet.signal test) and 08-03 (AIStreamModal stream-path tests).
//
// Two modes:
//
//   1. Streaming (responseChunks supplied) — returns a Response whose body is
//      a ReadableStream emitting chunks one at a time with optional inter-
//      chunk delay. If init.signal aborts mid-stream the controller errors
//      with AbortError; the consuming for-await rejects on next chunk.
//
//   2. Buffered (bufferedText supplied) — returns a Response whose `text()`
//      resolves to bufferedText after delayMs. Pre-aborted signal short-
//      circuits the call to a rejected promise (DOMException-shaped
//      AbortError) BEFORE any data is read; aborting after the call starts
//      mid-delay also rejects with AbortError.
//
// The stub honors the `init.signal` field as if it came from a real
// electron.net.fetch call. Phase 08 Plan 02 Task 2's electronNet.signal.test
// validates this behavior (Assumption A1 enforcement).
//
// NOTE: The returned `fetch` is typed loosely as a function compatible with
// the FetchFn shape used by `obsidianFetch` (input: RequestInfo|URL|string,
// init?: RequestInit). It is NOT bound to globalThis.fetch and does not
// honor every esoteric Fetch-API option (only `signal` matters for our
// abort semantics).

export interface MockElectronNetOptions {
  /** Stream of text chunks to emit. Mutually exclusive with bufferedText. */
  responseChunks?: string[];
  /** Single-shot fallback text. Used when responseChunks is omitted. */
  bufferedText?: string;
  /** Per-chunk delay (streaming) OR pre-resolve delay (buffered). Default 0. */
  delayMs?: number;
  /** HTTP status; default 200. */
  status?: number;
  /** Optional response headers. */
  headers?: Record<string, string>;
}

export interface MockElectronNet {
  fetch: (
    input: RequestInfo | URL | string,
    init?: RequestInit,
  ) => Promise<Response>;
}

/**
 * Build an AbortError that mimics the DOMException raised by real fetch
 * implementations on signal-aborted requests. The for-await chain inside the
 * AI SDK's stream consumer checks `signal.aborted` first so the actual error
 * shape matters less than the rejection happening at all — but keeping the
 * `name === 'AbortError'` matches WHATWG-spec behavior so tests using
 * `err.name === 'AbortError'` (legacy pattern) also work.
 */
function makeAbortError(): Error {
  // DOMException not always available in test env; use a plain Error with
  // name='AbortError' which is the convention global fetch uses too.
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(makeAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createMockElectronNet(opts: MockElectronNetOptions = {}): MockElectronNet {
  const status = opts.status ?? 200;
  const headers = opts.headers ?? { 'content-type': 'text/plain; charset=utf-8' };
  const delayMs = opts.delayMs ?? 0;

  const fetchImpl = async (
    _input: RequestInfo | URL | string,
    init?: RequestInit,
  ): Promise<Response> => {
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) {
      throw makeAbortError();
    }

    if (Array.isArray(opts.responseChunks) && opts.responseChunks.length > 0) {
      const chunks = [...opts.responseChunks];
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for (const chunk of chunks) {
              if (signal?.aborted) {
                controller.error(makeAbortError());
                return;
              }
              if (delayMs > 0) {
                await sleep(delayMs, signal);
              }
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
        cancel() {
          // ReadableStream.cancel called by consumer (e.g. reader.cancel()).
          // No additional teardown needed — chunks loop exits when the
          // controller closes.
        },
      });
      return new Response(body, { status, headers });
    }

    // Buffered path
    const text = opts.bufferedText ?? '';
    if (delayMs > 0) {
      await sleep(delayMs, signal);
    }
    return new Response(text, { status, headers });
  };

  return { fetch: fetchImpl };
}

/**
 * Convenience helper used by per-provider abortSignal tests. Returns the
 * mock fetch directly (not wrapped in `{ fetch }`) so it can be passed as
 * the `fetcher` arg to `streamAnthropic(cfg, fetcher, prompt, signal)` etc.
 */
export function createMockFetcher(
  opts: MockElectronNetOptions = {},
): MockElectronNet['fetch'] {
  return createMockElectronNet(opts).fetch;
}
