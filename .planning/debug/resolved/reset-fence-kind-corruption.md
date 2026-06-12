---
status: diagnosed
trigger: "Phase 20 UAT T10 — Reset to starter code (both action row icon AND command palette) replaces the v1.3 ```leetcode-solve fence with a plain ```<lang> codeblock — destroys the widget on the note."
created: 2026-06-01T01:59:53Z
updated: 2026-06-01T01:59:53Z
---

## Current Focus

hypothesis: confirmed — `forceInjectCodeSection` + `codeBlockFor` pair has zero awareness of fence kind. They emit `\`\`\`${lcSlugToFenceTag(langSlug)}` unconditionally and locate target blocks via `LC_LANG_SLUGS` membership only — `leetcode-solve` is not a langSlug, so the leetcode-solve fence is never matched as the "block to replace" and a plain `\`\`\`<lang>` block is grafted into `## Code` instead.
test: end-to-end read of `resetCode → resetCodeWithConfirm → forceInjectCodeSection → stripFirstRecognizedCodeBlock` + `codeBlockFor` + the existing test suite.
expecting: a fence-kind-aware reset path that preserves `\`\`\`leetcode-solve` when present.
next_action: hand off to the fix author. No code changes were made (read-only investigation).

## Symptoms

expected: Reset (both action-row icon AND command palette) leaves the leetcode-solve fence in place; only the BODY between `\`\`\`leetcode-solve` and the closing `\`\`\`` is replaced with the LC starter snippet for the active language. Widget continues to mount.
actual: Reset rewrites `## Code` to contain a plain `\`\`\`<lang>` (e.g., `\`\`\`python`) opener. The original `\`\`\`leetcode-solve` opener is either:
  (a) replaced wholesale (when the prior fence body had a recognized langSlug somewhere — but the leetcode-solve opener itself is NOT a langSlug, so this branch is not taken), or
  (b) left in place AS A SEPARATE FENCE while a fresh `\`\`\`<lang>` block is grafted at the top of the section (the `stripFirstRecognizedCodeBlock` returns `null` → "No recognized block — insert starter at top of section").
  In either case, the user-visible `\`\`\`leetcode-solve` fence is destroyed or duplicated; the widget's mount predicate (`fence.kind === 'leetcode-solve'`) breaks.
errors: none — silent data corruption.
reproduction: open any v1.3 problem note with a `\`\`\`leetcode-solve` fence under `## Code`. Trigger Reset via either (a) action-row icon → `resetFromWidget` → `resetWithSlug` → `resetCode`; or (b) command palette `reset-code` → `resetCode`. Both paths converge on `resetCode` (`src/main.ts:3947`).
started: Phase 20 Plan 20-09 — when v1.3 introduced the `\`\`\`leetcode-solve` fence kind. The reset code path was authored in Phase 5.2 (Plan 04 D-07) for the v1.2 langSlug-fence world and was never updated to the v1.3 fence kind.

## Eliminated

(none — root cause confirmed on first read pass; no alternative hypotheses tested.)

## Evidence

- timestamp: 2026-06-01T01:55:00Z
  checked: `src/main.ts:760-770` (command palette wiring) and `src/main.ts:2845-2859` (`resetFromWidget`).
  found: command palette `editorCheckCallback` calls `void this.resetCode(file, slug)` at line 767. `resetFromWidget` at line 2848-2859 calls `this.resetWithSlug(file, lcSlug)` which at line 2662-2664 calls `await this.resetCode(file, slug)`. **Both action-row icon AND command palette converge on the SAME `resetCode` body at `src/main.ts:3947` — confirms shared fault surface.**
  implication: a single fix at `resetCode` (or downstream in `resetCodeWithConfirm` / `forceInjectCodeSection` / `codeBlockFor`) covers both trigger paths.

