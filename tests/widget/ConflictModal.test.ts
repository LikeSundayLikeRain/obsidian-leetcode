// Phase 20 Plan 20-03 Task 2 — ConflictModal tests (RED).
//
// Covers SYNC-05 + CONTEXT D-conflict-01..04 + UI-SPEC §"Visual Layout
// Contracts §2" + Modal Test 8 (lifecycle BLOCKER fix) + Modal Test 9
// (WARNING #6 activeConflictModal cleanup):
//   - Modal Test 1: opens with heading + paragraph + 3 buttons (Keep mine
//     setCta, Keep external, View diff)
//   - Modal Test 2: Keep mine click → widget.writer.forceFlush + close +
//     Notice('Local edits saved.', 3000)
//   - Modal Test 3: Keep external click → widget.reloadFromDisk('keep-external')
//     + close + Notice('Reloaded from disk.', 3000)
//   - Modal Test 4: View diff click → modal stays open; appends 3-column
//     diff container with classes lc-conflict-mine/external/merged
//   - Modal Test 5: updateExternalContent mutates the external pane and
//     re-runs lineDiff for the merged column
//   - Modal Test 6: onClose() empties contentEl
//   - Modal Test 7: zero `innerHTML` usages — verified via dynamic check
//     of textContent / createEl / setText only
//   - Modal Test 8: lifecycle invariant — onClose() sets isOpen=false +
//     plugin.activeConflictModal=null via constructor callback
//   - Modal Test 9: after close, plugin.activeConflictModal === null

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock obsidian — provide a Modal stub that exposes contentEl + onOpen/onClose
// hooks, a Setting stub with chainable addButton, and a Notice with capture.
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');

  const noticeCalls: Array<{ message: string; timeout?: number }> = [];
  class Notice {
    message: string;
    timeout?: number;
    constructor(message: string, timeout?: number) {
      this.message = message;
      this.timeout = timeout;
      noticeCalls.push({ message, timeout });
    }
  }

  // Modal stub — onOpen / onClose are user-defined; open()/close() invoke
  // them. We intentionally DO NOT have ConflictModal override open()/close()
  // (the BLOCKER fix); the stub mimics Obsidian's guarantee that onClose
  // fires exactly once.
  class Modal {
    app: unknown;
    contentEl: HTMLDivElement;
    constructor(app: unknown) {
      this.app = app;
      const el = document.createElement('div');
      // empty() helper matching Obsidian's HTMLElement.empty() signature.
      // Obsidian augments HTMLElement.prototype with empty(); jsdom doesn't.
      (el as HTMLElement & { empty?: () => void }).empty = function empty() {
        while (this.firstChild) this.removeChild(this.firstChild);
      };
      this.contentEl = el;
    }
    open(): void {
      // Mimic Obsidian: lifecycle callback fires after open() invocation.
      (this as unknown as { onOpen?: () => void }).onOpen?.();
    }
    close(): void {
      (this as unknown as { onClose?: () => void }).onClose?.();
    }
  }

  // Setting stub — chainable addButton; each button captures its onClick
  // handler. Tests grab the buttons via setting.buttons[i].
  class Setting {
    containerEl: HTMLElement;
    buttons: Array<{
      buttonEl: HTMLButtonElement;
      onClickHandler?: (e?: MouseEvent) => unknown;
      isCta: boolean;
      labelText: string;
    }> = [];
    constructor(containerEl: HTMLElement) {
      this.containerEl = containerEl;
    }
    addButton(cb: (btn: ButtonComponent) => unknown): this {
      const buttonEl = document.createElement('button');
      this.containerEl.appendChild(buttonEl);
      const record = {
        buttonEl,
        onClickHandler: undefined as ((e?: MouseEvent) => unknown) | undefined,
        isCta: false,
        labelText: '',
      };
      const btn: ButtonComponent = {
        setButtonText: (t: string) => {
          buttonEl.textContent = t;
          record.labelText = t;
          return btn;
        },
        setCta: () => {
          buttonEl.classList.add('mod-cta');
          record.isCta = true;
          return btn;
        },
        onClick: (h: (e?: MouseEvent) => unknown) => {
          record.onClickHandler = h;
          buttonEl.addEventListener('click', () => {
            void h();
          });
          return btn;
        },
      };
      cb(btn);
      this.buttons.push(record);
      return this;
    }
  }

  interface ButtonComponent {
    setButtonText: (t: string) => ButtonComponent;
    setCta: () => ButtonComponent;
    onClick: (h: (e?: MouseEvent) => unknown) => ButtonComponent;
  }

  return {
    ...actual,
    Modal,
    Setting,
    Notice,
    __noticeCalls: noticeCalls,
  };
});

