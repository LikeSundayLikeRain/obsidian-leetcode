---
phase: 07-ai-provider-foundation
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/ai/AIClient.ts
  - src/ai/disclosure.ts
  - src/ai/obsidianFetch.ts
  - src/ai/pricing.ts
  - src/ai/providers/anthropic.ts
  - src/ai/providers/index.ts
  - src/ai/providers/ollama.ts
  - src/ai/providers/openai.ts
  - src/ai/providers/openaiCompatible.ts
  - src/ai/types.ts
  - src/main.ts
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
  - src/shared/logger.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 07 delivers the AI provider foundation: `AIClient` facade, four provider adapters, `obsidianFetch` transport, disclosure modal, Settings UI, and logger redaction extensions. The structural security decisions (CORS-bypass via `requestUrl`, `credentials: 'omit'` on every electron.net.fetch call, disclosure gate at the AIClient boundary) are correctly implemented.

Two blockers were found:

1. **Logger redaction double-replacement bug** (`src/shared/logger.ts`): the two-pass replace in `redactString` produces garbled output for `Authorization: Bearer <token>` strings. After the first pass produces `Authorization: Bearer [REDACTED]`, the second `SECRET_VALUE_PATTERN` pass matches `authorization: Bearer` and rewrites it to `Authorization=[REDACTED] [REDACTED]` — changing `:` to `=` and leaving a dangling `[REDACTED]` token. While the secret is still hidden, the double-replacement produces malformed log output that will confuse debugging.

2. **`probeCustom` / `probeViaOneTokenChat` crash on empty `baseUrl`** (`src/ai/providers/openaiCompatible.ts`): when the `custom` provider is selected and `baseUrl` is the empty-string default (the `DEFAULT_PROVIDER_CONFIGS.custom.baseUrl` is `''`), calling `.replace(/\/$/, '')` on `''` produces `''`, and the fetch URL becomes just `"/models"` — a relative URL that Obsidian's `requestUrl` or `electron.net.fetch` may interpret against a random base, or throw a type error. The Settings tab shows the `custom` provider sub-form immediately upon selection before the user enters a URL; the `testActiveAIConnection` guard only checks for empty `apiKey` on cloud providers (line 776), so it falls through to `probe()` with the empty URL.

Three warnings and two informational items round out the findings.

---

## Critical Issues

### CR-01: `redactString` two-pass replace produces garbled output for Authorization headers

**File:** `src/shared/logger.ts:38-49`

**Issue:** `redactString` applies `BEARER_VALUE_PATTERN` first, converting `Authorization: Bearer sk-xyz` to `Authorization: Bearer [REDACTED]`. The second pass applies `SECRET_VALUE_PATTERN`, whose `authorization` alternate matches `authorization:` followed by any non-whitespace chars — it now consumes `Bearer` as the value and produces `Authorization=[REDACTED] [REDACTED]`. The `:` separator is replaced with `=`, and a dangling `[REDACTED]` token appears. Confirmed via runtime test:

```
Input:   "Authorization: Bearer sk-proj-abcdef"
Step 1:  "Authorization: Bearer [REDACTED]"
Step 2:  "Authorization=[REDACTED] [REDACTED]"
```

This is observable in any log line that contains a full `Authorization: Bearer <token>` header string (e.g. error messages from AI provider SDK calls that embed the request config). The secret is protected, but the mangled output degrades debuggability and violates the stated intent that "both the Bearer keyword's value AND the surrounding header name redact, with no secret survival" (comment lines 43–46 describe a clean single-redaction outcome that is not actually produced).

**Fix:** Apply only one redaction pass for the combined `Authorization: Bearer <token>` shape. The simplest fix is to replace `BEARER_VALUE_PATTERN` with a regex that captures the full `authorization: bearer <token>` shape in a single pattern, or to apply the second pass only to the portions of the string that were NOT already touched by the first pass. A clean single-pattern approach:

```typescript
// Replace the two-pass approach with a single ordered alternation.
// The authorization+bearer shape is listed first so it wins before
// the bare 'authorization' alternate consumes 'Bearer' as the value.
const SECRET_VALUE_PATTERN =
  /\b(authorization)\s*:\s*(bearer)\s+([^\s;,"'&}\]]+)|\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization|apikey|api[_-]?key|x-api-key)\s*[=:]\s*([^\s;,"'&}\]]+)/gi;

function redactString(s: string): string {
  return s.replace(SECRET_VALUE_PATTERN, (_m, authKey, _bearer, _tok, otherKey) => {
    if (authKey) return `${authKey}: bearer [REDACTED]`;
    return `${otherKey}=[REDACTED]`;
  });
}
```

Alternatively, the minimal targeted fix is to make the `SECRET_VALUE_PATTERN`'s value-character class exclude `[` so that `[REDACTED]` already placed by the first pass is never re-consumed:

