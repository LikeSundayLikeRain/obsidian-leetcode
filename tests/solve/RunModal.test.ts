// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-07 D-03 / D-05 / D-06 / D-07 — RunModal seeds from
// exampleTestcases, Reset re-seeds, × hidden at single-tab minimum, Run
// passes only the active tab's input, onClose pushes tabs back to the store.
// Turns green when Plan 05 ships `src/solve/RunModal.ts`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return {
    ...actual,
    Modal: class {
      app: unknown;
      contentEl: HTMLElement = document.createElement('div');
      modalEl: HTMLElement = document.createElement('div');
      titleEl: HTMLElement = document.createElement('div');
      constructor(app: unknown) {
        this.app = app;
      }
      open() {
        (this as unknown as { onOpen(): void }).onOpen();
      }
      close() {
        (this as unknown as { onClose(): void }).onClose();
      }
      onOpen() {
        /* child overrides */
      }
      onClose() {
        /* child overrides */
      }
    },
  };
});

interface RunModalCtor {
  new (
    app: unknown,
    opts: {
      slug: string;
      exampleTestcases: string;
      store: FakeStore;
      onRun: (input: string) => void;
    },
  ): {
    open(): void;
    close(): void;
    contentEl: HTMLElement;
  };
}

interface FakeStore {
  getOrSeed: ReturnType<typeof vi.fn>;
  setTabs: ReturnType<typeof vi.fn>;
  resetToSamples: ReturnType<typeof vi.fn>;
}

function makeStore(initialTabs: string[]): FakeStore {
  let tabs = [...initialTabs];
  return {
    getOrSeed: vi.fn((_slug: string, _ex: string) => tabs),
    setTabs: vi.fn((_slug: string, next: string[]) => {
      tabs = [...next];
    }),
    resetToSamples: vi.fn((_slug: string, _ex: string) => {
      tabs = ['[1]\n2', '[3]\n4'];
      return tabs;
    }),
  };
}

