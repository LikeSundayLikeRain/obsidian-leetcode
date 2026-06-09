// Plan 21-17 — split-pane cursor preservation (post-UAT R9).
//
// When the same LC note is open in two split panes, typing in pane A flushes
// through DebouncedWriter → vault.process → vault.on('modify'). Pre-fix, the
// modify-handler picked the FIRST matching widget (non-deterministic Map
// iteration order) and called reloadFromDisk('silent') on it — which dispatches
// a FULL-DOC REPLACEMENT with line/col-clamped selection. For pane B (the
// non-typing pane) any UPSTREAM edit by pane A would relocate pane B's caret
// to col 0 of the same line number, perceived as "cursor jumped to position 0".
//
// Plan 21-17 fix: modify-handler routes self-write echoes through a per-pane
// peer-sync path:
//   1. selfWriteSuppression.arm() now records the originator's registryKey.
//   2. selfWriteSuppression.peekOriginator(path) reads it BEFORE tryConsume.
//   3. WidgetController.applyPeerSync(newBody) — incremental ChangeSpec with
//      mapped selection; carries 'leetcode.peer-sync' userEvent +
//      addToHistory.of(false).
//   4. main.ts fans out the peer-sync to all OTHER editable controllers for
//      the same path; the originator is skipped (its caret is already correct).
//
// Test surface:
//   P1..P6 — applyPeerSync direct unit tests (CM6 dispatch shape)
//   F1..F5 — modify-handler routing helper (routePeerSync) — pure function
//   R-T1, R-T2 — regression guards (decoupled subsystems)

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

