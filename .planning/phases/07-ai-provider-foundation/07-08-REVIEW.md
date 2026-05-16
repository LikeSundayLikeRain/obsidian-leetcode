---
phase: 07-08-advisory-cleanup
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/shared/logger.ts
  - src/main.ts
  - src/ai/providers/openaiCompatible.ts
  - src/ai/providers/ollama.ts
  - tests/shared/logger.test.ts
  - tests/ai/probes.test.ts
  - tests/ai/probe-debounce.test.ts
  - tests/ai/aiClient.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 07-08: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This review covers Plan 07-08's advisory cleanup: CR-01-A (Bearer-no-token edge case), WR-02-separator (colon-to-equals normalization), WR-03-whitespace (whitespace-only baseUrl bypass), and WR-01-test-gap (MockSettings `setProviderConfig` + disclosure persistence tests).

The four targeted fixes are **mechanically correct** — the regex, the guard, the MockSettings map, and the new tests all do what they claim. No new security vulnerabilities were introduced. However, three issues were found: one warning-level logical gap in the negative-lookahead behavior (the code comment is misleading about the `/i` flag interaction with the lookahead, and an undocumented edge case remains untested), one warning about the WR-03 tests exercising a production-unreachable code path due to `sanitizeProviderConfig` normalizing whitespace baseUrls before they can reach the guard, and one info finding about the MockSettings mock not mirroring real `setProviderConfig` sanitization.

---

## Warnings

### WR-01: `(?!bearer\b)` negative lookahead has an undocumented partial-match leak for `\i` flag interaction

**File:** `src/shared/logger.ts:70`

**Issue:** The code comment at lines 55-58 states: _"The `/i` flag already on this regex means the lookahead is also case-insensitive (matches Bearer, BEARER, bearer, etc.)"_ This statement is **correct for the complete pattern** as written (verified by running all three cases), but the explanation is incomplete in a way that will mislead maintainers.

The `/i` flag makes `(?!bearer\b)` case-insensitive at **position 0** of the candidate value — which is where the second alternate's value group always anchors. This works correctly because the regex engine evaluates the lookahead at the start of the `([^\s;,"'&}\]\[]+)` capture, not mid-string. The fix is sound.

However, a related undocumented edge case exists: when `(?!bearer\b)` is applied as a standalone pattern with `/i` and `/g` flags against a string like `'Bearer'`, the regex engine, after failing at position 0, advances to position 1 and matches `'earer'`. This behavior is **not exercised** by the current pattern (because the second alternate as a whole fails to match when position 0 of the value is blocked), but it has caused confusion in the first test output (`Bearer match test: [ 'earer' ]`) and will continue to confuse anyone who tries to unit-test the lookahead in isolation. There is **no test** for the `token: Bearer` or `session: Bearer` cases (where a non-`authorization` key has `Bearer` as its value), even though these are the core cases the fix is designed to protect.

**Fix:** Add two test cases to Category 5 in `tests/shared/logger.test.ts`:

```typescript
it('does NOT redact Bearer keyword as value for non-authorization key (CR-01-A coverage)', () => {
  logger.warn('http err', 'token: Bearer');
  const out = captured();
  // 'Bearer' is a scheme keyword, not a secret value — must not be redacted
  expect(out).not.toContain('token=[REDACTED]');
  expect(out).not.toContain('token: [REDACTED]');
  expect(out).toContain('Bearer');
});

it('does NOT redact BEARER (uppercase) as value for cookie key', () => {
  logger.warn('http err', 'cookie: BEARER');
  const out = captured();
  expect(out).not.toContain('cookie=[REDACTED]');
  expect(out).not.toContain('cookie: [REDACTED]');
  expect(out).toContain('BEARER');
});
```

Without these cases, a future regex change that accidentally breaks the `(?!bearer\b)` lookahead for other keys (e.g., a copy-paste error that drops the lookahead) will not be caught by the test suite.

---

### WR-02: WR-03-whitespace guard at `main.ts` is production-unreachable; tests validate an injected-state-only path

**File:** `src/main.ts:797-804`, `tests/ai/probe-debounce.test.ts:225-257`

**Issue:** The WR-03-whitespace guard in `main.ts` (`!cfg.baseUrl?.trim()`) reads `cfg` from `this.settings.getProviderConfig(provider)`, which returns data previously written through `SettingsStore.setProviderConfig`. That method runs `sanitizeProviderConfig(cfg, DEFAULT_PROVIDER_CONFIGS[p])` on every write. `sanitizeProviderConfig` validates `baseUrl` against `/^https?:\/\//` — a whitespace-only string (`' '`, `'\t'`, `'   \t  '`) fails that test and is **reset to the provider's default URL** before it ever reaches storage.

