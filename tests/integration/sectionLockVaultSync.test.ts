// Regression — section lock must not rewrite content-changing transactions.
//
// Bug (pre-fix): the `EditorState.transactionFilter` in
// `src/main/sectionLockExtension.ts` snapped the cursor out of locked ranges
// on EVERY transaction that carried a selection. Obsidian dispatches its
// vault-sync transactions (the buffer reload that follows
// `app.fileManager.processFrontMatter(...)` / `app.vault.process(...)`) with an
// explicit, change-mapped selection — so those transactions reached the filter
// and, when the cursor happened to sit in a locked region (## Problem body,
// ## Code heading, fence opener/closer), got rewritten. The rewrite forced the
// cursor off its mapped position; when several syncs landed in quick succession
// (the onAccepted flow fires processFrontMatter + vault.process back-to-back)
// the editor buffer drifted from the file on disk and corrupted — duplicated /
// reversed text inside the ## Code fence.
//
// Fix: `if (tr.docChanged) return tr;` immediately after the `!tr.selection`
// guard, so cursor-snapping only fires on PURE selection moves (arrow keys,
// clicks, column/word steps). This mirrors the changeFilter's "Gate 0" intent
// (which already skips non-user-input transactions).
//
// Unlike the sibling unit/integration files, these tests build a REAL CM6
// EditorState with the actual `buildSectionLockExtension` installed and drive
// genuine transactions through it — the only way to exercise the real
// `tr.docChanged` / `tr.selection` distinction the fix turns on. The synthetic
// `makeFakeTransaction` helper used elsewhere can't model that distinction.

import { describe, it, expect, vi } from 'vitest';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorState,
  EditorSelection,
  StateField,
  type Extension,
} from '@codemirror/state';
import { createFakePlugin, createFakeMetadataCache } from '../solve/mocks/fakeWorkspace';
import {
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
} from '../../src/notes/NoteTemplate';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// The production module reads the active file via `state.field(editorInfoField)`.
// We import the SAME field instance the source imports (the obsidian stub
// re-exports it) and seed it with a file via `.init(...)` so the filter's file
// gate passes against a real EditorState.
import { editorInfoField } from '../helpers/obsidian-stub';
import { buildSectionLockExtension } from '../../src/main/sectionLockExtension';

const FILE_PATH = 'LeetCode/0207-course-schedule.md';

/** Canonical lc-slug note: frontmatter + all four locked sections + a Python
 *  fence whose body is the editable SOLVE surface. */
function canonicalNote(): string {
  return [
    '---',
    'lc-slug: course-schedule',
    'lc-language: python',
    '---',
    '',
    PROBLEM_HEADING_LINE,
    'There are numCourses courses you have to take.',
    'Some have prerequisites.',
    '',
    CODE_HEADING_LINE,
    '',
    '```python',
    'class Solution:',
    '    def canFinish(self, numCourses, prerequisites):',
    '        adj_list = [[] for _ in range(numCourses)]',
    '        return True',
    '```',
    '',
    TECHNIQUES_HEADING_LINE,
    '',
    '- [[Graph]]',
    '',
    NOTES_HEADING_LINE,
    '',
    'DFS cycle detection.',
  ].join('\n');
}

/**
 * Build a real EditorState with the section-lock extension installed and the
 * cursor at `cursorOffset`. `editorInfoField` is seeded so the filter's file
 * gate passes; the fake plugin's metadataCache supplies the `lc-slug`.
 */
function makeEditorState(doc: string, cursorOffset: number): EditorState {
  const metadataCache = createFakeMetadataCache();
  metadataCache.setFrontmatter(FILE_PATH, { 'lc-slug': 'course-schedule', 'lc-language': 'python' });
  const plugin = createFakePlugin({ metadataCache });

  const lockExtension = buildSectionLockExtension(plugin as never) as Extension;

  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorOffset),
    extensions: [
      // Seed the file the production filter reads via state.field(editorInfoField).
      (editorInfoField as StateField<{ file: { path: string } | null }>).init(
        () => ({ file: { path: FILE_PATH } }),
      ),
      lockExtension,
    ],
  });
}

/**
 * Apply a vault-sync-shaped transaction: a document change PLUS an explicit
 * selection equal to the change-mapped cursor — exactly how Obsidian dispatches
 * the buffer reload after a vault write. Returns the post-transaction cursor so
 * tests can assert it stayed at the mapped position (no snap).
 */
function applyVaultSync(
  state: EditorState,
  change: { from: number; to: number; insert: string },
): { cursor: number; mappedCursor: number; doc: string } {
  // First map the cursor through the change the way CM6 would, so we can supply
  // it explicitly the way Obsidian does.
  const mapped = state.update({ changes: change }).state.selection.main.head;
  const tr = state.update({
    changes: change,
    selection: EditorSelection.cursor(mapped),
  });
  return {
    cursor: tr.state.selection.main.head,
    mappedCursor: mapped,
    doc: tr.state.doc.toString(),
  };
}

