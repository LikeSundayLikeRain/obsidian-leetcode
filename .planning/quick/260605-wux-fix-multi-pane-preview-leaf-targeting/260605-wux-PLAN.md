---
phase: quick-260605-wux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/notes/NoteWriter.ts
  - tests/note-writer-reveal-leaf.test.ts
autonomous: true
requirements:
  - QUICK-260605-WUX-01

must_haves:
  truths:
    - "When the active leaf is a non-MarkdownView (e.g. ProblemPreviewView, ProblemBrowserView), opening a problem creates the new note tab in the active tab group (the pane the user clicked from), not in a stale most-recently-active markdown leaf elsewhere."
    - "When the active leaf IS a MarkdownView, openProblem keeps the prior v1.0 UX (replaces the current tab via openLinkText) — no behavioral change."
    - "All three reveal sites in NoteWriter.openProblem (existing-cached path, recovered-canonical path, fresh-create path) route through the new helper — no direct openLinkText calls remain on the post-revealExistingLeaf reveal path."
  artifacts:
    - path: "src/notes/NoteWriter.ts"
      provides: "revealNoteFile(file: TFile) helper + three updated call sites"
      contains: "private async revealNoteFile"
    - path: "tests/note-writer-reveal-leaf.test.ts"
      provides: "Unit coverage for both branches of revealNoteFile (MarkdownView active vs. not)"
      contains: "describe('NoteWriter.openProblem reveal-leaf targeting"
  key_links:
    - from: "src/notes/NoteWriter.ts:openProblem"
      to: "src/notes/NoteWriter.ts:revealNoteFile"
      via: "all three reveal sites (existing-cached, recovered-canonical, fresh-create) call revealNoteFile after revealExistingLeaf returns false"
      pattern: "this\\.revealNoteFile\\("
---

<objective>
Fix multi-pane preview→openProblem leaf-targeting bug. When a user previews a problem in pane A and clicks Start/Open Problem, the resulting note tab must open in pane A (the active tab group), not in pane B (a stale most-recently-active MarkdownView elsewhere in the workspace).

Purpose: `app.workspace.openLinkText(path, '', false)` falls back to the most-recently-active MarkdownView when the current active leaf is not a MarkdownView (preview leaf, sidebar problem browser). In a two-pane workspace this surfaces as the note opening in the wrong pane. Single-pane works only because there's only one fallback target.

