// Phase 20 Plan 20-08 — gap-closure regression test for the chevron's
// language-switch refresh contract.
//
// UAT Test 3 reported: "Theme retheme looks good for Java (current language),
// but the language switch is broken — looks like it hasn't been wired up."
// Confirmed root cause (.planning/debug/language-switch-not-wired.md): the
// chevron click IS wired end-to-end but produces zero visible feedback —
// label + .is-current marker were captured at mount and never refreshed.
//
// This test pins the refresh contract:
//
// Test 1: Build returns refresh handle ({ wrapper, labelSpan, items, refresh }).
// Test 2: refresh updates label text to LC_LANG_DISPLAY_LABELS[newSlug].
// Test 3: refresh re-targets .is-current marker to the new slug's item.
// Test 4: refresh is idempotent for the same slug (no-op).
// Test 5: Unknown slug falls back to literal slug text + drops .is-current.

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { buildLanguageChevron } from '../../src/main/languageChevronWidget';
import {
  LC_LANG_DISPLAY_LABELS,
  LC_CHEVRON_LANG_ORDER,
} from '../../src/solve/languages';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';
import type { TFile } from 'obsidian';

type HostPlugin = Parameters<typeof buildLanguageChevron>[1];

function makeHost(): HostPlugin {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = vi.fn();
  plugin.submitFromActive = vi.fn();
  plugin.switchLanguage = vi.fn();
  return plugin as unknown as HostPlugin;
}

const FAKE_FILE = { path: 'LeetCode/0001-two-sum.md' } as unknown as TFile;

afterEach(() => {
  document
    .querySelectorAll('div.leetcode-language-chevron-dropdown')
    .forEach((el) => el.remove());
  document
    .querySelectorAll('span.leetcode-language-chevron-wrapper')
    .forEach((el) => el.remove());
});

describe('Phase 20 Plan 20-08 — chevron refresh contract', () => {
  it('Test 1: build returns { wrapper, labelSpan, items, refresh }', () => {
    const plugin = makeHost();
    const handle = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    expect(handle.wrapper).toBeInstanceOf(HTMLElement);
    expect(handle.wrapper.classList.contains('leetcode-language-chevron-wrapper'))
      .toBe(true);
    expect(handle.labelSpan).toBeInstanceOf(HTMLSpanElement);
    expect(handle.labelSpan.classList.contains('leetcode-language-chevron-label'))
      .toBe(true);
    expect(handle.items).toBeInstanceOf(Map);
    expect(handle.items.size).toBe(LC_CHEVRON_LANG_ORDER.length);
    expect(typeof handle.refresh).toBe('function');
  });

  it('Test 2: refresh updates labelSpan textContent to LC_LANG_DISPLAY_LABELS[newSlug]', () => {
    const plugin = makeHost();
    const handle = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    expect(handle.labelSpan.textContent).toBe(LC_LANG_DISPLAY_LABELS['python3']);

    handle.refresh('java');
    expect(handle.labelSpan.textContent).toBe(LC_LANG_DISPLAY_LABELS['java']);

    handle.refresh('cpp');
    expect(handle.labelSpan.textContent).toBe(LC_LANG_DISPLAY_LABELS['cpp']);
  });

  it('Test 3: refresh re-targets .is-current marker to new slug', () => {
    const plugin = makeHost();
    const handle = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    // Initial state — python3 has .is-current, java does not.
    expect(handle.items.get('python3')!.classList.contains('is-current')).toBe(true);
    expect(handle.items.get('java')!.classList.contains('is-current')).toBe(false);

    handle.refresh('java');
    expect(handle.items.get('python3')!.classList.contains('is-current')).toBe(false);
    expect(handle.items.get('java')!.classList.contains('is-current')).toBe(true);

    handle.refresh('cpp');
    expect(handle.items.get('java')!.classList.contains('is-current')).toBe(false);
    expect(handle.items.get('cpp')!.classList.contains('is-current')).toBe(true);
  });

  it('Test 4: refresh is idempotent for the same slug (no DOM mutation)', () => {
    const plugin = makeHost();
    const handle = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    // Switch to java first, capture state.
    handle.refresh('java');
    const javaItem = handle.items.get('java')!;
    const labelTextBefore = handle.labelSpan.textContent;
    const isCurrentBefore = javaItem.classList.contains('is-current');

    // Repeat call — no-op.
    handle.refresh('java');
    expect(handle.labelSpan.textContent).toBe(labelTextBefore);
    expect(javaItem.classList.contains('is-current')).toBe(isCurrentBefore);
    // Exactly one item still has .is-current (no double-add, no leak).
    const currentItems = Array.from(handle.items.values()).filter((b) =>
      b.classList.contains('is-current'),
    );
    expect(currentItems.length).toBe(1);
  });

  it('Test 5: unknown slug falls back to literal text + drops all .is-current', () => {
    const plugin = makeHost();
    const handle = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    handle.refresh('unknown-lang-slug');

    expect(handle.labelSpan.textContent).toBe('unknown-lang-slug');
    // No item should be .is-current (no entry in items Map for the unknown slug).
    const currentItems = Array.from(handle.items.values()).filter((b) =>
      b.classList.contains('is-current'),
    );
    expect(currentItems.length).toBe(0);
  });
});
