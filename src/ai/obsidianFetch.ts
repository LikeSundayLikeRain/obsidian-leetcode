// src/ai/obsidianFetch.ts
//
// Phase 07 Plan 02 — single HTTP seam for ALL AI provider calls.
//
// AIPROV-05 INVARIANT: leetcode.com NEVER goes through this function. The
//   isolation is enforced two ways: a CI grep gate
//   (scripts/check-no-obsidianfetch-in-lc.sh) blocks `obsidianFetch` imports
//   from src/api/, src/auth/, src/browse/, src/notes/, src/solve/, src/graph/,
//   src/preview/; and a runtime regression test (tests/ai/lc-isolation.test.ts)
//   walks src/ at vitest time and asserts the same boundary.
//
// T-07-02 COOKIE-LEAK MITIGATION: every fetch call inside obsidianFetch sets
//   `credentials: 'omit'`. `electron.net.fetch` honors the default-session
//   cookie pool unless explicitly told otherwise — without this override, an
//   AI provider host could see the user's leetcode.com session cookies. The
//   override fires in BOTH branches even if the caller passes
//   `credentials: 'include'` — this layer is the security boundary, not the
//   provider adapter.
//
// CONTRACT (Pitfall 7): mode='request' returns a fully-buffered Response
//   (requestUrl bridge — no streaming, ever). Use mode='stream' when you need
//   incremental chunks (electron.net.fetch path, exercised live in Phase 08).
//
// ELECTRON ACCESS: the stream branch loads electron via a lazy `require('electron')`
//   resolved through activeWindow.require / module.require / __webpack_require__.
//   electron is `external` in esbuild — provided at runtime by the Obsidian host.
//   We avoid a literal `require(...)` call site to honor the project's
//   `@typescript-eslint/no-require-imports` lint rule (mirrors the
//   nodeRequire indirection in src/auth/BrowserWindowLogin.ts).
import { requestUrl } from 'obsidian';

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ElectronNetFetch {
  fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
}
interface ElectronModule {
  net: ElectronNetFetch;
}

declare const __webpack_require__: ((id: string) => unknown) | undefined;

function loadElectronNet(): ElectronNetFetch {
  // Canonical pattern: lazy `require('electron')` inside the stream branch
  // closure (electron is external in esbuild — provided by the Obsidian host).
  // We look up Node's require via activeWindow.require / module.require /
  // __webpack_require__ so we never literally type `require(...)` here (the
  // obsidianmd-recommended config bans @typescript-eslint/no-require-imports).
  // Mirrors src/auth/BrowserWindowLogin.ts:nodeRequire — the only other file
  // in the project that bridges to electron at runtime.
  const g = activeWindow as unknown as {
    require?: (id: string) => unknown;
    module?: { require?: (id: string) => unknown };
  };
  const fn =
    g.require ??
    g.module?.require ??
    (typeof __webpack_require__ === 'function' ? __webpack_require__ : undefined);
  if (!fn) throw new Error('obsidianFetch(stream): Node require() unavailable from renderer.');
  const electron = fn('electron') as ElectronModule;
  return electron.net;
}

/**
 * Build a Fetch-API-shaped function bound to one of two transports.
 *
 *   - mode='stream': delegates to `electron.net.fetch`. Default-session
 *     cookies are stripped via `credentials: 'omit'` (T-07-02). Existence
 *     verified in Phase 07; live streaming is exercised in Phase 08.
 *
 *   - mode='request': bridges Obsidian's `requestUrl` and adapts the response
 *     into a Fetch-API `Response`. `requestUrl` does not carry session
 *     cookies, so cookie leakage is structurally impossible on this path —
 *     the omitted-credentials parity is documented in this file but not
 *     replayable as an assertion against requestUrl directly.
 */
export function obsidianFetch(mode: 'stream' | 'request'): FetchFn {
  if (mode === 'stream') {
    return async (input, init) => {
      const net = loadElectronNet();
      // T-07-02 mitigation: force credentials: 'omit' even if the caller
      // passes 'include'. obsidianFetch is the security boundary.
      const safeInit: RequestInit = { ...(init ?? {}), credentials: 'omit' };
      const target =
        input instanceof Request
          ? input
          : (typeof input === 'string' ? input : input.toString());
      return net.fetch(target, safeInit);
    };
  }

  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    // T-07-02 parity: requestUrl does not accept a `credentials` field, so
    // session-cookie carry-through is structurally impossible. We DO NOT
    // forward `init.credentials` even if the caller set it — by omitting it
    // from the requestUrl params we make the parity grep-visible
    // (`credentials: 'omit'` appears below as documentation; the runtime
    // behavior is "credentials key never set" which the test asserts).
    // credentials: 'omit' (documented; requestUrl does not carry cookies)
    const res = await requestUrl({
      url,
      method: (init?.method as string) ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body as string | undefined,
      throw: false,
    });
    return new Response(res.text, {
      status: res.status,
      statusText: '',
      headers: res.headers as HeadersInit,
    });
  };
}
