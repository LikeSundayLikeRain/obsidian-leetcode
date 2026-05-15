// tests/preview/header-render.test.ts
//
// Phase 06 Plan 03 — DOM contract for ProblemPreviewView's sticky header
// (06-UI-SPEC §Layout). Asserts:
//   - <h2 class="lc-preview__title"> with `{id}. {title}` text.
//   - one `.lc-diff--{difficulty.toLowerCase()}` element.
//   - N `.lc-preview__topic` chips matching topicSlugs.length (with title-case
//     display labels — 'hash-table' → 'Hash Table').
//   - one `<button>` with class `.lc-preview__action` carrying the
//     `is-primary` accent class iff `noteExists === false`.
//   - 06-UI-SPEC §Copywriting: button reads `Start Problem` (no note) /
//     `Open Problem` (note exists).

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { renderHeader } from '../../src/preview/ProblemPreviewView';
import type { DetailCacheEntry } from '../../src/notes/types';

function makeDetail(overrides: Partial<DetailCacheEntry> = {}): DetailCacheEntry {
  return {
    fetchedAt: 1700000000000,
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/two-sum/',
    contentHtml: '<p>Given an array …</p>',
    topicSlugs: ['array', 'hash-table'],
    ...overrides,
  };
}

describe('renderHeader (Phase 06 Plan 03 sticky header DOM contract)', () => {
  it('emits the title heading as `{id}. {title}` inside an h2.lc-preview__title', () => {
    const container = document.createElement('div');
    renderHeader(container, makeDetail({ id: 1, title: 'Two Sum' }), false);
    const h2 = container.querySelector('h2.lc-preview__title');
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe('1. Two Sum');
  });

  it('emits exactly one .lc-diff--{difficulty} pill matching the detail difficulty', () => {
    const container = document.createElement('div');
    renderHeader(container, makeDetail({ difficulty: 'Medium' }), false);
    const easy = container.querySelectorAll('.lc-diff--easy');
    const medium = container.querySelectorAll('.lc-diff--medium');
    const hard = container.querySelectorAll('.lc-diff--hard');
    expect(easy.length).toBe(0);
    expect(medium.length).toBe(1);
    expect(hard.length).toBe(0);
    expect(medium[0]?.textContent).toBe('Medium');
  });

  it('emits N topic chips equal to topicSlugs.length with title-case display labels', () => {
    const container = document.createElement('div');
    renderHeader(
      container,
      makeDetail({ topicSlugs: ['array', 'hash-table', 'two-pointers'] }),
      false,
    );
    const chips = container.querySelectorAll('.lc-preview__topic');
    expect(chips.length).toBe(3);
    expect(chips[0]?.textContent).toBe('Array');
    expect(chips[1]?.textContent).toBe('Hash Table');
    expect(chips[2]?.textContent).toBe('Two Pointers');
  });

  it('emits a Start Problem button with .is-primary when noteExists === false (accent CTA)', () => {
    const container = document.createElement('div');
    const btn = renderHeader(container, makeDetail(), false);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.className).toContain('lc-preview__action');
    expect(btn.className).toContain('is-primary');
    expect(btn.textContent).toBe('Start Problem');
  });

  it('emits an Open Problem button WITHOUT .is-primary when noteExists === true (neutral)', () => {
    const container = document.createElement('div');
    const btn = renderHeader(container, makeDetail(), true);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.className).toContain('lc-preview__action');
    expect(btn.className).not.toContain('is-primary');
    expect(btn.textContent).toBe('Open Problem');
  });

  it('action button carries an aria-label including verb + id + title', () => {
    const container = document.createElement('div');
    const btn = renderHeader(container, makeDetail({ id: 5, title: 'Add Two Numbers' }), false);
    expect(btn.getAttribute('aria-label')).toBe('Start problem 5: Add Two Numbers');
  });

  it('idempotent: calling renderHeader twice on the same container leaves a single header', () => {
    const container = document.createElement('div');
    renderHeader(container, makeDetail(), false);
    renderHeader(container, makeDetail(), true);
    // After the second call, the first call's DOM is gone (container.empty()).
    const titles = container.querySelectorAll('h2.lc-preview__title');
    expect(titles.length).toBe(1);
    const buttons = container.querySelectorAll('button.lc-preview__action');
    expect(buttons.length).toBe(1);
    // The second call's "Open" state is the live one.
    expect(buttons[0]?.textContent).toBe('Open Problem');
  });
});
