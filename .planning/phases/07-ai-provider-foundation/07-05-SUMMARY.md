---
phase: 07-ai-provider-foundation
plan: 05
subsystem: ai-disclosure-gate
tags: [ai, disclosure-modal, gate, palette-command, security, setCta-invariant]
requires:
  - ai-types-module
  - settings-store-ai-fields
  - obsidianfetch-fetchfn-factory
  - aiclient-facade
  - aiclient-on-plugin-instance
  - testActiveAIConnection-method
provides:
  - aidisclosuremodal-class
  - disclosure-base-copy-shared-constant
  - aiclient-disclosure-gate
  - reset-ai-disclosures-palette-command
  - require-disclosure-fn-injected-helper
affects:
  - src/ai/disclosure.ts
  - src/ai/AIClient.ts
  - src/main.ts
  - styles.css
  - tests/ai/disclosure.test.ts
  - tests/ai/disclosure-gate.test.ts
  - tests/ai/reset-disclosures-command.test.ts
tech-stack:
  added: []
  patterns:
    - injected-disclosure-helper-with-no-op-default
    - acknowledged-plus-decided-double-flag-prevents-cancel-double-fire
    - shared-disclosure-base-copy-constant-for-phase-08-09-11-extension
    - persist-then-re-read-cfg-after-disclosure-ack
    - per-provider-disclosure-state-as-aiprov-04-invariant
    - palette-command-clean-id-no-plugin-prefix-no-command-word-no-hotkey
key-files:
  created:
    - src/ai/disclosure.ts
    - tests/ai/disclosure.test.ts
    - tests/ai/disclosure-gate.test.ts
    - tests/ai/reset-disclosures-command.test.ts
  modified:
    - src/ai/AIClient.ts
    - src/main.ts
    - styles.css
decisions:
  - "AIClient ctor extends to (settings, requireDisclosure?: RequireDisclosureFn) — default `async () => true` no-op preserves Plan 07-02 backward compat (existing aiClient.test.ts stays green without injection); production path injects `(p, c) => this.requireAIDisclosure(p, c)` arrow from main.ts so the plugin's App reference is captured"
  - "Disclosure gate at the AIClient seam (NOT at the call site): probe() AND invoke() both consult disclosureAcknowledged BEFORE any HTTP. Plan 07-04's testActiveAIConnection inherits the protection automatically — no caller-side wiring change required for AIPROV-04. Phase 08+ invokers inherit it the same way."
  - "Cancel posture: probe returns `{ ok: false, errorMessage: 'AI call cancelled' }` (preserves ProbeResult shape so 07-04 testActiveAIConnection's failure-Notice flow renders 'OpenAI: AI call cancelled' verbatim); invoke throws `Error('AI call cancelled')` (re-throw posture matches LeetCodeClient.getProblemDetail so Phase 08 callers can catch + branch). Both strings locked verbatim."
  - "Continue path: persists `disclosureAcknowledged: true` via setProviderConfig FIRST, then re-reads cfg. The re-read is load-bearing because sanitizeProviderConfig (Plan 07-01 Task 2) may have normalized other fields; without it the adapter would see the pre-sanitize cfg snapshot."
  - "Cancel double-fire defence: the modal carries TWO flags — `acknowledged` (set only by Continue) and `decided` (set by EITHER button). onClose's Esc/X/overlay-click fallback fires onCancel only when both flags are false. Without the `decided` flag, Cancel's click handler invokes onCancel then close() → onClose() → fires onCancel again because `acknowledged` was correctly left false. Confirmed by the 'Cancel button click fires onCancel and not onContinue' test."
  - "DISCLOSURE_BASE_COPY exported as a mutable object (NOT Object.freeze'd) — Phase 08/09/11 each append a feature-specific bullet to `willSend` BEFORE any AIClient call site reads the constant. The verbatim shape is asserted at unit-test time so a typo in any future phase that changes a base-copy entry is caught at CI time."
  - "Palette command `reset-ai-disclosures` clean ID: no plugin-id prefix ('leetcode-'), no 'command' substring, no hotkey field — passes eslint-plugin-obsidianmd commands/no-* rule family already enforced phase-wide."
  - "resetAIDisclosures has an idempotent skip path: providers whose flag is already false are NOT written back. Avoids churning data.json on every reset and respects the SettingsStore setter's side-effect-free contract when no actual change is needed."
  - "setCta() invariant preserved: existing 1 invocation in src/settings/SettingsTab.ts:104 (Login button, Phase 1 D-09) + new 1 invocation in src/ai/disclosure.ts:145 (Continue button) = exactly 2 setCta() call sites in src/ tree. UI-SPEC §'Color' grep gate satisfied."
