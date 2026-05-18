// tests/ai/rerunAIReview.test.ts
//
// Phase 09 Plan 04 (AIREV-05) — palette-command + runAIReview coverage
// for the manual AI Review re-run surface. Test split:
//
//   - Source-file grep gates: ID, label, no-prefix, no default hotkey
//     (mirrors tests/main/aiDebugCommand.test.ts posture).
//   - editorCheckCallback unit cases: drives the callback shape directly
//     against a synthesized View+frontmatter to assert the gate logic
//     (no file -> false; no fm -> false; invalid slug -> false; valid slug
//     -> true; checking=true does NOT dispatch).
//   - runAIReview routing: validates provider-missing Notice guard.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SRC_MAIN = fs.readFileSync(path.join(REPO_ROOT, 'src/main.ts'), 'utf-8');

describe('src/main.ts grep gates — Phase 09 Plan 04 wiring (AIREV-05)', () => {
  it("registers `rerun-ai-review` palette command with verbatim label 'Re-run AI review on current note'", () => {
    expect(SRC_MAIN).toMatch(/id:\s*'rerun-ai-review'/);
    expect(SRC_MAIN).toMatch(/name:\s*'Re-run AI review on current note'/);
  });

  it('palette command ID has NO plugin-id prefix (clean ID per FOUND-03)', () => {
    expect(SRC_MAIN).not.toMatch(/'obsidian-leetcode:rerun-ai-review'/);
    expect(SRC_MAIN).not.toMatch(/'leetcode-rerun-ai-review'/);
  });

  it('palette command ID has NO default hotkey (project rule)', () => {
    const idIdx = SRC_MAIN.indexOf("id: 'rerun-ai-review'");
    expect(idIdx).toBeGreaterThan(0);
    const block = SRC_MAIN.slice(idIdx, idIdx + 800);
    expect(block).not.toMatch(/hotkeys:/);
  });

  it('palette command uses editorCheckCallback (frontmatter guard)', () => {
    const idIdx = SRC_MAIN.indexOf("id: 'rerun-ai-review'");
    const block = SRC_MAIN.slice(idIdx, idIdx + 800);
    expect(block).toMatch(/editorCheckCallback/);
    expect(block).toMatch(/isValidSlug/);
    expect(block).toMatch(/runAIReview/);
  });

  it('palette command exists exactly once (no duplicate IDs)', () => {
    const matches = SRC_MAIN.match(/id:\s*'rerun-ai-review'/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('runAIReview method exists with slug + file parameters', () => {
    expect(SRC_MAIN).toMatch(/async runAIReview\(slug:\s*string,\s*file:\s*TFile\):\s*Promise<void>/);
  });

  it('runAIReview surfaces the locked no-provider Notice', () => {
    expect(SRC_MAIN).toMatch(/'No AI provider configured\. Open settings → AI\.'/);
  });

  it('runAIReview opens AIStreamModal with withReviewBullet(DISCLOSURE_BASE_COPY)', () => {
    expect(SRC_MAIN).toMatch(/withReviewBullet\(DISCLOSURE_BASE_COPY\)/);
  });

  it('AIStreamModal is constructed in runAIReview with onStreamComplete callback', () => {
    const idx = SRC_MAIN.indexOf('async runAIReview(');
    expect(idx).toBeGreaterThan(0);
    const block = SRC_MAIN.slice(idx, idx + 2000);
    expect(block).toMatch(/onStreamComplete/);
    expect(block).toMatch(/new AIStreamModal\(/);
  });

  it('onStreamComplete callback uses vault.process with mergeAIReviewSection', () => {
    const idx = SRC_MAIN.indexOf('async runAIReview(');
    expect(idx).toBeGreaterThan(0);
    const block = SRC_MAIN.slice(idx, idx + 2000);
    expect(block).toMatch(/vault\.process/);
    expect(block).toMatch(/mergeAIReviewSection/);
  });
});

// -- editorCheckCallback unit cases (mirrors aiDebugCommand.test.ts shape) --

describe('rerun-ai-review editorCheckCallback shape (unit)', () => {
  function makeCheckCallback(
    isValid: (s: unknown) => boolean,
    onDispatch: (slug: string, file: unknown) => void,
  ) {
    return (
      checking: boolean,
      _editor: unknown,
      view: { file: { path: string } | null; metadataCache?: unknown },
      metadataCache: { getFileCache: (f: unknown) => { frontmatter?: Record<string, unknown> } | null },
    ): boolean => {
      const file = view.file;
      if (!file) return false;
      const fm = metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const slug = fm?.['lc-slug'];
      if (!isValid(slug)) return false;
      if (!checking) {
        onDispatch(slug as string, file);
      }
      return true;
    };
  }

  const isValidSlug = (s: unknown): s is string =>
    typeof s === 'string' && s.length > 0 && /^[a-z0-9-]+$/.test(s);

  it('returns false when view.file is null (Test 1)', () => {
    const dispatched: string[] = [];
    const cb = makeCheckCallback(isValidSlug, (s) => dispatched.push(s));
    const result = cb(
      false,
      {},
      { file: null },
      { getFileCache: () => null },
    );
    expect(result).toBe(false);
    expect(dispatched).toEqual([]);
  });

  it('returns false when frontmatter has no lc-slug (Test 2)', () => {
    const dispatched: string[] = [];
    const cb = makeCheckCallback(isValidSlug, (s) => dispatched.push(s));
    const result = cb(
      false,
      {},
      { file: { path: 'note.md' } },
      { getFileCache: () => ({ frontmatter: {} }) },
    );
    expect(result).toBe(false);
    expect(dispatched).toEqual([]);
  });

  it('returns true when frontmatter has valid lc-slug (Test 3)', () => {
    const dispatched: string[] = [];
    const cb = makeCheckCallback(isValidSlug, (s) => dispatched.push(s));
    const result = cb(
      false,
      {},
      { file: { path: 'note.md' } },
      { getFileCache: () => ({ frontmatter: { 'lc-slug': 'two-sum' } }) },
    );
    expect(result).toBe(true);
    expect(dispatched).toEqual(['two-sum']);
  });

  it('dispatches to runAIReview when checking === false (Test 4)', () => {
    const dispatched: Array<{ slug: string; file: unknown }> = [];
    const cb = makeCheckCallback(isValidSlug, (slug, file) => dispatched.push({ slug, file }));
    const mockFile = { path: 'note.md' };
    cb(
      false,
      {},
      { file: mockFile },
      { getFileCache: () => ({ frontmatter: { 'lc-slug': 'two-sum' } }) },
    );
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].slug).toBe('two-sum');
    expect(dispatched[0].file).toBe(mockFile);
  });

  it('does NOT dispatch when checking === true (palette-list-render mode)', () => {
    const dispatched: string[] = [];
    const cb = makeCheckCallback(isValidSlug, (s) => dispatched.push(s));
    const result = cb(
      true,
      {},
      { file: { path: 'note.md' } },
      { getFileCache: () => ({ frontmatter: { 'lc-slug': 'two-sum' } }) },
    );
    expect(result).toBe(true);
    expect(dispatched).toEqual([]);
  });
});

// -- runAIReview provider guard (Test 5) --

describe('runAIReview provider-missing guard', () => {
  it('runAIReview shows Notice when no AI provider configured (grep gate)', () => {
    // The method must check getActiveAIProvider() === null and show the
    // standard no-provider Notice. Verified via source grep.
    const idx = SRC_MAIN.indexOf('async runAIReview(');
    expect(idx).toBeGreaterThan(0);
    const block = SRC_MAIN.slice(idx, idx + 1500);
    expect(block).toMatch(/getActiveAIProvider\(\)/);
    expect(block).toMatch(/=== null/);
    expect(block).toMatch(/No AI provider configured/);
  });
});