This means the production data flow is:
1. User types `' '` in the Base URL settings field → triggers `setProviderConfig`
2. `sanitizeProviderConfig` normalizes `' '` → `defaults.baseUrl` (e.g., `'https://api.openai.com/v1'`)
3. `getProviderConfig` returns the normalized URL
4. `main.ts` guard: `!cfg.baseUrl?.trim()` evaluates `'https://api.openai.com/v1'.trim()` → always truthy → guard never fires

The two WR-03 tests in `probe-debounce.test.ts` (lines 225-257) use `makeFake()` which bypasses `setProviderConfig` entirely and injects raw cfg directly, making the guard reachable in the test but **not through any real user action**. Similarly, the regression guard test in `probes.test.ts` (lines 187-201) uses `' https://example.com/v1 '` which also fails `/^https?:\/\//` in `sanitizeProviderConfig` and would be normalized to `defaults.baseUrl` before reaching `probeCustom` in production.

The guard is not wrong as defense-in-depth (it protects direct callers of `AIClient.probe` that bypass `SettingsStore`), but the tests only exercise an artificial scenario. No user-visible bug exists today, but the claim in the plan summary ("symmetric with probeCustom and probeOllama") creates a false confidence that the three sites form a closed triangle.

**Fix:** Add a doc comment above the `main.ts` WR-03 guard clarifying the actual protection domain:

```typescript
// Phase 07 Plan 08 — WR-03-whitespace. Note: SettingsStore.setProviderConfig
// runs sanitizeProviderConfig which coerces whitespace-only baseUrl to the
// provider default, so this guard is unreachable through the normal settings
// UI flow. It is retained as defense-in-depth for callers that inject cfg
// directly (e.g., tests, future non-settings API surfaces).
if (
  (provider === 'custom' || provider === 'ollama') &&
  !cfg.baseUrl?.trim()
) {
```

Optionally, add a comment in the test acknowledging that `makeFake()` bypasses sanitization: _"This tests the guard at the AIClient boundary; in the production settings flow, sanitizeProviderConfig would have already coerced ' ' to the provider default before this path is reached."_

---

### WR-03: `MockSettings.setProviderConfig` stores un-sanitized cfg; second-probe test relies on mock fidelity that differs from real `SettingsStore`

**File:** `tests/ai/aiClient.test.ts:53-63`

**Issue:** The new `makeMockSettings` factory (Plan 07-08 WR-01-test-gap) implements `setProviderConfig` as:

```typescript
const setProviderConfigDefault = vi.fn(async (provider: string, next: Record<string, unknown>) => {
  cfgs.set(provider, next);
});
```

The real `SettingsStore.setProviderConfig` calls `sanitizeProviderConfig(cfg, DEFAULT_PROVIDER_CONFIGS[p])` before storing. The mock stores `next` **raw without sanitization**. This divergence matters for the "after Continue, a second probe call does NOT re-fire the disclosure helper" test (lines 150-176):

- First probe persists `{ ...startingCfg, disclosureAcknowledged: true }` via the mock
- Mock stores this raw value in `cfgs`
- AIClient then calls `cfg = this.settings.getProviderConfig(provider)` to re-read
- Mock returns `cfgs.get('anthropic')` — the raw stored value with `disclosureAcknowledged: true`
- Second probe reads `disclosureAcknowledged: true` — gate skipped, test passes

