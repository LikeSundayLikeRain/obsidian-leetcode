import type { Plugin } from 'obsidian';

export interface CodeBlockButtonRowHost {
  runFromActive(): void | Promise<void>;
  submitFromActive(): void | Promise<void>;
}

export function buildCodeBlockButtonRow(
  doc: Document,
  plugin: Plugin & CodeBlockButtonRowHost,
): HTMLDivElement {
  const row = doc.createElement('div');
  row.className = 'leetcode-code-actions';

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
