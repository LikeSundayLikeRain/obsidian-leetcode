// tests/ai/disclosure.test.ts
//
// Phase 07 Plan 05 Task 1 — AIDisclosureModal + DISCLOSURE_BASE_COPY tests.
//
// Verifies:
//   - DISCLOSURE_BASE_COPY shape (4 willSend + 4 neverSends entries, verbatim)
//   - Modal title contains the verbatim provider prettyName
//   - Modal lead paragraph contains base URL (or fallback when empty)
//   - Continue button has setCta() applied; Cancel button does NOT
//   - Continue click fires onContinue (NOT onCancel); Cancel click fires
//     onCancel (NOT onContinue)
//   - Esc-style close (close() without acknowledged) fires onCancel exactly
//     once; Continue+close does NOT double-fire onCancel
//   - No `innerHTML` substring in src/ai/disclosure.ts (lint-style invariant
//     made explicit at the unit-test layer)
//
// Strategy: vi.mock('obsidian') with a real-shape Modal class that exposes
// `contentEl` + `titleEl` (HTMLElement DOM nodes), plus a Setting class
// whose `addButton` invokes the builder callback against a captureable
// ButtonApi shape (.setButtonText / .setCta / .onClick — the three
// AIDisclosureModal touches). The tests stand up a per-test Modal instance,
// open it, and inspect the DOM nodes directly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// ────────────────────────────────────────────────────────────────────────────
//   obsidian mock — Modal + Setting shapes the disclosure modal touches.
// ────────────────────────────────────────────────────────────────────────────

interface CapturedButton {
  text: string | null;
  isCta: boolean;
  click: () => void;
}

const buttonsByContainer = new WeakMap<object, CapturedButton[]>();

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');

  class Modal {
    public app: unknown;
    public contentEl: HTMLElement;
    public titleEl: HTMLElement;
    constructor(app: unknown) {
      this.app = app;
      // happy-dom is the configured test env; document is available globally.
      this.contentEl = document.createElement('div');
      this.titleEl = document.createElement('div');
      // Wire `createEl` / `createDiv` / `addClass` shims onto the contentEl
      // tree so AIDisclosureModal's createEl chain reaches DOM nodes that
      // are inspectable by the tests. Obsidian's runtime adds these methods
      // to Element.prototype globally; we add them per-element here to keep
      // the mock self-contained.
      attachObsidianHelpers(this.contentEl);
      attachObsidianHelpers(this.titleEl);
    }
    open(): void {
      // Tests drive `onOpen` directly. open()/close() are no-ops.
    }
    close(): void {
      // Production code calls `this.close()` after firing onContinue/onCancel.
      // We simulate the lifecycle by firing onClose() to mirror the real
      // Obsidian behaviour (Esc / X / overlay-click ALL converge through
      // close() → onClose()). Tests that want to assert the Esc-as-cancel
      // semantics call modal.close() directly without clicking a button.
      const maybeClose = (this as unknown as { onClose?: () => void }).onClose;
      if (typeof maybeClose === 'function') maybeClose.call(this);
    }
  }

  // setText helper — the disclosure modal calls `titleEl.setText(...)`. The
  // Obsidian runtime adds setText to HTMLElement.prototype; mirror it here.
  function attachObsidianHelpers(el: HTMLElement): void {
    const elAny = el as unknown as {
      setText: (t: string) => void;
      addClass: (c: string) => void;
      createEl: (tag: string, opts?: { text?: string; cls?: string }) => HTMLElement;
      empty: () => void;
    };
    elAny.setText = function (this: HTMLElement, t: string): void {
      this.textContent = t;
    };
    elAny.addClass = function (this: HTMLElement, c: string): void {
      this.classList.add(c);
    };
    elAny.createEl = function (
      this: HTMLElement,
      tag: string,
      opts?: { text?: string; cls?: string },
    ): HTMLElement {
      const child = document.createElement(tag);
      if (opts?.text !== undefined) child.textContent = opts.text;
      if (opts?.cls) child.className = opts.cls;
      attachObsidianHelpers(child);
      this.appendChild(child);
      return child;
    };
    elAny.empty = function (this: HTMLElement): void {
      while (this.firstChild) this.removeChild(this.firstChild);
    };
  }

  class Setting {
    private buttons: CapturedButton[] = [];
    constructor(private container: HTMLElement) {
      buttonsByContainer.set(container, this.buttons);
    }
    addButton(cb: (b: ButtonBuilder) => unknown): this {
      const captured: CapturedButton = {
        text: null,
        isCta: false,
        click: () => {},
      };
      this.buttons.push(captured);
      // Mark the container DOM with the captured button order so tests can
      // query .mod-cta in CSS-style.
      const btnEl = document.createElement('button');
      btnEl.className = 'setting-button';
      const builder: ButtonBuilder = {
        setButtonText(t: string) {
          captured.text = t;
          btnEl.textContent = t;
          return builder;
        },
        setCta() {
          captured.isCta = true;
          btnEl.classList.add('mod-cta');
          return builder;
        },
        onClick(fn: () => void) {
          captured.click = fn;
          btnEl.addEventListener('click', fn);
          return builder;
        },
      };
      this.container.appendChild(btnEl);
      cb(builder);
      return this;
    }
  }

  interface ButtonBuilder {
    setButtonText(t: string): ButtonBuilder;
    setCta(): ButtonBuilder;
    onClick(fn: () => void): ButtonBuilder;
  }

  return {
    ...actual,
    Modal,
    Setting,
  };
});