```typescript
// Exclude '[' from the value character class so an already-redacted
// '[REDACTED]' token is never re-consumed by the second pass.
const SECRET_VALUE_PATTERN =
  /\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization|apikey|api[_-]?key|x-api-key)\s*[=:]\s*[^\s;,"'&}\]\[]+/gi;
```

---

### CR-02: `probeCustom` and `probeViaOneTokenChat` issue network calls with empty `baseUrl`

**File:** `src/ai/providers/openaiCompatible.ts:64` and `src/ai/providers/openaiCompatible.ts:92-101`

**Issue:** When the `custom` provider is active and the user has not yet entered a Base URL (the default `ProviderConfig.baseUrl` for `custom` is `''` per `DEFAULT_PROVIDER_CONFIGS.custom`), `probeCustom` executes:

```typescript
const baseUrl = cfg.baseUrl.replace(/\/$/, '');  // '' → ''
const res = await fetcher(`${baseUrl}/models`, { ... });  // fetches '/models'
```

With the `request` mode fetcher (`requestUrl`), calling `requestUrl({ url: '/models', ... })` will likely throw or return a nonsensical response because `requestUrl` expects an absolute URL. With the `stream` mode fetcher (`electron.net.fetch`), a relative URL may resolve against `app://obsidian.md/models` or similar, producing a confusing 404-shaped error rather than a clean "please configure a URL first" message.

The `testActiveAIConnection` guard in `main.ts` (line 776) only blocks on empty `apiKey` for `anthropic`, `openai`, and `openrouter` — it does not guard against an empty `baseUrl` for `custom` (or `ollama`). The Settings tab renders the sub-form immediately on provider selection before the user has entered a URL, making this reachable on first click of "Test connection".

**Fix:** Add an early-return guard in `probeCustom` (and mirror it in `probeOllama`) when `cfg.baseUrl` is empty:

```typescript
export async function probeCustom(cfg: ProviderConfig, fetcher: FetchFn): Promise<ProbeResult> {
  if (!cfg.baseUrl) {
    return { ok: false, errorMessage: 'Base URL is required for Custom provider.' };
  }
  try {
    const baseUrl = cfg.baseUrl.replace(/\/$/, '');
    // ... rest unchanged
```

Or, add the same guard to `testActiveAIConnection` in `main.ts` alongside the existing `apiKey` guard:

```typescript
if ((provider === 'custom' || provider === 'ollama') && cfg.baseUrl === '') {
  new Notice(`Enter a Base URL for ${prettyName(provider)} first.`, 3000);
  return;
}
```

---

## Warnings

### WR-01: `AIClient.invoke` is missing `await` — exceptions thrown by `adapter.invoke` bypass the disclosure-gate try/catch

**File:** `src/ai/AIClient.ts:150`

**Issue:** Line 150 reads:

```typescript
return adapter.invoke(req);
```

`adapter.invoke` returns a `Promise<AIResponse>`. Because the `async invoke` method does not `await` this return, any rejection from `adapter.invoke` is returned as a rejected promise that bubbles out of the `async` function's normal `.catch` path — but critically, the wrapping `try { ... } catch (err) { ... }` block at lines 134–146 does NOT catch errors thrown by `adapter.invoke`. This means an error from the adapter (e.g. the Phase 08 stub `Error('AIClient.invoke: Phase 08 wires the real call')`) escapes unhandled rather than being caught and re-thrown at the `invoke` boundary as the doc comment promises ("re-throws on adapter error").

In Phase 07 the stub always throws and Phase 08 callers are told they can `catch` the error — but the try/catch structure guarantees nothing here because the await is missing.

**Fix:**

```typescript
return await adapter.invoke(req);
```

---

### WR-02: `DISCLOSURE_BASE_COPY` is a shared mutable global — concurrent modal renders share the same arrays

**File:** `src/ai/disclosure.ts:43-56`

**Issue:** `DISCLOSURE_BASE_COPY` is deliberately left unfrozen (comment lines 38-41) to allow Phase 08/09/11 to push bullets via `DISCLOSURE_BASE_COPY.willSend.push(...)`. The `AIDisclosureModal.onOpen()` method iterates `DISCLOSURE_BASE_COPY.willSend` and `neverSends` directly (lines 115, 122). If two modals are open simultaneously (possible if `requireAIDisclosure` is called concurrently — e.g. a user quickly switches providers), both modal instances render from the same live array. More concretely, if Phase 08/09 mutates the array during a render, the DOM produced by an in-flight modal will reflect the mid-mutation state.

The design is intentional for the mutation pattern, but the modal renders the live reference rather than a snapshot, creating a data-race hazard that will be harder to debug once Phase 08 adds its bullet.

