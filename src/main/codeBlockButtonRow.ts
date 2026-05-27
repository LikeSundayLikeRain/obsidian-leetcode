import type { Plugin } from 'obsidian';

export interface CodeBlockButtonRowHost {
  resetFromActive(): void | Promise<void>;
  retrieveLastSubmissionFromActive(): void | Promise<void>;
  runFromActive(): void | Promise<void>;
  submitFromActive(): void | Promise<void>;
  aiDebugFromActive(): void | Promise<void>;
  aiSolutionFromActive(): void | Promise<void>;
}

/**
 * Phase 5.3 D-09 — optional pre-Run prefix slot for the Edit-Mode language
 * chevron (LEFT-aligned, before Run/Submit).
 *
 * Edit-Mode only: ONLY `CodeActionsWidget.toDOM` (the CM6 widget at
 * `src/main/codeActionsEditorExtension.ts`) MUST pass the prefix factory.
 * The Reading-Mode caller (`src/main/codeActionsPostProcessor.ts`) MUST
 * omit this option entirely — Reading Mode is render-only and a chevron
 * there has no semantic meaning (D-09 lock; UI-SPEC §"Why the chevron is
 * Edit-Mode only").
 *
 * Per RESEARCH §Pitfall 2: this contract is enforced by leaving the
 * Reading-Mode call site at the two-arg signature (TypeScript optional
 * default keeps it compiling); a regression test in
 * `tests/main/codeBlockButtonRow.test.ts` asserts the no-prefix path
 * produces exactly 2 children.
 */
export interface CodeBlockButtonRowOptions {
  prefix?: () => HTMLElement;
}

export function buildCodeBlockButtonRow(
  doc: Document,
  plugin: Plugin & CodeBlockButtonRowHost,
  opts: CodeBlockButtonRowOptions = {},
): HTMLDivElement {
  const row = doc.createElement('div');
  row.className = 'leetcode-code-actions';

  // Phase 5.3 D-06 / D-09 — chevron prefix slot. DOM order is load-bearing:
  // prefix first, then Run, then Submit. CSS layout uses
  // `justify-content: space-between` + `margin-left: auto` on `.leetcode-code-action-run`
  // so the prefix clings LEFT and Run+Submit cling RIGHT as a group.
  if (opts.prefix) {
    row.appendChild(opts.prefix());
  }

  const makeIconBtn = (cls: string, tooltip: string, iconSvg: string, handler: () => void | Promise<void>) => {
    const btn = doc.createElement('button');
    btn.className = cls;
    btn.innerHTML = iconSvg;
    btn.title = tooltip;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void handler();
    });
    return btn;
  };

  const retrieveIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2"/><path d="M16 2h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2"/></svg>';
  const resetIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';

  row.appendChild(makeIconBtn('leetcode-code-action-icon', 'Retrieve last submission', retrieveIcon, () => plugin.retrieveLastSubmissionFromActive()));
  row.appendChild(makeIconBtn('leetcode-code-action-icon', 'Reset to starter code', resetIcon, () => plugin.resetFromActive()));

  const makeBtn = (cls: string, label: string, iconSvg: string, handler: () => void | Promise<void>) => {
    const btn = doc.createElement('button');
    btn.className = cls;
    btn.innerHTML = iconSvg;
    const span = doc.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void handler();
    });
    return btn;
  };

  const sparklesIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>';
  const playIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  const cloudUploadIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/></svg>';

  row.appendChild(makeBtn('leetcode-code-action-ai-solution', 'AI solution', sparklesIcon, () => plugin.aiSolutionFromActive()));
  row.appendChild(makeBtn('leetcode-code-action-run', 'Run', playIcon, () => plugin.runFromActive()));
  row.appendChild(makeBtn('leetcode-code-action-submit', 'Submit', cloudUploadIcon, () => plugin.submitFromActive()));

  return row;
}