// jsdom doesn't add Obsidian's createEl/createDiv/empty augmentations to
// HTMLElement.prototype. Patch the minimal subset our tests need so the
// test stubs (and the production code under test) behave identically.
// These match the real Obsidian polyfills well enough for textContent /
// className / setText reads. Cast through `unknown` because Obsidian's
// d.ts already declares typed overloads for createEl with DomElementInfo;
// our shim is a runtime-only test fixture, not a typed contract.
beforeEach(() => {
  const proto = HTMLElement.prototype as unknown as {
    createEl?: (tag: string, opts?: { text?: string; cls?: string }) => HTMLElement;
    createDiv?: (opts?: { cls?: string }) => HTMLDivElement;
    createSpan?: (opts?: { cls?: string }) => HTMLSpanElement;
    empty?: () => void;
    setText?: (t: string) => void;
  };
  if (!proto.createEl) {
    proto.createEl = function createEl(this: HTMLElement, tag: string, opts?: { text?: string; cls?: string }): HTMLElement {
      const el = document.createElement(tag);
      if (opts?.text) el.textContent = opts.text;
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.createDiv) {
    proto.createDiv = function createDiv(this: HTMLElement, opts?: { cls?: string }): HTMLDivElement {
      const el = document.createElement('div');
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.createSpan) {
    proto.createSpan = function createSpan(this: HTMLElement, opts?: { cls?: string }): HTMLSpanElement {
      const el = document.createElement('span');
      if (opts?.cls) el.className = opts.cls;
      this.appendChild(el);
      return el;
    };
  }
  if (!proto.empty) {
    proto.empty = function empty(this: HTMLElement) {
      while (this.firstChild) this.removeChild(this.firstChild);
    };
  }
  if (!proto.setText) {
    proto.setText = function setText(this: HTMLElement, t: string) {
      this.textContent = t;
    };
  }
});

import { ConflictModal } from '../../src/widget/ConflictModal';

interface FakeWidget {
  writer?: { forceFlush: () => Promise<void> };
  reloadFromDisk: (reason: 'silent' | 'keep-external') => Promise<void>;
  view: { state: { doc: { toString: () => string } } };
  file: { path: string };
}

function makeFakeWidget(overrides: { mineDoc?: string; flushImpl?: () => Promise<void>; reloadImpl?: () => Promise<void> } = {}): FakeWidget {
  return {
    writer: {
      forceFlush: vi.fn<() => Promise<void>>(overrides.flushImpl ?? (() => Promise.resolve())),
    },
    reloadFromDisk: vi.fn<(r: 'silent' | 'keep-external') => Promise<void>>(overrides.reloadImpl ?? (() => Promise.resolve())),
    view: { state: { doc: { toString: () => overrides.mineDoc ?? 'a\nb\nc' } } },
    file: { path: 'note.md' },
  };
}

async function getNoticeCalls(): Promise<Array<{ message: string; timeout?: number }>> {
  const obsidian = (await import('obsidian')) as unknown as {
    __noticeCalls: Array<{ message: string; timeout?: number }>;
  };
  return obsidian.__noticeCalls;
}

describe('ConflictModal — Modal Test 1: open populates DOM with heading + paragraph + 3 buttons', () => {
  beforeEach(async () => {
    (await getNoticeCalls()).length = 0;
  });

  it('contentEl contains <h2> "External edit detected" + <p> body + 3 setting buttons', () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal(
      {} as never,
      widget as never,
      'a\nb\nc',
      'a\nb\nd',
    );
    modal.open();

    const h2 = modal.contentEl.querySelector('h2');
    expect(h2?.textContent).toBe('External edit detected');
    const p = modal.contentEl.querySelector('p');
    expect(p?.textContent).toContain('changed on disk');
    // 3 buttons (Keep mine setCta, Keep external, View diff)
    const buttons = modal.contentEl.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0]!.textContent).toBe('Keep mine');
    expect(buttons[0]!.classList.contains('mod-cta')).toBe(true);
    expect(buttons[1]!.textContent).toBe('Keep external');
    expect(buttons[1]!.classList.contains('mod-cta')).toBe(false);
    expect(buttons[2]!.textContent).toBe('View diff');
  });
});