**Fix:** Snapshot the arrays at render time:

```typescript
// In onOpen():
for (const line of [...DISCLOSURE_BASE_COPY.willSend]) {
  willList.createEl('li', { text: line });
}
for (const line of [...DISCLOSURE_BASE_COPY.neverSends]) {
  neverList.createEl('li', { text: line });
}
```

---

### WR-03: `sanitizeProviderConfig` rejects empty `baseUrl` but the `custom` provider's valid default IS empty — the guard silently replaces user-entered empty string with `''` anyway

**File:** `src/settings/SettingsStore.ts:389-395`

**Issue:** The `sanitizeProviderConfig` function validates `baseUrl` with `/^https?:\/\//`. The `custom` provider's default `baseUrl` is `''` (an intentional empty default — user must supply it). When the user clears the Base URL field in Settings, the `onChange` handler calls `setProviderConfig(active, { ...current, baseUrl: '' })`. Inside `setProviderConfig`, `sanitizeProviderConfig` runs and the regex test on `''` fails, so `baseUrl` is replaced with `defaults.baseUrl` — which is also `''` for `custom`. The round-trip is accidentally safe only because the default matches.

However, if a user enters a valid URL and then clears it back to empty, the sanitizer will replace it with `defaults.baseUrl = ''` rather than surfacing any error. This is fine for `custom`, but for `ollama` the same path would reset the URL back to `http://localhost:11434/v1` rather than preserving the intentional empty clear — except Ollama's default is non-empty, so clearing does reset silently to the Ollama default. A user who deliberately clears the Ollama Base URL field will see it silently restored to `http://localhost:11434/v1` on next plugin reload.

More concretely: `sanitizeProviderConfig` is called from `setProviderConfig` (line 700) on every onChange. The Ollama Base URL input field calls `setProviderConfig(active, { ...current, baseUrl: v })` on every keystroke (line 361-363). Typing in the field mid-edit produces intermediate values like `'http://'` which DO pass the regex test and persist, but a complete clear (value `''`) resets to the Ollama default rather than persisting the empty-clear intent.

**Fix:** For the `custom` provider, the empty string is a valid (sentinel) `baseUrl`. The regex guard should pass through empty strings as-is for the custom case, or `sanitizeProviderConfig` should accept an explicit `allowEmpty` option:

```typescript
const baseUrl =
  typeof r.baseUrl === 'string' &&
    (r.baseUrl === '' || /^https?:\/\//.test(r.baseUrl))
    ? r.baseUrl
    : defaults.baseUrl;
```

---

## Info

### IN-01: `probeOpenRouter` sends no `Authorization` header but OpenRouter recently began requiring a key

**File:** `src/ai/providers/openaiCompatible.ts:35-36`

**Issue:** The comment on line 35 states "OpenRouter's public model list does not require auth." This was accurate as of the research date, but OpenRouter changed their `/models` endpoint to require an `Authorization: Bearer <key>` header for authenticated requests in early 2026. A user with a valid key will get a 401 from the unauthenticated `/models` call, see a probe failure, and potentially think their key is wrong when it is not.

This is an informational finding because the behavior is documented as an assumption (RESEARCH Assumption A4) and is a vendor-side change, not a code defect. However, the probe will produce a misleading error for users with valid OpenRouter keys.

**Fix:** Pass the API key if present, matching the `probeCustom` pattern:

```typescript
const headers: Record<string, string> = {};
if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
const res = await fetcher(`${baseUrl}/models`, { method: 'GET', headers });
```

---

### IN-02: `SettingsTab` Ollama Base URL `onChange` handler saves on every keystroke without debounce

**File:** `src/settings/SettingsTab.ts:360-364`

**Issue:** The `ollama` and `custom` Base URL text inputs call `setProviderConfig` inside an `onChange` handler that fires on every keystroke. `setProviderConfig` calls `sanitizeProviderConfig` (which includes a regex test) and then `persist()` (which calls `plugin.saveData()`), writing to disk on every character typed. This is the same pattern used for the API key field, so it is consistent with the existing codebase style. However, `sanitizeProviderConfig` will reject intermediate partial URLs (e.g. `'http://'`) and silently fall back to the default while the user is still typing — meaning a user who types a new URL character-by-character may see their input reset to the default mid-keystroke if they pause between characters and the partial URL fails the regex.

This is an existing pattern in the codebase (not introduced by Phase 07) but is newly visible because Ollama/Custom are the first editable URL fields. No data loss occurs since the user can retype, but the behavior may surprise.

**Fix (optional, low priority):** Separate the in-memory edit state from the persisted state, persisting only on blur or an explicit Save button. Alternatively, validate only on blur. This is a quality-of-life improvement rather than a correctness fix.

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