// ────────────────────────────────────────────────────────────────────────────
//   Tests
// ────────────────────────────────────────────────────────────────────────────

describe('Phase 07 Plan 05 — DISCLOSURE_BASE_COPY constant', () => {
  it('willSend has exactly 4 entries (each a non-empty string)', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.willSend).toHaveLength(4);
    for (const s of DISCLOSURE_BASE_COPY.willSend) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('neverSends has exactly 4 entries (each a non-empty string)', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.neverSends).toHaveLength(4);
    for (const s of DISCLOSURE_BASE_COPY.neverSends) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('willSend[0] mentions Problem text', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.willSend[0]).toBe(
      'Problem text (statement, examples, constraints)',
    );
  });

  it('willSend[1] mentions ## Code', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.willSend[1]).toBe('Your `## Code` content');
  });

  it('willSend[2] mentions verdict and failing test', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.willSend[2]).toBe(
      'The last run/submit verdict and failing test (if any)',
    );
  });

  it('willSend[3] mentions ## Notes opt-in', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.willSend[3]).toBe(
      'Optionally your `## Notes` (only if you opt in per feature)',
    );
  });

  it('neverSends[0] mentions vault file paths', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.neverSends[0]).toBe(
      'Vault file paths outside the active note',
    );
  });

  it('neverSends[1] mentions lc- frontmatter prefix', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.neverSends[1]).toBe(
      'Frontmatter that does not begin with `lc-`',
    );
  });

  it('neverSends[2] mentions other vault content', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.neverSends[2]).toBe(
      'Any other vault content',
    );
  });

  it('neverSends[3] mentions telemetry', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(DISCLOSURE_BASE_COPY.neverSends[3]).toBe(
      'Telemetry of any kind',
    );
  });
});

describe('Phase 07 Plan 05 — AIDisclosureModal DOM rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('modal title contains the prettyName of the provider (Anthropic)', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    expect(modal.titleEl.textContent).toBe('Heads up: this will send data to Anthropic');
  });

  it('modal lead paragraph contains base URL', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'openai',
      makeCfg({ baseUrl: 'https://api.openai.com/v1' }),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toContain('https://api.openai.com/v1');
    expect(firstP?.textContent).toContain('OpenAI');
  });

  it('empty baseUrl renders the fallback text', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'custom',
      makeCfg({ baseUrl: '' }),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toBe(
      'Active provider: Custom (OpenAI-compatible) — (no base URL configured yet)',
    );
  });

  it('contentEl has the leetcode-ai-disclosure scoping class', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    expect(modal.contentEl.classList.contains('leetcode-ai-disclosure')).toBe(true);
  });

  it('renders 4 willSend list items + 4 neverSends list items', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const lists = modal.contentEl.querySelectorAll('ul');
    expect(lists).toHaveLength(2);
    expect(lists[0]!.querySelectorAll('li')).toHaveLength(4);
    expect(lists[1]!.querySelectorAll('li')).toHaveLength(4);
  });
});

