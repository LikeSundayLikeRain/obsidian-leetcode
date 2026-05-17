---
title: Fix real streaming transport (electron.net.fetch unavailable in current Obsidian)
captured: 2026-05-16
resolves_phase: 08.1
tags: [phase-08.1, ai, streaming, transport, dogfood]
references:
  - .planning/phases/08-ai-debug/08-RESEARCH.md (Pattern 4 — electron.net.fetch streaming)
  - .planning/phases/08-ai-debug/08-CONTEXT.md (decision F — streaming transport plumbing)
  - src/ai/obsidianFetch.ts (loadElectronNet — current eager-probe path)
  - src/ai/AIClient.ts (invokeStream — catch falls through to buffered)
---

# Real streaming transport for AI Debug

Phase 07 research assumed `electron.net.fetch` would be exposed in the Obsidian renderer process. In Obsidian 1.10+ (with `contextIsolation: true` on the main BrowserWindow), `electron.net` is not exposed via the renderer's `require('electron')` — only the renderer-process subset of the Electron API is available, and `net` is a main-process API.

## Symptom (Phase 08 dogfood, 2026-05-16)

User triggered AI Debug → eager probe in `loadElectronNet()` throws `electron.net.fetch unavailable in this renderer.` → AIClient.invokeStream's catch falls through to the buffered path → modal shows "Thinking…" until the full response arrives, then renders once. **No live token-by-token streaming visible to the user.**

The buffered path works correctly (litellm proxy → Bedrock → full response → `requestUrl` returns it as a single chunk → modal renders once). But the v1.1 hero feature design called for live token streaming, which currently never fires.

## Why this matters

- Live streaming is a CONTEXT decision F lock — phase goal AIDBG-02 explicitly says "see a streaming modal fill in real time (or a 'Thinking…' indicator on fallback)". The fallback IS hitting on every call right now, not the streaming path.
- The 100ms-debounced `MarkdownRenderer.render` mitigation (Pitfall 1) is currently never exercised at runtime because no chunks ever arrive — the `consumeStream` branch is dead code in this Obsidian build.

## Investigation paths to explore (Phase 08.1 research)

1. **`electron.net.request`** (older API) — pre-`fetch()` Electron net module. May be available where `net.fetch` is not. Returns a Node-style `ClientRequest` with `data`/`end` events, which can be adapted to a Fetch-API `Response` with a streaming `ReadableStream` body.

2. **Native `window.fetch()` for same-origin and CORS-enabled providers.** `requestUrl` is needed for `leetcode.com` because Electron's renderer CORS blocks `fetch` cross-origin. But:
   - `localhost:*` proxy endpoints (litellm, ollama-local) typically don't trip CORS — `fetch()` works.
   - Some AI providers send proper `Access-Control-Allow-Origin: *` (Anthropic, OpenAI, OpenRouter all do, last verified 2025).
   Adopt `fetch()` as the streaming primary, fall back to `obsidianFetch('stream')` only when CORS rejects. Bonus: returns a real `ReadableStream` body that AI SDK's `streamText` iterates natively.

3. **`@electron/remote` shim** (deprecated but available). The `remote.net` module re-exposes the main-process net module to the renderer. Older Obsidian-AI plugins use this. Cost: a deprecation-pending dependency; Electron may remove this in future major versions.

4. **Plugin-level transport flag.** Settings → AI → Streaming transport: `auto / fetch / electron-net / requestUrl`. Auto picks the best available; user can override when `auto` guesses wrong. Adds a settings row but lets dogfood-debug failures route around the broken path without code changes.

5. **Confirm Obsidian's actual policy.** Check Obsidian's developer docs / forum for the official position on `electron.net.fetch` in renderer. There may be a documented alternative (e.g., a future `requestUrl` streaming variant).

## Implementation scope estimate

- Research: ~2 hours (test transports 1-3 in real Obsidian renderer; confirm CORS for top 4 providers; check forum/docs)
- Implementation: ~3 hours (transport selection logic in `obsidianFetch.ts`, optional settings flag, tests, `consumeStream` exercise via real stream)
- Total: ~5 hours; fits a Phase 08.1 polish phase alongside the Bedrock provider work

## Trigger / when to do this

- **Phase 08.1** (alongside or after [[bedrock-provider-adapter]]). The two are independent; either can land first.
- Bedrock first → Streaming fix can use Bedrock as the live-test provider for the new transport.
- Streaming fix first → Bedrock work can verify against Anthropic-direct-via-key as a sanity baseline before swapping providers.

## Open questions for the research phase

- Does `electron.net.request` work in Obsidian 1.10+ with `contextIsolation: true`?
- Do all 4 current providers (Anthropic, OpenAI, OpenRouter, Ollama) send `Access-Control-Allow-Origin` headers that allow native `fetch()` from the Obsidian renderer?
- Does the Obsidian community-plugin review board have an official stance on `@electron/remote` usage?
- Is there a way to verify `electron.net.fetch` availability at plugin onload (and surface it in the AI section of settings) so users see "Streaming: enabled / disabled" without triggering an AI call first?

## Side note: known cause of confusion

The Phase 08 commit `fix(08-...)`-equivalent that added the eager probe (`obsidianFetch('stream')` throws at factory time when `electron.net.fetch` is missing) was the right call — without it, the failure surfaced inside the streamText iterator, AFTER `kind: 'stream'` had been returned to the modal, and produced an empty modal with no recovery path. The eager probe routes failures cleanly into the buffered fallback. **Keep the eager probe** when the streaming transport is fixed; it's the correct safety net for any future renderer where `net` is unavailable.