Output: Private `revealNoteFile(file)` helper on NoteWriter + three call-site replacements + a unit test covering both helper branches.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/notes/NoteWriter.ts
@src/main.ts
@src/preview/ProblemPreviewView.ts
@tests/helpers/mock-vault.ts
@tests/note-writer-folder.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add revealNoteFile helper, replace three openLinkText sites, add unit coverage</name>
  <files>src/notes/NoteWriter.ts, tests/note-writer-reveal-leaf.test.ts</files>
  <behavior>
    Helper contract — `private async revealNoteFile(file: TFile): Promise<void>` on the NoteWriter class:
    - Branch A (active leaf IS MarkdownView): call `this.app.workspace.openLinkText(file.path, '', false)` — preserves prior v1.0 UX (clicking a row replaces the open note tab).
    - Branch B (active leaf is NOT MarkdownView, including null): call `this.app.workspace.getLeaf('tab').openFile(file)` — Obsidian's `getLeaf('tab')` honors the active tab group, opening the new tab in the pane the user clicked from.
    - Detection uses `this.app.workspace.getActiveViewOfType(MarkdownView)` (MarkdownView is already imported at line 35); truthy → branch A, falsy → branch B. This mirrors the contest path at `src/main.ts:1884` and the deprecation-safe `getActiveViewOfType` access pattern called out in CLAUDE.md.

    Test contract — `tests/note-writer-reveal-leaf.test.ts`:
    - Test 1: "routes new-note reveal through getLeaf('tab').openFile when active leaf is not a MarkdownView"
      - Mock workspace where `getActiveViewOfType` returns `null`; spy on `getLeaf('tab')` returning a leaf with an `openFile` spy; assert `openFile` called once with the TFile, `openLinkText` NOT called.
    - Test 2: "routes new-note reveal through openLinkText when a MarkdownView is active"
      - Mock workspace where `getActiveViewOfType` returns a truthy MarkdownView-shaped object; spy on `openLinkText` and `getLeaf`; assert `openLinkText` called with `(path, '', false)`, `getLeaf` NOT called.
    - Both tests use the fresh-create path (no cached detail, no existing file) — the simplest reproduction since it doesn't require seeding `state.files` with a pre-existing note.
  </behavior>
  <action>
    Step 1 — Edit `src/notes/NoteWriter.ts`:

    (a) Add a new private helper method on the `NoteWriter` class, placed immediately after `revealExistingLeaf` (current end at line 292) and before `waitForFrontmatterIndexed` (current line 314). Method takes `file: TFile`, returns `Promise<void>`. Implementation: read `this.app.workspace.getActiveViewOfType(MarkdownView)`; if truthy, `await this.app.workspace.openLinkText(file.path, '', false)`; otherwise `const leaf = this.app.workspace.getLeaf('tab'); await leaf.openFile(file);`. Add a brief WHY-non-obvious comment block explaining the leaf-targeting bug (the v1.3 ProblemPreviewView / ProblemBrowserView active-leaf case), per the CLAUDE.md "no comments unless WHY-non-obvious" rule. Mirror the contest path shape at `src/main.ts:1884`.

    (b) Replace the three call sites where `openLinkText` is invoked AFTER the `revealExistingLeaf` early-return guard:
      - Line 346 (existing-cached path): `await this.app.workspace.openLinkText(existingFile.path, '', false);` → `await this.revealNoteFile(existingFile);`
      - Line 421 (recovered-canonical path): `await this.app.workspace.openLinkText(existingAtCanonical.path, '', false);` → `await this.revealNoteFile(existingAtCanonical);`
      - Line 523 (fresh-create path): `await this.app.workspace.openLinkText(file.path, '', false);` → `await this.revealNoteFile(file);`
      Each replacement stays inside the existing `if (!this.revealExistingLeaf(...)) { ... }` block. Do not touch `revealExistingLeaf` (line 278) or any call to it. Do not modify the tab-idempotent early-return semantics.

    Step 2 — Create `tests/note-writer-reveal-leaf.test.ts`. Mirror the file shape of `tests/note-writer-folder.test.ts` (imports, `makeMockSettings` inline factory, `makeMockVaultApp` from helpers, `makeMockLeetCodeClient` + `makeMockDetail`). The existing `makeMockVaultApp` already provides `workspace.openLinkText` and `workspace.getActiveViewOfType` spies (see `tests/helpers/mock-vault.ts:75-78,109-112`). The test must extend the workspace object on the returned `m.app` with a `getLeaf` spy returning `{ openFile: vi.fn() }` BEFORE constructing the writer — assign via `(m.app.workspace as Record<string, unknown>).getLeaf = vi.fn(() => ...)`. For Test 2, swap `m.spies.getActiveViewOfType.mockReturnValue({})` (any truthy object — the helper only checks truthiness, not instanceof, since the production guard uses `getActiveViewOfType(MarkdownView)` whose typed return is the type test).

    Notes on test assertions:
    - The fresh-create path triggers `waitForFrontmatterIndexed` (16-tick × 50ms = ~800ms ceiling). Seed metadataCache via `m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' })` BEFORE awaiting `writer.openProblem('two-sum')` so the poll exits on the first tick. Without this the test will spin for ~800ms (still passes, just slow).
    - Use `await writer.openProblem('two-sum')` and assert post-await — both branches resolve before the openProblem promise.

    Step 3 — Run the focused tests + the full notes test slice. The plan is intentionally tight: code change is ~20 LOC + ~80 LOC of test. Both code change and test land in this single task because the helper is simple and the test verifies both branches without external setup.
  </action>
  <verify>
    <automated>npm test -- tests/note-writer-reveal-leaf.test.ts tests/note-writer-folder.test.ts tests/re-open-silent-offline.test.ts tests/note-writer-force-refresh.test.ts</automated>
  </verify>
  <done>
    - `src/notes/NoteWriter.ts` exports a `revealNoteFile` private method on `NoteWriter`.
    - All three `await this.app.workspace.openLinkText(` call sites inside `openProblem` (formerly lines 346, 421, 523) are replaced with `await this.revealNoteFile(...)`. Verify with: `grep -n "this\.app\.workspace\.openLinkText" src/notes/NoteWriter.ts` returns zero matches inside the `openProblem` method body (the file may still contain the string in comments or in `revealExistingLeaf` is unaffected — `revealExistingLeaf` does NOT call openLinkText, so the grep should return zero matches across the whole file outside of any explanatory comment).
    - `tests/note-writer-reveal-leaf.test.ts` exists, exports two `it(...)` cases, and both pass under vitest.
    - The four test files in the verify command all pass (regression check: existing reveal-path tests still green).
    - `npm run build` succeeds (TypeScript strict mode happy with the new method signature).
  </done>
</task>

</tasks>

<verification>
- `npm test -- tests/note-writer-reveal-leaf.test.ts` — both new test cases pass.
- `npm test -- tests/note-writer-folder.test.ts tests/re-open-silent-offline.test.ts tests/note-writer-force-refresh.test.ts` — existing reveal-path tests still pass (regression guard; the helper preserves prior behavior on the MarkdownView-active branch which is what those tests exercise).
- `grep -nE "this\\.app\\.workspace\\.openLinkText\\(" src/notes/NoteWriter.ts | grep -v '^[^:]*:[ ]*//' | wc -l` returns `0` — no production call sites remain (commented references are filtered out by the `grep -v` of leading `//`).
- `grep -nE "private async revealNoteFile" src/notes/NoteWriter.ts` returns exactly one match.
- `npm run build` succeeds with TypeScript strict checks.
</verification>

<success_criteria>
- The bug is fixed for the multi-pane preview→openProblem case: in a two-pane workspace, previewing a problem in pane A and clicking Start/Open Problem creates the note tab in pane A, not pane B. (Verified empirically by the developer in the dev vault — outside the test surface, but the helper's branch B is the targeted fix.)
- The single-pane case is unchanged.
- The active-MarkdownView UX (clicking a browser row replaces the currently-open note tab) is unchanged.
- The `revealExistingLeaf` tab-idempotency early-return is unchanged.
- The contest path at `src/main.ts:1884` is untouched.
- Existing 1,713-test suite remains green; the new test file adds 2 cases.
</success_criteria>

<output>
Create `.planning/quick/260605-wux-fix-multi-pane-preview-leaf-targeting/260605-wux-SUMMARY.md` when done, capturing: the helper signature, the three replaced sites, the test file path + case count, and the verification command transcript (build OK, tests OK).
</output>
