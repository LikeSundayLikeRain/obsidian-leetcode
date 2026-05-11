// Phase 5.3 (POLISH-09) — Language-aware edit-mode fence.
// RED-state unit tests. Pins the behavioral contract the Wave 1 implementation
// module `src/main/codeFenceLanguageExtension.ts` must satisfy: slug→pack map,
// frontmatter `lc-slug` gate, caret-in-`## Code`-fence detection, and language
// routing for the pragmatic 8 LC languages (Python/python3 → python,
// Java → java, C/C++ → cpp, JavaScript/TypeScript → javascript+typescript,
// Go → go, Rust → rust). Unsupported slugs (csharp, ruby, mysql, …) → fallback.
//
// WAVE 0 LINT NOTE: the rules disabled below fire solely because
// `../../src/main/codeFenceLanguageExtension` does not yet exist (TDD Wave 0
// RED contract — the imports below resolve to `any`/`error` until Wave 1 ships
// the module). When Wave 1 (Plan 02) creates the real module with typed exports,
// TypeScript will infer concrete types, the no-unsafe-* cascade will evaporate,
// and these disables can be removed. Mirrors the Phase 5.1 RED-state pattern in
// tests/main/codeActionsEditorExtension.test.ts.
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, obsidianmd/prefer-active-doc -- Wave 0 RED-state scaffolding; removed when Wave 1 ships the implementation module */

import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import type { EditorState } from '@codemirror/state';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// MUST fail to resolve at Wave 0 time; becomes resolvable when Wave 1 (Plan 02)
// ships `src/main/codeFenceLanguageExtension.ts` with these named exports.
import {
  mapSlugToPack,
  computeFenceState,
  buildCodeFenceLanguageExtension,
} from '../../src/main/codeFenceLanguageExtension';

// --- Full-note fixtures (frontmatter + ## Code fence) ---------------------
// Mirror the analog FULL_NOTE shape from
// tests/main/codeActionsEditorExtension.test.ts lines 37–62, varied per fence
// language. Used by Group 2 (gate), Group 3 (caret math), and Group 4 (routing).

const PYTHON_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Problem',
  '',
  'Given an array, return two indices.',
  '',
  '## Code',
  '',
  '```python3',
  'class Solution:',
  '    pass',
  '```',
  '',
  '## Techniques',
  '',
].join('\n');

const JAVA_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {}',
  '```',
  '',
].join('\n');

const C_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```c',
  'int main(void) { return 0; }',
  '```',
  '',
].join('\n');

const GOLANG_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```golang',
  'package main',
  '```',
  '',
].join('\n');

const CSHARP_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```csharp',
  'public class Solution {}',
  '```',
  '',
].join('\n');

const NO_CODE_NOTE = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Problem',
  '',
  '```text',
  'sample IO only',
  '```',
  '',
].join('\n');

// --- Minimal EditorState stub for pure-function (no-file) tests -----------
// Drawn from the 5.1 analog (lines 64–82) — `state.doc.line(n)` returns
// 1-indexed lines with `text/from/to/number`, sufficient for findCodeFence
// + caret-line arithmetic. No real CM6 internals required.
function makeState(text: string, caretPos = 0): EditorState {
  const lines = text.split('\n');
  return {
    doc: {
      get lines() {
        return lines.length;
      },
      get length() {
        return text.length;
      },
      line(n: number) {
        const t = lines[n - 1] ?? '';
        const before = lines.slice(0, n - 1).join('\n');
        const from = n === 1 ? 0 : before.length + 1;
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, from, to, number: n };
      },
      lineAt(pos: number) {
        // Walk forward until cumulative length >= pos.
        let acc = 0;
        for (let n = 1; n <= lines.length; n++) {
          const lineLen = (lines[n - 1] ?? '').length;
          if (acc + lineLen >= pos) {
            return { number: n, from: acc, to: acc + lineLen, text: lines[n - 1] ?? '' };
          }
          acc += lineLen + 1; // +1 for the newline
        }
        const last = lines.length;
        return {
          number: last,
          from: acc,
          to: acc + (lines[last - 1] ?? '').length,
          text: lines[last - 1] ?? '',
        };
      },
    },
    selection: { main: { head: caretPos, anchor: caretPos } },
    field(_f: unknown) {
      return null;
    },
  } as unknown as EditorState;
}

