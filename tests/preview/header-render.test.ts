// tests/preview/header-render.test.ts
//
// Phase 06 Plan 03 (with gap-closure 06-05) — DOM contract for the
// ProblemPreviewView sticky header (06-UI-SPEC §Layout, amended by
// 06-UAT.md). Asserts:
//   - <h2 class="lc-preview__title"> with `{id}. {title}` text.
//   - one `.lc-diff--{difficulty.toLowerCase()}` element.
//   - ZERO `.lc-preview__topic` chips regardless of topicSlugs (gap-closure
//     06-05: topic chips dropped from header per user override of decision C).
//   - the action button is a child of `.lc-preview__chips` so the strip
//     collapses to title + pill + button on one line.
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

  it('emits ZERO .lc-preview__topic chips regardless of topicSlugs (gap-closure 06-05)', () => {
    // Topic chips were dropped from the sticky header per user override of
    // CONTEXT.md decision C. The header is now a single-strip layout
    // (title + difficulty pill + action button). This test locks the
    // deletion at the DOM level even when the detail carries a non-empty
    // topicSlugs array.
    const container = document.createElement('div');
    renderHeader(
      container,
      makeDetail({ topicSlugs: ['array', 'hash-table', 'two-pointers'] }),
      false,
    );
    const chips = container.querySelectorAll('.lc-preview__topic');
    expect(chips.length).toBe(0);
  });

  it('title, difficulty pill, and action button are direct children of the header strip (single-row layout)', () => {
    // Gap-closure 06-05 follow-up — single-row layout: header is a flex row
    // with title, pill, and button as siblings. CSS `margin-left: auto` on
    // `.lc-preview__action` pushes the button to the right edge.
    const container = document.createElement('div');
    const btn = renderHeader(
      container,
      makeDetail({ topicSlugs: ['array', 'hash-table'] }),
      false,
    );
    const title = container.querySelector('h2.lc-preview__title');
    const pill = container.querySelector('.lc-diff');
    expect(title).not.toBeNull();
    expect(pill).not.toBeNull();
    expect(title?.parentElement).toBe(container);
    expect(pill?.parentElement).toBe(container);
    expect(btn.parentElement).toBe(container);
    // No `.lc-preview__chips` wrapper anymore.
    expect(container.querySelector('.lc-preview__chips')).toBeNull();
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
