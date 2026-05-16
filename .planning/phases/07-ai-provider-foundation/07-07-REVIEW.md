---
phase: 07-ai-provider-foundation
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/shared/logger.ts
  - src/ai/AIClient.ts
  - src/ai/disclosure.ts
  - src/ai/providers/openaiCompatible.ts
  - src/ai/providers/ollama.ts
  - src/main.ts
  - tests/shared/logger.test.ts
  - tests/ai/aiClient.test.ts
  - tests/ai/disclosure.test.ts
  - tests/ai/probes.test.ts
  - tests/ai/probe-debounce.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 07 Plan 07: Gap-Closure Code Review

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This review covers the four targeted fixes from Plan 07-07:
- CR-01: logger double-replacement — single ordered-alternation pattern
- CR-02: empty-baseUrl guards in `probeCustom`, `probeOllama`, `testActiveAIConnection`
- WR-01: `await` added to `adapter.invoke()` in `AIClient.ts`
- WR-02: `Object.freeze` applied to `DISCLOSURE_BASE_COPY` and both inner arrays

**CR-01 is functionally closed** for the documented regression scenario. The "Approach B" single ordered-alternation pattern correctly handles `Authorization: Bearer <token>` without double-replacement. Mechanically verified with Node.js against all test inputs.

**CR-02 is complete and symmetric** across all three call sites. All three guards are present with the correct condition (`cfg.baseUrl === ''` in `main.ts`, `!cfg.baseUrl` in the providers).

**WR-01 `await` fix is correct** but reveals a latent test gap: the `aiClient.test.ts` suite sets `disclosureAcknowledged: true` in every mock, meaning the disclosure gate branch that calls `settings.setProviderConfig` is never exercised. The mock settings object does not expose `setProviderConfig`, so a test that exercises the disclosure path (ack=false + Continue) would crash the test suite — indicating the gate is only integration-tested via `probe-debounce.test.ts`'s prototype-call pattern, not unit-tested at the AIClient level.

**WR-02 deep freeze is correctly implemented.** Both inner arrays are frozen via inline `Object.freeze([...])` before being assigned to the outer object, and then the outer object is frozen at module scope. This is a correct deep freeze. The `readonly` TypeScript type annotation on the exported constant is consistent with the freeze.

One new BLOCKER is introduced by the CR-01 fix (described below). Three warnings concern the fix scope's interaction with surrounding code.

---

## Critical Issues

### CR-01: `SECRET_VALUE_PATTERN` second alternate rewrites `:` separator to `=`, losing the `Bearer` keyword when no token follows

**File:** `src/shared/logger.ts:51-70`

**Issue:** The CR-01 fix comment promises "preserves the original `:` separator and the `Bearer` keyword" as properties of the fix. This is true only when the first alternate fires (i.e., when a token follows `Bearer`). When the input is `'Authorization: Bearer'` with no trailing token — which is a valid log fragment that could appear in truncated error messages or config dumps — the first alternate fails to match (it requires `\s+` plus at least one token character), and the second alternate matches `'Authorization: Bearer'` treating the word `Bearer` as the value. The replacement function then outputs `'Authorization=[REDACTED]'`, which:

1. Changes the separator from `:` to `=` (undocumented output mutation).
2. Silently removes the `Bearer` keyword from the output (the keyword itself is not secret, but losing it from logs degrades debuggability).
3. **More critically**: the second alternate in the pattern includes `authorization` as one of the keyword candidates. This means `'Authorization: Bearer'` (no token) produces `'Authorization=[REDACTED]'`. The word `Bearer` is redacted as if it were a secret value. This is incorrect behavior — `Bearer` is the scheme name, not a credential — and it means any log line of the form `'Sending Authorization: Bearer'` (common in HTTP layer debug logs when the token has already been stripped) will silently lose the word `Bearer` in the output.

This is not a security vulnerability (no real secret is exposed), but it is a BLOCKER-class correctness failure: the fix introduces a new edge-case output shape that contradicts its own documented contract, and the test suite has no case covering `'Authorization: Bearer'` (no token).

Mechanically confirmed via Node.js:
```
Input:  "Authorization: Bearer"
Output: "Authorization=[REDACTED]"   // 'Bearer' keyword silently redacted as a value
```

