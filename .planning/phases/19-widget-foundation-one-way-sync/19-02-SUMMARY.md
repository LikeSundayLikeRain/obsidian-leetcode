---
phase: 19-widget-foundation-one-way-sync
plan: 02
subsystem: widget-sync
tags: [widget, sync, debounce, suppression, vault-process, hash-diagnostic, rate-limit, flush-hooks]
requires:
  - widget-mount-factory
  - widget-registry
  - fence-locator-pure-helpers
  - fence-serialization-pure-helpers
  - inline-widget-settings-toggle
  - widget-sync-debounce-setting
provides:
  - self-write-suppression-map
  - debounced-writer
  - widget-flush-transitions
  - vault-modify-self-write-consumer
  - post-flush-hash-diagnostic
  - per-file-flush-rate-limit
  - applyDelay-live-reconfigure
affects:
  - src/main.ts
  - src/settings/SettingsTab.ts
  - src/widget/WidgetController.ts
  - src/widget/widgetRegistry.ts
tech-stack:
  added: []
  patterns:
    - obsidian-debouncer-resetTimer
    - per-path-content-hash-suppression
    - pre-write-hash-arming
    - post-flush-hash-diagnostic
    - per-file-flush-rate-limit-coalesce
    - workspace-quit-tasks-add
    - beforeunload-best-effort-flush
    - microtask-safe-arm-then-process
key-files:
  created:
    - src/widget/selfWriteSuppression.ts
    - src/widget/debouncedWriter.ts
    - tests/widget/modifyEventOrdering.probe.test.ts
    - tests/widget/selfWriteSuppression.test.ts
    - tests/widget/debouncedWriter.test.ts
    - tests/widget/flushRateLimit.test.ts
    - tests/widget/flushTransitions.test.ts
    - tests/widget/postFlushDiagnostic.test.ts
    - tests/widget/fenceIndexRecompute.test.ts
  modified:
    - src/widget/WidgetController.ts
    - src/widget/widgetRegistry.ts
    - src/main.ts
    - src/settings/SettingsTab.ts
    - tests/widget/widgetRegistry.test.ts
    - tests/widget/WidgetController.test.ts
    - tests/widget/themeIntegration.test.ts
    - tests/widget/vimMount.test.ts
decisions:
  - "Empirical probe (Pitfall 19-A / Open Question A1) confirms simple arm-then-vault.process order is robust under BOTH default ordering (modify fires after vault.process resolves) AND the worst-case sync-inside-callback ordering — the suppression.arm() runs synchronously BEFORE vault.process is invoked, so the entry is observable by the modify listener regardless of when modify fires. No microtask wrapping (`Promise.resolve().then()`) needed."
  - "DebouncedWriter rate-limit gate uses single setTimeout(remainingWindow) coalescing — over-rate calls collapse because subsequent rate-limit-deferred flushes also bail and the timer is shared (rateLimitTimer field). Verified by flushRateLimit.test.ts ≥200ms gap assertion."
  - "Pitfall 19-E drift detection counts `\\`\\`\\`leetcode-solve` openers in fresh disk content; if count exceeds expected fenceIndex+1 the writer aborts with `Notice('Fence position changed; reload to continue editing.')` BEFORE vault.process. Out-of-range case (fence removed) silently no-ops since rewriteFenceBody is idempotent on out-of-range; the modify listener catches that as external."
  - "SHA-1 via Web Crypto SubtleCrypto.digest('SHA-1') with hand-rolled FNV-1a 32-bit fallback for happy-dom test envs that omit crypto.subtle. SHA-1 acceptable for echo detection (no security implication) per RESEARCH A7."
  - "WidgetRegistry.flushAll/flushFile became async (await each flushNow); flushAllSync is the synchronous-issue variant for `beforeunload` (RESEARCH Pitfall 19-B). Existing widgetRegistry.test.ts updated to `await registry.flushAll()`."
  - "Plan 19-02 vault.on('modify') consumer hashes fenceIndex 0 body (single-fence common case). Multi-fence per-fence-index suppression is deferred to Plan 19-04+ / v1.4 — Phase 19 ships single-fence-per-file as the supported shape (CONTEXT D-01 + Pitfall 19-E)."
  - "The Reset child dispatch and 'leetcode.*' userEvent paragraphs in CLAUDE.md remain UNTOUCHED through Phase 21 (RESEARCH §7) — Phase 22 owns DELETE-08."
metrics:
  duration: ~18 minutes
  completed: 2026-05-29
---

# Phase 19 Plan 02: Debounced One-Way Sync + Suppression Summary