// --- State helper that plumbs a file reference through editorInfoField ----
// computeFenceState reads `state.field(editorInfoField)?.file` then looks up
// frontmatter via `plugin.app.metadataCache.getFileCache(file)`. Tests stub
// `state.field()` to always return `{ file: { path } }` for the configured
// path — sufficient since 5.3 gate code only reads editorInfoField (mirrors
// the 5.1 analog's makeStateWithFile, lines 104–134).
function makeStateWithFile(
  text: string,
  opts: { path: string; caretPos?: number },
): EditorState {
  const lines = text.split('\n');
  const caretPos = opts.caretPos ?? 0;
  const fakeState = {
    doc: {
      get lines() {
        return lines.length;
      },
      get length() {
        return text.length;
      },
      line(n: number) {
        const t = lines[n - 1] ?? '';
        const before = lines.slice(0, n - 1).join('\n');
        const from = n === 1 ? 0 : before.length + 1;
        const to = lines.slice(0, n).join('\n').length;
        return { text: t, from, to, number: n };
      },
      lineAt(pos: number) {
        let acc = 0;
        for (let n = 1; n <= lines.length; n++) {
          const lineLen = (lines[n - 1] ?? '').length;
          if (acc + lineLen >= pos) {
            return { number: n, from: acc, to: acc + lineLen, text: lines[n - 1] ?? '' };
          }
          acc += lineLen + 1;
        }
        const last = lines.length;
        return {
          number: last,
          from: acc,
          to: acc + (lines[last - 1] ?? '').length,
          text: lines[last - 1] ?? '',
        };
      },
    },
    selection: { main: { head: caretPos, anchor: caretPos } },
    field(_f: unknown) {
      // Wave 0 hermetic stub: tests do not discriminate between editorInfoField
      // and editorLivePreviewField; computeFenceState only reads editorInfoField
      // for the file ref. Returning a {file} object always is a sound stub for
      // both reads (a boolean Live Preview state passes through unchanged).
      return { file: { path: opts.path } };
    },
  };
  return fakeState as unknown as EditorState;
}

/** Compute the byte-offset of the line whose 1-indexed number is `lineNumber`,
 *  for placing the caret on the desired line in test fixtures. */
function lineStart(text: string, lineNumber: number): number {
  const lines = text.split('\n');
  let acc = 0;
  for (let n = 1; n < lineNumber; n++) {
    acc += (lines[n - 1] ?? '').length + 1;
  }
  return acc;
}

// =========================================================================
// Group 1 — mapSlugToPack
// =========================================================================
// 13 cases per RESEARCH lines 898–929 + D-05 slug expansion.

describe('mapSlugToPack', () => {
  it('maps python → python pack', () => {
    expect(mapSlugToPack('python')).toBe('python');
  });

  it('maps python3 → python pack (alias)', () => {
    expect(mapSlugToPack('python3')).toBe('python');
  });

  it('maps java → java pack', () => {
    expect(mapSlugToPack('java')).toBe('java');
  });

  it('maps cpp → cpp pack', () => {
    expect(mapSlugToPack('cpp')).toBe('cpp');
  });

  it('maps c → cpp pack (D-05 shared parser)', () => {
    expect(mapSlugToPack('c')).toBe('cpp');
  });

  it('maps javascript → javascript pack', () => {
    expect(mapSlugToPack('javascript')).toBe('javascript');
  });

  it('maps typescript → typescript pack', () => {
    expect(mapSlugToPack('typescript')).toBe('typescript');
  });

  it('maps golang → go pack', () => {
    expect(mapSlugToPack('golang')).toBe('go');
  });

  it('maps rust → rust pack', () => {
    expect(mapSlugToPack('rust')).toBe('rust');
  });

  it('maps csharp → fallback (D-04)', () => {
    expect(mapSlugToPack('csharp')).toBe('fallback');
  });

  it('maps ruby → fallback', () => {
    expect(mapSlugToPack('ruby')).toBe('fallback');
  });

  it('maps mysql → fallback', () => {
    expect(mapSlugToPack('mysql')).toBe('fallback');
  });

  it('maps empty string → fallback', () => {
    expect(mapSlugToPack('')).toBe('fallback');
  });
});

// =========================================================================
// Group 2 — computeFenceState — lc-slug gate
// =========================================================================
// Returns EMPTY when the lc-slug frontmatter gate fails (D-12).

