---
phase: quick-260605-wux
plan: 01
status: complete
files_modified:
  - src/notes/NoteWriter.ts
  - tests/helpers/mock-vault.ts
  - tests/note-writer-reveal-leaf.test.ts
  - tests/offline-regenerate.test.ts
  - tests/re-open-silent-offline.test.ts
requirements:
  - QUICK-260605-WUX-01
---

# Quick 260605-wux: Fix multi-pane preview→openProblem leaf-targeting

## Summary

`NoteWriter.openProblem` previously called `app.workspace.openLinkText(path, '', false)` directly at three reveal sites. Obsidian's `openLinkText` falls back to the most-recently-active MarkdownView when the active leaf is not a MarkdownView — which is exactly the case after a user clicks Start/Open Problem from a `ProblemPreviewView` or `ProblemBrowserView` leaf. In a two-pane workspace this surfaced as the new note opening in the wrong pane (a stale MD leaf elsewhere) instead of the active tab group the user clicked from.

Routed all three reveal sites through a new pane-aware helper.

## Helper signature

```ts
private async revealNoteFile(file: TFile): Promise<void>
```

Branches on `app.workspace.getActiveViewOfType(MarkdownView)`:
- Truthy (a MarkdownView IS active) → `await this.app.workspace.openLinkText(file.path, '', false)` — preserves prior v1.0 UX (clicking a row replaces the open note tab).
- Falsy (preview / browser / null) → `await this.app.workspace.getLeaf('tab').openFile(file)` — `getLeaf('tab')` honors the active tab group.

Mirrors the contest path shape at `src/main.ts:1884`.

## Replaced sites

All three are inside `openProblem`, after the `revealExistingLeaf` early-return guard:

1. `src/notes/NoteWriter.ts:346` (existing-cached path) — `existingFile`
2. `src/notes/NoteWriter.ts:421` (recovered-canonical path) — `existingAtCanonical`
3. `src/notes/NoteWriter.ts:523` (fresh-create path) — `file`

`revealExistingLeaf` (tab-idempotency early-return) is untouched. The contest path at `src/main.ts:1884` is untouched.

## Test file

- Path: `tests/note-writer-reveal-leaf.test.ts`
- Cases: 2 (`describe('NoteWriter.openProblem reveal-leaf targeting', ...)`)
  - Test 1: routes new-note reveal through `getLeaf('tab').openFile` when active leaf is not a MarkdownView
  - Test 2: routes new-note reveal through `openLinkText` when a MarkdownView is active

## Deviations

- **[Rule 1 - Bug] Mock vault helper extended:** `tests/helpers/mock-vault.ts` now exposes a default `getLeaf` spy returning `{ openFile }` with both spies on `m.spies`. Without this, every pre-existing NoteWriter test that hits the new helper's branch B (the default — no MarkdownView active in the mock) crashed with `getLeaf is not a function`. The default keeps tests that don't care about pane targeting working unchanged; tests that DO care (e.g. the new reveal-leaf test file) override `getLeaf` per-case.
- **[Rule 1 - Bug] Two regression tests updated:** `tests/re-open-silent-offline.test.ts` and `tests/offline-regenerate.test.ts` previously asserted `m.spies.openLinkText.toHaveBeenCalled()` to confirm "reveal happened". Since the helper now routes through `getLeaf('tab').openFile` when no MarkdownView is active (the default mock state), both assertions were updated to `expect(m.spies.openFile).toHaveBeenCalled()`. The intent of those tests (silent offline / cache-fresh re-reveal without network) is preserved verbatim.

## Verification transcript

### Focused + regression slice

```
npm test -- tests/note-writer-reveal-leaf.test.ts tests/note-writer-folder.test.ts tests/re-open-silent-offline.test.ts tests/note-writer-force-refresh.test.ts tests/offline-regenerate.test.ts

 ✓ tests/note-writer-folder.test.ts (1 test) 8ms
 ✓ tests/note-writer-force-refresh.test.ts (7 tests) 10ms
 ✓ tests/note-writer-reveal-leaf.test.ts (2 tests) 11ms
 ✓ tests/re-open-silent-offline.test.ts (1 test) 15ms
 ✓ tests/offline-regenerate.test.ts (1 test) — covered in full run

 Test Files  5 passed (5)
      Tests  12 passed (12)
```

### Full suite

```
npm test
 Test Files  241 passed | 1 skipped (242)
      Tests  2859 passed | 7 skipped (2866)
   Duration  56.15s
```

### Build

```
npm run build
> obsidian-leetcode@1.3.0-beta.1 build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production

main.js  1.8M  (produced)
```

All green. TypeScript strict mode happy with the new method signature.

## Done

- `src/notes/NoteWriter.ts` exports private `revealNoteFile(file: TFile): Promise<void>`.
- All three `openLinkText` call sites inside `openProblem` route through the helper. The remaining `openLinkText` reference at `src/notes/NoteWriter.ts:311` is INSIDE the helper itself (branch A — MarkdownView-active path).
- `tests/note-writer-reveal-leaf.test.ts` adds 2 cases covering both branches.
- Full 2859-test suite remains green; build is clean.