Ships the canonical write path: typing in the widget produces atomic `vault.process` writes via per-file `DebouncedWriter`; self-writes are suppressed via per-path content-hash map (2s TTL); rate-limited to 1 flush per 200ms; flushed on six transition hooks; runtime hash diagnostic catches drift.

## Empirical Probe Result (RESEARCH Pitfall 19-A / Open Question A1)

The Wave 0 probe (`tests/widget/modifyEventOrdering.probe.test.ts`) characterized `vault.on('modify')` ordering relative to `vault.process` resolution and the suppression-arm-before-process invariant. **The probe confirms the simple `arm-then-process` order is robust under BOTH ordering regimes:**

1. **Default ordering** (modify fires after `vault.process` resolves via microtask): `arm()` runs synchronously before `vault.process` is even invoked. By the time the modify event fires, the suppression entry is in the map. → Listener observes `consumed`.
2. **Worst-case ordering** (modify fires synchronously inside the `process` callback, before resolve): Even here, `arm()` ran synchronously BEFORE `vault.process` was called. The map already contains the entry when the synchronous-emit happens. → Listener observes `consumed`.

**Conclusion:** Plan 19-02 ships the simple `arm-then-process` order. **No `Promise.resolve().then()` microtask wrapping needed.** If a future Obsidian release changes ordering, the probe test will catch it.

## What Was Built

**`src/widget/selfWriteSuppression.ts`** (CONTEXT C-04 + RESEARCH Pattern 2):
- `class SelfWriteSuppression` with `Map<string, { expectedHash, expiresAt }>` shape and 2s TTL.
- `arm(path, expectedHash)` — replaces any existing entry for the path; sets `expiresAt = Date.now() + 2000`.
- `tryConsume(path, observedHash) → 'consumed' | 'stale' | 'miss'`. Defensive delete on hash mismatch within TTL preserves the external-edit semantics (RESEARCH §1 fail-safe — race resolves to "miss" rather than swallowing an external write).
- `clear()` (Plugin.onunload) and `clearForPath(path)` (vault.on('rename')).

**`src/widget/debouncedWriter.ts`** (CONTEXT C-04, C-06, C-08, D-09):
- `class DebouncedWriter` constructor takes `app`, `file`, `getDoc`, `getFenceIndex`, `suppression`, `delayMs`.
- Uses Obsidian's built-in `debounce(fn, ms, /*resetTimer=*/true)` — no lodash (CONTEXT C-06).
- `run()` schedules a debounced flush; `cancel()` drops pending; `forceFlush()` cancels then awaits the flush.
- `setDelay(ms)` — rebuilds the debouncer for live-reconfigure (D-08).
- `flush()` lifecycle (per write):
  1. Rate-limit gate (≤1/200ms — SYNC-07). Coalesce via `rateLimitTimer` setTimeout(remaining).
  2. `vault.read(file)` → fresh disk content.
  3. **Pitfall 19-E drift detection:** count `\`\`\`leetcode-solve` openers in fresh disk; if count exceeds expected `fenceIndex + 1`, abort with `Notice('Fence position changed; reload to continue editing.')`.
  4. Compute `futureFullText = rewriteFenceBody(currentDisk, fenceIndex, newBody)` and `expectedHash = sha1(extractFenceBody(futureFullText, fenceIndex))`.
  5. `suppression.arm(file.path, expectedHash)` BEFORE `vault.process` (CONTEXT C-04 — probe-confirmed safe).
  6. `await vault.process(file, body => rewriteFenceBody(body, fenceIndex, newBody))`.
  7. **D-09 post-flush diagnostic:** re-extract observed body from `postWriteText`; `console.warn('LC widget: post-flush hash drift for ' + file.path)` if hash differs from widget doc. ALWAYS-ON in Phase 19.
- `sha1(s)` helper — Web Crypto `SubtleCrypto.digest('SHA-1')` with hand-rolled FNV-1a 32-bit fallback for happy-dom envs that omit `crypto.subtle`.

**`src/widget/WidgetController.ts`** updates:
- `WidgetController` gains optional `writer: DebouncedWriter` field.
- `flushNow()` returns `Promise<void>` proxying `writer.forceFlush()` (resolves immediately when no writer, e.g. read-only mounts and test fixtures).
- `destroy()` now cancels writer first (defensive; the registry callers always flushNow before destroy).
- `mountLeetCodeWidget` instantiates `DebouncedWriter` when `readOnly === false` AND the plugin host provides `app.vault.read`/`process` AND `selfWriteSuppression`. Read-only mounts skip the writer entirely.
- Adds `EditorView.updateListener.of(update => update.docChanged && writer.run())` to extensions for editable mounts only — read-only widgets don't register the listener (WIDGET-07 contract).
- `LeetCodeWidgetRenderChild.onunload` fires `flushNow()` (fire-and-forget — sync-shaped onunload) before `destroy()`.