**Fix:** Add a negative-lookahead to the second alternate's `authorization` keyword so it only fires when the separator is `=` (env-var style), not `:` followed by a known scheme keyword. Alternatively, add a guard in the replacement function: when `otherKey` is `'authorization'` (case-insensitive) and the captured value is `'bearer'` (case-insensitive), emit `authorization: bearer [missing-token]` instead of the `=[REDACTED]` shape. The simplest targeted fix is to reconstruct the separator from the full match rather than hardcoding `=`:

```typescript
return s.replace(SECRET_VALUE_PATTERN, (_m, authKey, bearerKey, _bearerTok, otherKey, _otherVal, offset, str) => {
  if (authKey !== undefined && bearerKey !== undefined) {
    return `${authKey}: ${bearerKey} [REDACTED]`;
  }
  // Preserve the original separator (':' or '=') from the match context
  // so 'x-api-key: value' → 'x-api-key: [REDACTED]' not 'x-api-key=[REDACTED]'
  const sepMatch = /\s*([=:])\s*/.exec(str.slice(offset + (otherKey ?? '').length));
  const sep = sepMatch?.[1] ?? '=';
  return `${otherKey ?? ''}${sep}[REDACTED]`;
});
```

Additionally, add a test case for `'Authorization: Bearer'` (no token) to the Category 4 regression suite.

---

## Warnings

### WR-01: `aiClient.test.ts` mock settings object is missing `setProviderConfig` — disclosure-gate path crashes if exercised

**File:** `tests/ai/aiClient.test.ts:25-43`

**Issue:** The `MockSettings` interface and `makeMockSettings` factory do not include a `setProviderConfig` method. `AIClient.probe` and `AIClient.invoke` both call `await this.settings.setProviderConfig(...)` when `disclosureAcknowledged` is `false` and the user clicks Continue. All existing tests set `disclosureAcknowledged: true`, bypassing this path. If a future test (or the WR-01 fix test that should exist) exercises the disclosure path with `ack=false` and a `requireDisclosure` that returns `true`, the test will throw `TypeError: this.settings.setProviderConfig is not a function` — a test-quality failure that masks whether the gate itself works correctly.

This was the existing state before Plan 07-07, but the WR-01 fix comment explicitly notes that the `await` is "contract-load-bearing" for the re-throw posture. The gap is now load-bearing: there is no test confirming that `probe()` correctly persists `disclosureAcknowledged: true` via `setProviderConfig` after a Continue click.

**Fix:** Add `setProviderConfig` to `MockSettings` and `makeMockSettings`:

```typescript
interface MockSettings {
  getActiveAIProvider: () => string | null;
  getProviderConfig: (p: string) => Record<string, unknown>;
  setProviderConfig: (p: string, cfg: Record<string, unknown>) => Promise<void>;
  addCostLedger: (usd: number) => Promise<void>;
}

function makeMockSettings(overrides: Partial<MockSettings> = {}): MockSettings {
  return {
    // ... existing fields ...
    setProviderConfig: vi.fn(async () => {}),
    ...overrides,
  };
}
```

Then add a test for the disclosure-gate-ack path in `probe` and `invoke`.

### WR-02: `SECRET_VALUE_PATTERN` value character class normalizes `:` separator to `=` in output for all non-Authorization colon-separated headers

**File:** `src/shared/logger.ts:65-70`

**Issue:** The replacement function for the second alternate always emits `${otherKey}=[REDACTED]` with a hardcoded `=` separator, regardless of whether the original string used `:` (HTTP header style) or `=` (env-var style). So `'x-api-key: sk-ant-xyz'` → `'x-api-key=[REDACTED]'` (colon becomes equals). This is an observable output mutation that survives into log lines: a developer reading a redacted log line that says `x-api-key=[REDACTED]` when the original was `x-api-key: sk-ant-xyz` will see a different syntactic form, which may cause confusion when grepping or parsing structured logs.

This is not new — it predates Plan 07-07 — but the CR-01 fix is the first time the separator-preservation contract is explicitly documented in comments for the first alternate only. The fix creates an asymmetry: Authorization headers preserve `:`, all other headers normalize to `=`. The test suite does not assert the separator in the output for the `x-api-key` case (test at line 86-91 only checks `not.toContain` and `toContain('[REDACTED]')`).

**Fix:** Capture the separator in the second alternate group and replay it:

```typescript
const SECRET_VALUE_PATTERN =
  /\b(authorization)\s*:\s*(bearer)\s+([^\s;,"'&}\]\[]+)|\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization|apikey|api[_-]?key|x-api-key)\s*([=:])\s*([^\s;,"'&}\]\[]+)/gi;
```

