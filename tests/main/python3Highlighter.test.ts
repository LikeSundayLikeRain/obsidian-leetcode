// tests/main/python3Highlighter.test.ts
//
// Phase 5.2 D-13 — Python3 syntax-highlight alias.
//
// Target surface: `src/main/python3Highlighter.ts`.
//   - exports `registerPython3Highlighter(plugin: Plugin): void`
//   - installs a Prism alias (`Prism.languages.python3 = Prism.languages.python`)
//   - registers a markdown post-processor that rewrites `language-python3`
//     class on `<code>` elements to `language-python` so Obsidian's existing
//     Python CSS + highlighter picks them up.
//
// Scope: Reading Mode only. Edit-Mode CM6 highlighting is deferred to Phase 5.3.

import { describe, it, expect, vi } from 'vitest';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return {
    ...actual,
    // Minimal Prism stub so the alias-install path can execute without
    // a real Obsidian host.
    loadPrism: async () => ({
      languages: { python: { __python: true } },
    }),
  };
});

type ProcessorFn = (root: HTMLElement, ctx: unknown) => void | Promise<void>;

describe('registerPython3Highlighter (D-13)', () => {
  it('rewrites language-python3 → language-python on rendered <code>', async () => {
    const mod = await import('../../src/main/python3Highlighter');
    const plugin = createFakePlugin();
    mod.registerPython3Highlighter(plugin);

    const processor = plugin.registerMarkdownPostProcessor.mock
      .calls[0][0] as ProcessorFn;

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

  it('leaves language-java / language-cpp untouched', async () => {
    const mod = await import('../../src/main/python3Highlighter');
    const plugin = createFakePlugin();
    mod.registerPython3Highlighter(plugin);
    const processor = plugin.registerMarkdownPostProcessor.mock
      .calls[0][0] as ProcessorFn;

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

    expect(root.querySelector('code.language-java')).not.toBeNull();
    expect(root.querySelector('code.language-cpp')).not.toBeNull();
  });
});
