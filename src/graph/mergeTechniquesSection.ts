// src/graph/mergeTechniquesSection.ts
//
// Phase 4 Plan 02 — pure union-merge transform for the ## Techniques region
// (GRAPH-03, D-13). Operates on list-item granularity (single lines) rather
// than fenced case blocks.
//
// Purity contract (D-13 + CF-06):
//   - Only imports heading SSoT constants from NoteTemplate
//   - No I/O, no captured state, no Date.now, no randomness
//   - Same (body, topicTags) input → same string output
//   - Safe inside `vault.process` retry semantics
//
// Invariants:
//   - Idempotent: merge(merge(body, tags), tags) === merge(body, tags)
//   - User-line preservation: any non-plugin-link line present in input is
//     present in output (D-13 "user-added lines below")
//   - Plugin completeness: every topicTag appears as `- [[name]]` exactly once
//   - Format tolerance: existing `*` / `+` / `-` bullets preserved on existing
//     lines; newly-appended plugin links use `-` (canonical)
//   - Insertion point (D-14): ## Techniques inserted immediately after the
//     ## Notes region (i.e. at the end of Notes, before the next H2). If
//     ## Notes is absent: inserted before ## Custom Tests; if both absent,
//     appended at EOF.
//   - No-op (D-25): when topicTags is empty AND section is absent, body is
//     returned unchanged.
//
// Design uses a parse-items / splice pattern:
//   - Items are `link` (a `- [[Target]]` line) or `free` (everything else)
//   - New section is inserted AFTER ## Notes rather than APPENDED at EOF
//
// This file is the primitive Plan 03's KnowledgeGraphWriter will call inside
// a `vault.process(ctx.file, body => mergeTechniquesSection(body, tags))`.

import {
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  CUSTOM_TESTS_HEADING_LINE,
} from '../notes/NoteTemplate';

const H2 = /^## /;
/** Tolerates `-`, `*`, `+` bullets (D-13 format tolerance, RESEARCH §Pattern 3). */
const LINK_RE = /^([-*+])\s+\[\[([^\]]+)\]\]\s*$/;

type Item =
  | { type: 'link'; target: string; bullet: string }
  | { type: 'free'; content: string };

/**
 * Union-merge `topicTags` into the body's ## Techniques region.
 *
 * @param body       — full note body (post-frontmatter; same contract as
 *                     `vault.process` callbacks)
 * @param topicTags  — ordered LC topic-tag list. `name` is the wikilink
 *                     target; `slug` is accepted for symmetry with callers
 *                     but not used here (stub filenames are built in
 *                     StubNoteCreator via NoteTemplate.buildTechniqueFilename).
 * @returns new body. Caller assigns it back to the note.
 */
export function mergeTechniquesSection(
  body: string,
  topicTags: ReadonlyArray<{ name: string; slug: string }>,
): string {
  const lines = body.split('\n');
  const start = findSectionStart(lines);

  // D-25: no tags AND no existing section → no-op.
  if (topicTags.length === 0 && start < 0) return body;

  // No existing section → insert a fresh block at the canonical anchor point.
  if (start < 0) {
    return appendNewTechniquesSection(body, topicTags);
  }

  // Existing section → parse items, union-merge, render, splice.
  const end = findSectionEnd(lines, start);
  const items = parseItems(lines, start + 1, end);

  const pluginTargets = new Set(topicTags.map((t) => t.name));
  const seenTargets = new Set<string>();
  const merged: Item[] = items.map((it) => {
    if (it.type === 'link' && pluginTargets.has(it.target)) {
      seenTargets.add(it.target);
    }
    return it;
  });

  // Append missing plugin targets in LC's natural order (D-12).
  for (const tag of topicTags) {
    if (!seenTargets.has(tag.name)) {
      merged.push({ type: 'link', target: tag.name, bullet: '-' });
    }
  }

  const rendered = renderSection(merged);
  return spliceRegion(lines, start, end, rendered);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function findSectionStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === TECHNIQUES_HEADING_LINE) return i;
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
 * Parse lines[from..to) into typed Items. Each LINK_RE match becomes a `link`
 * item; runs of non-link lines become `free` items with leading/trailing
 * blank lines trimmed.
 */