Then in the replacement: `return \`\${otherKey ?? ''}\${sep}[REDACTED]\`;` where `sep` is the captured `=` or `:` group.

### WR-03: `probe-debounce.test.ts` CR-02 tests for `main.ts` guard use `cfg.baseUrl === ''` but `makeProviderConfig` defaults `baseUrl` to a non-empty string — tests only work because overrides are explicit, creating a fragile dependency on override ordering

**File:** `tests/ai/probe-debounce.test.ts:181-213`

**Issue:** The two CR-02 guard tests at lines 181–213 construct `makeProviderConfig({ apiKey: '', baseUrl: '' })`. `makeProviderConfig` has a default of `baseUrl: 'https://api.example.com/v1'` (line 56). The override `baseUrl: ''` in the spread works correctly because `makeFake` assigns `cfg: opts.cfg ?? makeProviderConfig()` — so the override does reach `getProviderConfig`. However the `main.ts` guard checks `cfg.baseUrl === ''` (strict equality with empty string), while `probeCustom` and `probeOllama` check `!cfg.baseUrl` (falsy). These two conditions differ for whitespace-only values: `cfg.baseUrl = '  '` passes the `=== ''` guard in `main.ts` (does not trigger the Notice) but still produces a relative-looking URL (`'  /models'`) that could fail the fetch. The test suite does not cover a whitespace-only `baseUrl` for either guard site.

This is a pre-existing gap but is observable now because the CR-02 fix added the `main.ts` guard explicitly with `=== ''` while the provider guards use `!cfg.baseUrl`. The asymmetry in condition style may silently diverge under a future whitespace-trimming or input-sanitization change.

**Fix:** Align the `main.ts` guard condition with the provider-level guards by using `!cfg.baseUrl` (or the equivalent `cfg.baseUrl.trim() === ''` if whitespace-trimmed inputs are a concern). Add a whitespace-only `baseUrl` test case:

```typescript
it('Custom whitespace-only baseUrl blocks with Notice (CR-02 whitespace edge case)', async () => {
  const probe = vi.fn(async () => ({ ok: true, modelCount: null } as ProbeResult));
  const fake = makeFake({
    active: 'custom',
    cfg: makeProviderConfig({ apiKey: '', baseUrl: '   ' }),
    probe,
  });
  await callTestActiveAIConnection(fake);
  expect(probe).not.toHaveBeenCalled();
});
```

---

## Info

### IN-01: `logger.test.ts` Category 4 tests assert against the garbled v1 output shape but do not assert the correct post-fix output shape

**File:** `tests/shared/logger.test.ts:129-154`

**Issue:** All three Category 4 tests (lines 129–154) assert what the output must NOT contain (`not.toContain('sk-proj-abcdef')`, `not.toContain('=[REDACTED] [REDACTED]')`) but none asserts what the output SHOULD contain after redaction. A future regression that redacts the key name itself (e.g., producing `'[REDACTED]'` with no key context) would pass all three tests while violating the documented contract ("preserves the original `:` separator and the `Bearer` keyword").

**Fix:** Add a positive assertion for the expected post-fix shape:

```typescript
expect(out).toContain('Authorization: Bearer [REDACTED]');
```

### IN-02: `aiClient.test.ts` WR-01 test (line 115) description says "awaits adapter.invoke so adapter rejections propagate as rejected promise" but the behavior is identical with or without `await` for external callers using `.catch` or `rejects.toThrow`

**File:** `tests/ai/aiClient.test.ts:115-126`

**Issue:** The test comment at lines 108–114 correctly identifies that the semantic difference between `return adapter.invoke(req)` and `return await adapter.invoke(req)` is only observable when the call body is wrapped in a `try/catch` — not via external `.rejects.toThrow`. The test itself (`await expect(client.invoke(...)).rejects.toThrow(/adapter-boom/)`) does not actually prove the `await` is present: both the old unawaited form and the new awaited form produce identical behavior for this assertion. The test validates the Promise rejects with the right message, but does not validate the internal `await`-ness that was the stated fix rationale.

**Fix:** Add a comment clarifying the test limitation, or restructure as an internal-behavior test using a spy on the adapter mock to verify the result is awaited before the function resolves (e.g., via ordering of side effects). Alternatively, the existing comment is sufficient documentation; label this as an accepted limitation.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
