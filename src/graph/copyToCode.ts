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
import { LC_LANG_SLUGS } from '../solve/languages';
// Phase 20 Plan 20-10 (gap-closure T9 underlying layer) — REUSE the canonical
// fence-locator predicate; do NOT inline a private detector. SSoT keeps the
// regex semantics in one place across reset, retrieve, and copyToCode paths.
import { countLeetCodeSolveFenceOpeners } from '../widget/fenceLocator';

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
 *
 * G-COPY-TO-CODE-LANG-DRIFT (gap-closure 05.3-06): after the fence body
 * rewrite resolves, the note's `lc-language` frontmatter is also synced to
 * `langSlug` so the chevron + Run/Submit dispatch stay in sync with the
 * actual code. Mirrors `switchFenceLanguage` Step C in src/main.ts:801-803
 * — same atomic-shape `processFrontMatter` write, but invoked from the
 * copy-to-code path instead of the chevron click. The chevron label
 * re-renders for free because Plan 05's `languageRefreshEffect` listens to
 * `metadataCache.on('changed')`, which fires when this write lands.
 *
 * Two short-circuits skip the frontmatter write:
 *   - Same-slug: note's current `lc-language` already equals `langSlug`.
 *     Avoids spurious vault writes (no metadataCache 'changed' event).
 *   - Unknown slug: `langSlug` is not in `LC_LANG_SLUGS`. The fence body
 *     is already rewritten by `forceInjectCodeSection`, but `lc-language`
 *     stays at its prior canonical slug because Run/Submit dispatch
 *     consumes that field as a contract — writing a non-canonical slug
 *     would corrupt the LC API call.
 *
 * Ordering: vault.process MUST run before processFrontMatter. The chevron's
 * languageRefreshEffect rebuilds the StateField off the metadataCache
 * 'changed' event the frontmatter write fires, and it re-scans the buffer
 * for the fence — so the fence body must already be the new code by then.
 */
export async function copyToCode(
  app: App,
  file: TFile,
  code: string,
  langSlug: string,
): Promise<void> {
  // Step 1 — fence body rewrite (existing contract; CF-06 vault.process).
  //
  // Phase 20 Plan 20-10 (gap-closure T9 underlying layer) — kind-aware:
  // when the note already contains a v1.3 leetcode-solve fence, signal
  // 'leetcode-solve' so forceInjectCodeSection short-circuits to
  // rewriteFenceBody and the fence opener stays verbatim (no sibling
  // ```python fence grafted). When no v1.3 fence is present, the omitted
  // fenceKind keeps the existing v1.2 path running byte-for-byte.
  // SSoT: REUSES countLeetCodeSolveFenceOpeners (src/widget/fenceLocator.ts).
  await app.vault.process(file, (current) => {
    const fenceKind: 'leetcode-solve' | undefined =
      countLeetCodeSolveFenceOpeners(current, Number.MAX_SAFE_INTEGER) > 0
        ? 'leetcode-solve'
        : undefined;
    return forceInjectCodeSection(current, {
      starterCode: code,
      langSlug,
      ...(fenceKind ? { fenceKind } : {}),
    });
  });

  // Step 2 — G-COPY-TO-CODE-LANG-DRIFT lc-language sync. Skip when the slug
  // is not a canonical LC slug (defensive — the LC API dispatch contract
  // requires `lc-language` to be a member of LC_LANG_SLUGS).
  if (!LC_LANG_SLUGS.has(langSlug)) return;

  // Same-slug short-circuit — the note's `lc-language` already equals the
  // submission's slug, so writing again would only fire a spurious
  // metadataCache 'changed' event with no semantic delta.
  const fm = app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const currentLangSlug = fm?.['lc-language'];
  if (currentLangSlug === langSlug) return;

  // Mirror switchFenceLanguage Step C (src/main.ts:801-803). Errors
  // propagate naturally — caller (SubmissionDetailModal.performCopy) closes
  // the modal after the await; the fence body has already landed.
  await app.fileManager.processFrontMatter(file, (fmObj: Record<string, unknown>) => {
    fmObj['lc-language'] = langSlug;
  });
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
