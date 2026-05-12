// Phase 5.3 (POLISH-09 / D-06..D-12) — chevron DOM render + interaction coverage.
// Asserts UI-SPEC §"Dropdown item click → language switch" + §Copywriting Contract:
//   - Chevron renders `▼ {DisplayLabel}` from LC_LANG_DISPLAY_LABELS
//   - Click toggles dropdown via style.display + aria-expanded
//   - Click on different language item invokes plugin.switchLanguage(file, slug) once
//   - Click on currently-selected language item is a no-op (no fetch, no dispatch, no Notice)
//   - 8 dropdown items in LC_CHEVRON_LANG_ORDER

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { buildLanguageChevron } from '../../src/main/languageChevronWidget';
import { LC_CHEVRON_LANG_ORDER } from '../../src/solve/languages';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';
import type { TFile } from 'obsidian';

type HostPlugin = Parameters<typeof buildLanguageChevron>[1];

function makeHost(switchLanguage = vi.fn()): {
  plugin: HostPlugin;
  switchLanguage: ReturnType<typeof vi.fn>;
} {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = vi.fn();
  plugin.submitFromActive = vi.fn();
  plugin.switchLanguage = switchLanguage;
  return {
    plugin: plugin as unknown as HostPlugin,
    switchLanguage,
  };
}

const FAKE_FILE = { path: 'LeetCode/0001-two-sum.md' } as unknown as TFile;

describe('buildLanguageChevron DOM render', () => {
  it('renders ▼ Python when currentSlug = python3 (display-label remap)', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    expect(wrapper.classList.contains('leetcode-language-chevron-wrapper')).toBe(true);
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('▼ Python');
  });

  it('renders ▼ Java when currentSlug = java', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'java');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.textContent).toBe('▼ Java');
  });

  it('renders ▼ C++ when currentSlug = cpp', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'cpp');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.textContent).toBe('▼ C++');
  });

  it('passes through unknown slug as raw text (no LC_LANG_DISPLAY_LABELS entry)', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'xyz');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.textContent).toBe('▼ xyz');
  });

  it('button has aria-haspopup=listbox and aria-expanded=false initially', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });

  it('button does NOT have a title attribute (UI-SPEC §Copywriting "zero hover tooltip")', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.hasAttribute('title')).toBe(false);
  });

  it('dropdown is initially hidden via style.display=none and has role=listbox', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const dropdown = wrapper.querySelector<HTMLDivElement>(
      'div.leetcode-language-chevron-dropdown',
    );

    expect(dropdown).not.toBeNull();
    expect(dropdown!.style.display).toBe('none');
    expect(dropdown!.getAttribute('role')).toBe('listbox');
  });

  it('dropdown lists exactly 8 items in LC_CHEVRON_LANG_ORDER with role=option', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const items = wrapper.querySelectorAll<HTMLButtonElement>(
      'button.leetcode-language-chevron-item',
    );

    expect(items.length).toBe(8);
    expect(items.length).toBe(LC_CHEVRON_LANG_ORDER.length);
    items.forEach((item) => expect(item.getAttribute('role')).toBe('option'));
  });

  it('marks the currently-selected language item with .is-current', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'java');
    const items = Array.from(
      wrapper.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    const pythonItem = items.find((it) => it.textContent === 'Python');

    expect(javaItem).toBeDefined();
    expect(javaItem!.classList.contains('is-current')).toBe(true);
    expect(pythonItem).toBeDefined();
    expect(pythonItem!.classList.contains('is-current')).toBe(false);
  });
});

describe('buildLanguageChevron click toggles dropdown', () => {
  it('first click sets dropdown display to block; second click reverts to none', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    const dropdown = wrapper.querySelector<HTMLDivElement>(
      'div.leetcode-language-chevron-dropdown',
    );

    expect(dropdown!.style.display).toBe('none');
    button!.click();
    expect(dropdown!.style.display).toBe('block');
    button!.click();
    expect(dropdown!.style.display).toBe('none');
  });

  it('updates aria-expanded matching dropdown visibility', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.getAttribute('aria-expanded')).toBe('false');
    button!.click();
    expect(button!.getAttribute('aria-expanded')).toBe('true');
    button!.click();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('buildLanguageChevron item click', () => {
  it('clicking a different language item invokes plugin.switchLanguage(file, slug) once', () => {
    const { plugin, switchLanguage } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    // Open dropdown first.
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();

    const items = Array.from(
      wrapper.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    expect(javaItem).toBeDefined();
    javaItem!.click();

    expect(switchLanguage).toHaveBeenCalledTimes(1);
    expect(switchLanguage).toHaveBeenCalledWith(FAKE_FILE, 'java');

    // Cleanup so other tests don't see leftover DOM.
    document.body.removeChild(wrapper);
  });

  it('clicking the currently-selected language is a no-op (no switchLanguage call)', () => {
    const { plugin, switchLanguage } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'java');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();

    const items = Array.from(
      wrapper.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    expect(javaItem).toBeDefined();
    expect(javaItem!.classList.contains('is-current')).toBe(true);
    javaItem!.click();

    expect(switchLanguage).not.toHaveBeenCalled();

    // Dropdown still closes (no spurious side effect — UI-SPEC §"State machine").
    const dropdown = wrapper.querySelector<HTMLDivElement>(
      'div.leetcode-language-chevron-dropdown',
    );
    expect(dropdown!.style.display).toBe('none');

    document.body.removeChild(wrapper);
  });

  it('item click closes the dropdown (instant feedback per UI-SPEC §State machine)', () => {
    const { plugin } = makeHost();
    const wrapper = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();
    const dropdown = wrapper.querySelector<HTMLDivElement>(
      'div.leetcode-language-chevron-dropdown',
    );
    expect(dropdown!.style.display).toBe('block');

    const items = Array.from(
      wrapper.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    javaItem!.click();

    expect(dropdown!.style.display).toBe('none');
    expect(button!.getAttribute('aria-expanded')).toBe('false');

    document.body.removeChild(wrapper);
  });
});