describe('ConflictModal — Modal Test 2: Keep mine click → forceFlush + close + Notice', () => {
  beforeEach(async () => {
    (await getNoticeCalls()).length = 0;
  });

  it('clicking Keep mine invokes widget.writer.forceFlush, closes modal, fires Notice("Local edits saved.", 3000)', async () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal({} as never, widget as never, 'a', 'b');
    modal.open();

    const buttons = modal.contentEl.querySelectorAll('button');
    buttons[0]!.click();
    // Wait for any awaited forceFlush resolution.
    await Promise.resolve();
    await Promise.resolve();

    expect(widget.writer!.forceFlush).toHaveBeenCalledTimes(1);
    const notices = await getNoticeCalls();
    expect(notices).toContainEqual({ message: 'Local edits saved.', timeout: 3000 });
    expect(modal.isOpen).toBe(false);
  });
});

describe('ConflictModal — Modal Test 3: Keep external click → reloadFromDisk + close + Notice', () => {
  beforeEach(async () => {
    (await getNoticeCalls()).length = 0;
  });

  it('clicking Keep external invokes widget.reloadFromDisk("keep-external"), closes modal, fires Notice("Reloaded from disk.", 3000)', async () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal({} as never, widget as never, 'a', 'b');
    modal.open();

    const buttons = modal.contentEl.querySelectorAll('button');
    buttons[1]!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(widget.reloadFromDisk).toHaveBeenCalledWith('keep-external');
    const notices = await getNoticeCalls();
    expect(notices).toContainEqual({ message: 'Reloaded from disk.', timeout: 3000 });
    expect(modal.isOpen).toBe(false);
  });
});

describe('ConflictModal — Modal Test 4: View diff click expands inline (does NOT close modal)', () => {
  it('View diff appends 3-column container; buttons remain at top; modal stays open', () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal(
      {} as never,
      widget as never,
      'a\nb\nc',
      'a\nb\nd',
    );
    modal.open();

    const buttonsBefore = modal.contentEl.querySelectorAll('button');
    expect(buttonsBefore.length).toBe(3);

    const viewDiffBtn = buttonsBefore[2]!;
    viewDiffBtn.click();

    // Modal still open
    expect(modal.isOpen).toBe(true);
    // Buttons still present
    expect(modal.contentEl.querySelectorAll('button').length).toBe(3);

    // 3-column diff container exists
    const mineEl = modal.contentEl.querySelector('.lc-conflict-mine');
    const extEl = modal.contentEl.querySelector('.lc-conflict-external');
    const mergedEl = modal.contentEl.querySelector('.lc-conflict-merged');
    expect(mineEl).not.toBeNull();
    expect(extEl).not.toBeNull();
    expect(mergedEl).not.toBeNull();
    expect(mineEl!.textContent).toBe('a\nb\nc');
    expect(extEl!.textContent).toBe('a\nb\nd');
  });
});