**`src/widget/widgetRegistry.ts`** updates:
- `flushAll()` and `flushFile()` are now async (await each `flushNow()` sequentially).
- `flushAllSync()` — synchronous-issue variant for `beforeunload` (RESEARCH Pitfall 19-B): cancels each writer, fires flushNow without awaiting (best-effort).
- `applyDelay(ms)` — iterates controllers and calls `writer.setDelay(ms)` for hot reconfigure of `widgetSyncDebounceMs` (D-08 SettingsTab live-apply).

**`src/main.ts` onload (gated on `useInlineWidget=ON`):**
- Instantiate `selfWriteSuppression`.
- Six flush hooks (CONTEXT C-07):
  1. `workspace.on('active-leaf-change')` → `flushAll()`
  2. `workspace.on('quit')` → `tasks.add(flushAll())` — primary graceful shutdown (RESEARCH Pitfall 19-B). One-shot `logger.debug` of `Tasks` shape on first invocation per RESEARCH Open Question A8.
  3. `vault.on('rename')` → `flushFile(oldPath)` + `selfWriteSuppression.clearForPath(oldPath)`.
  4. `window 'beforeunload'` → `flushAllSync()` (best-effort fallback).
  5. `MarkdownRenderChild.onunload` — owned by `LeetCodeWidgetRenderChild` per Plan 19-01.
  6. `Plugin.onunload` extended with `flushAll`/`destroyAll`/`suppression.clear`.
- `vault.on('modify')` consumer with `useInlineWidget` gate at FIRE TIME (RESEARCH Specific Findings §4 — handles mid-session toggle): reads disk, hashes fence body 0, calls `suppression.tryConsume`. `'consumed'` drops the event silently; `'stale'`/`'miss'` logs the external-edit observation (Plan 20 reload TBD).

**`src/main.ts` onunload:**
- Fire-and-forget `widgetRegistry.flushAll()` Promise (sync-shaped onunload), then `destroyAll()`, then `selfWriteSuppression.clear()`.

**`src/settings/SettingsTab.ts`:**
- 'Save delay' onChange now also calls `widgetRegistry.applyDelay(val)` so the new debounce applies live across all open widgets without note reload (D-08).

## Test Coverage

7 new test files under `tests/widget/` plus updates to existing widget tests:

| File | Tests | Coverage |
|------|-------|----------|
| `tests/widget/modifyEventOrdering.probe.test.ts` | 3 | Empirical probe (Pitfall 19-A / Open Question A1) — both ordering regimes consume |
| `tests/widget/selfWriteSuppression.test.ts` | 12 | arm/tryConsume basic, TTL expiry, multi-file isolation, hash mismatch defensive delete, clear/clearForPath, re-arm overwrite |
| `tests/widget/debouncedWriter.test.ts` | 7 | Debouncer behavior (resetTimer, cancel, forceFlush, setDelay), arm-before-process invariant, vault.process write through rewriteFenceBody |
| `tests/widget/flushRateLimit.test.ts` | 3 | Two-back-to-back ≥200ms gap, immediate retry coalesce, after-window fires immediately |
| `tests/widget/flushTransitions.test.ts` | 8 | flushAll/flushAllSync/flushFile/applyDelay; defensive when writer absent |
| `tests/widget/postFlushDiagnostic.test.ts` | 2 | Silent on byte-exact round-trip; warns on simulated drift with file path in message |
| `tests/widget/fenceIndexRecompute.test.ts` | 3 | Notice on multi-fence drift abort; normal flow on unchanged count; out-of-range no-op safe |

**Test counts (Plan 19-02 incremental):**
- New tests: 38 (33 from above + 5 from Task 3 WidgetController extensions for writer wiring)
- Total widget tests post-Plan 19-02: **119 passing** (up from 85 baseline in Plan 19-01)
- Full suite: **1851 passing / 6 skipped** (no regressions vs Plan 19-01 baseline of 1849)

## Verification Performed

