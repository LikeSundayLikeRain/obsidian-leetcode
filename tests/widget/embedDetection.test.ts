// Phase 19 Plan 04 Task 1 — embedDetection unit tests (RED).
//
// VALIDATION row 19-04-01 / EMBED-01..04 / RESEARCH §3 (dual-signal embed
// detection) + Pitfall 19-D (null getSectionInfo as embed-likely).
//
// Plan 19-04 refines isEmbedContext to accept an OPTIONAL `info:
// MarkdownSectionInformation | null` argument; null info → embed-likely (true).
// The two existing signals (DOM ancestor walk + ctx.sourcePath mismatch)
// remain. Either signal alone is sufficient.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { isEmbedContext } from '../../src/widget/embedDetect';

interface FakeFile { path: string }

function makeCtx(sourcePath: string): { sourcePath: string } {
  return { sourcePath };
}

function buildHostElement(): HTMLElement {
  return document.createElement('div');
}

describe('isEmbedContext (Plan 19-04 refinement)', () => {
  describe('DOM ancestor signal (signal 1)', () => {
    it('parent has markdown-embed class → returns true', () => {
      const el = buildHostElement();
      const parent = document.createElement('div');
      parent.classList.add('markdown-embed');
      parent.appendChild(el);
      const file = { path: 'LeetCode/two-sum.md' };
      expect(
        isEmbedContext(el, makeCtx(file.path) as never, file as FakeFile as never),
      ).toBe(true);
    });

    it('three-level ancestor has internal-embed class → returns true', () => {
      const el = buildHostElement();
      const mid1 = document.createElement('div');
      const mid2 = document.createElement('div');
      const root = document.createElement('div');
      root.classList.add('internal-embed');
      mid2.appendChild(el);
      mid1.appendChild(mid2);
      root.appendChild(mid1);
      const file = { path: 'LeetCode/two-sum.md' };
      expect(
        isEmbedContext(el, makeCtx(file.path) as never, file as FakeFile as never),
      ).toBe(true);
    });
  });

  describe('sourcePath mismatch signal (signal 2)', () => {
    it('no embed class anywhere AND ctx.sourcePath === file.path → returns false', () => {
      const el = buildHostElement();
      const file = { path: 'LeetCode/two-sum.md' };
      expect(
        isEmbedContext(el, makeCtx(file.path) as never, file as FakeFile as never),
      ).toBe(false);
    });

    it('no embed class AND ctx.sourcePath !== file.path → returns true', () => {
      const el = buildHostElement();
      const file = { path: 'LeetCode/two-sum.md' };
      expect(
        isEmbedContext(
          el,
          makeCtx('Notes/host-note.md') as never,
          file as FakeFile as never,
        ),
      ).toBe(true);
    });
  });

  describe('Both signals true (idempotent)', () => {
    it('DOM embed AND sourcePath mismatch → returns true', () => {
      const el = buildHostElement();
      const parent = document.createElement('div');
      parent.classList.add('markdown-embed');
      parent.appendChild(el);
      const file = { path: 'LeetCode/two-sum.md' };
      expect(
        isEmbedContext(
          el,
          makeCtx('Notes/host-note.md') as never,
          file as FakeFile as never,
        ),
      ).toBe(true);
    });
  });

  describe('Plan 19-04 — null section info (Pitfall 19-D)', () => {
    it('info === null AND no other signals → returns true (Pitfall 19-D treatment)', () => {
      const el = buildHostElement();
      const file = { path: 'LeetCode/two-sum.md' };
      // The new signature accepts an optional fourth argument: info | null.
      // When info === null, isEmbedContext returns true regardless of signals 1/2.
      expect(
        (isEmbedContext as unknown as (
          el: HTMLElement,
          ctx: { sourcePath: string },
          targetFile: { path: string },
          info: unknown,
        ) => boolean)(el, makeCtx(file.path), file, null),
      ).toBe(true);
    });

    it('info present AND no signals → returns false', () => {
      const el = buildHostElement();
      const file = { path: 'LeetCode/two-sum.md' };
      const info = { text: 'mock', lineStart: 0, lineEnd: 1 };
      expect(
        (isEmbedContext as unknown as (
          el: HTMLElement,
          ctx: { sourcePath: string },
          targetFile: { path: string },
          info: unknown,
        ) => boolean)(el, makeCtx(file.path), file, info),
      ).toBe(false);
    });

    it('three-arg call shape (Plan 19-01 baseline) still works without info argument', () => {
      const el = buildHostElement();
      const file = { path: 'LeetCode/two-sum.md' };
      // Backward compatibility — three-arg call without info.
      expect(
        isEmbedContext(el, makeCtx(file.path) as never, file as FakeFile as never),
      ).toBe(false);
    });
  });
});
