---
status: diagnosed
trigger: "Phase 20 UAT cluster: T3 language switch silent, T7 Run/Submit can't find code block, T9 Retrieve says no submission. Cluster investigation across runFromWidget/submitFromWidget/retrieveLastSubmissionFromWidget paths."
created: 2026-05-31T00:00:00Z
updated: 2026-05-31T00:00:00Z
---

## Current Focus

hypothesis: Three INDEPENDENT root causes — they share an architectural pattern (widget owns a body that is *just the code*, not markdown) but the failure surfaces are distinct. T7 = `extractFirstFencedBlock` fed naked code. T3 = `switchLanguageFromWidget` silently bails on `view.file !== file` plus its own kind-aware fence rejection in some panes. T9 = `forceInjectCodeSection` rewrites a v1.2-shape fence (lang slug opener) and never matches the v1.3 leetcode-solve fence — so on retrieve the leetcode-solve fence is left alone and the new code is INSERTED above it, plus the original 'No past submissions found for this problem.' Notice masks an empty rows array from `submissionHistory.get(slug)` for the cmd-palette caller too.
test: Trace each Notice to its origin and the data path feeding it.
expecting: Distinct fixes for T3 / T7 / T9.
next_action: Document evidence chain and propose three surgical fixes.

## Symptoms

expected: T3 language switch retokens fence and updates chevron; T7 Run/Submit submits current fence body; T9 Retrieve fetches last LC submission and writes into widget.
actual: T3 nothing happens; T7 'No code block found. Add a fenced block with your solution.' (user-paraphrased as "can't find the code block"); T9 'No past submissions found for this problem.' (also from cmd palette).
errors: 'No code block found. Add a fenced block with your solution.' (T7, src/main.ts:3729 + src/solve/submissionOrchestrator.ts:224); 'No past submissions found for this problem.' (T9, src/main.ts:2684).
reproduction: Open a v1.3 problem note → click action row Run/Submit/Retrieve, click chevron and select different language, command palette "Retrieve last submission".
started: After Phase 20 reconciliation/UAT work; gaps 20-08 and 20-09 attempted to fix but T3 regressed.

## Eliminated

- hypothesis: "Frontmatter key drift (lcSlug vs lc-slug)"
  evidence: "Grep over src/ shows only `lc-slug` and `lc-language` (kebab-case) in production code paths. `*FromActive`, `*FromWidget`, `getActiveProblemContext`, `switchFenceLanguage`, `switchLanguageFromWidget`, and `copyToCode` all read identical kebab-case keys. No code reads `lcSlug` or `lcLanguage` from frontmatter."
  timestamp: 2026-05-31

- hypothesis: "Widget controller stale state (ctl.view, ctl.file, ctl.fenceIndex invalid post 20-05)"
  evidence: "Phase 20-09 post-mortem rewrite kept `mountLeetCodeWidget` mutation order: ctl is constructed BEFORE mountActionRow runs (src/widget/WidgetController.ts:1032-1041). The action-row host adapter (src/widget/widgetActions.ts:105-115) closes over ctl directly, so click handlers always see the live registry-resident ctl whose .view/.file/.fenceIndex are written once at construction and never reassigned."
  timestamp: 2026-05-31

- hypothesis: "ctl.view.state.doc.toString() returns empty string after 20-09"
  evidence: "20-09 post-mortem: 'Widget owns the source of truth in memory. Child docChanges never dispatch into the parent CM6 doc directly; only DebouncedWriter writes — and only after ~500ms of typing idle.' This means `widget.view.state.doc.toString()` IS the canonical body — non-empty by construction since the writer only flushes on actual content."
  timestamp: 2026-05-31

- hypothesis: "csrftoken / cookies expired (T9-only)"
  evidence: "T9 reports 'No past submissions found for this problem.' which fires from src/main.ts:2684 *only when* `rows.length === 0`. The auth-cookies branch fires 'Not logged in.' (line 2690). User saw the empty-rows branch, so cookies were valid AND `listSubmissionsForSlug` returned an empty array OR the cached entry has empty rows."
  timestamp: 2026-05-31

## Evidence

