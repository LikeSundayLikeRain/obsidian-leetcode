// src/main/codeActionsPostProcessor.ts
//
// Phase 5 Wave 4 (D-11, D-12, D-13) — Reading-mode Run/Submit buttons below
// fenced code blocks on LeetCode problem notes. Registered in main.ts via
// plugin.registerMarkdownPostProcessor; Obsidian invokes the callback for
// every reading-mode render pass.
//
// Guard chain (RESEARCH §Pattern 2 + Pitfalls 3/5/14):
//   1. Pitfall 5: Gate on lc-slug frontmatter via metadataCache. The context's
//      sourcePath → TFile → cached frontmatter. No slug → no buttons (D-12).
//   2. Pitfall 3: Idempotency — if the <pre>'s nextElementSibling is already
//      our .leetcode-code-actions div, skip. Prevents duplicate button rows
//      on scroll / re-render.
//   3. Pitfall 14: executeCommandById uses the fully-qualified
//      `${plugin.manifest.id}:run` / `:submit` format. The bare command IDs
//      ('run', 'submit') are plugin.manifest.id-prefixed at registration time
//      (see runCommandRegistration.ts + main.ts addCommand sites).
//
// DOM discipline (CF-07): use the element's ownerDocument.createElement +
// appendChild pattern (works in happy-dom unit tests AND in production
// Obsidian). NO innerHTML. Neutral buttons — no .mod-cta (UI-SPEC color rule:
// accent reserved for primary auth button).

import type { Plugin } from 'obsidian';

// `app.commands.executeCommandById` is an undocumented but long-stable Obsidian
// API; the shipped `obsidian.d.ts` does not surface it. Scope a tiny structural
// type here rather than leaking the cast to call sites.
interface AppWithCommands {
  commands: {
    executeCommandById(id: string): boolean;
  };
}

export function registerCodeBlockActionProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((element, ctx) => {
    // Pitfall 5: metadataCache accepts any { path } shape in production;
    // passing the raw sourcePath in a minimal TFile-like wrapper lets the
    // cache resolve by path without needing the real TFile instance (which
    // Wave 0 tests cannot synthesize inside happy-dom).
    const cache = plugin.app.metadataCache.getFileCache(
      { path: ctx.sourcePath } as unknown as Parameters<
        typeof plugin.app.metadataCache.getFileCache
      >[0],
    );
    const fm = cache?.frontmatter as Record<string, unknown> | undefined;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;
    const commands = (plugin.app as unknown as AppWithCommands).commands;

    const codeBlocks = element.querySelectorAll('pre > code');
    codeBlocks.forEach((code) => {
      const pre = code.parentElement;
      if (!pre) return;
      // Pitfall 3: idempotency guard — re-render must not duplicate.
      if (pre.nextElementSibling?.classList.contains('leetcode-code-actions')) return;

      // eslint-disable-next-line obsidianmd/prefer-active-doc -- happy-dom fallback for tests; ownerDocument resolves to the correct document in production
      const doc: Document = pre.ownerDocument ?? document;
      const row = doc.createElement('div');
      row.className = 'leetcode-code-actions';

      const runBtn = doc.createElement('button');
      runBtn.className = 'leetcode-code-action-run';
      runBtn.textContent = 'Run';
      runBtn.addEventListener('click', () => {
        // Pitfall 14: command IDs are plugin.manifest.id-prefixed at registration time.
        commands.executeCommandById(`${plugin.manifest.id}:run`);
      });
      row.appendChild(runBtn);

      const submitBtn = doc.createElement('button');
      submitBtn.className = 'leetcode-code-action-submit';
      submitBtn.textContent = 'Submit';
      submitBtn.addEventListener('click', () => {
        commands.executeCommandById(`${plugin.manifest.id}:submit`);
      });
      row.appendChild(submitBtn);

      pre.insertAdjacentElement('afterend', row);
    });
  });
}