import {
  ChangeSet,
  Compartment,
  EditorSelection,
  EditorState,
  StateField,
  Transaction,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { WidgetController } from '../../src/widget/WidgetController';
import { routePeerSync } from '../../src/widget/peerSyncRouting';

interface FakePlugin {
  app: {
    vault: {
      read: ReturnType<typeof vi.fn> & ((file: { path: string }) => Promise<string>);
    };
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  };
  lcSettings: { getIndentSizeOverride: () => 'auto' | 2 | 4 | 8 };
}

function makeFakePlugin(diskContent: string = ''): FakePlugin {
  return {
    app: {
      vault: {
        read: vi.fn<(file: { path: string }) => Promise<string>>(() => Promise.resolve(diskContent)),
      },
      metadataCache: { getFileCache: vi.fn(() => null) },
    },
    lcSettings: { getIndentSizeOverride: () => 4 },
  };
}

function makeWidgetView(initialDoc: string, extraExtensions: import('@codemirror/state').Extension[] = []): EditorView {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const state = EditorState.create({ doc: initialDoc, extensions: extraExtensions });
  return new EditorView({ state, parent: container });
}

function makeController(
  view: EditorView,
  plugin: FakePlugin,
  fenceIndex = 0,
  filePath = 'note.md',
  registryKey?: string,
): WidgetController {
  const file = { path: filePath } as never;
  const vimComp = new Compartment();
  return new WidgetController(view, view.dom, file, fenceIndex, plugin as never, vimComp, false, registryKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// applyPeerSync — direct unit tests (P1..P6)
// ─────────────────────────────────────────────────────────────────────────────

describe('WidgetController.applyPeerSync — incremental dispatch with mapped selection (Plan 21-17)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('P1 downstream insertion: pane B caret at offset 5 stays at offset 5 when newBody appends text far away', () => {
    const view = makeWidgetView('line1\nline2\nline3\nline4\nline5');
    // Place caret at offset 5 (end of "line1").
    view.dispatch({ selection: EditorSelection.cursor(5) });
    const ctl = makeController(view, makeFakePlugin());

    const newBody = 'line1\nline2\nline3\nline4\nline5_extra';
    ctl.applyPeerSync(newBody);

    expect(view.state.doc.toString()).toBe(newBody);
    // Caret unchanged because the edit is downstream of the caret.
    expect(view.state.selection.main.head).toBe(5);
  });

  it('P2 upstream insertion: caret at offset 4 maps forward by 4 when newBody prepends 4 chars', () => {
    const view = makeWidgetView('abc\ndef');
    // Caret at offset 4 (start of "def" — line 2 col 0).
    view.dispatch({ selection: EditorSelection.cursor(4) });
    const ctl = makeController(view, makeFakePlugin());

    const newBody = 'XXXXabc\ndef';
    ctl.applyPeerSync(newBody);

    expect(view.state.doc.toString()).toBe(newBody);
    // Caret maps forward by 4: 4 + 4 = 8 (start of "def" in new doc).
    expect(view.state.selection.main.head).toBe(8);
  });

  it('P3 upstream deletion: caret at offset 12 maps backward through the deleted range', () => {
    const view = makeWidgetView('abcdefghij\nklmno');
    // Caret at offset 12 (offset of "l" — line 2 col 1).
    view.dispatch({ selection: EditorSelection.cursor(12) });
    const ctl = makeController(view, makeFakePlugin());

    const newBody = 'cdefghij\nklmno';
    ctl.applyPeerSync(newBody);

    expect(view.state.doc.toString()).toBe(newBody);
    // First 2 chars removed: caret 12 → 10.
    expect(view.state.selection.main.head).toBe(10);
  });

  it('P4 no-op when newBody === current doc: no dispatch, caret unchanged', () => {
    const view = makeWidgetView('same');
    view.dispatch({ selection: EditorSelection.cursor(2) });
    const ctl = makeController(view, makeFakePlugin());

    const dispatchSpy = vi.spyOn(view, 'dispatch');
    ctl.applyPeerSync('same');

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(view.state.selection.main.head).toBe(2);
    expect(view.state.doc.toString()).toBe('same');
  });

  it('P5 dispatch carries leetcode.peer-sync userEvent AND addToHistory.of(false) annotations', () => {
    const view = makeWidgetView('hello');
    const ctl = makeController(view, makeFakePlugin());

    let capturedUserEvent: string | undefined;
    let capturedAddToHistory: boolean | undefined;
    const origDispatch = view.dispatch.bind(view);
    vi.spyOn(view, 'dispatch').mockImplementation((spec: never) => {
      const s = spec as { annotations?: unknown[] };
      if (Array.isArray(s.annotations)) {
        for (const a of s.annotations) {
          const ann = a as { type?: unknown; value?: unknown };
          if (ann.type === Transaction.userEvent && typeof ann.value === 'string') {
            capturedUserEvent = ann.value;
          }
          if (ann.type === Transaction.addToHistory && typeof ann.value === 'boolean') {
            capturedAddToHistory = ann.value;
          }
        }
      }
      origDispatch(spec);
    });

    ctl.applyPeerSync('hello world');

    expect(capturedUserEvent).toBe('leetcode.peer-sync');
    expect(capturedAddToHistory).toBe(false);
  });

  it('P6 dispatch.changes is INCREMENTAL — single contiguous range, NOT full-doc replacement', () => {
    const view = makeWidgetView('hello');
    const ctl = makeController(view, makeFakePlugin());

    let capturedChanges: unknown;
    const origDispatch = view.dispatch.bind(view);
    vi.spyOn(view, 'dispatch').mockImplementation((spec: never) => {
      const s = spec as { changes?: unknown };
      capturedChanges = s.changes;
      origDispatch(spec);
    });

    // Insert 'X' at index 5: shared prefix "hello", shared suffix "" → spec
    // describes a minimal { from: 5, to: 5, insert: 'X' }.
    ctl.applyPeerSync('helloX');

    // Reconstruct the ChangeSet to inspect the contiguous range.
    const oldLen = 'hello'.length;
    const set = ChangeSet.of(capturedChanges as Parameters<typeof ChangeSet.of>[0], oldLen);
    let rangeCount = 0;
    let captured: { fromA: number; toA: number; inserted: string } | null = null;
    set.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      rangeCount++;
      captured = { fromA, toA, inserted: inserted.toString() };
    });
    expect(rangeCount).toBe(1);
    expect(captured).not.toBeNull();
    if (captured !== null) {
      const c = captured as { fromA: number; toA: number; inserted: string };
      expect(c.fromA).toBe(5);
      expect(c.toA).toBe(5);
      expect(c.inserted).toBe('X');
    }
  });

  it('refreshes currentDocHash after the dispatch (Pitfall P2 absorption gate)', async () => {
    const view = makeWidgetView('hello');
    const ctl = makeController(view, makeFakePlugin());
    ctl.currentDocHash = 'old-hash-placeholder';

    ctl.applyPeerSync('hello world');

    // currentDocHash refresh is fire-and-forget — sha1 wraps a real
    // crypto.subtle.digest Promise that needs both microtask AND macrotask
    // drains to settle. Poll up to ~50ms for the assignment to land.
    for (let i = 0; i < 50; i++) {
      if (ctl.currentDocHash !== 'old-hash-placeholder') break;
      await new Promise((r) => window.setTimeout(r, 1));
    }
    expect(ctl.currentDocHash).not.toBe('old-hash-placeholder');
    expect(ctl.currentDocHash.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routePeerSync — modify-handler fan-out routing (F1..F5)
// ─────────────────────────────────────────────────────────────────────────────
//
// Tests the pure routing helper extracted from main.ts. Given an event
// (originator + matching controllers) the helper returns the per-controller
// dispatch decision: 'apply-peer-sync' | 'reload-silent' | 'skip'.
// The main.ts modify handler calls routePeerSync to decide what to do per
// controller, then invokes the corresponding method.

interface MockController {
  registryKey: string;
  filePath: string;
  isEmbed: boolean;
  readOnly: boolean;
}

function ctl(
  registryKey: string,
  filePath: string,
  opts: { isEmbed?: boolean; readOnly?: boolean } = {},
): MockController {
  return {
    registryKey,
    filePath,
    isEmbed: opts.isEmbed ?? false,
    readOnly: opts.readOnly ?? false,
  };
}

describe('routePeerSync — modify-handler fan-out routing (Plan 21-17)', () => {
  it('F1 two panes, same file: originator skipped; peer receives apply-peer-sync (NOT reload-silent)', () => {
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const B = ctl('note.md::0::leaf-B::lp', 'note.md');
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, B],
    });

    expect(decision.kind).toBe('peer-fan-out');
    if (decision.kind !== 'peer-fan-out') return;
    // A is skipped (originator), B receives apply-peer-sync.
    const aDecision = decision.perController.find((d) => d.registryKey === A.registryKey);
    const bDecision = decision.perController.find((d) => d.registryKey === B.registryKey);
    expect(aDecision?.action).toBe('skip-originator');
    expect(bDecision?.action).toBe('apply-peer-sync');
  });

  it('F2 external edit (consumeResult=miss): single-controller path → reload-silent', () => {
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: null,
      consumeResult: 'miss',
      controllers: [A],
    });

    expect(decision.kind).toBe('reload-silent');
  });

  it('F2b external edit with two panes: still reload-silent on the first matching widget (preserves R8 byte-identical)', () => {
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const B = ctl('note.md::0::leaf-B::lp', 'note.md');
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: null,
      consumeResult: 'stale',
      controllers: [A, B],
    });
    // External edit (no armed suppression) → reload-silent path is taken
    // — Plan 21-17 leaves the existing single-controller branch unchanged.
    expect(decision.kind).toBe('reload-silent');
  });

  it('F3 embed widget on same file is NEVER routed to apply-peer-sync (single-editable-controller short-circuit)', () => {
    // A (editable) + C (embed) → only ONE editable controller on the file.
    // The fan-out doesn't activate (no editable peer to dispatch to);
    // C.applyPeerSync is therefore never invoked.
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const C = ctl('note.md::0::leaf-C::lp', 'note.md', { isEmbed: true });
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, C],
    });
    // No editable peer → single-pane-consumed; C.applyPeerSync is NEVER called.
    expect(decision.kind).toBe('single-pane-consumed');
  });

  it('F3b embed widget alongside two editable panes IS marked skip-embed-or-readonly', () => {
    // A (editable, originator) + B (editable, peer) + C (embed). The fan-out
    // activates because there are 2 editable controllers. C is filtered to
    // skip-embed-or-readonly.
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const B = ctl('note.md::0::leaf-B::lp', 'note.md');
    const C = ctl('note.md::0::leaf-C::lp', 'note.md', { isEmbed: true });
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, B, C],
    });
    if (decision.kind !== 'peer-fan-out') return expect(decision.kind).toBe('peer-fan-out');
    const cDecision = decision.perController.find((d) => d.registryKey === C.registryKey);
    expect(cDecision?.action).toBe('skip-embed-or-readonly');
    const bDecision = decision.perController.find((d) => d.registryKey === B.registryKey);
    expect(bDecision?.action).toBe('apply-peer-sync');
  });

  it('F4 readOnly widget on same file is NEVER routed to apply-peer-sync (single-editable short-circuit)', () => {
    // A (editable) + R (readOnly Reading-mode) → only ONE editable controller.
    // The fan-out doesn't activate; R.applyPeerSync is never invoked.
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const R = ctl('note.md::0::leaf-R::read', 'note.md', { readOnly: true });
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, R],
    });
    expect(decision.kind).toBe('single-pane-consumed');
  });

  it('F4b readOnly widget alongside two editable panes IS marked skip-embed-or-readonly', () => {
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const B = ctl('note.md::0::leaf-B::lp', 'note.md');
    const R = ctl('note.md::0::leaf-R::read', 'note.md', { readOnly: true });
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, B, R],
    });
    if (decision.kind !== 'peer-fan-out') return expect(decision.kind).toBe('peer-fan-out');
    const rDecision = decision.perController.find((d) => d.registryKey === R.registryKey);
    expect(rDecision?.action).toBe('skip-embed-or-readonly');
  });

  it('F5 three panes, same file: A is originator, B and C both receive apply-peer-sync', () => {
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const B = ctl('note.md::0::leaf-B::lp', 'note.md');
    const C = ctl('note.md::0::leaf-C::lp', 'note.md');
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, B, C],
    });

    if (decision.kind !== 'peer-fan-out') return expect(decision.kind).toBe('peer-fan-out');
    const bDecision = decision.perController.find((d) => d.registryKey === B.registryKey);
    const cDecision = decision.perController.find((d) => d.registryKey === C.registryKey);
    expect(bDecision?.action).toBe('apply-peer-sync');
    expect(cDecision?.action).toBe('apply-peer-sync');
  });

  it('single editable controller and consumed event: returns single-pane consumed (no fan-out, no reload)', () => {
    const A = ctl('note.md::0::leaf-A::lp', 'note.md');
    const decision = routePeerSync({
      filePath: 'note.md',
      originatingRegistryKey: 'note.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A],
    });
    // No peer to fan out to; the existing 'consumed' silent return.
    expect(decision.kind).toBe('single-pane-consumed');
  });

  it('different file paths are filtered out of the peer fan-out', () => {
    const A = ctl('a.md::0::leaf-A::lp', 'a.md');
    const X = ctl('b.md::0::leaf-X::lp', 'b.md'); // different file
    const B = ctl('a.md::0::leaf-B::lp', 'a.md');
    const decision = routePeerSync({
      filePath: 'a.md',
      originatingRegistryKey: 'a.md::0::leaf-A::lp',
      consumeResult: 'consumed',
      controllers: [A, X, B],
    });

    if (decision.kind !== 'peer-fan-out') return expect(decision.kind).toBe('peer-fan-out');
    // X must be filtered out — it's on a different file.
    const xDecision = decision.perController.find((d) => d.registryKey === X.registryKey);
    expect(xDecision).toBeUndefined();
    // A skipped, B fans out.
    expect(decision.perController.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression guards (R-T1, R-T2)
// ─────────────────────────────────────────────────────────────────────────────

describe('Plan 21-17 regression guards', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('R-T2 StateField recompute path on B is NOT suppressed by the addToHistory.of(false) annotation', () => {
    // A synthetic StateField that counts updates whose tr.docChanged === true.
    let docChangedCount = 0;
    const counterField = StateField.define<number>({
      create: () => 0,
      update(value, tr) {
        if (tr.docChanged) docChangedCount++;
        return value + (tr.docChanged ? 1 : 0);
      },
    });

    const view = makeWidgetView('hello', [counterField]);
    const ctl = makeController(view, makeFakePlugin());

    const before = docChangedCount;
    ctl.applyPeerSync('hello world');
    expect(docChangedCount).toBe(before + 1);
    // The addToHistory.of(false) eats undo-stack semantics ONLY; StateField
    // updates fire normally on doc change.
    expect(view.state.field(counterField)).toBeGreaterThanOrEqual(1);
  });

  it('R-T1 applyPeerSync dispatch is purely doc/selection — does NOT mutate paneState', () => {
    const view = makeWidgetView('hello');
    const ctl = makeController(view, makeFakePlugin());
    expect(ctl.paneState).toBe('active');

    ctl.applyPeerSync('hello world');

    // applyPeerSync is decoupled from the multi-pane focus subsystem owned
    // by reconcileFocus (Plan 21-12). It must not flip pane state.
    expect(ctl.paneState).toBe('active');
  });
});
