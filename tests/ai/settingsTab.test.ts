// tests/ai/settingsTab.test.ts
//
// Phase 07 Plan 03 Task 2 — DOM-level unit tests for the new AI section in
// LeetCodeSettingTab. Mirrors the precedent in
// tests/settings/SettingsTab.knowledge-graph.test.ts: monkey-patches
// HTMLElement.prototype with empty/addClass/createEl, mocks 'obsidian' with a
// lightweight Setting + PluginSettingTab pair, then drives the production
// SettingsTab.display() against happy-dom.
//
// Coverage matrix:
//   1. activeAIProvider === null            -> only heading + dropdown render
//   2. activeAIProvider === 'anthropic'     -> API key field is type=password + .lc-ai-input
//   3. activeAIProvider === 'ollama'        -> NO API key field, Base URL editable
//   4. activeAIProvider === 'custom'        -> Base URL has placeholder https://your-host.example.com/v1
//   5. provider switch X->Y->X preserves apiKey (PluginData persistence)
//   6. Test connection click fires placeholder Notice w/ 'Plan 07-04' marker
//   7. setCta count in SettingsTab.ts stays at 1 (the pre-existing Login button)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AIProvider, ProviderConfig } from '../../src/ai/types';

// ────────────────────────────────────────────────────────────────────────────
//   HTMLElement prototype patches (mirrors knowledge-graph test precedent)
// ────────────────────────────────────────────────────────────────────────────
type CreateElOpts = { cls?: string | string[]; text?: string; type?: string };
const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>;
if (typeof proto.empty !== 'function') {
  proto.empty = function (this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
}
if (typeof proto.addClass !== 'function') {
  proto.addClass = function (this: HTMLElement, ...cls: string[]) {
    this.classList.add(...cls);
    return this;
  };
}
if (typeof proto.removeClass !== 'function') {
  proto.removeClass = function (this: HTMLElement, ...cls: string[]) {
    this.classList.remove(...cls);
    return this;
  };
}
if (typeof (proto as unknown as { createDiv?: unknown }).createDiv !== 'function') {
  (proto as unknown as Record<string, unknown>).createDiv = function (this: HTMLElement, cls?: string) {
    const el = this.ownerDocument.createElement('div');
    if (cls) el.classList.add(...cls.split(' '));
    this.appendChild(el);
    return el;
  };
}
if (typeof proto.createEl !== 'function') {
  proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    opts?: CreateElOpts,
  ): HTMLElementTagNameMap[K] {
    const el = this.ownerDocument.createElement(tag);
    if (opts?.cls) {
      const classes = Array.isArray(opts.cls) ? opts.cls : [opts.cls];
      el.classList.add(...classes);
    }
    if (opts?.text !== undefined) el.textContent = opts.text;
    if (opts?.type !== undefined) el.setAttribute('type', opts.type);
    this.appendChild(el);
    return el;
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   'obsidian' mock — Setting / PluginSettingTab / Notice
//   Tracks Notice instantiations so test 6 can assert the placeholder text.
// ────────────────────────────────────────────────────────────────────────────
const noticeCalls: Array<{ text: string; duration?: number }> = [];

vi.mock('obsidian', () => {
  class Notice {
    constructor(public readonly message: string, public readonly timeout?: number) {
      noticeCalls.push({ text: message, duration: timeout });
    }
  }

  // Capture button onClick handlers so test 6 can simulate the Test connection click.
  const buttonHandlers: Array<{ text: string; tooltip: string; onClick: () => unknown }> = [];

  class Setting {
    settingEl: HTMLElement;
    nameEl: HTMLElement;
    descEl: HTMLElement;
    controlEl: HTMLElement;
    private _isHeading = false;
    constructor(containerEl: HTMLElement) {
      this.settingEl = containerEl.createEl('div', { cls: 'setting-item' });
      this.nameEl = this.settingEl.createEl('div', { cls: 'setting-item-name' });
      this.descEl = this.settingEl.createEl('div', { cls: 'setting-item-description' });
      this.controlEl = this.settingEl.createEl('div', { cls: 'setting-item-control' });
    }
    setName(n: string) {
      this.nameEl.textContent = n;
      return this;
    }
    setDesc(d: string) {
      this.descEl.textContent = d;
      return this;
    }
    setHeading() {
      this._isHeading = true;
      this.settingEl.addClass('setting-item-heading');
      const heading = this.settingEl.createEl('h3');
      heading.textContent = this.nameEl.textContent;
      this.nameEl.replaceWith(heading);
      this.nameEl = heading;
      return this;
    }
    addText(cb: (t: TextApi) => void) {
      const inputEl = this.controlEl.createEl('input', { type: 'text' });
      const api: TextApi = {
        inputEl,
        setPlaceholder(p: string) {
          inputEl.placeholder = p;
          return api;
        },
        setValue(v: string) {
          inputEl.value = v;
          return api;
        },
        onChange(_fn: (v: string) => void) {
          // Production code attaches the listener via the fluent chain; tests
          // that need to drive onChange manipulate inputEl + dispatchEvent.
          return api;
        },
      };
      cb(api);
      return this;
    }
    addToggle(cb: (t: ToggleApi) => void) {
      const toggleEl = this.controlEl.createEl('div', { cls: 'checkbox-container' });
      const api: ToggleApi = {
        toggleEl,
        setValue(v: boolean) {
          toggleEl.setAttribute('data-value', String(v));
          if (v) toggleEl.addClass('is-enabled');
          else toggleEl.removeClass('is-enabled');
          return api;
        },
        onChange(_fn: (v: boolean) => void) {
          return api;
        },
      };
      cb(api);
      return this;
    }
    addDropdown(cb: (d: DropdownApi) => void) {
      const selectEl = this.controlEl.createEl('select');
      const api: DropdownApi = {
        selectEl,
        addOption(value: string, label: string) {
          const opt = selectEl.createEl('option');
          opt.value = value;
          opt.textContent = label;
          return api;
        },
        addOptions(opts: Record<string, string>) {
          for (const [value, label] of Object.entries(opts)) {
            const opt = selectEl.createEl('option');
            opt.value = value;
            opt.textContent = label;
          }
          return api;
        },
        setValue(v: string) {
          selectEl.value = v;
          return api;
        },
        onChange(_fn: (v: string) => void) {
          return api;
        },
      };
      cb(api);
      return this;
    }
    addButton(cb: (b: ButtonApi) => void) {
      const buttonEl = this.controlEl.createEl('button');
      const handlerRecord: { text: string; tooltip: string; onClick: () => unknown } = {
        text: '',
        tooltip: '',
        onClick: () => undefined,
      };
      buttonHandlers.push(handlerRecord);
      const api: ButtonApi = {
        buttonEl,
        setButtonText(t: string) {
          buttonEl.textContent = t;
          handlerRecord.text = t;
          return api;
        },
        setIcon(_i: string) {
          return api;
        },
        setTooltip(t: string) {
          handlerRecord.tooltip = t;
          return api;
        },
        setCta() {
          buttonEl.classList.add('mod-cta');
          return api;
        },
        setDisabled(d: boolean) {
          buttonEl.disabled = d;
          return api;
        },
        onClick(fn: () => unknown) {
          handlerRecord.onClick = fn;
          buttonEl.addEventListener('click', () => {
            void fn();
          });
          return api;
        },
      };
      cb(api);
      return this;
    }
  }

  class PluginSettingTab {
    app: unknown;
    plugin: unknown;
    containerEl: HTMLElement = document.createElement('div');
    constructor(app: unknown, plugin: unknown) {
      this.app = app;
      this.plugin = plugin;
    }
    display(): void {
      /* child overrides */
    }
  }

  return {
    Setting,
    PluginSettingTab,
    Notice,
    App: class {},
    __getButtonHandlers: () => buttonHandlers,
    __resetButtonHandlers: () => {
      buttonHandlers.length = 0;
    },
  };
});

interface TextApi {
  inputEl: HTMLInputElement;
  setPlaceholder(p: string): TextApi;
  setValue(v: string): TextApi;
  onChange(fn: (v: string) => void): TextApi;
}
interface ToggleApi {
  toggleEl: HTMLElement;
  setValue(v: boolean): ToggleApi;
  onChange(fn: (v: boolean) => void): ToggleApi;
}
interface DropdownApi {
  selectEl: HTMLSelectElement;
  addOption(value: string, label: string): DropdownApi;
  addOptions(opts: Record<string, string>): DropdownApi;
  setValue(v: string): DropdownApi;
  onChange(fn: (v: string) => void): DropdownApi;
}
interface ButtonApi {
  buttonEl: HTMLButtonElement;
  setButtonText(t: string): ButtonApi;
  setIcon(i: string): ButtonApi;
  setTooltip(t: string): ButtonApi;
  setCta(): ButtonApi;
  setDisabled(d: boolean): ButtonApi;
  onClick(fn: () => unknown): ButtonApi;
}

// ────────────────────────────────────────────────────────────────────────────
//   Fake plugin shape — minimum surface SettingsTab.display() reads
// ────────────────────────────────────────────────────────────────────────────
function makeFakePlugin(opts: { activeProvider?: AIProvider | null; configs?: Partial<Record<AIProvider, ProviderConfig>> } = {}) {
  const defaultConfigs: Record<AIProvider, ProviderConfig> = {
    anthropic: { apiKey: '', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5', disclosureAcknowledged: false },
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', disclosureAcknowledged: false },
    openrouter: { apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4.5', disclosureAcknowledged: false },
    ollama: { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', disclosureAcknowledged: false },
    custom: { apiKey: '', baseUrl: '', model: '', disclosureAcknowledged: false },
    // Phase 08.1 Plan 02 — Bedrock joins the locked provider map. The
    // BedrockProviderConfig superset includes `region/modelId/authMethod`
    // plus 4 secret fields; only the inherited ProviderConfig fields are
    // referenced by SettingsTab tests, so a minimal ProviderConfig shape
    // satisfies the type — the cast widens for round-tripping cfg through
    // settings.getProviderConfig.
    bedrock: { apiKey: '', baseUrl: '', model: '', disclosureAcknowledged: false },
  };
  const merged: Record<AIProvider, ProviderConfig> = { ...defaultConfigs, ...(opts.configs ?? {}) } as Record<AIProvider, ProviderConfig>;
  let activeProvider: AIProvider | null = opts.activeProvider ?? null;

  const settings = {
    getUsername: () => null,
    getProblemsFolder: () => 'LeetCode',
    getDefaultLanguage: () => 'python3',
    getTechniquesFolderOverride: () => '',
    setTechniquesFolderOverride: vi.fn(async (_v: string) => undefined),
    getAutoBacklinksEnabled: () => true,
    setAutoBacklinksEnabled: vi.fn(async (_v: boolean) => undefined),
    setProblemsFolder: vi.fn(async (_v: string) => undefined),
    setDefaultLanguage: vi.fn(async (_v: string) => undefined),
    getPreviewClickBehavior: () => 'preview',
    setPreviewClickBehavior: vi.fn(async (_v: 'preview' | 'open') => undefined),
    // Phase 16 Plan 02 — indentSizeOverride field on SettingsStore. Mock
    // returns 'auto' so SettingsTab's "Code editor" section renders the
    // default-state dropdown without diverging from any test's expectation.
    getIndentSizeOverride: () => 'auto' as const,
    setIndentSizeOverride: vi.fn(async (_v: 'auto' | 2 | 4 | 8) => undefined),
    getShowRelativeLineNumbers: () => false,
    setShowRelativeLineNumbers: vi.fn(async (_v: boolean) => undefined),
    // Phase 19 vq4 — useNestedEditor toggle row stub. Returns true so the
    // SettingsTab Code-editor section renders the default-on toggle state.
    getUseNestedEditor: () => true,
    setUseNestedEditor: vi.fn(async (_v: boolean) => undefined),
    // Phase 19 D-05 — useInlineWidget toggle row stub (Experimental section).
    getUseInlineWidget: () => false,
    setUseInlineWidget: vi.fn(async (_v: boolean) => undefined),
    // Phase 21 MIGRATE-06 — auto-migrate v1.2 toggle row stub (Experimental).
    getAutoMigrateOnOpen: () => true,
    setAutoMigrateOnOpen: vi.fn(async (_v: boolean) => undefined),
    // Phase 19 C-06 — widget sync debounce delay (Experimental → Save delay).
    getWidgetSyncDebounceMs: () => 400 as const,
    setWidgetSyncDebounceMs: vi.fn(async (_v: 300 | 400 | 500 | 1000 | 2000) => undefined),
    getActiveAIProvider: () => activeProvider,
    setActiveAIProvider: vi.fn(async (p: AIProvider | null) => {
      activeProvider = p;
    }),
    getProviderConfig: (p: AIProvider) => merged[p],
    setProviderConfig: vi.fn(async (p: AIProvider, cfg: ProviderConfig) => {
      merged[p] = cfg;
    }),
    getAutoAIReviewOnAC: () => false,
    setAutoAIReviewOnAC: vi.fn(async (_v: boolean) => undefined),
    getAutoAIContestAnalysis: () => false,
    setAutoAIContestAnalysis: vi.fn(async (_v: boolean) => undefined),
    getAutoAIKnowledgeGraph: () => true,
    setAutoAIKnowledgeGraph: vi.fn(async (_v: boolean) => undefined),
    getFeatureFlags: () => ({ lookAheadEdges: false }),
    setFeatureFlag: vi.fn(async (_k: string, _v: boolean) => undefined),
  };

  // Phase 07 Plan 04 — Settings Test connection button delegates to the
  // plugin-level testActiveAIConnection() method (shared with the palette
  // command). Tests that exercise the button click stub this with a vi.fn()
  // and assert it was invoked.
  const testActiveAIConnection = vi.fn(async () => undefined);

  return {
    auth: {
      isLoggedIn: () => false,
      login: vi.fn(),
      logout: vi.fn(),
      loginManual: vi.fn(),
    },
    settings,
    testActiveAIConnection,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Tests
// ────────────────────────────────────────────────────────────────────────────
describe('SettingsTab — AI section (Phase 07 Plan 03)', () => {
  beforeEach(() => {
    noticeCalls.length = 0;
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('when activeAIProvider is null, only heading row renders in the AI section (toggle off)', async () => {
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const plugin = makeFakePlugin({ activeProvider: null });
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();

    // The AI section renders only the heading row with toggle OFF — no provider
    // dropdown or sub-form. Find the AI coach heading.
    const headings = Array.from(tab.containerEl.querySelectorAll('h3'));
    const aiHeading = headings.find((h) => h.textContent === 'AI coach');
    expect(aiHeading).toBeDefined();

    // The next heading after AI coach must be Knowledge graph (Contest was
    // merged into the AI features card which is hidden when toggle is off).
    const aiHeadingIdx = headings.indexOf(aiHeading!);
    const nextHeading = headings[aiHeadingIdx + 1];
    expect(nextHeading?.textContent).toBe('Knowledge graph');

    // No AI password input rendered when toggle is off.
    const passwordInputs = tab.containerEl.querySelectorAll('input[type="password"]');
    // Two pre-existing password inputs come from the manual-cookie section
    // (LEETCODE_SESSION + csrftoken). The AI section adds zero when off.
    expect(passwordInputs.length).toBe(2);
  });

  it('when activeAIProvider is anthropic, API key field is type=password with .lc-ai-input class', async () => {
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const plugin = makeFakePlugin({ activeProvider: 'anthropic' });
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();

    const aiInputs = tab.containerEl.querySelectorAll('input.lc-ai-input');
    // At least one .lc-ai-input must exist (the API key field).
    expect(aiInputs.length).toBeGreaterThanOrEqual(1);

    // The .lc-ai-input that's the API key MUST be type=password.
    const apiKeyInput = Array.from(aiInputs).find(
      (el) => (el as HTMLInputElement).type === 'password',
    ) as HTMLInputElement | undefined;
    expect(apiKeyInput).toBeDefined();
    expect(apiKeyInput!.type).toBe('password');
  });

  it('when activeAIProvider is ollama, no AI API key field is rendered and Base URL is editable', async () => {
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const plugin = makeFakePlugin({ activeProvider: 'ollama' });
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();

    // No .lc-ai-input password input exists for Ollama (Ollama has no API key row).
    const aiPasswords = Array.from(
      tab.containerEl.querySelectorAll('input.lc-ai-input'),
    ).filter((el) => (el as HTMLInputElement).type === 'password');
    expect(aiPasswords.length).toBe(0);

    // Base URL editable text input exists with default Ollama URL.
    const aiTextInputs = Array.from(
      tab.containerEl.querySelectorAll('input.lc-ai-input'),
    ).filter((el) => (el as HTMLInputElement).type === 'text');
    expect(aiTextInputs.length).toBeGreaterThanOrEqual(1);
    const baseUrlInput = aiTextInputs.find((el) => (el as HTMLInputElement).value === 'http://localhost:11434/v1');
    expect(baseUrlInput).toBeDefined();
  });

  it('when activeAIProvider is custom, base URL is editable with placeholder https://your-host.example.com/v1', async () => {
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const plugin = makeFakePlugin({ activeProvider: 'custom' });
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();

    const aiInputs = Array.from(
      tab.containerEl.querySelectorAll('input.lc-ai-input'),
    ) as HTMLInputElement[];
    const placeholdered = aiInputs.find(
      (el) => el.placeholder === 'https://your-host.example.com/v1',
    );
    expect(placeholdered).toBeDefined();
  });

  it('switching from Anthropic to OpenAI and back preserves Anthropic apiKey', async () => {
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const plugin = makeFakePlugin({
      activeProvider: 'anthropic',
      configs: {
        anthropic: { apiKey: 'sk-ant-123', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5', disclosureAcknowledged: false },
      },
    });
    const tab = new LeetCodeSettingTab({} as never, plugin as never);

    // Render with Anthropic active — apiKey should populate the password input.
    tab.display();
    let apiKeyInputs = Array.from(
      tab.containerEl.querySelectorAll('input.lc-ai-input'),
    ).filter((el) => (el as HTMLInputElement).type === 'password') as HTMLInputElement[];
    expect(apiKeyInputs[0]?.value).toBe('sk-ant-123');

    // Simulate switching to OpenAI.
    await plugin.settings.setActiveAIProvider('openai');
    tab.display();
    // Anthropic key NOT visible while OpenAI is active.
    apiKeyInputs = Array.from(
      tab.containerEl.querySelectorAll('input.lc-ai-input'),
    ).filter((el) => (el as HTMLInputElement).type === 'password') as HTMLInputElement[];
    expect(apiKeyInputs[0]?.value).toBe(''); // OpenAI key is empty in fake

    // Switch back to Anthropic — original key must persist.
    await plugin.settings.setActiveAIProvider('anthropic');
    tab.display();
    apiKeyInputs = Array.from(
      tab.containerEl.querySelectorAll('input.lc-ai-input'),
    ).filter((el) => (el as HTMLInputElement).type === 'password') as HTMLInputElement[];
    expect(apiKeyInputs[0]?.value).toBe('sk-ant-123');
  });

  it('clicking Test connection delegates to the plugin-level testActiveAIConnection method (Plan 07-04 wiring)', async () => {
    const obs = await import('obsidian');
    type ObsTest = typeof obs & {
      __resetButtonHandlers: () => void;
      __getButtonHandlers: () => Array<{ text: string; tooltip: string; onClick: () => unknown }>;
    };
    const obsHelpers = obs as unknown as ObsTest;
    obsHelpers.__resetButtonHandlers();

    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const plugin = makeFakePlugin({ activeProvider: 'anthropic' });
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();

    // Find the captured Test connection handler by tooltip and invoke it.
    const handlers = obsHelpers.__getButtonHandlers();
    const testConn = handlers.find((h) => h.tooltip === 'Test connection');
    expect(testConn).toBeDefined();

    await testConn!.onClick();

    expect(plugin.testActiveAIConnection).toHaveBeenCalledTimes(1);
  });

  it('exactly one setCta invocation in src/settings/SettingsTab.ts (the pre-existing Login button)', () => {
    const sourcePath = path.resolve(__dirname, '../../src/settings/SettingsTab.ts');
    const content = fs.readFileSync(sourcePath, 'utf8');
    // Count `.setCta(` invocations — Phase 07 Plan 03 must NOT add any.
    const matches = content.match(/\.setCta\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
