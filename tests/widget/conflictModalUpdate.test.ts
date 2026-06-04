// Phase 20 Plan 20-03 Task 2 — D-conflict-04 in-place External-pane update tests (RED).
//
// Verifies that a second vault.on('modify') event while ConflictModal is
// already open updates the External pane in place via
// `conflictModal.updateExternalContent(newContent)` rather than opening a
// SECOND modal. Asserts via spy on updateExternalContent + assertion that the
// constructor was invoked exactly once for the file's modal session.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { sha1 } from '../../src/widget/debouncedWriter';
import { extractFenceBody } from '../../src/widget/fenceSerialization';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

interface FakeConflictModal {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  // Typed callable mock — use a vi.MockInstance-bearing function that
  // is also directly callable as `(newExt: string) => void`.
  updateExternalContent: ((newExt: string) => void) & { mock: { calls: unknown[][] } };
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
  // Typed callable factory — directly callable as a function AND exposes
  // a .mock property for assertion. Mirrors vi.fn(...) at the type level.
  newConflictModal: ((mine: string, ext: string, w: FakeWidgetCtl) => FakeConflictModal) & {
    mock: { calls: unknown[][] };
  };
  modalDiskDispatched: string[];
}

const FENCE_NOTE = (body: string): string =>
  ['## Code', '', '```leetcode-solve', body, '```', ''].join('\n');

async function dispatchModifyEvent(
  host: ModifyHandlerHost,
  file: { path: string },
): Promise<void> {
  let matchingWidget: FakeWidgetCtl | null = null;
  for (const ctl of host.widgetRegistry.values()) {
    if (ctl.file.path === file.path) {
      matchingWidget = ctl;
      break;
    }
  }
  if (!matchingWidget) return;

  const disk = await host.app.vault.read(file);
  const observedBody = extractFenceBody(disk, matchingWidget.fenceIndex) ?? '';
  const observedHash = await sha1(observedBody);

  if (
    typeof matchingWidget.currentDocHash === 'string' &&
    matchingWidget.currentDocHash.length > 0 &&
    matchingWidget.currentDocHash === observedHash
  ) {
    return;
  }

  const result = host.selfWriteSuppression.tryConsume(file.path, observedHash);
  if (result === 'consumed') return;

  const hasPending = matchingWidget.writer?.hasPending() === true;
  if (!hasPending) {
    await matchingWidget.reloadFromDisk('silent');
    return;
  }
  if (host.activeConflictModal && host.activeConflictModal.isOpen) {
    host.activeConflictModal.updateExternalContent(observedBody);
    host.modalDiskDispatched.push(observedBody);
    return;
  }
  host.activeConflictModal = host.newConflictModal('WIDGET_DOC', observedBody, matchingWidget);
  host.activeConflictModal!.open();
  host.modalDiskDispatched.push(observedBody);
}

function makeWidget(opts: { hasPending: boolean }): FakeWidgetCtl {
  return {
    file: { path: 'note.md' },
    fenceIndex: 0,
    currentDocHash: 'stale',
    reloadFromDisk: vi.fn<(r: 'silent' | 'keep-external') => Promise<void>>(() => Promise.resolve()),
    writer: {
      hasPending: () => opts.hasPending,
    },
  };
}

describe('D-conflict-04 — Update Test 1: second external edit while modal open updates External pane', () => {
  let widget: FakeWidgetCtl;
  let host: ModifyHandlerHost;

  beforeEach(() => {
    widget = makeWidget({ hasPending: true });
    host = {
      app: { vault: { read: vi.fn(() => Promise.resolve(FENCE_NOTE('first-external'))) } },
      selfWriteSuppression: new SelfWriteSuppression(),
      widgetRegistry: { values: () => [widget][Symbol.iterator]() },
      activeConflictModal: null,
      newConflictModal: vi.fn(
        (_mine: string, _ext: string, _w: FakeWidgetCtl): FakeConflictModal => ({
          isOpen: false,
          open() {
            this.isOpen = true;
          },
          close() {
            this.isOpen = false;
          },
          updateExternalContent: vi.fn() as unknown as FakeConflictModal['updateExternalContent'],
        }),
      ) as unknown as ModifyHandlerHost['newConflictModal'],
      modalDiskDispatched: [],
    };
  });

  it('first modify with hasPending=true → ConflictModal constructor called once', async () => {
    await dispatchModifyEvent(host, widget.file);
    expect(host.newConflictModal).toHaveBeenCalledTimes(1);
    expect(host.activeConflictModal).not.toBeNull();
    expect(host.activeConflictModal!.isOpen).toBe(true);
  });

  it('second modify while modal open → updateExternalContent called; constructor NOT called again', async () => {
    // First fire — opens modal.
    await dispatchModifyEvent(host, widget.file);
    const firstModal = host.activeConflictModal;
    expect(host.newConflictModal).toHaveBeenCalledTimes(1);

    // Change disk content for second event.
    (host.app.vault.read as Mock<(file: { path: string }) => Promise<string>>).mockImplementation(
      async () => FENCE_NOTE('second-external'),
    );

    // Second fire — should update in place.
    await dispatchModifyEvent(host, widget.file);

    expect(host.newConflictModal).toHaveBeenCalledTimes(1);
    expect(host.activeConflictModal).toBe(firstModal);
    expect(firstModal!.updateExternalContent).toHaveBeenCalledWith('second-external');
  });

  it('THIRD modify while modal still open → updateExternalContent fires again, no new modal', async () => {
    await dispatchModifyEvent(host, widget.file);

    (host.app.vault.read as Mock<(file: { path: string }) => Promise<string>>).mockImplementation(
      async () => FENCE_NOTE('second-external'),
    );
    await dispatchModifyEvent(host, widget.file);

    (host.app.vault.read as Mock<(file: { path: string }) => Promise<string>>).mockImplementation(
      async () => FENCE_NOTE('third-external'),
    );
    await dispatchModifyEvent(host, widget.file);

    expect(host.newConflictModal).toHaveBeenCalledTimes(1);
    expect(host.activeConflictModal!.updateExternalContent).toHaveBeenCalledTimes(2);
    expect(host.activeConflictModal!.updateExternalContent).toHaveBeenLastCalledWith(
      'third-external',
    );
  });

  it('after modal closes (isOpen=false), a new modify fire constructs a new modal', async () => {
    await dispatchModifyEvent(host, widget.file);
    const firstModal = host.activeConflictModal;
    firstModal!.close();
    expect(firstModal!.isOpen).toBe(false);

    // Set ref back to null to mimic the production constructor-callback
    // cleanup (the modal's onClose fires the callback that sets activeConflictModal=null).
    host.activeConflictModal = null;

    (host.app.vault.read as Mock<(file: { path: string }) => Promise<string>>).mockImplementation(
      async () => FENCE_NOTE('post-close-external'),
    );
    await dispatchModifyEvent(host, widget.file);

    expect(host.newConflictModal).toHaveBeenCalledTimes(2);
    expect(host.activeConflictModal).not.toBe(firstModal);
  });
});
