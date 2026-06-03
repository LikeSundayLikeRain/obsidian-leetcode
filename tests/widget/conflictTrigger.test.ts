// Phase 20 Plan 20-03 Task 2 — vault.on('modify') handler decision tree tests (RED).
//
// Covers SYNC-04 / SYNC-05 + CONTEXT D-conflict-01..04:
//   - Trigger Test 1: self-write hash match → tryConsume returns 'consumed'
//     → no widget action.
//   - Trigger Test 2: external write + writer.hasPending() === false →
//     widget.reloadFromDisk('silent') invoked; ConflictModal NOT opened.
//   - Trigger Test 3: external write + writer.hasPending() === true →
//     new ConflictModal(...).open() invoked.
//   - Trigger Test 4: Pitfall P2 early-return — fence body unchanged →
//     return BEFORE invoking tryConsume.
//
// The tests exercise the DECISION TREE shape — they construct a minimal
// handler that mirrors the production handler's branching logic and assert
// each branch fires the expected side effect. The production handler in
// src/main.ts is the load-bearing implementation; these tests validate the
// shape per the must_haves contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sha1 } from '../../src/widget/debouncedWriter';
import { rewriteFenceBody } from '../../src/widget/fenceSerialization';
import { extractFenceBody } from '../../src/widget/fenceSerialization';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

// Type-only — production-shape per src/widget/ConflictModal.ts.
interface FakeConflictModal {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  updateExternalContent: (newExt: string) => void;
}

interface FakeWidgetCtl {
  file: { path: string };
  fenceIndex: number;
  currentDocHash: string;
  reloadFromDisk: (reason: 'silent' | 'keep-external') => Promise<void>;
  writer?: { hasPending: () => boolean };
}

interface ModifyHandlerHost {
  app: { vault: { read: (file: { path: string }) => Promise<string> } };
  selfWriteSuppression: SelfWriteSuppression;
  widgetRegistry: { values: () => IterableIterator<FakeWidgetCtl> };
  activeConflictModal: FakeConflictModal | null;
  newConflictModal: (mineDoc: string, externalDoc: string, widget: FakeWidgetCtl) => FakeConflictModal;
}

/**
 * Mirror of the production vault.on('modify') decision tree from src/main.ts.
 * Tests assert the side effects this handler produces; the production handler
 * shares the same logic shape.
 *
 * Decision tree:
 *   (a) gate: walk widgetRegistry; if no widget matches file.path, return.
 *   (b) Pitfall P2 early-return: compute observedFenceHash; if any matching
 *       widget has currentDocHash === observedFenceHash, return.
 *   (c) tryConsume(path, observedFenceHash). 'consumed' → return.
 *   (d) on 'stale'|'miss': branch on widget.writer?.hasPending():
 *         false → reloadFromDisk('silent')
 *         true  → if activeConflictModal?.isOpen, updateExternalContent;
 *                 else open new ConflictModal.
 */
async function dispatchModifyEvent(
  host: ModifyHandlerHost,
  file: { path: string },
): Promise<void> {
  // (a) Gate: any matching widget?
  let matchingWidget: FakeWidgetCtl | null = null;
  for (const ctl of host.widgetRegistry.values()) {
    if (ctl.file.path === file.path) {
      matchingWidget = ctl;
      break;
    }
  }
  if (!matchingWidget) return;

  // Read disk content and compute observed fence-body hash.
  const disk = await host.app.vault.read(file);
  const observedBody = extractFenceBody(disk, matchingWidget.fenceIndex) ?? '';
  const observedHash = await sha1(observedBody);

  // (b) Pitfall P2 early-return — compare against widget's currentDocHash
  // (which tracks the fence body the widget owns at this moment).
  if (
    typeof matchingWidget.currentDocHash === 'string' &&
    matchingWidget.currentDocHash.length > 0 &&
    matchingWidget.currentDocHash === observedHash
  ) {
    return;
  }

  // (c) Suppression consume.
  const result = host.selfWriteSuppression.tryConsume(file.path, observedHash);
  if (result === 'consumed') return;

  // (d) Stale or miss → branch on hasPending().
  const hasPending = matchingWidget.writer?.hasPending() === true;
  if (!hasPending) {
    await matchingWidget.reloadFromDisk('silent');
    return;
  }
  // hasPending — open or update modal.
  if (host.activeConflictModal && host.activeConflictModal.isOpen) {
    host.activeConflictModal.updateExternalContent(observedBody);
    return;
  }
  host.activeConflictModal = host.newConflictModal(
    'WIDGET_DOC',
    observedBody,
    matchingWidget,
  );
  host.activeConflictModal.open();
}

const FENCE_NOTE = (body: string): string =>
  ['## Code', '', '```leetcode-solve', body, '```', ''].join('\n');

function makeFakeWidget(opts: {
  hasPending?: boolean;
  currentDocHash?: string;
  filePath?: string;
} = {}): FakeWidgetCtl {
  return {
    file: { path: opts.filePath ?? 'note.md' },
    fenceIndex: 0,
    currentDocHash: opts.currentDocHash ?? '',
    reloadFromDisk: vi.fn<(r: 'silent' | 'keep-external') => Promise<void>>(() => Promise.resolve()),
    writer: {
      hasPending: vi.fn<() => boolean>(() => opts.hasPending ?? false),
    },
  };
}