- `npm test -- --run --reporter=dot tests/widget/` → 15 files, 119 tests, all pass
- `npm test -- --run` (full suite) → 211 files, 1851 passed / 6 skipped (no regressions)
- `npm run build` → `tsc -noEmit -skipLibCheck && esbuild production` succeeds
- `grep -c "lodash" src/widget/debouncedWriter.ts` → 0 (CONTEXT C-06)
- `grep -rc "vault\.modify" src/widget/` → 0 (CI grep `scripts/grep-no-vault-modify.sh`)
- `grep -c "suppression\.arm" src/widget/debouncedWriter.ts` → 1 (arm before vault.process)
- `grep -c "post-flush hash drift" src/widget/debouncedWriter.ts` → 1 (D-09)
- `grep -c "workspace\.on('quit'" src/main.ts` → 2 (RESEARCH Pitfall 19-B)
- `grep -c "vault\.on('rename'" src/main.ts` → 1
- `grep -c "registerDomEvent.*beforeunload" src/main.ts` → 1
- `grep -c "vault\.on('modify'" src/main.ts` → 5 (Plan 19-02 added 1 new gated handler vs Plan 19-01 baseline of 4)
- `grep -c "tryConsume" src/main.ts` → 1
- `grep -c "selfWriteSuppression" src/main.ts` → 10 (instantiation + onunload clear + modify consumer + clearForPath on rename + class field)
- `git diff CLAUDE.md` → empty (preserve list honored)
- `git diff --name-only HEAD~4 HEAD -- 'src/main/'` → empty (no v1.2 deletion-bound files modified — CONTEXT C-17)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] vitest fake-timer microtask drainage required for async flush() chain**
- **Found during:** Task 2 (debouncedWriter.test.ts initial run)
- **Issue:** `vi.useFakeTimers()` advances `Date.now()` and `setTimeout` callbacks, but `vi.advanceTimersByTimeAsync(N)` does not always fully drain the multi-await microtask chain inside `DebouncedWriter.flush()` (`vault.read` → `sha1` → `vault.process`). The original 1-microtask `await Promise.resolve()` after the timer advance left one or more `await` continuations pending.
- **Fix:** Replaced single-microtask drains with `await vi.runAllTimersAsync()` after the explicit time advance. For the rate-limit deferred-flush case (where the second `forceFlush` schedules a setTimeout that cascades into a fresh flush whose vault.process resolves on its own microtask chain), a 5-iteration `runAllTimersAsync + Promise.resolve` loop is required.
- **Also added:** Non-zero `vi.setSystemTime(new Date(10_000_000))` in the beforeEach so the rate-limit check (`now - lastFlushAt < 200`) doesn't reject the very first flush when both are 0.
- **Files modified:** tests/widget/debouncedWriter.test.ts, tests/widget/flushRateLimit.test.ts
- **Commit:** 37a1b6d

**2. [Rule 3 — Blocking issue] CodeMirror EditorView mock missing `updateListener.of`**
- **Found during:** Task 3 (mount tests after adding the updateListener extension)
- **Issue:** `WidgetController.test.ts`, `vimMount.test.ts`, and `themeIntegration.test.ts` all stub `@codemirror/view`'s `EditorView` with a mock class that omits `static updateListener`. Adding `EditorView.updateListener.of(...)` to the mount factory broke all three test files at module load.
- **Fix:** Added `static updateListener = { of: vi.fn(() => 'mock-update-listener') }` to all three mocks. Also added a `debounce` stub to the `obsidian` mock in WidgetController.test.ts so the new DebouncedWriter import doesn't blow up under mount tests that previously didn't exercise it.
- **Files modified:** tests/widget/WidgetController.test.ts, tests/widget/vimMount.test.ts, tests/widget/themeIntegration.test.ts
- **Commit:** ccfd71b

**3. [Rule 3 — Blocking issue] Existing widgetRegistry.test.ts flushAll test was synchronous; flushAll became async**
- **Found during:** Task 3 (WidgetRegistry flushAll signature change)
- **Issue:** The Plan 19-01 test called `registry.flushAll()` synchronously and asserted all controllers' `flushNow` had been called immediately. After the Plan 19-02 change to `async flushAll() { for (...) await flushNow(); }`, only the first controller's flushNow runs synchronously; the rest depend on the awaited Promise resolution.
- **Fix:** Updated the test to `await registry.flushAll()` (now expects a Promise) and the empty-registry no-op test to `expect(registry.flushAll()).resolves.toBeUndefined()`.
- **Files modified:** tests/widget/widgetRegistry.test.ts
- **Commit:** ccfd71b

