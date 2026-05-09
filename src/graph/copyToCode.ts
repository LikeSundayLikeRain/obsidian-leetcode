// src/graph/copyToCode.ts
//
// Phase 4 Plan 04 Task 2 — "Copy to ## Code" primitive (GRAPH-01 revised, D-01).
//
// Thin `vault.process` wrapper that rewrites the ## Code fenced block with a
// submitted-from-LC code body. Delegates the pure string transform to
// `forceInjectCodeSection` (Phase 3 `src/solve/starterCodeInjector.ts`) which
// already handles:
//   - ## Code heading exists → replace first recognized-langSlug fenced block
//   - ## Code heading exists with no recognized fence → insert at top of section
//   - ## Code heading missing → delegate to injectCodeSection (create fresh)
//
// The replacement fence's language tag is the submitted language (not the
// existing fence's tag) per D-04. Sibling regions (## Problem, ## Notes,
// ## Techniques, ## Custom Tests) are never touched — `forceInjectCodeSection`
// only modifies content inside the ## Code region.
//
// CF-06: `vault.process()` is the ONLY vault mutation primitive used here.
// NEVER `vault.modify` on problem notes. The grep gate in
// `scripts/grep-no-vault-modify.sh` still applies.
//
// D-01 (GRAPH-01 revised): explicitly forbids creating a ## Solution heading.
// This module has zero code paths that emit `## Solution`.

import type { App, TFile } from 'obsidian';
import { forceInjectCodeSection } from '../solve/starterCodeInjector';

/**
 * Rewrite the ## Code fenced block in `file` with the submitted code + lang.
 *
 * @param app       The Obsidian App (or test-mode mock) exposing vault.process.
 * @param file      The target problem note.
 * @param code      The submitted code body (from a past LC submission).
 * @param langSlug  LC's langSlug for the submission (python3, java, cpp, …).
 *                  Used as the fenced block's language tag per D-04 — the
 *                  submitted language wins, not the existing fence tag.
 *
 * Always runs through `app.vault.process(file, fn)` so the transform is
 * retry-safe under Obsidian's vault conflict model. Sibling regions stay
 * intact because `forceInjectCodeSection` only rewrites the ## Code block.
 */
export async function copyToCode(
  app: App,
  file: TFile,
  code: string,
  langSlug: string,
): Promise<void> {
  await app.vault.process(file, (current) =>
    forceInjectCodeSection(current, {
      starterCode: code,
      langSlug,
    }),
  );
}

// ── hasExistingCodeBlock (confirm-gate predicate) ───────────────────────
//
// Returns `true` when the ## Code region contains a fenced block whose body
// has at least one non-whitespace character. Used by SubmissionDetailModal to
// decide whether to open the ConfirmOverwriteModal before copy proceeds.
//
// Contract (from tests):
//   - Whitespace-only fence body       → false
//   - No ## Code heading at all        → false
//   - Non-empty fence body             → true
//
// This is a pure string predicate — no vault, no app, no I/O. Usable directly
// inside or outside a `vault.process` callback.

const H2 = /^## /;
const CODE_HEADING = '## Code';

export function hasExistingCodeBlock(body: string): boolean {
  const lines = body.split('\n');
  let codeStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === CODE_HEADING) {
      codeStart = i;
      break;
    }
  }
  if (codeStart < 0) return false;

  // Determine where the ## Code section ends (next H2 or EOF).
  let sectionEnd = lines.length;
  for (let i = codeStart + 1; i < lines.length; i++) {
    if (H2.test(lines[i] ?? '')) {
      sectionEnd = i;
      break;
    }
  }

  // Walk fence pairs inside the section. Any fence whose body has at least
  // one non-whitespace char counts as "existing code block."
  let i = codeStart + 1;
  while (i < sectionEnd) {
    const openMatch = /^```[a-zA-Z0-9_+#-]*\s*$/.exec(lines[i] ?? '');
    if (!openMatch) {
      i += 1;
      continue;
    }
    // Scan to close fence.
    const bodyStart = i + 1;
    let closeIdx = -1;
    for (let j = bodyStart; j < sectionEnd; j++) {
      if (/^```\s*$/.test(lines[j] ?? '')) {
        closeIdx = j;
        break;
      }
    }
    if (closeIdx < 0) {
      // Unclosed fence — not a valid block; bail out.
      return false;
    }
    // Inspect body contents.
    for (let k = bodyStart; k < closeIdx; k++) {
      const line = lines[k] ?? '';
      if (line.trim().length > 0) {
        return true;
      }
    }
    // This fence was whitespace-only; keep scanning for another fence in the
    // same ## Code section (defensive — user may have multiple fences).
    i = closeIdx + 1;
  }
  return false;
}
