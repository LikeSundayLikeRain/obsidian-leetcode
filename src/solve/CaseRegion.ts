// src/solve/CaseRegion.ts
//
// Pure string transform: reads and writes the `## Custom Tests` region
// with nested `### Case N` subheadings. Mirrors HeadingRegion.ts but for
// a plugin-owned section with FULL INTRA-section user text preservation
// (CONTEXT D-19) — inter-case user paragraphs round-trip verbatim.
//
// Architecture (D-19 parse-items — Warning 8 fix):
//   Parse the region into a sequence of typed items
//     { type: 'case', index: N, content: string } | { type: 'free', content: string }
//   On write-back:
//     - case items' content is overwritten from the `cases` arg
//     - free items are preserved verbatim (inter-case paragraphs survive)
//     - new cases (beyond existing count) appended AFTER all existing items
//     - cases renumbered sequentially (1, 2, 3, …)
//     - trailing cases dropped when `cases.length < existing case count`
//     - region removed entirely when `cases` is empty but region existed
//     - region is lazy: when `cases` is empty AND region didn't exist, body
//       is returned unchanged (D-18 lazy contract)
//
// Purity: only imports heading SSoT constants from NoteTemplate; no I/O,
// no captured state. Safe inside `vault.process` retry (CF-06).

import { CUSTOM_TESTS_HEADING_LINE, CASE_HEADING_PREFIX } from '../notes/NoteTemplate';

const FENCE_OPEN = /^```(?:text|plaintext)?\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const H2 = /^## /;
const CASE_H3 = /^### Case (\d+)\s*$/;

type Item =
  | { type: 'case'; index: number; content: string }
  | { type: 'free'; content: string };

export function readCases(body: string): string[] {
  const lines = body.split('\n');
  const start = findSectionStart(lines);
  if (start < 0) return [];
  const end = findSectionEnd(lines, start);
  const items = parseItems(lines, start + 1, end);
  return items
    .filter((it): it is Extract<Item, { type: 'case' }> => it.type === 'case')
    .map((it) => it.content);
}

export function writeCases(body: string, cases: string[]): string {
  const lines = body.split('\n');
  const start = findSectionStart(lines);

  // Lazy-create: nothing to do when section is absent and no cases to write.
  if (cases.length === 0 && start < 0) return body;

  // Remove region entirely when user emptied all cases.
  if (cases.length === 0) {
    const end = findSectionEnd(lines, start);
    const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
    const after = lines.slice(end).join('\n');
    if (before.length === 0) return after.replace(/^\n+/, '');
    return before + (after.length > 0 ? '\n\n' + after.replace(/^\n+/, '') : '\n');
  }

  // Parse existing items (free-text + case blocks). If region didn't exist,
  // start from empty item list.
  const existingItems: Item[] = start >= 0
    ? parseItems(lines, start + 1, findSectionEnd(lines, start))
    : [];

  const newItems = mergeCases(existingItems, cases);
  const newSection = renderSection(newItems);

  if (start < 0) {
    // Append at EOF.
    const trimmed = body.replace(/\n+$/, '');
    if (trimmed.length === 0) return newSection + '\n';
    return trimmed + '\n\n' + newSection + '\n';
  }

  const end = findSectionEnd(lines, start);
  const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
  const after = lines.slice(end).join('\n');
  const gluePre = before.length > 0 ? '\n\n' : '';
  const gluePost = after.length > 0 ? '\n\n' : '\n';
  return before + gluePre + newSection + gluePost + after.replace(/^\n+/, '');
}

// ── Helpers ───────────────────────────────────────────────────────────

function findSectionStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === CUSTOM_TESTS_HEADING_LINE) return i;
  }
  return -1;
}

function findSectionEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (H2.test(lines[i] ?? '')) return i;
  }
  return lines.length;
}

/**
 * Parse lines[from..to) into a sequence of items preserving inter-case
 * free-text exactly (D-19). A "case" item is the ```text fenced block
 * content following an `### Case N` heading. A "free" item is any text
 * (paragraphs; blank lines collapsed at leading/trailing edges) that
 * appears BETWEEN case headings or before the first case heading.
 */
