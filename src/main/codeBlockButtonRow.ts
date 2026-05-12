import type { Plugin } from 'obsidian';

export interface CodeBlockButtonRowHost {
  runFromActive(): void | Promise<void>;
  submitFromActive(): void | Promise<void>;
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

  const runBtn = doc.createElement('button');
  runBtn.className = 'leetcode-code-action-run';
  runBtn.textContent = 'Run';
  runBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void plugin.runFromActive();
  });
  row.appendChild(runBtn);

  const submitBtn = doc.createElement('button');
  submitBtn.className = 'leetcode-code-action-submit';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void plugin.submitFromActive();
  });
  row.appendChild(submitBtn);

  return row;
}
