// Phase 19 Plan 01 — LC note fixtures for widget tests.
//
// Mirrors the CANONICAL_NOTE shape from tests/main/nestedEditorExtension.test.ts:66-91
// but swaps the fence opener tag from `python3` (Phase 13–18 nested-editor) to
// `leetcode-solve` (Phase 19+ inline widget — CONTEXT C-01 / Phase 21 fence tag).
// Frontmatter keeps `lc-language: python3` because Phase 19 reads the language
// from frontmatter, not the fence opener (CONTEXT C-01).
//
// All fixtures are pure data — they import nothing from the plugin source.

/** Canonical LC note: lc-slug + lc-language present, single leetcode-solve fence. */
export const CANONICAL_LC_NOTE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
  '---',
  '',
  '## Problem',
  '',
  'Given an array...',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'class Solution:',
  '    def twoSum(self):',
  '        pass',
  '```',
  '',
  '## Techniques',
  '',
  '## Notes',
].join('\n');

/** Two leetcode-solve fences in the same file (Pitfall 19-E corner case). */
export const MULTI_FENCE_NOTE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
  '---',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'A',
  '```',
  '',
  '## Other',
  '',
  '```leetcode-solve',
  'B',
  '```',
].join('\n');

/** LC note without lc-slug — should fall back to static <pre><code>. */
export const MISSING_SLUG_NOTE = [
  '---',
  'lc-language: python3',
  '---',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'pass',
  '```',
].join('\n');

/** LC note with lc-slug but no lc-language — Plan 19-04 emits Notice + Python fallback. */
export const MISSING_LANGUAGE_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'pass',
  '```',
].join('\n');

/** Host note containing an embed reference to an LC note. */
export const EMBED_HOST_NOTE = [
  '# My host note',
  '',
  '![[two-sum]]',
  '',
  'See above.',
].join('\n');

/** Stray leetcode-solve fence inside a non-LC note (no lc-slug). */
export const STRAY_FENCE_NOTE = [
  '# Random vault note',
  '',
  'Some prose.',
  '',
  '```leetcode-solve',
  'console.log("not a real LC note");',
  '```',
  '',
  'More prose.',
].join('\n');

/** Same as CANONICAL_LC_NOTE but with CRLF line endings. */
export const CRLF_NOTE = CANONICAL_LC_NOTE.replace(/\n/g, '\r\n');

/** Canonical note WITHOUT a trailing newline. */
export const NO_TRAILING_NEWLINE_NOTE = CANONICAL_LC_NOTE.replace(/\n$/, '');