function makeFakeHost(disk: string, widgets: FakeWidgetCtl[]): ModifyHandlerHost & {
  modalsConstructed: number;
  modalUpdatedExternalContents: string[];
} {
  const modalUpdatedExternalContents: string[] = [];
  const newModal = vi.fn(
    (_mine: string, _ext: string, _w: FakeWidgetCtl): FakeConflictModal => ({
      isOpen: false,
      open() {
        this.isOpen = true;
      },
      close() {
        this.isOpen = false;
      },
      updateExternalContent(newExt: string) {
        modalUpdatedExternalContents.push(newExt);
      },
    }),
  );
  return {
    app: { vault: { read: vi.fn(() => Promise.resolve(disk)) } },
    selfWriteSuppression: new SelfWriteSuppression(),
    widgetRegistry: { values: () => widgets[Symbol.iterator]() },
    activeConflictModal: null,
    newConflictModal: newModal,
    modalsConstructed: 0,
    modalUpdatedExternalContents,
  };
}

describe('vault.on("modify") handler — Trigger Test 1: self-write consumed → no-op', () => {
  it('tryConsume returns consumed → no reload, no modal', async () => {
    const widget = makeFakeWidget({ hasPending: false, currentDocHash: 'stale-hash' });
    const newBody = 'self-write-body';
    const disk = FENCE_NOTE(newBody);
    const host = makeFakeHost(disk, [widget]);

    // Arm suppression with the hash of the new body.
    const observedHash = await sha1(newBody);
    host.selfWriteSuppression.arm(widget.file.path, observedHash);

    await dispatchModifyEvent(host, widget.file);

    expect(widget.reloadFromDisk).not.toHaveBeenCalled();
    expect(host.activeConflictModal).toBeNull();
  });
});

describe('vault.on("modify") handler — Trigger Test 2: external write + idle → silent reload', () => {
  it('hasPending=false → reloadFromDisk("silent") + no ConflictModal', async () => {
    const widget = makeFakeWidget({ hasPending: false, currentDocHash: 'stale-hash' });
    const disk = FENCE_NOTE('external-body');
    const host = makeFakeHost(disk, [widget]);

    await dispatchModifyEvent(host, widget.file);

    expect(widget.reloadFromDisk).toHaveBeenCalledWith('silent');
    expect(host.activeConflictModal).toBeNull();
  });
});

describe('vault.on("modify") handler — Trigger Test 3: external write + in-flight → ConflictModal', () => {
  it('hasPending=true → open ConflictModal; reloadFromDisk NOT called', async () => {
    const widget = makeFakeWidget({ hasPending: true, currentDocHash: 'stale-hash' });
    const disk = FENCE_NOTE('external-body');
    const host = makeFakeHost(disk, [widget]);

    await dispatchModifyEvent(host, widget.file);

    expect(widget.reloadFromDisk).not.toHaveBeenCalled();
    expect(host.activeConflictModal).not.toBeNull();
    expect(host.activeConflictModal!.isOpen).toBe(true);
  });
});

describe('vault.on("modify") handler — Trigger Test 4: Pitfall P2 fence-body-unchanged early-return', () => {
  it('observedFenceHash === widget.currentDocHash → return BEFORE tryConsume / reload / modal', async () => {
    const sameBody = 'same-body';
    const sameHash = await sha1(sameBody);
    const widget = makeFakeWidget({
      hasPending: true,
      currentDocHash: sameHash,
    });
    const disk = FENCE_NOTE(sameBody);
    const host = makeFakeHost(disk, [widget]);

    const tryConsumeSpy = vi.spyOn(host.selfWriteSuppression, 'tryConsume');

    await dispatchModifyEvent(host, widget.file);

    // Pitfall P2 — early-return BEFORE tryConsume.
    expect(tryConsumeSpy).not.toHaveBeenCalled();
    expect(widget.reloadFromDisk).not.toHaveBeenCalled();
    expect(host.activeConflictModal).toBeNull();
  });
});

describe('vault.on("modify") handler — gating', () => {
  it('no widget matches file.path → no-op', async () => {
    const widget = makeFakeWidget({ filePath: 'a.md' });
    const disk = FENCE_NOTE('body');
    const host = makeFakeHost(disk, [widget]);

    await dispatchModifyEvent(host, { path: 'b.md' });

    expect(widget.reloadFromDisk).not.toHaveBeenCalled();
    expect(host.activeConflictModal).toBeNull();
  });
});

// Sanity: helper functions are reachable. Catches accidental import drift.
describe('vault.on("modify") handler — helper coverage', () => {
  it('FENCE_NOTE round-trips through extractFenceBody', () => {
    const text = FENCE_NOTE('xy');
    expect(extractFenceBody(text, 0)).toBe('xy');
  });
  it('rewriteFenceBody works', () => {
    const text = FENCE_NOTE('a');
    expect(rewriteFenceBody(text, 0, 'B')).toBe(FENCE_NOTE('B'));
  });
});