describe('Phase 5 RunModal (D-03 / D-05 / D-06 / D-07)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('opens with tabs seeded from exampleTestcases via the store', async () => {
    const mod = (await import('../../src/solve/RunModal')) as unknown as {
      RunModal?: RunModalCtor;
    };
    expect(typeof mod.RunModal).toBe('function');

    const store = makeStore(['[2,7,11,15]\n9', '[3,2,4]\n6']);
    const onRun = vi.fn();
    const modal = new mod.RunModal!({} as never, {
      slug: 'two-sum',
      exampleTestcases: '[2,7,11,15]\n9\n\n[3,2,4]\n6',
      store,
      onRun,
    });
    modal.open();

    expect(store.getOrSeed).toHaveBeenCalledWith('two-sum', '[2,7,11,15]\n9\n\n[3,2,4]\n6');
    const tabButtons = modal.contentEl.querySelectorAll('.leetcode-run-tab');
    expect(tabButtons.length).toBe(2);
  });

  it('Reset button wipes + re-seeds via store.resetToSamples (D-05)', async () => {
    const mod = (await import('../../src/solve/RunModal')) as unknown as {
      RunModal?: RunModalCtor;
    };
    expect(typeof mod.RunModal).toBe('function');

    const store = makeStore(['user-edited']);
    const onRun = vi.fn();
    const modal = new mod.RunModal!({} as never, {
      slug: 'two-sum',
      exampleTestcases: '[1]\n2\n\n[3]\n4',
      store,
      onRun,
    });
    modal.open();

    const resetBtn = modal.contentEl.querySelector(
      'button.leetcode-run-reset',
    ) as HTMLButtonElement | null;
    expect(resetBtn).not.toBeNull();
    resetBtn!.click();

    expect(store.resetToSamples).toHaveBeenCalledWith('two-sum', '[1]\n2\n\n[3]\n4');
  });

  // SUPERSEDED by D-01 in Phase 5.4 — onRun now joins all tabs.
  // Phase 5.4 Plan 01 Task 3 keeps this it-block under it.skip so the
  // historical contract is documented for future readers; Plan 02 will
  // delete it once D-01 lands and the new D-01 it-block below is GREEN.
  it.skip('D-07: single active tab only (SUPERSEDED by D-01 in Phase 5.4)', async () => {
    const mod = (await import('../../src/solve/RunModal')) as unknown as {
      RunModal?: RunModalCtor;
    };
    expect(typeof mod.RunModal).toBe('function');

    const tabs = ['INPUT_A', 'INPUT_B', 'INPUT_C'];
    const store = makeStore(tabs);
    const onRun = vi.fn();
    const modal = new mod.RunModal!({} as never, {
      slug: 'two-sum',
      exampleTestcases: 'INPUT_A\n\nINPUT_B\n\nINPUT_C',
      store,
      onRun,
    });
    modal.open();

    // Activate the second tab (index 1 → INPUT_B).
    const tabButtons = Array.from(
      modal.contentEl.querySelectorAll('.leetcode-run-tab'),
    ) as HTMLElement[];
    expect(tabButtons.length).toBe(3);
    (tabButtons[1] as HTMLButtonElement).click();

    const runBtn = modal.contentEl.querySelector(
      'button.leetcode-run-submit, button.leetcode-run-run',
    ) as HTMLButtonElement | null;
    expect(runBtn).not.toBeNull();
    runBtn!.click();

    expect(onRun).toHaveBeenCalledTimes(1);
    const passed = onRun.mock.calls[0]![0] as string;
    // D-07: single active tab only. Must NOT include the non-active tabs.
    expect(passed).toBe('INPUT_B');
    expect(passed).not.toContain('INPUT_A');
    expect(passed).not.toContain('INPUT_C');
  });

  // D-01 (Phase 5.4): clicking Run joins ALL tabs into one newline-
  // separated string so a single batched interpret_solution call
  // covers every case (matches LC.com). RED until Plan 02 ships the
  // RunModal join change.
  it('D-01: onRun joins all tabs into single newline-separated string (Phase 5.4)', async () => {
    const mod = (await import('../../src/solve/RunModal')) as unknown as {
      RunModal?: RunModalCtor;
    };
    expect(typeof mod.RunModal).toBe('function');

    const tabs = ['INPUT_A', 'INPUT_B'];
    const store = makeStore(tabs);
    const onRun = vi.fn();
    const modal = new mod.RunModal!({} as never, {
      slug: 'two-sum',
      exampleTestcases: 'INPUT_A\n\nINPUT_B',
      store,
      onRun,
    });
    modal.open();

    const runBtn = modal.contentEl.querySelector(
      'button.leetcode-run-submit, button.leetcode-run-run',
    ) as HTMLButtonElement | null;
    expect(runBtn).not.toBeNull();
    runBtn!.click();

    expect(onRun).toHaveBeenCalledTimes(1);
    const passed = onRun.mock.calls[0]![0] as string;
    // D-01: ALL tabs joined with `\n` (Phase 5.4 supersedes D-07).
    expect(passed).toBe('INPUT_A\nINPUT_B');
    expect(passed).toContain('INPUT_A');
    expect(passed).toContain('INPUT_B');
  });

  it('× delete button hidden when tabs.length === 1 (D-06)', async () => {
    const mod = (await import('../../src/solve/RunModal')) as unknown as {
      RunModal?: RunModalCtor;
    };
    expect(typeof mod.RunModal).toBe('function');

    const store = makeStore(['only-case']);
    const onRun = vi.fn();
    const modal = new mod.RunModal!({} as never, {
      slug: 'two-sum',
      exampleTestcases: 'only-case',
      store,
      onRun,
    });
    modal.open();

    const deleteButtons = Array.from(
      modal.contentEl.querySelectorAll('.leetcode-run-tab-delete'),
    ) as HTMLElement[];
    // All delete buttons should be hidden (either not rendered, or styled
    // `display: none`). Either empty array OR every button offsetParent=null.
    const visibleDeletes = deleteButtons.filter((d) => {
      const style = window.getComputedStyle(d);
      return style.display !== 'none' && !d.hidden;
    });
    expect(visibleDeletes.length).toBe(0);
  });

  it('onClose pushes current tabs back to store.setTabs (no vault writes)', async () => {
    const mod = (await import('../../src/solve/RunModal')) as unknown as {
      RunModal?: RunModalCtor;
    };
    expect(typeof mod.RunModal).toBe('function');

    const store = makeStore(['a', 'b']);
    const onRun = vi.fn();
    const modal = new mod.RunModal!({} as never, {
      slug: 'two-sum',
      exampleTestcases: 'a\n\nb',
      store,
      onRun,
    });
    modal.open();
    modal.close();

    expect(store.setTabs).toHaveBeenCalled();
    const lastCall = store.setTabs.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe('two-sum');
    expect(Array.isArray(lastCall[1])).toBe(true);
  });
});