function parseItems(lines: string[], from: number, to: number): Item[] {
  const items: Item[] = [];
  let buf: string[] = [];

  const flushFree = (): void => {
    while (buf.length > 0 && buf[0] === '') buf.shift();
    while (buf.length > 0 && buf[buf.length - 1] === '') buf.pop();
    if (buf.length > 0) items.push({ type: 'free', content: buf.join('\n') });
    buf = [];
  };

  for (let i = from; i < to; i++) {
    const line = lines[i] ?? '';
    const m = LINK_RE.exec(line);
    if (m) {
      flushFree();
      items.push({ type: 'link', target: m[2] ?? '', bullet: m[1] ?? '-' });
    } else {
      buf.push(line);
    }
  }
  flushFree();
  return items;
}

/**
 * Render a parsed item sequence as the full ## Techniques region text.
 * Format:
 *   ## Techniques
 *   <blank>
 *   <items joined by '\n'; free items get blank-line separators around them>
 */
function renderSection(items: Item[]): string {
  const parts: string[] = [TECHNIQUES_HEADING_LINE, ''];
  let lastKind: 'link' | 'free' | null = null;
  for (const item of items) {
    // Separator: between link-run and free-block insert a blank line; between
    // consecutive links, no separator (tight list).
    if (lastKind !== null && (lastKind !== item.type)) {
      parts.push('');
    }
    if (item.type === 'link') {
      parts.push(`${item.bullet} [[${item.target}]]`);
    } else {
      parts.push(item.content);
    }
    lastKind = item.type;
  }
  // Strip any trailing blank lines from the rendered body.
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n');
}

/**
 * Splice the rendered section back into `lines` between `start` (the heading
 * line index) and `end` (exclusive; first line after the region). Standard
 * splice shape tuned for the Techniques region.
 */
function spliceRegion(lines: string[], start: number, end: number, rendered: string): string {
  const before = lines.slice(0, start).join('\n').replace(/\n+$/, '');
  const after = lines.slice(end).join('\n');
  const gluePre = before.length > 0 ? '\n\n' : '';
  const gluePost = after.length > 0 ? '\n\n' : '\n';
  return before + gluePre + rendered + gluePost + after.replace(/^\n+/, '');
}

/**
 * Build a fresh rendered ## Techniques section from `topicTags`, then insert
 * it at the canonical anchor point (D-14):
 *   1. If ## Notes exists, insert at end of the Notes region (just before the
 *      next H2, or at EOF if Notes is the last section).
 *   2. Else if ## Custom Tests exists, insert before it.
 *   3. Else, append at EOF.
 */
function appendNewTechniquesSection(
  body: string,
  topicTags: ReadonlyArray<{ name: string; slug: string }>,
): string {
  const lines = body.split('\n');

  const rendered = renderSection(
    topicTags.map((t) => ({ type: 'link', target: t.name, bullet: '-' })),
  );

  // D-14: insertion point
  let insertionIndex = -1;

  // Prefer: end of Notes region.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === NOTES_HEADING_LINE) {
      // Walk forward for the next H2 → that's our insertion point.
      let next = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (H2.test(lines[j] ?? '')) {
          next = j;
          break;
        }
      }
      insertionIndex = next;
      break;
    }
  }

  // Fallback 1: before ## Custom Tests.
  if (insertionIndex < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === CUSTOM_TESTS_HEADING_LINE) {
        insertionIndex = i;
        break;
      }
    }
  }

  // Fallback 2: EOF.
  if (insertionIndex < 0) {
    insertionIndex = lines.length;
  }

  const before = lines.slice(0, insertionIndex).join('\n').replace(/\n+$/, '');
  const after = lines.slice(insertionIndex).join('\n');
  const gluePre = before.length > 0 ? '\n\n' : '';
  const gluePost = after.length > 0 ? '\n\n' : '\n';
  return before + gluePre + rendered + gluePost + after.replace(/^\n+/, '');
}