The test is **valid for its stated purpose** because:
1. `DEFAULT_CFG.baseUrl = 'https://api.openai.com/v1'` passes `sanitizeProviderConfig`'s URL check, so sanitization would return the same value in this case
2. `disclosureAcknowledged: true` passes the strict-true check at `sanitizeProviderConfig` line 404

However, if a future test uses a non-HTTP `baseUrl` (or `null`), `sanitizeProviderConfig` would reset it to the provider default — but the mock would return the raw value, causing the test to verify behavior that production code cannot exhibit. The divergence is a latent trap for future test authors.

**Fix:** Add a comment to `makeMockSettings` making the mock divergence explicit:

```typescript
// NOTE: Unlike real SettingsStore.setProviderConfig, this mock stores
// cfg raw without calling sanitizeProviderConfig. Tests that depend on
// the sanitization side-effects (e.g., baseUrl normalization) must mock
// setProviderConfig directly instead of relying on this factory.
const setProviderConfigDefault = vi.fn(async (provider: string, next: Record<string, unknown>) => {
  cfgs.set(provider, next);
});
```

---

## Info

### IN-01: Category 5 CR-01-A test uses an overly permissive "acceptable" contract

**File:** `tests/shared/logger.test.ts:189-203`

**Issue:** The CR-01-A test (line 189) specifies two acceptable output shapes — `acceptableA` (input untouched, `Bearer` keyword survives) and `acceptableB` (`Authorization: Bearer [REDACTED]` is emitted). The test comment documents this dual-contract as intentional. However, at runtime the actual behavior is always `acceptableA` (input untouched, never `acceptableB`), because the first alternate requires `\s+([^\s]+)` — at least one non-whitespace character after `Bearer`. There is no code path that can produce `acceptableB` for the no-token input.

This means the test verifies two possible shapes but only one can ever occur. A regression that changes the output to `acceptableB` would pass the test despite being behaviorally different from the current implementation. The test does catch the bad shape (`Authorization=[REDACTED]`), which is the critical assertion, so this is documentation quality, not a correctness gap.

**Fix:** Tighten the test to assert only `acceptableA` since `acceptableB` is impossible:

```typescript
it('does NOT consume the Bearer keyword as a value when no token follows (CR-01-A)', () => {
  logger.warn('http err', 'Authorization: Bearer');
  const out = captured();
  // Hard contract: the v07-07 broken shape MUST NOT appear.
  expect(out).not.toContain('Authorization=[REDACTED]');
  // The first alternate requires a non-whitespace token after Bearer (\s+[^\s]+),
  // so 'Authorization: Bearer' (no token) always passes through untouched.
  expect(out).toContain('Authorization');
  expect(out).toContain('Bearer');
  expect(out).not.toContain('[REDACTED]');
});
```

---

### IN-02: `probeCustom` does not trim `baseUrl` before constructing fetch URLs

**File:** `src/ai/providers/openaiCompatible.ts:79`

**Issue:** After the `!cfg.baseUrl?.trim()` guard at line 75, `probeCustom` computes:

```typescript
const baseUrl = cfg.baseUrl.replace(/\/$/, '');
```

This removes a trailing slash but does **not** trim surrounding whitespace. If `cfg.baseUrl` is `' https://example.com/v1 '`, the constructed URL becomes `' https://example.com/v1/models'` (leading space preserved), which is a malformed URL. The same applies to `probeOllama` (line 41) and `createOpenAICompatibleModel` (line 23).

In practice this is unreachable through `SettingsStore` (sanitization rejects non-`http(s)://` values including space-prefixed URLs), but the probe functions accept a `FetchFn + ProviderConfig` interface that can be called directly with unsanitized cfg. The `probes.test.ts` regression guard at line 187 even tests this exact input and asserts the fetcher is called — confirming the malformed-URL path exists and is left to the fetcher to handle.

**Fix:** Trim `baseUrl` after the guard:

```typescript
const baseUrl = cfg.baseUrl.trim().replace(/\/$/, '');
```

Apply the same to `probeOllama` (line 41) and `createOpenAICompatibleModel` (line 23). This makes the guard and the URL construction consistent.

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
