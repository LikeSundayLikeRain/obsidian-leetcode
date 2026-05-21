// tests/ai/disclosure.bedrock.test.ts
//
// Phase 08.1 Plan 02 — disclosure modal renders Bedrock base URL via
// getDisplayBaseUrl region substitution (T-08.1-04 mitigation). Mirrors
// tests/ai/disclosure.test.ts shape — happy-dom Modal + createEl shims.
//
// Two assertions:
//   1. Bedrock modal lead paragraph contains the user-configured region
//      substituted into 'https://bedrock-runtime.{region}.amazonaws.com'.
//   2. Non-Bedrock providers continue to render cfg.baseUrl verbatim
//      (no regression on the existing disclosure flow).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BedrockProviderConfig, ProviderConfig } from '../../src/ai/types';

interface CapturedButton {
  text: string | null;
  isCta: boolean;
  click: () => void;
}

const buttonsByContainer = new WeakMap<object, CapturedButton[]>();

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');

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

  class Modal {
    public app: unknown;
    public contentEl: HTMLElement;
    public titleEl: HTMLElement;
    constructor(app: unknown) {
      this.app = app;
      this.contentEl = document.createElement('div');
      this.titleEl = document.createElement('div');
      attachObsidianHelpers(this.contentEl);
      attachObsidianHelpers(this.titleEl);
    }
    open(): void {}
    close(): void {
      const maybeClose = (this as unknown as { onClose?: () => void }).onClose;
      if (typeof maybeClose === 'function') maybeClose.call(this);
    }
  }

  interface ButtonBuilder {
    setButtonText(t: string): ButtonBuilder;
    setCta(): ButtonBuilder;
    onClick(fn: () => void): ButtonBuilder;
  }

  class Setting {
    private buttons: CapturedButton[] = [];
    constructor(private container: HTMLElement) {
      buttonsByContainer.set(container, this.buttons);
    }
    addButton(cb: (b: ButtonBuilder) => unknown): this {
      const captured: CapturedButton = { text: null, isCta: false, click: () => {} };
      this.buttons.push(captured);
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

  return {
    ...actual,
    Modal,
    Setting,
  };
});

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeBedrockCfg(region: string): BedrockProviderConfig {
  return {
    apiKey: '',
    baseUrl: '',
    model: '',
    disclosureAcknowledged: false,
    region,
    modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    authMethod: 'default-chain',
    accessKeyId: '',
    secretAccessKey: '',
    ssoProfile: '',
    bedrockApiKey: '',
  };
}

function makeRegularCfg(baseUrl: string): ProviderConfig {
  return {
    apiKey: 'sk-test',
    baseUrl,
    model: 'm',
    disclosureAcknowledged: false,
  };
}

describe('Phase 08.1 AIDisclosureModal — Bedrock region substitution', () => {
  it('substitutes user-configured region into bedrock-runtime endpoint', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'bedrock',
      makeBedrockCfg('us-west-2'),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toContain('us-west-2.amazonaws.com');
    expect(firstP?.textContent).toContain('https://bedrock-runtime.us-west-2.amazonaws.com');
    expect(firstP?.textContent).toContain('AWS Bedrock');
  });

  it("falls back to 'us-east-1' when cfg.region is empty", async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'bedrock',
      makeBedrockCfg(''),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toContain('https://bedrock-runtime.us-east-1.amazonaws.com');
  });

  it('substitutes a non-US region (eu-west-1) cleanly', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'bedrock',
      makeBedrockCfg('eu-west-1'),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toContain('eu-west-1.amazonaws.com');
  });
});

describe('Phase 08.1 AIDisclosureModal — non-Bedrock providers unchanged (no regression)', () => {
  it('Anthropic still renders cfg.baseUrl verbatim', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'anthropic',
      makeRegularCfg('https://api.anthropic.com/v1'),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toContain('https://api.anthropic.com/v1');
    expect(firstP?.textContent).toContain('Anthropic');
    // Bedrock substring MUST NOT appear in an Anthropic modal.
    expect(firstP?.textContent).not.toContain('bedrock-runtime');
  });

  it('OpenAI still renders cfg.baseUrl verbatim', async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'openai',
      makeRegularCfg('https://api.openai.com/v1'),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toContain('https://api.openai.com/v1');
  });

  it("Custom with empty baseUrl falls back to '(no base URL configured yet)'", async () => {
    const { AIDisclosureModal } = await import('../../src/ai/disclosure');
    const modal = new AIDisclosureModal(
      {} as never,
      'custom',
      makeRegularCfg(''),
      vi.fn(),
      vi.fn(),
    );
    modal.onOpen();
    const firstP = modal.contentEl.querySelector('p');
    expect(firstP?.textContent).toBe(
      'Active provider: Custom (OpenAI-compatible) — (no base URL configured yet)',
    );
  });
});