function parseItems(lines: string[], from: number, to: number): Item[] {
  const items: Item[] = [];
  let buf: string[] = [];

  const flushFree = (): void => {
    while (buf.length > 0 && buf[0] === '') buf.shift();
    while (buf.length > 0 && buf[buf.length - 1] === '') buf.pop();
    if (buf.length > 0) {
      items.push({ type: 'free', content: buf.join('\n') });
    }
    buf = [];
  };

  let i = from;
  while (i < to) {
    const line = lines[i] ?? '';
    const caseMatch = CASE_H3.exec(line);
    if (caseMatch) {
      flushFree();
      const index = Number.parseInt(caseMatch[1] ?? '0', 10);
      // Scan forward for the ```text fenced block that belongs to this case.
      let j = i + 1;
      let caseContent = '';
      while (j < to) {
        const next = lines[j] ?? '';
        if (CASE_H3.test(next)) break; // Next case heading — current case has no block.
        if (FENCE_OPEN.test(next)) {
          const codeLines: string[] = [];
          j++;
          while (j < to && !FENCE_CLOSE.test(lines[j] ?? '')) {
            codeLines.push(lines[j] ?? '');
            j++;
          }
          caseContent = codeLines.join('\n');
          // Advance past the close fence (if present).
          if (j < to && FENCE_CLOSE.test(lines[j] ?? '')) j++;
          break;
        }
        // Lines between `### Case N` and its fence are unusual but possible;
        // we treat them as part of the case metadata and drop on normalize.
        j++;
      }
      items.push({ type: 'case', index, content: caseContent });
      i = j;
      continue;
    }
    buf.push(line);
    i++;
  }
  flushFree();
  return items;
}

/**
 * Given existing items (parsed from the note) and the new `cases` array
 * (the in-memory truth from the modal), produce an updated item sequence:
 *   - Existing case items get their content replaced by cases[n-1]
 *   - Existing free-text items are preserved verbatim
 *   - If `cases.length` exceeds existing case count, new case items are
 *     appended AFTER all existing items
 *   - If `cases.length` is LESS than existing case count, trailing case
 *     items are dropped (user removed them in the modal)
 */
function mergeCases(existing: Item[], cases: string[]): Item[] {
  const out: Item[] = [];
  let caseIdx = 0; // 0-based index into `cases`

  for (const item of existing) {
    if (item.type === 'free') {
      out.push(item);
    } else {
      if (caseIdx < cases.length) {
        out.push({ type: 'case', index: caseIdx + 1, content: cases[caseIdx] ?? '' });
        caseIdx++;
      }
      // else: drop this case (user removed it)
    }
  }
  // Append new cases beyond existing count.
  while (caseIdx < cases.length) {
    out.push({ type: 'case', index: caseIdx + 1, content: cases[caseIdx] ?? '' });
    caseIdx++;
  }
  return renumberCases(out);
}

/** Renumbers case items sequentially (1, 2, 3, ...) regardless of input numbering. */
function renumberCases(items: Item[]): Item[] {
  let n = 1;
  return items.map((it) => (it.type === 'case' ? { ...it, index: n++ } : it));
}

function renderSection(items: Item[]): string {
  const parts: string[] = [CUSTOM_TESTS_HEADING_LINE, ''];
  items.forEach((item) => {
    if (item.type === 'free') {
      parts.push(item.content);
      parts.push('');
    } else {
      parts.push(`${CASE_HEADING_PREFIX}${item.index}`);
      parts.push('```text');
      parts.push(item.content);
      parts.push('```');
      parts.push('');
    }
  });
  // Remove trailing blank line.
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n');
}
