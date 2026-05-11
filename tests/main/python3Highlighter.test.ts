// tests/main/python3Highlighter.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-05 (Python3 syntax-highlight alias D-13).
//
// Target surface (not yet created): `src/main/python3Highlighter.ts`.
//   - exports `registerPython3Highlighter(plugin: Plugin): void`
//   - registers a markdown post-processor that rewrites the `language-python3`
//     class on `<code>` elements to `language-python` so Obsidian's existing
//     Python highlighter picks them up. Other languages are untouched.
//
// This test is `it.skip` because the target module doesn't exist yet. Plan
// 05.2-05 creates the file and this test unskips.

import { describe, it, expect, vi } from 'vitest';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

type ProcessorFn = (root: HTMLElement, ctx: unknown) => void | Promise<void>;

// Dynamic import path — Vite's import-analysis transform refuses to resolve a
// literal path to a non-existent module at load time (even inside `it.skip`).
// Routing through a runtime variable keeps the vitest loader happy while the
// file doesn't exist yet. 05.2-05 creates `src/main/python3Highlighter.ts`
// and these tests unskip as-is.
const PYTHON3_HIGHLIGHTER_PATH = '../../src/main/python3Highlighter';

describe('registerPython3Highlighter (RED until 05.2-05)', () => {
  // D-13 — rewriting `code.language-python3` to `code.language-python`.
  it.skip('D-13: rewrites language-python3 → language-python on rendered code (TODO(05.2-05))', async () => {
    const mod = (await import(/* @vite-ignore */ PYTHON3_HIGHLIGHTER_PATH)) as unknown as {
      registerPython3Highlighter: (plugin: unknown) => void;
    };

    const plugin = createFakePlugin();
    mod.registerPython3Highlighter(plugin);

    // Post-processor is registered via plugin.registerMarkdownPostProcessor —
    // capture the callback to exercise it directly (mirrors the pattern used
    // by tests/main/codeActionsPostProcessor.test.ts).
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as ProcessorFn;

    const root = document.createElement('div');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-python3';
    code.textContent = "print('hello')";
    pre.appendChild(code);
    root.appendChild(pre);

    await processor(root, {});

    expect(code.classList.contains('language-python')).toBe(true);
    expect(code.classList.contains('language-python3')).toBe(false);
  });

  // D-13 — java / cpp untouched. Only `language-python3` should be rewritten.
  it.skip('D-13: leaves language-java / language-cpp untouched (TODO(05.2-05))', async () => {
    const mod = (await import(/* @vite-ignore */ PYTHON3_HIGHLIGHTER_PATH)) as unknown as {
      registerPython3Highlighter: (plugin: unknown) => void;
    };

    const plugin = createFakePlugin();
    mod.registerPython3Highlighter(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock.calls[0][0] as ProcessorFn;

    const root = document.createElement('div');
    for (const lang of ['java', 'cpp']) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.className = `language-${lang}`;
      code.textContent = 'noop';
      pre.appendChild(code);
      root.appendChild(pre);
    }

    await processor(root, {});

    const javaCode = root.querySelector('code.language-java');
    const cppCode = root.querySelector('code.language-cpp');
    expect(javaCode).not.toBeNull();
    expect(cppCode).not.toBeNull();
  });
});
