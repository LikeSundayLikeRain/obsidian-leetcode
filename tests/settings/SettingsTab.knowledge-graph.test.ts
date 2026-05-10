// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-01 D-14 / D-15 / D-16 — Knowledge Graph section in
// SettingsTab with override input + auto-backlink toggle.
// Turns green when Plan 02 ships the Knowledge Graph section in
// src/settings/SettingsTab.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeSettingsStore } from '../solve/mocks/fakeSettingsStore';

// Obsidian monkey-patches HTMLElement.prototype with `empty()`, `addClass()`,
// and `createEl()` at plugin load time. The `obsidian` npm package ships types
// only, so these helpers are absent under Vitest/happy-dom. Install the
// minimum subset the mock Setting / PluginSettingTab chain and production
// SettingsTab.display() depend on, scoped to this test file so the rest of
// the suite is untouched.
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

// The real Setting / PluginSettingTab classes from Obsidian need a DOM-backed
// `createEl()` chain. Replace them with a lightweight stub that mirrors the
// fluent chain on a real HTMLElement so `tab.display()` against happy-dom
// renders enough structure for us to assert against.
vi.mock('obsidian', () => {
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
      // Replace name el with a real heading element so tests can assert on tag name.
      const heading = this.settingEl.createEl('h3');
      heading.textContent = this.nameEl.textContent;
      this.nameEl.replaceWith(heading);
      this.nameEl = heading;
      return this;
    }
    addText(cb: (t: { inputEl: HTMLInputElement; setPlaceholder(p: string): { setValue(v: string): { onChange(fn: (v: string) => void): unknown } }; setValue(v: string): unknown; onChange(fn: (v: string) => void): unknown }) => void) {
      const inputEl = this.controlEl.createEl('input', { type: 'text' }) as HTMLInputElement;
      const api = {
        inputEl,
        setPlaceholder(p: string) {
          inputEl.placeholder = p;
          return { setValue(v: string) { inputEl.value = v; return { onChange(_fn: (v: string) => void) { return api; } }; } };
        },
        setValue(v: string) {
          inputEl.value = v;
          return api;
        },
        onChange(_fn: (v: string) => void) {
          return api;
        },
      };
      cb(api);
      return this;
    }
    addToggle(cb: (t: { toggleEl: HTMLElement; setValue(v: boolean): unknown; onChange(fn: (v: boolean) => void): unknown }) => void) {
      const toggleEl = this.controlEl.createEl('div', { cls: 'checkbox-container' });
      // Mark the current value via a data attribute so tests can assert on it.
      const api = {
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
    addDropdown(_cb: unknown) {
      return this;
    }
    addButton(_cb: unknown) {
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
  return { Setting, PluginSettingTab, App: class {}, Notice: class {} };
});

interface KnowledgeGraphCapableStore {
  getProblemsFolder(): string;
  getTechniquesFolderOverride(): string;
  setTechniquesFolderOverride(v: string): Promise<void>;
  getAutoBacklinksEnabled(): boolean;
  setAutoBacklinksEnabled(v: boolean): Promise<void>;
}

function makeFakePluginForSettingsTab(settings: KnowledgeGraphCapableStore) {
  // Production SettingsTab.display() also reads getUsername() + the manual-
  // cookie path via loginManual(). The fake settings store from solve/mocks
  // is Phase 3-scoped and does not expose these; wrap it here with the
  // extra surface the UI path needs so this test focuses on the new
  // Knowledge Graph section.
  const wrappedSettings = {
    ...settings,
    getUsername: () => null,
  } as unknown as KnowledgeGraphCapableStore & { getUsername(): string | null };
  return {
    auth: {
      isLoggedIn: () => false,
      login: vi.fn(),
      logout: vi.fn(),
      loginManual: vi.fn(),
    },
    settings: wrappedSettings,
  };
}

describe('SettingsTab — Knowledge Graph section (Phase 5 D-14 / D-15 / D-16)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('renders a Knowledge Graph heading', async () => {
    // D-14: the new third section is labeled exactly `Knowledge Graph`.
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const settings = makeFakeSettingsStore() as unknown as KnowledgeGraphCapableStore;
    const plugin = makeFakePluginForSettingsTab(settings);
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();
    const headings = Array.from(
      tab.containerEl.querySelectorAll('h3, h2, h4'),
    ) as HTMLElement[];
    const knowledgeGraphHeading = headings.find(
      (h) => h.textContent === 'Knowledge Graph',
    );
    expect(knowledgeGraphHeading).toBeDefined();
  });

  it('technique folder override input has placeholder `{problemsFolder}/Techniques`', async () => {
    // D-15: placeholder shows the derived default so users see "LeetCode/Techniques"
    // when they haven't overridden, and their typed value when they have.
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const settings = makeFakeSettingsStore({
      problemsFolder: 'MyVault/LC',
    }) as unknown as KnowledgeGraphCapableStore;
    const plugin = makeFakePluginForSettingsTab(settings);
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();
    const inputs = Array.from(
      tab.containerEl.querySelectorAll('input[type="text"]'),
    ) as HTMLInputElement[];
    const overrideInput = inputs.find((i) => i.placeholder === 'MyVault/LC/Techniques');
    expect(overrideInput).toBeDefined();
  });

  it('auto-backlink toggle initial value binds to getAutoBacklinksEnabled()', async () => {
    // D-16: the toggle reflects the persisted flag. When disabled in settings,
    // the toggle reads `data-value="false"` (fake Obsidian Setting stub above).
    const { LeetCodeSettingTab } = await import('../../src/settings/SettingsTab');
    const settings = makeFakeSettingsStore({
      autoBacklinksEnabled: false,
    }) as unknown as KnowledgeGraphCapableStore;
    const plugin = makeFakePluginForSettingsTab(settings);
    const tab = new LeetCodeSettingTab({} as never, plugin as never);
    tab.display();
    const toggles = Array.from(
      tab.containerEl.querySelectorAll('.checkbox-container'),
    ) as HTMLElement[];
    const disabledToggle = toggles.find(
      (t) => t.getAttribute('data-value') === 'false',
    );
    // With autoBacklinksEnabled=false, at least one toggle must read false.
    expect(disabledToggle).toBeDefined();
  });
});