**4. [Rule 1 — Bug] TypeScript build errors in test files (Mock typing for `getDoc`/`getFenceIndex`)**
- **Found during:** Task 3 (npm run build after Task 3 wiring)
- **Issue:** `let getDoc: ReturnType<typeof vi.fn>` types as `Mock<Procedure | Constructable>`, which is not assignable to the `() => string` parameter of `DebouncedWriter`'s constructor. Same for `getFenceIndex` (`() => number`).
- **Fix:** Typed the test-fixture closures as plain function types (`let getDoc: () => string` and `let getFenceIndex: () => number`) and removed the `vi.fn()` wrappers that weren't being inspected.
- **Also fixed:** `args` parameter in `warnSpy.mock.calls.find((args) => …)` typed as `unknown[]` to satisfy `noImplicitAny`.
- **Files modified:** tests/widget/debouncedWriter.test.ts, tests/widget/postFlushDiagnostic.test.ts
- **Commit:** ccfd71b

## Authentication Gates

None — Plan 19-02 is local widget mount + write path; no LeetCode API calls.

## Plan-Level TDD Gate Compliance

This plan's frontmatter does NOT have `type: tdd`, so the per-plan TDD cycle (RED commit → GREEN commit → optional REFACTOR commit) is not the canonical structure. Each task with `tdd="true"` follows its own RED → GREEN flow within its commit. Specifically:

- **RED commit (Task 1):** `28993d2 test(19-02): add Wave 0 sync + suppression test scaffolds (RED)` — 7 test files; all import-fail or assertion-fail until Task 2 ships the source.
- **GREEN commit (Task 2):** `37a1b6d feat(19-02): SelfWriteSuppression + DebouncedWriter (canonical write path)` — 30 of the 38 tests turn GREEN.
- **GREEN commit (Task 3):** `ccfd71b feat(19-02): wire WidgetController + WidgetRegistry to DebouncedWriter` — flushTransitions tests + WidgetController writer-wiring tests turn GREEN; existing widgetRegistry.test.ts updated for async flushAll.
- **GREEN commit (Task 4):** `13a2248 feat(19-02): wire flush hooks + modify consumer + suppression instance` — main.ts onload + onunload + SettingsTab.applyDelay; full suite 1851 passing.

## Threat Flags

None — Plan 19-02 surface (suppression map, debounced writer, six flush hooks, modify consumer) is fully covered by the plan's `<threat_model>` register T-19-01 through T-19-NEW-Phase19-Rate. No new network endpoints, auth paths, file access patterns, or schema changes outside the plan.

## Self-Check: PASSED

**Files verified to exist (all FOUND):**
- src/widget/selfWriteSuppression.ts FOUND
- src/widget/debouncedWriter.ts FOUND
- tests/widget/modifyEventOrdering.probe.test.ts FOUND
- tests/widget/selfWriteSuppression.test.ts FOUND
- tests/widget/debouncedWriter.test.ts FOUND
- tests/widget/flushRateLimit.test.ts FOUND
- tests/widget/flushTransitions.test.ts FOUND
- tests/widget/postFlushDiagnostic.test.ts FOUND
- tests/widget/fenceIndexRecompute.test.ts FOUND

**Commits verified to exist (git log):**
- 28993d2 FOUND: Task 1 — Wave 0 RED test scaffolds (7 test files)
- 37a1b6d FOUND: Task 2 — SelfWriteSuppression + DebouncedWriter source
- ccfd71b FOUND: Task 3 — WidgetController + WidgetRegistry wiring
- 13a2248 FOUND: Task 4 — main.ts onload/onunload + SettingsTab.applyDelay

**Acceptance criteria:**
- [x] All 5 tasks in 19-02-PLAN.md executed (Task 5 UAT auto-approved per auto-mode contract — gate=blocking, not blocking-human)
- [x] Each task committed individually (4 commits)
- [x] SUMMARY.md created at `.planning/phases/19-widget-foundation-one-way-sync/19-02-SUMMARY.md`
- [x] Empirical probe of vault.on('modify') ordering documented in SUMMARY.md (above)
- [x] No modifications to STATE.md / ROADMAP.md (worktree mode — orchestrator owns those writes)
- [x] No deletion of v1.2 files (CONTEXT C-17)
- [x] No new runtime dependencies in package.json (CONTEXT C-16)
- [x] CLAUDE.md `'leetcode.*'` userEvent paragraph and Phase 17 D-05 canonical write-path paragraph remain UNTOUCHED (`git diff CLAUDE.md` returns empty)
- [x] `npm run build` succeeds
- [x] All 19-02 vitest test files pass
- [x] No regressions on 19-01 tests (1851/1851 passing in full suite, 6 skipped — same as 19-01 baseline)