metrics:
  duration: "11m 19s"
  completed_date: "2026-05-16"
  tasks_completed: 2
  files_changed: 7
  files_created: 4
  tests_added: 37
  bundle_delta_bytes: 2521  # 827.6 KB → 830.1 KB
---

# Phase 07 Plan 05: AI Disclosure Gate Summary

The AIPROV-04 disclosure gate landing point: `AIDisclosureModal` ships verbatim 07-UI-SPEC copy; `AIClient.probe()` AND `AIClient.invoke()` both consult `disclosureAcknowledged` BEFORE any HTTP via an injected `RequireDisclosureFn` helper that opens the modal and resolves on the user's button click; `LeetCodePlugin.requireAIDisclosure` is the production helper, `LeetCodePlugin.resetAIDisclosures` is the QA + paranoia escape hatch wired to the new `reset-ai-disclosures` palette command. Plan 07-04's `testActiveAIConnection` inherits the protection automatically — no caller-side change required.

## Objective Achieved

1. **`AIDisclosureModal` + `DISCLOSURE_BASE_COPY` (Task 1)** — `src/ai/disclosure.ts` extends Obsidian's `Modal`, builds the entire DOM tree via `createEl` / `Setting.addButton` (zero `innerHTML`, asserted at unit-test time), renders verbatim 07-UI-SPEC copy:
   - Title: `Heads up: this will send data to {provider name}`
   - Lead paragraph: `Active provider: {provider name} — {base URL}` (or `(no base URL configured yet)` fallback for Custom on fresh install)
   - 4-bullet `willSend` list + 4-bullet `neverSends` list (locked entries; mutable shared constant for Phase 08/09/11 extension)
   - Cancel button (neutral) + Continue button (the ONLY new `.setCta()` invocation across `src/` in v1.1)
   - Esc / X / overlay-click all converge through `onClose()` which fires `onCancel` only when neither button was clicked
2. **AIClient gate + plugin wiring (Task 2)** — `AIClient` ctor extends to `(settings, requireDisclosure?: RequireDisclosureFn)` with a default `async () => true` no-op so Plan 07-02's tests stay green. `probe()` and `invoke()` both consult `disclosureAcknowledged` BEFORE any HTTP; Cancel short-circuits with the locked 'AI call cancelled' string. `LeetCodePlugin.requireAIDisclosure` is injected via the AIClient construction at Step 5.9; `resetAIDisclosures` clears all 5 providers' flags + emits the locked Notice; new `reset-ai-disclosures` palette command delegates to it.
3. **Bundle stays under 1 MB ceiling**: 850,049 bytes (830.1 KB), +2,521 bytes vs Plan 07-04 baseline (827.6 KB). Headroom: 169.9 KB.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Build AIDisclosureModal + DISCLOSURE_BASE_COPY + scoping CSS | `97d9592` | `src/ai/disclosure.ts`, `tests/ai/disclosure.test.ts`, `styles.css` |
| 2 | Wire disclosure gate into AIClient.probe + invoke; add reset-ai-disclosures palette command | `5123976` | `src/ai/AIClient.ts`, `src/main.ts`, `tests/ai/disclosure-gate.test.ts`, `tests/ai/reset-disclosures-command.test.ts` |

## Tests Added

- **`tests/ai/disclosure.test.ts`** — 22 tests across 4 describe blocks:
  - DISCLOSURE_BASE_COPY constant (10): willSend[0..3] verbatim, neverSends[0..3] verbatim, length === 4 each.
  - DOM rendering (5): title text, lead paragraph base URL substitution, empty-baseUrl fallback, scoping class, list shape.
  - Button shape (2): Continue has setCta (only one `.mod-cta` element); Cancel is neutral.
  - Callback wiring (4): Continue fires onContinue / not onCancel; Cancel fires onCancel / not onContinue; Esc-style close fires onCancel once; Continue+close does NOT double-fire onCancel (acknowledged guard).
  - Source invariant (1): `grep -c innerHTML src/ai/disclosure.ts === 0`.