describe('ConflictModal — Modal Test 5: updateExternalContent mutates External pane in place', () => {
  it('updateExternalContent updates external pane textContent + re-runs diff in merged column', () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal(
      {} as never,
      widget as never,
      'a\nb\nc',
      'a\nb\nd',
    );
    modal.open();

    // Expand the diff first.
    const buttons = modal.contentEl.querySelectorAll('button');
    buttons[2]!.click();

    const mergedBefore = modal.contentEl.querySelector('.lc-conflict-merged')!;
    const mergedSpansBefore = mergedBefore.querySelectorAll('span').length;
    expect(mergedSpansBefore).toBeGreaterThan(0);

    modal.updateExternalContent('a\nb\nc\nNEW');

    const extEl = modal.contentEl.querySelector('.lc-conflict-external')!;
    expect(extEl.textContent).toBe('a\nb\nc\nNEW');

    // Merged column re-rendered. With ext = 'a\nb\nc\nNEW' and mine = 'a\nb\nc',
    // the diff is 3 same rows + 1 external-only row.
    const mergedAfter = modal.contentEl.querySelector('.lc-conflict-merged')!;
    expect(mergedAfter.textContent).toContain('NEW');
  });

  it('updateExternalContent BEFORE diff expansion is a no-op for the merged pane (no diff yet)', () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal(
      {} as never,
      widget as never,
      'a',
      'b',
    );
    modal.open();

    // Don't click View diff. updateExternalContent should still work but not crash.
    expect(() => modal.updateExternalContent('NEW')).not.toThrow();
  });
});

describe('ConflictModal — Modal Test 6: onClose empties contentEl', () => {
  it('after close, contentEl has no children', () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal({} as never, widget as never, 'a', 'b');
    modal.open();
    expect(modal.contentEl.children.length).toBeGreaterThan(0);
    modal.close();
    expect(modal.contentEl.children.length).toBe(0);
  });
});

describe('ConflictModal — Modal Test 7: NO innerHTML in source (DOM XSS mitigation)', () => {
  it('the ConflictModal source file contains zero `innerHTML` usages', async () => {
    // Read the source file and grep for innerHTML.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/widget/ConflictModal.ts'),
      'utf8',
    );
    // Allow `innerHTML` to appear ONLY in comments — but the strictest check
    // is zero matches anywhere. CLAUDE.md no-innerHTML rule.
    expect(src).not.toMatch(/innerHTML/);
  });
});

describe('ConflictModal — Modal Test 8: lifecycle invariant (BLOCKER fix)', () => {
  it('onClose() sets isOpen=false AND fires the constructor callback', () => {
    const widget = makeFakeWidget();
    let cleanedUp = false;
    const modal = new ConflictModal(
      {} as never,
      widget as never,
      'a',
      'b',
      () => {
        cleanedUp = true;
      },
    );
    modal.open();
    expect(modal.isOpen).toBe(true);

    // Direct (modal as any).onClose() invocation — simulates Obsidian-internal
    // teardown that bypasses modal.close() (workspace teardown path).
    (modal as unknown as { onClose: () => void }).onClose();
    expect(modal.isOpen).toBe(false);
    expect(cleanedUp).toBe(true);
  });

  it('direct (modal as any).onOpen() sets isOpen=true', () => {
    const widget = makeFakeWidget();
    const modal = new ConflictModal({} as never, widget as never, 'a', 'b');
    expect(modal.isOpen).toBe(false);
    (modal as unknown as { onOpen: () => void }).onOpen();
    expect(modal.isOpen).toBe(true);
  });
});

describe('ConflictModal — Modal Test 9: WARNING #6 activeConflictModal cleanup via constructor callback', () => {
  it('after modal.close() resolves, the plugin reference is reset (constructor callback fired)', () => {
    const widget = makeFakeWidget();
    let activeRef: ConflictModal | null = null;
    const cb = () => {
      activeRef = null;
    };
    const modal = new ConflictModal({} as never, widget as never, 'a', 'b', cb);
    activeRef = modal;
    modal.open();
    expect(activeRef).toBe(modal);
    modal.close();
    expect(activeRef).toBeNull();
  });
});
