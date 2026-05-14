import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { buildCodeBlockButtonRow, type CodeBlockButtonRowHost } from './codeBlockButtonRow';

export function registerCodeBlockActionProcessor(
  plugin: Plugin & CodeBlockButtonRowHost,
): void {
  plugin.registerMarkdownPostProcessor((element, ctx) => {
    const cache = plugin.app.metadataCache.getFileCache(
      { path: ctx.sourcePath } as unknown as Parameters<
        typeof plugin.app.metadataCache.getFileCache
      >[0],
    );
    const fm = cache?.frontmatter as Record<string, unknown> | undefined;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;

    const pre = findCodeSectionPre(element, ctx);
    if (!pre) return;
    if (pre.nextElementSibling?.classList.contains('leetcode-code-actions')) return;

    const doc: Document = pre.ownerDocument as unknown as Document;
    const row = buildCodeBlockButtonRow(doc, plugin);
    pre.insertAdjacentElement('afterend', row);
  });
}

function findCodeSectionPre(
  element: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): HTMLElement | null {
  const pre = element.querySelector(':scope > pre, pre');
  if (!pre || !pre.querySelector(':scope > code')) return null;

  const info = ctx.getSectionInfo(element);
  if (info) {
    const lines = info.text.split('\n');
    for (let i = info.lineStart - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      const m = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (m) {
        const level = (m[1] ?? '').length;
        const title = (m[2] ?? '').trim();
        if (level === 2 && title === 'Code') {
          return pre as HTMLElement;
        }
        if (level <= 2) return null;
      }
    }
    return null;
  }

  const headings = element.querySelectorAll('h2');
  for (const h of Array.from(headings)) {
    if (h.textContent?.trim() === 'Code') {
      let sib = h.nextElementSibling;
      while (sib) {
        if (sib.tagName === 'PRE' && sib.querySelector(':scope > code')) {
          return sib as HTMLElement;
        }
        if (sib.tagName === 'H2') return null;
        sib = sib.nextElementSibling;
      }
    }
  }
  return null;
}