- timestamp: 2026-05-31
  checked: "Run/Submit data flow on widget click (T7)"
  found: |
    Click → widgetActions.ts:106 host.runFromActive() → ctl.plugin.runFromWidget(ctl) → main.ts:2731.
    runFromWidget reads `code = widget.view.state.doc.toString()` (line 2733) — this is JUST THE CODE inside the fence (e.g., 'class Solution:\n    def twoSum(...)'), NOT a markdown document with ``` fences.
    Then runFromWidget invokes `runWithCode(file, lcSlug, lcTitle, lcLanguage, () => code, widgetCtxResolver)` at line 2785.
    The widgetCtxResolver returns a synthetic ctx whose `currentBody: () => widget.view.state.doc.toString()` (line 2782) — also JUST THE CODE.
    runWithCode (line 3282) opens RunModal; on user Run-click → `runInterpretedInput(current, input)` at line 3713.
    runInterpretedInput at line 3724 calls `const body = ctx.currentBody();` — gets the bare code.
    Line 3725: `extractFirstFencedBlock(body)` — this expects a markdown document with ``` opener/closer. Implementation at src/solve/codeExtractor.ts:46 uses FENCE_OPEN regex `^```([a-zA-Z0-9_+#-]*)\s*$` to find a fence; on bare code that regex never matches anywhere.
    Line 3726: `if (!extracted)` → fires 'No code block found. Add a fenced block with your solution.' Notice (line 3729). This is the verbatim "can't find code block" error the user paraphrased.
  implication: "T7 root cause: widget feeds naked fence body (raw code) into a helper (extractFirstFencedBlock) that expects markdown wrapped in ``` fences. The active-leaf path works because `ctx.currentBody = () => view.editor.getValue()` returns the WHOLE NOTE (markdown including the fence). The widget path passes only the fence-interior. Same applies to submitFromWidget at main.ts:2814 — the orchestrator's gate at submissionOrchestrator.ts:220-221 also calls extractFirstFencedBlock on getCurrentBody()."

- timestamp: 2026-05-31
  checked: "Language switch click flow on widget (T3)"
  found: |
    Click chevron item → languageChevronWidget.ts:289 `void plugin.switchLanguage(file, slug)`.
    BUT in widget mode the plugin handle is constructed by widgetActions.ts:105-115 — host.switchLanguage routes to `ctl.plugin.switchLanguageFromWidget(ctl, f, newSlug)` (line 113-114), NOT to the widget mode plugin.switchLanguage method that wraps switchFenceLanguage.
    switchLanguageFromWidget at main.ts:2910 does:
      Step (a) widget.flushNow() — OK.
      Step (b) read lc-slug — OK.
      Step (c) fetch starter code via client.getProblemDetail.
      Step (d) line 2942: `const view = this.app.workspace.getActiveViewOfType(MarkdownView);`
               line 2943: `if (!view || view.file !== file) return;` — SILENT BAIL.
      Step (d) cont line 2945: `const fence = findLcCodeFence(cm.state, { preferLeetCodeSolve: true });`
               line 2946: `if (!fence || fence.kind !== 'leetcode-solve') return;` — SILENT BAIL.
      Step (e) parent CM6 dispatch on the fence body range.
      Step (f) processFrontMatter(file, fmObj => fmObj['lc-language'] = newSlug).
    THE METADATACACHE 'CHANGED' LISTENER (src/widget/WidgetController.ts:1126-1162) is what triggers chevron refresh + Compartment.reconfigure. It fires from step (f) processFrontMatter.
    The earlier version of switchLanguageFromWidget in 20-08/20-09 may have only invoked processFrontMatter; here it ALSO does CM6 dispatch on parent (step e). If the parent CM6 view is in popout mode, OR if the user is in a Reading-mode pane, OR if the active view is a different pane (multi-pane scenario where widget click lands but active leaf is on another file), step (d) line 2943 silently returns.
    Even when the dispatch lands, this writes a body change BACK into the parent CM6 — but the v1.3 design (per 20-09 post-mortem key-decisions: 'Widget owns the source of truth in memory. Child docChanges never dispatch into the parent CM6 doc directly') uses the WIDGET'S editor as canonical. The parent CM6 dispatch is the OLD v1.2 path. After dispatch, the parent's modify handler may suppress the change as a self-write echo, or the widget may not pick up the new starter code in its own EditorView.
    Net result the user sees: chevron click → no observable change. This matches debug session `language-switch-not-wired.md`'s prior finding ("chevron label and is-current marker built once at mount and never refreshed") which 20-08 fixed via actionRowRefresh — but 20-09 then introduced switchLanguageFromWidget that uses the OLD parent-dispatch path instead of the WIDGET-dispatch path. So the chevron refresh code is wired but never fires because step (d) bails OR step (e) writes to the wrong view.
  implication: "T3 root cause: switchLanguageFromWidget at main.ts:2910 reaches for `app.workspace.getActiveViewOfType(MarkdownView)` and dispatches into the PARENT CM6, but the v1.3 architecture per 20-09 says the WIDGET'S EditorView is the source of truth. The 'view.file !== file' guard at line 2943 silently bails when the chevron click happens from a non-active leaf (e.g., split pane). Even when it doesn't bail, dispatching new starter code into the parent CM6 doesn't visibly update the widget because the widget reads from its own state.doc, not the parent. Plus processFrontMatter ONLY changes lc-language — chevron refresh fires but produces no fence body / parser change in the widget."

- timestamp: 2026-05-31
  checked: "Retrieve last submission flow (T9)"
  found: |
    Action-row click → host.retrieveLastSubmissionFromActive() (widgetActions.ts:111) → ctl.plugin.retrieveLastSubmissionFromWidget(ctl) → main.ts:2866.
    Line 2868-2871: read lc-slug from frontmatter — OK.
    Line 2876: `await this.retrieveLastSubmissionWithSlug(file, lcSlug)` → main.ts:2680.
    Line 2682: `const rows = await this.submissionHistory.get(slug);`
    Line 2683: `if (!rows || rows.length === 0) { Notice('No past submissions found for this problem.'); return; }`.
    submissionHistory is `new SubmissionHistoryStore({...})` at main.ts:425. Its fetchHistory shim at line 426 is `async (slug) => listSubmissionsForSlug(slug, cookies)`.
    SubmissionHistoryStore.getOrFetch (graph/SubmissionHistoryStore.ts:133-156) uses TTL=60s in-memory cache — for fresh cache hits it returns cached.rows.
    KEY INSIGHT: the same store is used by D-02 prefetch (NoteWriter.openProblem post-reveal hook at main.ts:449-453). That prefetch fires every time a note is OPENED. If the prefetch ran BEFORE auth was set up, OR ran during a transient session expiry, OR ran for a different slug variant, OR the LC API returned an empty array transiently, an empty `[]` rows array gets cached for 60s. Subsequent retrieveLastSubmissionWithSlug calls within 60s see `rows.length === 0` → fire the locked Notice — even though LC has submissions.
    Note: T9 ALSO fails from command palette. But there is NO `addCommand({ id: 'retrieve-last-submission', ... })` in main.ts (verified by grep). The "Retrieve last submission command" the user describes does not exist as its own palette entry — it's the action-row icon, OR it might be the "View past submissions" command (main.ts:777) which opens SubmissionPickerModal. SubmissionPickerModal also reads from the same SubmissionHistoryStore (graph/SubmissionPickerModal.ts:11 'Loading submissions...' state). If the cached rows are empty, the picker shows the empty-state placeholder 'No submissions yet.' (graph/SubmissionPickerModal.ts:183).
    Even when the network actually returns rows, copyToCode (graph/copyToCode.ts:73-78) has a SECOND failure mode: it calls `forceInjectCodeSection(current, { starterCode: code, langSlug })`. In src/solve/starterCodeInjector.ts:209-232, `stripFirstRecognizedCodeBlock` walks for a fence opener whose tag matches `LC_LANG_SLUGS` (python3/java/cpp/etc). For a v1.3 widget note, the fence opener is ```leetcode-solve — which is NOT in LC_LANG_SLUGS — so `stripFirstRecognizedCodeBlock` returns null. The fallback then INSERTS a new ```python3 fence above/in-place-of and the leetcode-solve fence is left intact. Result: a v1.3 note ends up with TWO fences after retrieve, OR a corrupted layout — but the user reports they never reach this point because the empty-rows Notice fires first.
  implication: "T9 root cause is two-layered. Surface symptom (the user-visible Notice): SubmissionHistoryStore returns empty rows from a stale 60s cache that was populated by an earlier failed prefetch (or transient LC empty response). The store dedupes by slug for 60s and never retries within that window. Underneath that — even if retrieve fetched real rows — copyToCode's forceInjectCodeSection cannot handle the leetcode-solve fence kind (same family of bug as T10's resetCode regression). Fixing only the store layer would expose the second bug; fixing both is required to make retrieve work end-to-end on v1.3 notes."

- timestamp: 2026-05-31
  checked: "Why prior gap closures (20-08, 20-09) didn't catch this"
  found: |
    20-08 (chevron refresh): added `actionRowRefresh` closure that updates chevron label + .is-current marker after metadataCache 'changed' fires. This is correctly wired (WidgetController.ts:1154-1160). But 20-08 ASSUMED switchLanguageFromWidget would (a) write fence body into the WIDGET, and (b) then update frontmatter. In practice 20-09 wrote it to dispatch into the PARENT CM6 which the widget never reads. So chevron refresh fires (b happens) but the user sees no fence-body change because the widget never picks up step (a)'s starter code. T3 escaped 20-08 because 20-08 only added new code; it didn't audit the existing switchLanguageFromWidget body.
    20-09 (post-mortem rewrite): KEY DECISION line 51-52: 'Widget owns the source of truth in memory. Child docChanges never dispatch into the parent CM6 doc directly.' But the FIRST WAVE 20-09 commits (Tasks 1-8) introduced the kind-aware findLcCodeFence + the parent-CM6 dispatch in switchLanguageFromWidget Step (e). The post-mortem REVERSED the typing path but DID NOT revisit the language-switch path — it remained on the parent-dispatch architecture even though that contradicts the new key decision. So switchLanguageFromWidget is architecturally inconsistent with its own phase's revised key-decision.
    Neither 20-08 nor 20-09 audited the *FromWidget Run/Submit code-resolution. Both assumed that `widget.view.state.doc.toString()` = "the body the orchestrator gates on" — but the orchestrator gate is `extractFirstFencedBlock(body)` which requires markdown wrapping. T7 was a latent bug that pre-dated 20-08/20-09; UAT just first exposed it after 20-08 wired action-row clicks end-to-end.
    T9's stale-cache and copyToCode-fence-kind bugs are also latent across all of phase 20 — the SubmissionHistoryStore was a phase-4 D-02 design that never accounted for v1.3 leetcode-solve fences in copyToCode.
  implication: "20-08 fixed the chevron refresh closure but not the body-replacement step. 20-09 reversed the typing path but did not reverse the language-switch path. T7 and T9 are latent v1.2-era bugs that 20-02 (FromWidget seam) routed through unchanged; UAT first exposed them when action-row clicks started reaching the orchestrators."

## Resolution

root_cause: |
  Three INDEPENDENT root causes that share the surface pattern "v1.3 widget plumbs a fence-only body through helpers that expect a v1.2 markdown body":

  1. **T7 (Run/Submit "can't find code block")** — `runFromWidget` (src/main.ts:2733, 2782) and `submitFromWidget` (src/main.ts:2794, 2819) feed `widget.view.state.doc.toString()` (the fence body alone) into `runWithCode`/`submitWithCode`, which call `extractFirstFencedBlock(body)` at src/main.ts:3725 and src/solve/submissionOrchestrator.ts:220. extractFirstFencedBlock requires the body to be markdown containing a ``` fence; the widget passes raw code. Result: `extracted` is null → the locked Notice 'No code block found. Add a fenced block with your solution.' fires.

  2. **T3 (language switch silent)** — `switchLanguageFromWidget` (src/main.ts:2910-2987) dispatches the new starter code into the PARENT CM6 (Step e at line 2956-2967), but per 20-09 post-mortem key-decision the WIDGET owns the canonical body. The widget reads from its own `state.doc`, never re-reads the parent's fence body for language-switch starter code. Step (d) at line 2942-2946 also silently bails when the active markdown view is not the widget's file (multi-pane / popout / Reading-mode chevron click) OR when the kind-aware findLcCodeFence rejects the fence as non-leetcode-solve. The chevron-refresh closure DOES fire correctly via the metadataCache 'changed' listener (WidgetController.ts:1154-1160) when processFrontMatter writes lc-language at line 2977 — but the user sees no fence-body change, no parser swap inside the widget, hence "nothing happens". 20-08's chevron-refresh fix is wired correctly; 20-09's switchLanguageFromWidget body is architecturally wrong.

  3. **T9 (retrieve last submission empty)** — Two-layered. Surface: `SubmissionHistoryStore.get(slug)` (graph/SubmissionHistoryStore.ts:107) returns cached empty `rows[]` for 60s when an earlier prefetch (NoteWriter.openProblem hook at main.ts:449) returned empty (transient LC blip, race with auth init, or no-auth-yet at note-open time). Within that window, retrieveLastSubmissionWithSlug at main.ts:2682-2685 fires the locked 'No past submissions found for this problem.' Notice. Underneath: even with real rows, `copyToCode` (graph/copyToCode.ts:73-78) → `forceInjectCodeSection` → `stripFirstRecognizedCodeBlock` (src/solve/starterCodeInjector.ts:217-220) walks for a fence opener tag in LC_LANG_SLUGS — `leetcode-solve` is NOT in that set → null return → fallback fresh-insert path runs, producing a duplicate or corrupted fence on v1.3 notes (this is the same bug family as T10 resetCode).

fix: |
  Three surgical fixes — each closes its own gap; they DO NOT compose into one fix.

  **T7 fix** — Update `runFromWidget` and `submitFromWidget` to pass the widget body wrapped in a synthetic markdown fence so downstream extractFirstFencedBlock matches:
  - `src/main.ts:2733` — change `const code = widget.view.state.doc.toString();` to construct a synthetic fenced body: `const fenceBody = widget.view.state.doc.toString(); const synthetic = '```' + lcLanguage + '\n' + fenceBody + '\n```\n';`
  - `src/main.ts:2782` — change `currentBody: () => widget.view.state.doc.toString()` to `currentBody: () => '```' + freshLanguage + '\n' + widget.view.state.doc.toString() + '\n```\n'`.
  - `src/main.ts:2819` — same wrap on the submit path's getCurrentBody closure.
  - Alternative (preferred long-term): change `runWithCode`/`submitWithCode`/`runInterpretedInput` to accept code+lang directly, skip extractFirstFencedBlock entirely on the widget path. But the synthetic-wrap approach is the smallest-radius fix.

  **T3 fix** — Rewrite `switchLanguageFromWidget` (src/main.ts:2910-2987) to dispatch the new starter code into the WIDGET's CM6, not the parent:
  - Drop step (d): `app.workspace.getActiveViewOfType(MarkdownView)` lookup AND the `view.file !== file` guard AND the parent-CM6 `findLcCodeFence` lookup (lines 2942-2967).
  - Replace with a single dispatch on `widget.view`:
    `widget.view.dispatch({ changes: { from: 0, to: widget.view.state.doc.length, insert: snippet } });`
  - Keep step (f) processFrontMatter — that fires the metadataCache 'changed' listener at WidgetController.ts:1126 which calls Compartment.reconfigure (parser swap) AND actionRowRefresh (chevron label + is-current). Both observable signals appear.
  - The DebouncedWriter will then flush the new body to disk after ~500ms idle (matches the 20-09 post-mortem typing-path architecture).
  - Remove `findLcCodeFence` import if unused after this change.

  **T9 fix** — Two parts:
  - Part A (surface): in `retrieveLastSubmissionWithSlug` (src/main.ts:2680-2707), invalidate the cache before fetching so the user always gets a fresh round-trip on this user-initiated action: insert `this.submissionHistory.invalidate(slug);` before line 2682. This closes the stale-empty-cache window without touching D-02 prefetch semantics.
  - Part B (underneath, must ship together with Part A): make `copyToCode` (graph/copyToCode.ts) preserve the leetcode-solve fence kind. Add a fence-kind detection step BEFORE calling forceInjectCodeSection: scan `current` for `^\s*```leetcode-solve` opener — if present, perform the body replacement directly between that opener and its matching closer (preserving the leetcode-solve tag). Only fall through to forceInjectCodeSection for legacy v1.2 notes. The leetcode-solve fence body replacement should be the same shape as the T3 fix's widget.view.dispatch — single transaction, body-only — but operating at the markdown text layer through vault.process. (T10 is the symmetric fix for resetCode in src/solve/resetCodeWithConfirm.ts; consider deduplicating both into a shared `replaceLeetCodeSolveFenceBody(noteText, newCode): string` helper in src/widget/fenceSerialization.ts since fenceSerialization already owns extractFenceBody for the leetcode-solve fence.)

verification: |
  After fixes ship:
  - **T7**: click Run from a v1.3 widget — Run modal opens (no Notice); LC returns Run verdict.
  - **T7**: click Submit from a v1.3 widget — VerdictModal opens (no Notice); LC returns Submit verdict.
  - **T3**: click chevron, pick a different language — fence body content swaps to that language's starter code (visible in the widget); chevron label updates to the new language; .is-current marker re-targets in the dropdown; parser tokens re-color to match the new language pack; lc-language frontmatter reflects the new slug.
  - **T9 Part A**: click Retrieve in action row — store invalidates, fresh fetch; if LC has submissions the user sees them; cmd-palette path (View past submissions) also gets fresh data.
  - **T9 Part B**: after retrieve fetches real code, the leetcode-solve fence body is replaced with the submission code, fence opener stays as `\`\`\`leetcode-solve`, no duplicate fences are produced.

files_changed:
  - "src/main.ts:2731-2825 — runFromWidget + submitFromWidget body wrapping"
  - "src/main.ts:2910-2987 — switchLanguageFromWidget rewrite to widget.view.dispatch"
  - "src/main.ts:2682 — submissionHistory.invalidate(slug) before get(slug)"
  - "src/graph/copyToCode.ts — fence-kind detection, leetcode-solve body replacement"
  - "src/widget/fenceSerialization.ts (optional new helper) — replaceLeetCodeSolveFenceBody"