describe('Phase 07 Plan 05 — Button shape (setCta vs neutral)', () => {
  it('Continue button has setCta() applied; Cancel button does NOT', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const ctaButtons = modal.contentEl.querySelectorAll('.mod-cta');
    expect(ctaButtons).toHaveLength(1);
    expect(ctaButtons[0]!.textContent).toBe('I understand — continue');
  });

  it('Cancel button has the locked label "Cancel" and is neutral', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const allButtons = Array.from(modal.contentEl.querySelectorAll('button'));
    const cancelBtn = allButtons.find((b) => b.textContent === 'Cancel');
    expect(cancelBtn).toBeDefined();
    expect(cancelBtn?.classList.contains('mod-cta')).toBe(false);
  });
});

describe('Phase 07 Plan 05 — Callback wiring', () => {
  it('Continue button click fires onContinue and not onCancel', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      onContinue,
      onCancel,
    );
    modal.onOpen();
    const continueBtn = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (b) => b.textContent === 'I understand — continue',
    );
    expect(continueBtn).toBeDefined();
    continueBtn!.click();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Cancel button click fires onCancel and not onContinue', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      onContinue,
      onCancel,
    );
    modal.onOpen();
    const cancelBtn = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    );
    expect(cancelBtn).toBeDefined();
    cancelBtn!.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('Esc-style close (close() without clicking buttons) fires onCancel once', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      onContinue,
      onCancel,
    );
    modal.onOpen();
    // Simulate Esc / X / overlay-click — Modal.close() fires onClose().
    modal.close();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('Continue+close does NOT double-fire onCancel (acknowledged guard)', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeCfg(),
      onContinue,
      onCancel,
    );
    modal.onOpen();
    const continueBtn = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (b) => b.textContent === 'I understand — continue',
    );
    continueBtn!.click(); // sets acknowledged=true, fires onContinue, calls close()
    // The Continue button's click handler closes the modal — onCancel must
    // remain at zero invocations because acknowledged=true short-circuits
    // the onClose-Esc-fallback.
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(0);
  });
});

describe('Phase 07 Plan 05 — Source file invariants', () => {
  it('NO innerHTML usage in src/ai/disclosure.ts', () => {
    const path = resolvePath(__dirname, '../../src/ai/disclosure.ts');
    const src = readFileSync(path, 'utf8');
    expect(src.includes('innerHTML')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
//   Plan 07-07 Task 4 — WR-02 freeze regression
//
//   DISCLOSURE_BASE_COPY (and both inner arrays) must be frozen at module
//   load so future-phase mutation cannot race with in-flight modal renders
//   (07-PATTERNS.md Pattern 4 originally allowed Phase 08/09/11 to push
//   bullets via `DISCLOSURE_BASE_COPY.willSend.push(...)` — WR-02 supersedes
//   that with a composition-based extension contract).
// ────────────────────────────────────────────────────────────────────────────

describe('Phase 07 Plan 07 — WR-02 freeze regression', () => {
  it('Object.isFrozen(DISCLOSURE_BASE_COPY) === true', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY)).toBe(true);
  });

  it('Object.isFrozen(DISCLOSURE_BASE_COPY.willSend) === true (deep freeze)', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY.willSend)).toBe(true);
  });

  it('Object.isFrozen(DISCLOSURE_BASE_COPY.neverSends) === true (deep freeze)', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY.neverSends)).toBe(true);
  });

  it('mutation attempts on willSend throw in strict mode (vitest default)', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(() => {
      (DISCLOSURE_BASE_COPY.willSend as string[]).push('mutated-by-future-phase');
    }).toThrow();
  });

  it('mutation attempts on neverSends throw in strict mode', async () => {
    const { DISCLOSURE_BASE_COPY } = await import('../../src/ai/disclosure');
    expect(() => {
      (DISCLOSURE_BASE_COPY.neverSends as string[]).push('mutated-by-future-phase');
    }).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────

function makeCfg(overrides: Partial<{ baseUrl: string }> = {}): {
  apiKey: string;
  baseUrl: string;
  model: string;
  disclosureAcknowledged: boolean;
} {
  return {
    apiKey: 'sk-test',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5',
    disclosureAcknowledged: false,
    ...overrides,
  };
}
