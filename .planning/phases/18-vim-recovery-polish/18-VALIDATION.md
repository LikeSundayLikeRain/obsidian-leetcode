---
phase: 18
slug: vim-recovery-polish
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-25
source: derived from 18-RESEARCH.md §6 — anti-pattern-aware (live probes mandatory; source-only acceptance forbidden for UX-affecting tasks)
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Special invariant for Phase 18 (post-revert):** Unit tests alone are NOT sufficient — the previous Phase 18 attempt shipped 1738 green tests but produced three blocker UAT regressions in production. Every UX-affecting requirement here MUST also have a manual verification gate (live DevTools probe + live UAT against the user's vault). See "Manual-Only Verifications" below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (verified in `tests/main/childEditorFactory.test.ts:1` and similar) |
| **Config file** | `vitest.config.ts` at repo root |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (current baseline 1713 green / 6 skipped) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot` (full suite — fast at ~30s)
- **After every plan wave:** Run `npm run build && npx vitest run` + manual probe rerun
- **Before `/gsd:verify-work`:** Full suite green AND all three §3 probes confirmed pass on user's vault (operator-pasted output) AND 17-UAT.md Tests 17/23/25 manually run on FINAL build
- **Max feedback latency:** ~30 seconds (automated); operator-paced for manual probes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | VIM-INTERACTION-01 | — | N/A | manual:probe | `(operator-pasted DevTools output for §3.2 probe)` | N/A — checkpoint | ⬜ pending |
| 18-01-02 | 01 | 1 | VIM-INTERACTION-01 | — | Esc + i/a/o/s flow into vim's modal-state machine; only h/j/k/l/d/y/p/x candidate-intercepted (if Hypothesis A) OR no intercept added (if Hypothesis B) | unit | `npx vitest run tests/main/childEditorVimScope.test.ts` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | VIM-INTERACTION-01 | — | Live UAT — keystroke routing matches probe model; first `o` immediately editable; `:set nu` falls back to vim's default unknown-option error (NOT implemented) | manual:uat | `(operator-pasted live UAT confirmation against §3.2 post-fix probe)` | N/A — checkpoint | ⬜ pending |
| 18-02-01 | 02 | 1 | REPAIR-02-RESILIENT | — | N/A | manual:probe | `(operator-pasted DevTools output for §3.1 probe; chevron switch to python3 + c, vim dd on closer)` | N/A — checkpoint | ⬜ pending |
| 18-02-02 | 02 | 1 | REPAIR-02-RESILIENT | — | `vault.on('modify')` triggers `repairFenceStructure` for lc-slug notes only; chevron switch to python3 / c does NOT trigger registry.delete (no chevron-blank); checkStaleChildAndInvalidate is removed or no-op | unit + integration | `npx vitest run tests/main/childEditorSync.repair.test.ts tests/main/switchFenceLanguage.test.ts` | ⚠️ W0 (new repair test file) | ⬜ pending |
| 18-02-03 | 02 | 1 | REPAIR-02-RESILIENT | — | Live UAT — chevron through ALL 8 LC languages (esp python3 + c) without blank Code section; vim `dd` on closer triggers repair within ~100 ms; reload-on-broken-fence renders correct language | manual:uat | `(operator-pasted live UAT confirmation against post-fix state)` | N/A — checkpoint | ⬜ pending |
| 18-03-01 | 03 | 2 | LINENUM-RELATIVE-01 | — | N/A | manual:probe | `(operator-pasted DevTools output for §3.3 probe — gutter span text + formatNumber callback hit count)` | N/A — checkpoint | ⬜ pending |
| 18-03-02 | 03 | 2 | LINENUM-RELATIVE-01 | — | All 5 integration touchpoints wired (settings field, settings UI, factory param, PluginHost type, NestedEditorWidget pass-through); combinatorial truth table covered (showLineNumber × showRelativeLineNumbers) | unit + integration | `npx vitest run tests/main/childEditorFactory.test.ts tests/main/nestedEditorExtension.test.ts` | ❌ W0 (integration test new) | ⬜ pending |
| 18-03-03 | 03 | 2 | LINENUM-RELATIVE-01 | — | Live UAT — toggle ON + reload renders relative numbers; toggle OFF preserves absolute; `showLineNumber=false` → no `.cm-gutters` element | manual:uat | `(operator-pasted live UAT confirmation against §3.3 post-fix probe)` | N/A — checkpoint | ⬜ pending |
| 18-04-01..06 | 04 | 3 | (manual ship-readiness; no requirement coverage — closes deferred 17-06 work) | — | N/A | manual:uat + docs | `(see 18-04-PLAN.md — build, bundle audit, heap snapshot, regression spot-check, UAT docs)` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/main/childEditorVimScope.test.ts` — NEW; covers Plan 18-01 mechanism (only created if probe confirms Hypothesis A — Scope-narrow intercept)
- [ ] `tests/main/childEditorSync.repair.test.ts` — NEW; covers Plan 18-02 vault.on('modify') path + asserts checkStaleChildAndInvalidate removal
- [ ] `tests/main/switchFenceLanguage.python3.test.ts` (or extension to existing `tests/main/switchFenceLanguage.test.ts`) — covers chevron switch through python3 + c WITHOUT registry.delete; asserts (a) parent fence opener becomes `python` / `cpp`, (b) `childLanguageTracker` is set to `python3` / `c`, (c) registry entry NOT deleted, (d) `.cm-content` element exists post-switch
- [ ] `tests/main/nestedEditorExtension.integration.test.ts` — NEW; covers full chain `SettingsStore.getShowRelativeLineNumbers() → buildNestedDecorations → NestedEditorWidget.toDOM → createChildEditor → lineNumbers({formatNumber})` to prevent the "tested the contract but not the integration" gap (the previous 18-03 failure mode)
- [ ] No new framework install needed — vitest 4.1.5 already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live vim modal-state probe (Scope levels, keymap reach, where Esc is absorbed) | VIM-INTERACTION-01 | Obsidian's Scope manager + CM6's keymap + @replit/codemirror-vim's modal state machine cannot all be reproduced in vitest — they require a live Electron renderer with a focused Obsidian view. Unit-test mocks would replicate the previous failure mode. | Operator pastes `app.scope.scopes.length`, `app.scope.scopes.map(s => s.keys.length)`, output of a `keydown` listener probing keystroke recipient when child is focused — see RESEARCH §3.2 for full probe snippet. Run BEFORE coding (Plan 18-01 Task 1) AND AFTER fix (Plan 18-01 Task 3). |
| Live chevron-state probe (currentSlug, fmLang, openerSlug raw, openerSlug normalized; checkStaleChildAndInvalidate firing point) | REPAIR-02-RESILIENT | The chevron-blank-on-python3-c bug had a CONFIRMED primary cause AND a SUSPECTED secondary cause; only live capture distinguishes them. The previous unit-test pattern showed all-green while production was broken. | Operator runs the §3.1 probe snippet — instruments `checkStaleChildAndInvalidate` AND `vault.on('modify')` listener, performs chevron switch to python3 (and to c), pastes the resulting log. Run BEFORE coding (Plan 18-02 Task 1) AND AFTER fix (Plan 18-02 Task 3) including all 8 chevron languages. |
| Live UAT — first `o` keystroke produces editable cursor without requiring a second keystroke | VIM-INTERACTION-01 | User-reported symptom not in original regression doc — "first `o` creates blank line but not editable; have to hit another `i`/`a`/`o` to get a blinking cursor." Only operator-paced live testing detects this UX pathology. | Operator opens Java problem note, focuses child editor, types `i` (Insert mode), confirms typing works on first character; types Esc, types `o`, confirms blinking cursor appears AND first character typed is accepted (NOT lost). Repeat for `a` and Insert-mode-from-Visual transitions. |
| Live UAT — chevron switch to python3 / c does NOT blank the Code section across all 8 LC languages | REPAIR-02-RESILIENT | The chevron-blank regression's most damaging surface — affects core feature for 2 of 8 supported languages. Unit tests didn't catch it. | Operator opens Java problem note, uses chevron to switch through all 8 LC languages (java→python3→c→cpp→javascript→typescript→go→rust→java), confirms `.cm-content` element exists at every step (no blank Code section). |
| Live UAT — vim `dd` on fence closer triggers `repairFenceStructure` within ~100 ms | REPAIR-02-RESILIENT | The `vault.on('modify')` listener fires asynchronously; latency is not testable in vitest's synchronous model. | Operator opens problem note with vim mode ON, navigates to fence closer line via vim, types `dd`, observes that closer is restored within ~100 ms (no manual reload needed). |
| Live UAT — relative line number gutter renders correctly in all three combinatorial states (D-04 settings × 3 truth-table rows) | LINENUM-RELATIVE-01 | DOM gutter span text content cannot be asserted in vitest's headless model without bringing up a full CM6 view; the previous 18-03 unit tests showed green while gutter rendered absolute numbers in production. | Operator toggles `showRelativeLineNumbers` in settings, reloads note, captures DOM screenshot of gutter spans; repeats with `showLineNumber=false` to confirm no gutter renders. |
| 18-04 Wave 3 — final-build heap snapshot, bundle audit, regression spot-check | — (manual ship-readiness) | Heap-snapshot UAT is per CONTEXT D-23 arm b; bundle audit requires real Obsidian renderer to capture esbuild metafile contributor breakdown; regression spot-check is operator-paced. | See 18-04-PLAN.md tasks T1–T6 for exact procedures. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify, Wave 0 dependencies, OR explicit `manual:probe` / `manual:uat` gate
- [x] Sampling continuity: every plan has at most 1 auto-coding task between checkpoints (probe → auto → UAT)
- [x] Wave 0 covers all MISSING references (4 new test files identified)
- [x] No watch-mode flags (full suite ~30s)
- [x] Feedback latency < 30s for automated; operator-paced for manual
- [x] `nyquist_compliant: true` set in frontmatter (probes are MANDATORY for UX-affecting tasks; source-only acceptance is FORBIDDEN per anti-pattern guard #1 from `.continue-here.md`)

**Approval:** pending — set to approved when plan-checker re-verification passes.