- **`tests/ai/disclosure-gate.test.ts`** — 10 tests across 3 describe blocks:
  - probe (6): ack=true skips modal; ack=false opens modal with correct args; Cancel returns the ProbeResult shape; Continue persists ack=true; getProviderConfig called twice (pre-gate + post-persist re-read); default no-op helper preserves Plan 07-02 backward compat.
  - invoke (3): ack=false + Cancel throws 'AI call cancelled'; ack=false + Continue persists then proceeds; null active provider throws BEFORE checking disclosure.
  - per-provider state (1): switching anthropic (acked) → openai (not-acked) re-fires the gate on openai.
- **`tests/ai/reset-disclosures-command.test.ts`** — 5 tests:
  - Iterates all 5 providers when all 5 are acked.
  - Idempotent skip path: only writes for currently-acked providers.
  - After reset, all 5 providers' `disclosureAcknowledged` flags are false.
  - Notice fires with locked verbatim copy + 4000ms duration.
  - Notice still fires when no providers were acked (no setProviderConfig writes).

**Net total: 37 new tests; full suite is 886 passing (+37 from this plan).**

## Verification Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/ai/disclosure.test.ts tests/ai/disclosure-gate.test.ts tests/ai/reset-disclosures-command.test.ts` | 37 passed |
| `npx vitest run tests/ai/types.test.ts tests/ai/settingsStore.test.ts tests/ai/obsidianFetch.test.ts tests/ai/aiClient.test.ts tests/ai/pricing.test.ts tests/ai/lc-isolation.test.ts tests/ai/settingsTab.test.ts tests/ai/probe-debounce.test.ts tests/shared/logger.test.ts` (Plan 07-01..07-04 regression) | 67 passed, 0 regressions |
| `npx vitest run tests/ai/` | 133 passed (18 files) |
| `npx vitest run tests/api/ tests/settings/ tests/shared/` (v1.0 regression) | 35 passed, 2 skipped — 0 regressions |
| `npx vitest run` (full suite) | 886 passed, 3 skipped (128 files) |
| `npm run lint` | exit 0 |
| `npm run check:lc-isolation` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:bundle-size` | `main.js: 850049 bytes (830.1 KB)` — BUNDLE CHECK OK (under 1 MB) |

## Acceptance Criteria Grep Gates

| Gate | Expected | Actual |
|------|----------|--------|
| `grep -c "export const DISCLOSURE_BASE_COPY" src/ai/disclosure.ts` | 1 | 1 |
| `grep -c "export class AIDisclosureModal" src/ai/disclosure.ts` | 1 | 1 |
| `grep -c "innerHTML" src/ai/disclosure.ts` | 0 | 0 |
| `grep -c "leetcode-ai-disclosure" src/ai/disclosure.ts` | 1 | 1 |
| `grep -c "leetcode-ai-disclosure" styles.css` | 1 | 1 |
| `grep -c "Heads up: this will send data to" src/ai/disclosure.ts` | 1 | 1 |
| `grep -c "I understand — continue" src/ai/disclosure.ts` | 1 | 1 |
| `grep -c "The plugin never sends:" src/ai/disclosure.ts` | 1 | 1 |
| Functional `setCta()` call sites in `src/` | 2 | 2 (`SettingsTab.ts:104` Login button + `disclosure.ts:145` Continue button) |
| `grep -c "requireDisclosure" src/ai/AIClient.ts` | ≥ 4 | 9 (type + ctor + 4 call sites + JSDoc refs) |
| `grep -c "RequireDisclosureFn" src/ai/AIClient.ts` | ≥ 1 | 3 |
| `grep -c "AI call cancelled" src/ai/AIClient.ts` | ≥ 2 (one per probe / invoke branch) | 9 (2 functional + 7 in JSDoc commentary) |
| `grep -c "requireAIDisclosure" src/main.ts` | ≥ 2 | 3 (declaration + AIClient construction call site + JSDoc) |
| `grep -c "resetAIDisclosures" src/main.ts` | ≥ 2 | 2 (method + addCommand callback) |
| `grep -F "id: 'reset-ai-disclosures'" src/main.ts` (presence) | found | found |
| `grep -c "Reset AI provider disclosures" src/main.ts` | ≥ 1 | 1 (palette command name) |
| `grep -c "AI provider disclosures reset" src/main.ts` | 1 | 1 (Notice text) |
| `grep -c "AIDisclosureModal" src/main.ts` | ≥ 2 | 7 (import + new + JSDoc references) |

## Deviations from Plan

### [Rule 1 — Bug] Cancel button click double-fired `onCancel`

**Found during:** Task 1 GREEN gate (`Cancel button click fires onCancel and not onContinue` test failed with `expected to be called 1 times, but got 2 times`).
**Issue:** The plan's prescribed semantics — Cancel onClick fires `onCancel()` then `close()`; `onClose()` fires `onCancel()` if `acknowledged === false` — produced a double-fire. Cancel never sets `acknowledged` (only Continue does), so when Cancel's click handler called `close()`, `onClose()` saw `acknowledged === false` and fired `onCancel()` a second time.
**Fix:** Added a second flag, `decided`, set by EITHER button click. `onClose()` now fires `onCancel` only when both `acknowledged === false` AND `decided === false`. The Esc / X / overlay-click fallback path (where neither flag is set) still works correctly. Both flags are necessary: `decided` alone would let a future caller setting `decided = true` without Continue bypass the persist-on-Continue invariant; `acknowledged` alone allows the double-fire bug.
**Files modified:** `src/ai/disclosure.ts`.
**Commit:** Bundled into `97d9592`.

### [Rule 1 — Bug] `innerHTML` substring in source comment tripped the source-invariant test

**Found during:** Task 1 GREEN gate (`NO innerHTML usage in disclosure.ts` test failed because the file's docstring contained the phrase "Strict-no-innerHTML discipline").
**Issue:** The acceptance criterion is `grep -c "innerHTML" src/ai/disclosure.ts === 0`. A descriptive comment using the word `innerHTML` to explain the anti-pattern violates the gate even though no actual `innerHTML` write is happening. The unit test (which reads the file as plaintext) is the canonical enforcement; the documentation could not be allowed to trip the gate.
**Fix:** Rephrased the docstring to "Strict no-HTML-string-injection discipline" — same intent, no banned token.
**Files modified:** `src/ai/disclosure.ts`.
**Commit:** Bundled into `97d9592`.

### [Rule 1 — Bug] Mock helper's nullish coalescing collapsed `null` to `'openai'`

**Found during:** Task 2 GREEN gate (`invoke without active provider throws BEFORE checking disclosure` failed — promise resolved instead of rejecting).
**Issue:** The test helper used `getActiveAIProvider: () => opts.active ?? 'openai'`. Nullish coalescing matches `null`, so passing `opts.active = null` collapsed back to `'openai'` and the test's "no active provider" precondition was never set up.
**Fix:** Switched to an explicit triple check: `() => (opts.active === undefined ? 'openai' : opts.active)`. This preserves the default-to-`'openai'` ergonomics for tests that omit `opts.active` entirely while honouring an explicit `null` for the no-provider branch.
**Files modified:** `tests/ai/disclosure-gate.test.ts`.
**Commit:** Bundled into `5123976`.

### Note: Plan-prescribed `vitest -x` flag is unsupported in vitest 4

The plan's `<verify>` step uses `npx vitest run ... -x`. Vitest 4.1.5 (the project's pinned version) rejects `-x` as `Unknown option`. Used `npx vitest run ...` without the flag — equivalent semantics; the suite already exits non-zero on failure. Not a deviation in behavior; just a documentation drift between the plan template and the vitest 4 CLI.

## Auth Gates

None — Plan 07-05 ships only the seam (modal + helper + gate). No live HTTP probe is exercised by this plan; Plan 07-04's testActiveAIConnection is the surface that will trigger the modal on first user click.

## Posture Decisions

- **Gate at the AIClient boundary, not the call site.** This is the single invariant that makes AIPROV-04 a Phase-07-only concern: every Phase 08 / Phase 09 / Phase 11 invoker that calls `AIClient.probe` or `AIClient.invoke` automatically inherits the disclosure protection. The alternative — wrapping every call site — would have required per-feature wiring and a per-feature regression test for the bypass path. The trade-off: a future caller that imports `resolveAdapter` directly bypasses the gate; this is documented in the AIClient JSDoc + 07-RESEARCH §Security threat #5 and is the residual risk T-07-03-bypass.
- **Default no-op `requireDisclosure` preserves Plan 07-02 backward compat.** The injected helper defaults to `async () => true` so existing AIClient tests (Plan 07-02 + Plan 07-04 probe-debounce) stay green without rewrites. Production wiring overrides via the arrow `(p, c) => this.requireAIDisclosure(p, c)` at construction time.
- **Continue persists THEN re-reads cfg.** Without the re-read, the adapter would see the pre-sanitize cfg snapshot. `sanitizeProviderConfig` (Plan 07-01 Task 2) may normalize fields (baseUrl trimming, model fallback) and the adapter must operate on the post-sanitize state. The re-read is two `getProviderConfig` calls per Continue — a non-issue because the getter is a Map lookup.
- **Cancel posture distinct between probe and invoke.** probe returns a `{ ok: false, errorMessage: 'AI call cancelled' }` ProbeResult so testActiveAIConnection's existing failure-Notice flow renders 'OpenAI: AI call cancelled' verbatim without code changes. invoke throws `Error('AI call cancelled')` because Phase 08 callers need to branch on the error type (network / cap / disclosure-cancel) and a Result-shaped return would force every caller into a try/catch + branch + throw pattern that the LeetCodeClient `getProblemDetail` precedent already rejected.
- **Two-flag double-fire defence.** `acknowledged` (set by Continue ONLY) + `decided` (set by EITHER button) is more defensive than a single flag. `acknowledged` alone allows Cancel double-fire; `decided` alone would let a future modification flip `decided` without going through Continue's persist path. Both flags are load-bearing; the test suite asserts both behaviours independently.
- **Idempotent reset path.** `resetAIDisclosures` skips providers whose flag is already false. Avoids data.json churn (every write fires the SettingsStore persist + sanitization pipeline) and respects the SettingsStore setter's side-effect-free contract when no actual change is needed. The reset Notice still fires unconditionally — confirms to the user that the command ran.
- **DISCLOSURE_BASE_COPY mutability is a feature.** The plan explicitly cites Phase 08/09/11 each appending a feature-specific bullet to `willSend`. Locking the constant via `Object.freeze` would force each downstream phase to either copy the array (drift risk) or expose a separate registration API (boilerplate). The mutation contract is documented at the export site + asserted at unit-test time.

## Gates Downstream

- **Plan 07-06 (palette commands + README + final phase metadata):** May now ship the `clear-ai-key` palette command (calls `setProviderConfig(active, { ...current, apiKey: '' })`) — the disclosure gate already protects every probe / invoke caller, so 07-06 has no AIClient-side modification to make. README "Network use" section update is the remaining 07-06 work; the plan also closes Phase 07 with the final phase metadata commit.
- **Phase 08 (streaming Debug):** May now `await aiClient.invoke({ stream: true, ... })` and inherit the disclosure gate automatically. Cancel surfaces as a thrown `Error('AI call cancelled')` at the invoke site; Phase 08 callers should catch the locked string and branch to the streaming-modal cancel state. The DISCLOSURE_BASE_COPY constant is exported with a stable shape; Phase 08 mutates `willSend` to append a Debug-specific bullet (e.g. "The error message and stack trace from the failing run") BEFORE its first invoke call site reads the constant.
- **Phase 09 (AI ACed Review):** Same pattern as Phase 08 — extends DISCLOSURE_BASE_COPY.willSend with a Review-specific bullet (e.g. "Your accepted code from `## Code` and the prior verdict") and inherits the gate via the AIClient seam.
- **Phase 11 (Knowledge Graph classifier):** Same pattern as Phase 08/09. The classifier batches calls so the disclosure gate fires on the FIRST batch invocation per provider per session if the user hasn't yet acked; subsequent batches in the same session don't re-fire (per-provider state, not per-call).

## Self-Check: PASSED

**Files (created + modified):**
- FOUND: `src/ai/disclosure.ts`
- FOUND: `tests/ai/disclosure.test.ts`
- FOUND: `tests/ai/disclosure-gate.test.ts`
- FOUND: `tests/ai/reset-disclosures-command.test.ts`
- FOUND: `src/ai/AIClient.ts` (modified — RequireDisclosureFn + ctor extension + probe/invoke gate)
- FOUND: `src/main.ts` (modified — AIDisclosureModal import + ProviderConfig type-import + AIClient injection + requireAIDisclosure + resetAIDisclosures + reset-ai-disclosures palette command)
- FOUND: `styles.css` (modified — `.leetcode-ai-disclosure` scoping rule)

**Commits:**
- FOUND: `97d9592` (Task 1 — AIDisclosureModal + DISCLOSURE_BASE_COPY + 22 tests)
- FOUND: `5123976` (Task 2 — AIClient gate + plugin wiring + reset palette + 15 tests)

**Tests:** 886 passing in full suite; 37 new tests across 3 files; 0 regressions in v1.0 or Plan 07-01..07-04 suites.