- timestamp: 2026-06-01T01:55:30Z
  checked: `src/solve/resetCodeWithConfirm.ts` end-to-end.
  found: the helper accepts `langSlug` (resolved via `resolveActiveLangSlug` priority chain at line 165-169) and starter code (line 170-171), then calls `forceInjectCodeSection(currentBody, { starterCode, langSlug })` at lines 179-182 (child path) and 188-189 (vault.process path). **The helper itself NEVER inspects fence kind. There is no `fenceKind` field on `ResetCodeWithConfirmDeps`, no resolver for it, no path that branches on it.**
  implication: kind-awareness must be added to `forceInjectCodeSection` / `codeBlockFor` OR threaded through this helper as a new dep.

- timestamp: 2026-06-01T01:56:00Z
  checked: `src/solve/starterCodeInjector.ts` `forceInjectCodeSection` body, `stripFirstRecognizedCodeBlock`, and `codeBlockFor` (`src/notes/NoteTemplate.ts:107-110`).
  found: `forceInjectCodeSection` calls `stripFirstRecognizedCodeBlock(lines, codeStart+1, codeEnd)` (line 128) which scans for fence openers matching `FENCE_OPEN = /^```([a-zA-Z0-9_+#-]*)\s*$/` and ONLY returns a match when the captured tag (a) is non-empty AND (b) resolves through `resolveLangSlug(tag, '__x__')` to a member of `LC_LANG_SLUGS` (line 217-220). **The string `leetcode-solve` is NOT a langSlug — it is not a key in `LC_LANG_FENCE_TAG` and not in `LC_LANG_SLUGS`. So the leetcode-solve fence is invisible to the strip helper.** The function returns `null` (no recognized block found), forceInjectCodeSection takes the "No recognized block — insert starter at top of section" branch (lines 129-136), and a fresh `\`\`\`<lang>` block from `codeBlockFor(opts.langSlug, opts.starterCode)` (line 126) is inserted at the top of `## Code`. The original `\`\`\`leetcode-solve` fence is left untouched as a sibling fence in the same section.
  **`codeBlockFor` (`src/notes/NoteTemplate.ts:107-110`) returns `'```' + lcSlugToFenceTag(langSlug) + '\n' + code + '\n```'` — i.e., it ALWAYS emits a langSlug-tagged opener, never `\`\`\`leetcode-solve`.**
  implication: the data-corruption mechanism is precisely confirmed. Two failure modes are possible depending on the existing fence body content; both produce a note where the user's leetcode-solve widget no longer mounts (the v1.3 widget mount predicate at `src/widget/liveModeViewPlugin.ts:77` is `fence.kind === 'leetcode-solve'`, and an inserted `\`\`\`python` fence will be tagged `kind: 'legacy'` by `findCodeFence`).

- timestamp: 2026-06-01T01:56:30Z
  checked: `src/widget/fenceLocator.ts:33-99`.
  found: `findCodeFence` returns `kind: 'leetcode-solve' | 'legacy'` based on the opener line text matching `/^\s*```leetcode-solve\b/`. With `preferLeetCodeSolve: true` (used by `switchLanguageFromWidget` at `src/main.ts:2945`), the locator skips legacy fences and keeps scanning for a leetcode-solve fence. **This is the canonical SSoT for fence-kind detection — it has been available since Phase 19/20-09.** The reset path NEVER consults it.
  implication: there is a ready-to-use, kind-aware locator. The fix likely consists of (a) locating the existing fence WITH `findCodeFence`, (b) reading its `kind`, (c) preserving `\`\`\`leetcode-solve` when `kind === 'leetcode-solve'`.

- timestamp: 2026-06-01T01:57:00Z
  checked: `switchLanguageFromWidget` at `src/main.ts:2880-2987` — the canonical kind-aware language-switch path landed in Plan 20-09.
  found: it dispatches a single `cm.dispatch({ changes: { from: bodyStart, to: bodyEnd, insert: snippet + '\n' }, ... })` where `bodyStart = cm.state.doc.line(fence.openerLine).to + 1` and `bodyEnd = cm.state.doc.line(fence.closerLine).from` — i.e., it replaces ONLY the body between the existing opener and closer lines, leaving both fence-marker lines verbatim on disk. Combined with `processFrontMatter` updating `lc-language`. **This is the design the reset path should mirror.**
  implication: the fix shape is structurally identical to `switchLanguageFromWidget` — locate fence with `findCodeFence({ preferLeetCodeSolve: true })`, replace ONLY the body span, do not touch the opener/closer lines. The `forceInjectCodeSection` "rewrite the whole fence opener" approach is the wrong primitive for v1.3 fences.

- timestamp: 2026-06-01T01:57:30Z
  checked: `tests/main/resetCommand.test.ts` (4 cases) and `tests/main/resetCommand.childDispatch.test.ts` (8 cases) and `tests/solve/starterCodeInjector.forced.test.ts` (6 cases).
  found: **EVERY fixture uses a v1.2-style langSlug fence (`\`\`\`python3`, `\`\`\`text`, etc.).** Search across all reset-related tests for the literal string `leetcode-solve` returned ZERO matches. The fixtures all have shapes like:
    - `'## Code\n\`\`\`python3\nOLD\n\`\`\`\n'` (`resetCommand.test.ts:44`)
    - `'## Code\n\`\`\`python3\nOLD_CODE\n\`\`\`\n'` (`resetCommand.childDispatch.test.ts:107`)
    - `'## Code\n\`\`\`python3\nuser wrote this — will be replaced\n\`\`\`'` (`starterCodeInjector.forced.test.ts:14`)
  All assertions check for starter-code presence (`expect(body).toContain('class S: pass')`) and OLD-code absence; none assert that the fence opener line is preserved verbatim or that `kind === 'leetcode-solve'` survives. The Plan 17 child-dispatch tests (Tests 5-8) added kind-OPAQUE coverage of the priority chain (lc-language fm > fence opener tag > default) but still seed v1.2 fixtures.
  implication: **the test suite has a structural blind spot — no fixture exercises a `\`\`\`leetcode-solve` fence through reset.** This is why CI was green when the v1.3 fence shipped in Plan 20-09 and the regression slipped to UAT.

- timestamp: 2026-06-01T01:58:00Z
  checked: 20-09-SUMMARY.md (Phase 20 Plan 09 — child→parent CM6 sync architecture).
  found: 20-09's scope was the typing-path / debounced-write / parking-lot / pane- and mode-aware adoption / pushParentToChild echo gating. The "Files Created/Modified" list does NOT include `src/solve/resetCodeWithConfirm.ts` or `src/solve/starterCodeInjector.ts` or `src/notes/NoteTemplate.ts`. **20-09 ALSO did not audit the v1.2 langSlug-fence-aware code paths for kind-awareness — the plan focused on language-switch and the typing path.** The reset path was structurally invisible to the plan.
  implication: this is a known-pattern category — "v1.3 fence-kind shipped without auditing all v1.2 langSlug-fence-aware paths." `resetCode` is one such path; future audits should sweep for `LC_LANG_SLUGS` / `lcSlugToFenceTag` / `codeBlockFor` callers and verify each is fence-kind-aware.

## Resolution

root_cause: |
  Two bugs compose:

  **Bug 1 (`src/notes/NoteTemplate.ts:107-110`, `codeBlockFor`)** — the helper unconditionally emits `'\`\`\`' + lcSlugToFenceTag(langSlug)` as the opener line. It has NO awareness of v1.3 fence kind and NO parameter to request a `\`\`\`leetcode-solve` opener. It was authored in Phase 5.3 D-04 for the v1.2 world.

  **Bug 2 (`src/solve/starterCodeInjector.ts:209-232`, `stripFirstRecognizedCodeBlock`)** — the helper only matches openers whose tag is in `LC_LANG_SLUGS`. The string `leetcode-solve` is not a langSlug, so a v1.3 leetcode-solve fence is INVISIBLE to the strip helper. `forceInjectCodeSection` (`src/solve/starterCodeInjector.ts:116-148`) consequently takes the "No recognized block — insert starter at top of section" branch (lines 129-136) and grafts a fresh `codeBlockFor(opts.langSlug, opts.starterCode)` (`\`\`\`python` etc.) above the existing leetcode-solve fence.

  **Failure surface** — `resetCode` (`src/main.ts:3947`) → `resetCodeWithConfirm` (`src/solve/resetCodeWithConfirm.ts:153`) → `forceInjectCodeSection` (`src/solve/starterCodeInjector.ts:116`). The helper has zero awareness of fence kind on input or output. Both action-row icon (`resetFromWidget` → `resetWithSlug` → `resetCode`) and command palette (`reset-code` editorCheckCallback → `resetCode`) flow through the same body at `src/main.ts:3947`.

  **Why both triggers fail identically** — `resetFromWidget` (`src/main.ts:2848-2859`) and the command palette `reset-code` (`src/main.ts:760-770`) both call `this.resetCode(file, slug)` (line 767 and 2663). The shared `resetCode` private at line 3947 is the single fault site.

  **Why tests didn't catch it** — every reset-path fixture in `tests/main/resetCommand.test.ts`, `tests/main/resetCommand.childDispatch.test.ts`, and `tests/solve/starterCodeInjector.forced.test.ts` seeds a v1.2 langSlug fence (`\`\`\`python3`, `\`\`\`text`, etc.). Zero fixtures exercise a `\`\`\`leetcode-solve` fence. Assertions check for starter-code presence/absence and language correctness, never for fence-opener preservation. Plan 20-09 introduced the v1.3 fence kind but did not audit `resetCode` for kind-awareness; the plan's "Files Modified" list excludes the entire `src/solve/*` and `src/notes/*` surface.

fix: |
  Read-only investigation — no code changes applied. The fix author has two viable shapes:

  **Shape A (preferred — mirrors the canonical kind-aware path established by `switchLanguageFromWidget`):** abandon `forceInjectCodeSection` for the reset path entirely. Replace it with a body-span replace dispatched on the existing fence:
    1. In `resetCodeWithConfirm`, accept a new dep `findExistingFence(file): { kind, openerLine, closerLine } | null` (or thread `app + file` through the existing seam to call `findCodeFence` directly via the active MarkdownView's CM6 state, mirroring `resolveActiveLangSlug`'s structure at `src/main.ts:4007-4040`).
    2. When `fence.kind === 'leetcode-solve'`: replace ONLY the body span between `openerLine.to + 1` and `closerLine.from` with the new starter snippet + trailing `\n`. Leave the `\`\`\`leetcode-solve` opener and `\`\`\`` closer lines verbatim. This is byte-for-byte the shape `switchLanguageFromWidget` uses at `src/main.ts:2951-2967`.
    3. When `fence.kind === 'legacy'` or no fence is found: fall through to the existing `forceInjectCodeSection` path for v1.2 backward compat.

  **Shape B (smaller delta — extend the existing pure helpers with fence-kind awareness):** Pass `fenceKind: 'leetcode-solve' | 'legacy' | null` (resolved by the caller via `findCodeFence`) into `forceInjectCodeSection`. Then:
    1. Update `stripFirstRecognizedCodeBlock` (or add a sibling `stripLeetCodeSolveFence`) to also match `\`\`\`leetcode-solve\b` openers when `fenceKind === 'leetcode-solve'`. The opener-search branch in `stripFirstRecognizedCodeBlock` already loops over fence openers — the gate at line 217-220 is the only exclusion.
    2. Update `codeBlockFor` (or a sibling `leetcodeSolveBlockFor`) to emit `\`\`\`leetcode-solve` instead of `\`\`\`<lang>` when caller requests it. Caller at `forceInjectCodeSection` line 126 selects the helper based on `fenceKind`.
    3. `resetCodeWithConfirm` resolves `fenceKind` upstream via `findCodeFence` (mirroring how `resolveActiveLangSlug` resolves langSlug) and threads it into `forceInjectCodeSection`.

  **Shape A is preferred** because:
    - It mirrors the canonical pattern already established by `switchLanguageFromWidget` (Plan 20-09 Task 6), so future audits find one consistent shape for "rewrite fence body without touching markers."
    - It avoids the awkwardness of `forceInjectCodeSection` having to handle TWO fence-kind discriminations (the v1.2 langSlug match + the v1.3 leetcode-solve match) when the v1.3 path is structurally simpler (just replace the body span — no need for `LC_LANG_SLUGS` membership scanning).
    - Phase 22 retires v1.2 entirely; isolating the v1.3 reset path now means Phase 22 deletion is mechanical (drop the legacy fallback branch).

  **Specific file:line locations the fix author will touch (Shape A):**
    - `src/solve/resetCodeWithConfirm.ts:88-146` — extend `ResetCodeWithConfirmDeps` with a fence-locator seam (e.g., `resolveExistingFence?: (file: TFile) => { kind: 'leetcode-solve' | 'legacy'; bodyText: string; replaceBody: (next: string) => void } | null`). Mirror the existing `getDispatchHandle` and `resolveActiveLangSlug` shapes.
    - `src/solve/resetCodeWithConfirm.ts:153-194` — branch on the locator's `kind`. For `'leetcode-solve'`, call `replaceBody(starter + '\n')` and skip the `forceInjectCodeSection` path entirely. For `'legacy'` or null, retain the current path verbatim.
    - `src/main.ts:3947-4045` — wire the new resolver alongside the existing `getDispatchHandle` and `resolveActiveLangSlug` callbacks. The resolver looks up the active MarkdownView's CM6 state, calls `findLcCodeFence(cm.state, { preferLeetCodeSolve: true })`, and returns a handle that dispatches a body-span replace with `userEvent: 'leetcode.reset.child'` (CLAUDE.md §Conventions — already in the audited callsites; do NOT add to `ECHO_PRONE_USER_EVENTS`).

  **Coverage gap fix (REQUIRED alongside the code change):**
    - `tests/main/resetCommand.test.ts` and `tests/main/resetCommand.childDispatch.test.ts` — add a fixture seeded with a `\`\`\`leetcode-solve` fence under `## Code`. Assert that AFTER reset, the file content STILL contains the literal string `\`\`\`leetcode-solve` AND contains the new starter code AND does NOT contain a stray `\`\`\`python` (or any other langSlug-tagged opener) injected as a sibling. The assertion shape:
      ```js
      const out = m.getContent(FILE_PATH)!;
      expect(out).toMatch(/^```leetcode-solve$/m);   // opener preserved verbatim
      expect(out).not.toMatch(/^```python\d?$/m);    // no langSlug opener grafted
      expect(out).toContain('class S: pass');         // body replaced
      expect(out).not.toContain('OLD_CODE');          // prior body gone
      ```
    - Plus a kind-discrimination test: legacy `\`\`\`python3` fixture continues to take the v1.2 fallback path (current behavior preserved).

verification: |
  None — read-only investigation. The fix author must apply the changes above and run:
    1. `npm test -- resetCommand` (existing 12 cases pass + new leetcode-solve cases added).
    2. `npm test -- forceInjectCodeSection` (sanity — no behavior regression on legacy path).
    3. Manual UAT replay of T10 — open a v1.3 problem note, trigger Reset via BOTH the action-row icon AND the command palette. Confirm that (a) the fence opener remains `\`\`\`leetcode-solve` verbatim, (b) the body is replaced with the LC starter, (c) the widget continues to mount, (d) cm-z scope isolation invariant holds (Phase 15 D-05) — Cmd-Z after Reset does not leak the prior body into adjacent sections.

files_changed: []
