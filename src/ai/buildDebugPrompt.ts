// src/ai/buildDebugPrompt.ts
//
// Phase 08 Plan 03 Task 1 — Pure prompt-assembly helper for AI Debug.
//
// Purity (mirrors `src/solve/codeExtractor.ts` posture):
//   - Only import is `LastVerdict` (type-only).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same args → byte-identical output across calls (locked test asserts
//     determinism over 100 iterations).
//
// Locked structure (08-RESEARCH §"Pattern 3: Prompt Assembly via
// buildDebugPrompt", lines 434-475):
//   - Preamble: "You are debugging a LeetCode solution. Be concise. ..."
//   - `## Problem` heading + problemMd.trim()
//   - `## My {language} solution` heading + fenced code block
//   - `## What happened on my last run` heading + verdict block
//   - `## Tasks` heading + 3 numbered tasks (verbatim)
//
// Empty-store path (08-CONTEXT decision A): when `lastVerdict` is undefined,
// the verdict block becomes the literal line:
//
//   `No verdict yet — review the code as-is.`
//
// `## Notes` is NEVER sent (08-CONTEXT decision A — locked v1.1 posture).
// This helper does NOT write the heading anywhere on its own; the only way
// `## Notes` content could leak in is via the `code` arg, which the caller
// (Plan 08-04) extracts via `extractFirstFencedBlock` (scoped to the `## Code`
// section). Defensive test in tests/ai/buildDebugPrompt.test.ts asserts the
// heading never appears in helper output.
//
// Number-token formatting: runtime/memory pass through verbatim from LC's
// wire format (`'120 ms'`, `'14.5 MB'`). Plan 08-01 locked the LastVerdict
// shape with these as `string` rather than parsed numbers.

import type { LastVerdict } from '../solve/lastVerdictStore';

export interface BuildDebugPromptArgs {
  /** Markdown of the problem statement (full statement + examples + constraints). */
  problemMd: string;
  /** The user's solution code (active fence body — Plan 08-04 reads via `extractFirstFencedBlock`). */
  code: string;
  /** Fence info-string ('python3', 'java', 'cpp', etc.). */
  language: string;
  /** Optional last failing run/submit verdict. Undefined = empty-store path. */
  lastVerdict?: LastVerdict;
}

/**
 * Pure prompt assembler. Returns the AI Debug prompt string built from
 * problem markdown + user code + selected language + last verdict (if any).
 * Determinism: same args → byte-identical output.
 */
export function buildDebugPrompt(args: BuildDebugPromptArgs): string {
  const verdictBlock = args.lastVerdict
    ? formatVerdictBlock(args.lastVerdict)
    : 'No verdict yet — review the code as-is.';

  return [
    'You are debugging a LeetCode solution. Be concise. Do not rewrite the entire problem.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## My ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## What happened on my last run',
    verdictBlock,
    '',
    '## Tasks',
    '1. Tell me what is wrong.',
    '2. Suggest the smallest fix that makes the failing case pass.',
    '3. Show the corrected code in a fenced block. Do not rewrite unchanged sections; show the full corrected solution only if a partial diff would be confusing.',
  ].join('\n');
}

/**
 * Format the verdict-block portion of the prompt. Each optional field
 * contributes a line only when present (08-PATTERNS Pattern 3 lines 466-476).
 * Error message wraps in a fenced block with `Error:` heading line.
 */
function formatVerdictBlock(v: LastVerdict): string {
  const lines: string[] = [`Verdict: ${v.verdictText}`];
  if (v.failingInput !== undefined) {
    lines.push(`Input: ${v.failingInput}`);
  }
  if (v.expectedOutput !== undefined) {
    lines.push(`Expected output: ${v.expectedOutput}`);
  }
  if (v.actualOutput !== undefined) {
    lines.push(`My output: ${v.actualOutput}`);
  }
  if (v.runtimeMs !== undefined) {
    lines.push(`Runtime: ${v.runtimeMs}`);
  }
  if (v.memoryMb !== undefined) {
    lines.push(`Memory: ${v.memoryMb}`);
  }
  if (v.errorMessage !== undefined) {
    lines.push('', 'Error:', '```', v.errorMessage, '```');
  }
  return lines.join('\n');
}