describe('computeFenceState — lc-slug gate', () => {
  let metadataCache: ReturnType<typeof createFakeMetadataCache>;

  beforeEach(() => {
    metadataCache = createFakeMetadataCache();
  });

  it('returns EMPTY when frontmatter is missing', () => {
    metadataCache.setFrontmatter('Notes/random.md', null);
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateWithFile(PYTHON_NOTE, { path: 'Notes/random.md' });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });

  it('returns EMPTY when lc-slug is empty string', () => {
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': '' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateWithFile(PYTHON_NOTE, { path: 'LeetCode/0001-two-sum.md' });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });

  it('returns EMPTY when lc-slug present but no ## Code fence', () => {
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const state = makeStateWithFile(NO_CODE_NOTE, { path: 'LeetCode/0001-two-sum.md' });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });
});

// =========================================================================
// Group 3 — computeFenceState — caret-in-fence
// =========================================================================
// 5 caret-position cases. Pattern 1's strict-inside check:
// `caretLine > openerLine && caretLine < closerLine`. Boundary lines (opener,
// closer) and lines outside the fence return false.
//
// PYTHON_NOTE structure (1-indexed lines):
//   1: ---
//   2: lc-slug: two-sum
//   3: ---
//   4: (empty)
//   5: ## Problem
//   6: (empty)
//   7: Given an array, return two indices.
//   8: (empty)
//   9: ## Code
//  10: (empty)
//  11: ```python3        <- opener
//  12: class Solution:
//  13:     pass
//  14: ```               <- closer
//  15: (empty)
//  16: ## Techniques
//  17: (empty)

describe('computeFenceState — caret-in-fence', () => {
  let metadataCache: ReturnType<typeof createFakeMetadataCache>;

  beforeEach(() => {
    metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
  });

  it('caret on opener line returns caretInCodeFence:false', () => {
    const plugin = createFakePlugin({ metadataCache });
    const caret = lineStart(PYTHON_NOTE, 11) + 1; // inside ```python3
    const state = makeStateWithFile(PYTHON_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });

  it('caret on closer line returns caretInCodeFence:false', () => {
    const plugin = createFakePlugin({ metadataCache });
    const caret = lineStart(PYTHON_NOTE, 14) + 1; // inside closing ```
    const state = makeStateWithFile(PYTHON_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });

  it('caret strictly between opener and closer returns caretInCodeFence:true', () => {
    const plugin = createFakePlugin({ metadataCache });
    const caret = lineStart(PYTHON_NOTE, 12) + 2; // inside `class Solution:`
    const state = makeStateWithFile(PYTHON_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(true);
  });

  it('caret above opener returns caretInCodeFence:false', () => {
    const plugin = createFakePlugin({ metadataCache });
    const caret = lineStart(PYTHON_NOTE, 7) + 2; // inside the prose paragraph
    const state = makeStateWithFile(PYTHON_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });

  it('caret below closer returns caretInCodeFence:false', () => {
    const plugin = createFakePlugin({ metadataCache });
    const caret = lineStart(PYTHON_NOTE, 16) + 2; // inside ## Techniques heading
    const state = makeStateWithFile(PYTHON_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(false);
  });
});

// =========================================================================
// Group 4 — computeFenceState — language routing
// =========================================================================
// 4 cases verifying the slug→desiredPack routing once the gate + caret-in-fence
// checks pass. Sentinel caret pos placed on the line strictly inside the fence.

describe('computeFenceState — language routing', () => {
  let metadataCache: ReturnType<typeof createFakeMetadataCache>;

  beforeEach(() => {
    metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/0001-two-sum.md', { 'lc-slug': 'two-sum' });
  });

  it('python3 fence routes to desiredPack:python', () => {
    const plugin = createFakePlugin({ metadataCache });
    const caret = lineStart(PYTHON_NOTE, 12) + 2;
    const state = makeStateWithFile(PYTHON_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(true);
    expect(result.desiredPack).toBe('python');
  });

  it('c fence routes to desiredPack:cpp (shared parser)', () => {
    const plugin = createFakePlugin({ metadataCache });
    // C_NOTE structure: opener at line 7, closer at line 9; caret on line 8.
    const caret = lineStart(C_NOTE, 8) + 2;
    const state = makeStateWithFile(C_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(true);
    expect(result.desiredPack).toBe('cpp');
  });

  it('golang fence routes to desiredPack:go', () => {
    const plugin = createFakePlugin({ metadataCache });
    // GOLANG_NOTE structure: opener at line 7, closer at line 9; caret on line 8.
    const caret = lineStart(GOLANG_NOTE, 8) + 2;
    const state = makeStateWithFile(GOLANG_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(true);
    expect(result.desiredPack).toBe('go');
  });

  it('csharp fence routes to desiredPack:fallback (D-04)', () => {
    const plugin = createFakePlugin({ metadataCache });
    // CSHARP_NOTE structure: opener at line 7, closer at line 9; caret on line 8.
    const caret = lineStart(CSHARP_NOTE, 8) + 2;
    const state = makeStateWithFile(CSHARP_NOTE, {
      path: 'LeetCode/0001-two-sum.md',
      caretPos: caret,
    });

    const result = computeFenceState(state, plugin as never);

    expect(result.caretInCodeFence).toBe(true);
    expect(result.desiredPack).toBe('fallback');
  });
});

// =========================================================================
// Group 5 — buildCodeFenceLanguageExtension — public API exists
// =========================================================================
// Sanity check mirroring the 5.1 analog (lines 304–313). Real behavioral
// coverage lives in the computeFenceState tests above; this group simply pins
// the public-API surface so Wave 1 can't ship the module without exporting
// the factory.

describe('buildCodeFenceLanguageExtension — public API exists', () => {
  it('exports a function that returns a CM6 Extension', () => {
    const metadataCache = createFakeMetadataCache();
    const plugin = createFakePlugin({ metadataCache });

    const ext = buildCodeFenceLanguageExtension(plugin as never);

    // A StateField + ViewPlugin + Compartment value is an Extension; truthy is
    // sufficient for the public-API sanity check at Wave 0 RED time. JAVA_NOTE
    // is referenced here only to exercise that the test module's fixtures load
    // successfully — when the import above fails (Wave 0 RED), this test fails
    // at module-resolution time, not at this expectation.
    expect(JAVA_NOTE).toContain('## Code');
    expect(ext).toBeTruthy();
  });
});