describe('section lock — vault-sync transactions are not rewritten', () => {
  // Insert a frontmatter line, the way processFrontMatter does on AC.
  const fmInsert = (doc: string): { from: number; to: number; insert: string } => {
    const closingDashes = doc.indexOf('---\n', 4); // second `---`
    return { from: closingDashes, to: closingDashes, insert: 'lc-status: accepted\n' };
  };

  it('cursor in ## Problem body survives a processFrontMatter sync (was rewritten pre-fix)', () => {
    const doc = canonicalNote();
    const cursorOffset = doc.indexOf('Some have prerequisites.');
    expect(cursorOffset).toBeGreaterThan(0);

    const state = makeEditorState(doc, cursorOffset);
    const { cursor, mappedCursor, doc: newDoc } = applyVaultSync(state, fmInsert(doc));

    // The cursor must remain at the change-mapped position — NOT snapped out of
    // the ## Problem lock. Pre-fix the filter snapped it to a section boundary.
    expect(cursor).toBe(mappedCursor);
    // And the document is exactly the vault-sync result (content intact).
    expect(newDoc).toBe(
      doc.slice(0, fmInsert(doc).from) + 'lc-status: accepted\n' + doc.slice(fmInsert(doc).from),
    );
  });

  it('cursor on the ## Code heading survives a vault-sync', () => {
    const doc = canonicalNote();
    const cursorOffset = doc.indexOf(CODE_HEADING_LINE);
    const state = makeEditorState(doc, cursorOffset);
    const { cursor, mappedCursor } = applyVaultSync(state, fmInsert(doc));
    expect(cursor).toBe(mappedCursor);
  });

  it('cursor in the editable fence body survives a vault-sync (control)', () => {
    const doc = canonicalNote();
    const cursorOffset = doc.indexOf('        adj_list');
    const state = makeEditorState(doc, cursorOffset);
    const { cursor, mappedCursor } = applyVaultSync(state, fmInsert(doc));
    expect(cursor).toBe(mappedCursor);
  });

  it('cascading syncs (processFrontMatter then vault.process) leave the buffer intact', () => {
    const doc = canonicalNote();
    const cursorOffset = doc.indexOf('Some have prerequisites.');
    const state = makeEditorState(doc, cursorOffset);

    // Sync 1 — processFrontMatter inserts two fields.
    const closingDashes = doc.indexOf('---\n', 4);
    const fmFields = 'lc-status: accepted\nlc-solved-date: 2026-05-28\n';
    const mapped1 = state
      .update({ changes: { from: closingDashes, to: closingDashes, insert: fmFields } })
      .state.selection.main.head;
    const tr1 = state.update({
      changes: { from: closingDashes, to: closingDashes, insert: fmFields },
      selection: EditorSelection.cursor(mapped1),
    });
    expect(tr1.state.selection.main.head).toBe(mapped1);

    // Sync 2 — vault.process rewrites the ## Techniques body, on the post-sync-1 state.
    const doc1 = tr1.state.doc.toString();
    const graphFrom = doc1.indexOf('- [[Graph]]');
    const graphTo = graphFrom + '- [[Graph]]'.length;
    const techInsert = '- [[Graph]]\n- [[DFS]]\n- [[Topological Sort]]';
    const mapped2 = tr1.state
      .update({ changes: { from: graphFrom, to: graphTo, insert: techInsert } })
      .state.selection.main.head;
    const tr2 = tr1.state.update({
      changes: { from: graphFrom, to: graphTo, insert: techInsert },
      selection: EditorSelection.cursor(mapped2),
    });
    expect(tr2.state.selection.main.head).toBe(mapped2);

    // Final buffer equals the two syncs applied in order — no drift / corruption.
    const expected =
      doc.slice(0, closingDashes) +
      fmFields +
      doc.slice(closingDashes).replace('- [[Graph]]', techInsert);
    expect(tr2.state.doc.toString()).toBe(expected);
  });
});

describe('section lock — pure cursor moves are still snapped out of locked ranges', () => {
  it('a click into the ## Problem body snaps the cursor to the editable boundary', () => {
    const doc = canonicalNote();
    // Start with the cursor in the editable fence body…
    const startOffset = doc.indexOf('        adj_list');
    const state = makeEditorState(doc, startOffset);

    // …then a pure selection move (no doc change) lands inside the ## Problem lock.
    const intoProblem = doc.indexOf('Some have prerequisites.');
    const tr = state.update({ selection: EditorSelection.cursor(intoProblem) });

    // The filter must still snap: the resulting cursor is NOT the requested
    // locked offset. (This proves the fix didn't disable selection-snapping.)
    expect(tr.state.selection.main.head).not.toBe(intoProblem);
  });
});
