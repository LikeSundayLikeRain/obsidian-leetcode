// Phase 19 Plan 01 + Plan 04 — Pure string-only fence body extract / rewrite.
//
// Used inside the `vault.process(file, fn)` callback path where the input is
// a raw string buffer (Phase 19-02 owns that wiring; Phase 19-01 ships the
// pure functions + property tests for the round-trip invariant per CONTEXT D-09).
//
// Round-trip invariant (verified in tests/widget/fenceSerialization.property.test.ts):
//   rewriteFenceBody(s, i, extractFenceBody(s, i) ?? '') === s
//
// CRLF preservation (RESEARCH §5): line endings (LF vs CRLF) are reconstructed
// from the originals via captured-trailing-CR detection. DO NOT normalize
// line endings — the round-trip invariant requires byte-for-byte equality.
// Mixed Windows/Unix line endings within the same file are preserved per-line
// via the splitPreservingEols tokenizer (Plan 19-04 corpus expansion).
//
// Plan 19-04 closer-resolution rule: walk forward from the leetcode-solve
// opener; the section terminates at the FIRST of (a) the next `## ` H2
// heading line, or (b) the next NON-leetcode-solve TAGGED fence opener
// (`\`\`\`<tag>` where <tag> is non-empty AND not `leetcode-solve`), or (c)
// EOF. The closer is the LAST bare-or-tagged `\`\`\``-prefixed line BEFORE
// that section terminator.
//
// Why: the v1.2 first-`\`\`\``-after-opener rule misreads nested triple
// backtick bodies (corpus body `\`\`\`\nnested\n\`\`\`` would terminate after
// the inner `\`\`\``); the Plan 19-01 LAST-in-section rule misreads bodies
// followed by non-LC fences without `## ` separator (the next fence's closer
// gets picked as ours). Bounding the walk at the next TAGGED opener fixes
// both — nested bare-`\`\`\`` lines stay inside the section while subsequent
// `\`\`\`python` etc. correctly cap it.
//
// Empty body / single-line / mid-byte / unicode handled by the test corpus.
// rewriteFenceBody is a no-op when fenceIndex is out of range (matches
// extractFenceBody's null-on-out-of-range so callers never need to check both).

const LC_OPENER_RE = /^\s*```leetcode-solve\b/;
const FENCE_BOUNDARY_RE = /^\s*```/;
const H2_HEADING_RE = /^\s*##\s+\S/;
/** Tagged fence opener that is NOT our `leetcode-solve` opener. Matches
 *  `\`\`\`python`, `\`\`\`bash`, `\`\`\`ts`, etc. Bare `\`\`\`` lines are NOT
 *  tagged and therefore do NOT terminate the section walk (they may be content
 *  inside the body — see nested-triple-backticks case in the corpus). */
const TAGGED_NON_LC_OPENER_RE = /^\s*```([A-Za-z0-9_-]+)\b/;

interface FenceBounds {
  openerLineIdx: number;
  closerLineIdx: number;
}

/**
 * Walk `noteBody` line-by-line and return the bounds of the fenceIndex-th
 * `\`\`\`leetcode-solve` fence (0-indexed).
 *
 * Closer-resolution rule: the closer is the LAST `\`\`\``-prefixed line
 * within the section starting at the opener and ending at the next `## `
 * heading or EOF. This handles bodies containing nested triple backticks
 * (`\`\`\`\nnested\n\`\`\``) — a corpus case in 19-RESEARCH.md §"Property-test
 * seeds" — that the naive first-`\`\`\``-after-opener rule (the v1.2
 * `findCodeFence` semantic) would misread as a zero-line empty body.
 *
 * For the common case (no nested backticks), this rule reduces to the v1.2
 * semantic: with exactly one `\`\`\`` line in the section after the opener,
 * the LAST `\`\`\`` is the FIRST `\`\`\`` is the outer closer. The behaviors
 * diverge only when ≥2 `\`\`\`` lines appear in the section — at which point
 * the v1.2 rule was provably wrong for nested-triple-backtick bodies.
 *
 * Returns null when fenceIndex is out of range OR when the located opener
 * has no `\`\`\``-shaped closer before the next H2 heading / EOF.
 */
function locateFenceByIndex(lines: string[], fenceIndex: number): FenceBounds | null {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!LC_OPENER_RE.test(lines[i] ?? '')) continue;
    if (count === fenceIndex) {
      // Plan 19-04 closer-resolution: walk forward; section terminates at the
      // FIRST of (a) next H2 heading, (b) next non-leetcode-solve TAGGED
      // fence opener (`\`\`\`python`, `\`\`\`bash`, etc.), or (c) EOF. Closer
      // is the LAST bare-or-tagged `\`\`\``-prefixed line BEFORE the boundary.
      //
      // Bounding at the next TAGGED opener correctly skips subsequent non-LC
      // fences while still accepting nested bare-`\`\`\`` lines as body content.
      let lastFenceLine = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const text = lines[j] ?? '';
        if (H2_HEADING_RE.test(text)) {
          break;
        }
        // Tagged non-LC opener — terminates the search BEFORE this line.
        // (We use the tagged-opener match BEFORE the boundary match because
        // every tagged opener is also a fence boundary.)
        const taggedMatch = TAGGED_NON_LC_OPENER_RE.exec(text);
        if (taggedMatch && taggedMatch[1] !== 'leetcode-solve') {
          break;
        }
        if (FENCE_BOUNDARY_RE.test(text)) {
          lastFenceLine = j;
        }
      }
      if (lastFenceLine === -1) return null; // unterminated
      return { openerLineIdx: i, closerLineIdx: lastFenceLine };
    }
    count++;
  }
  return null;
}

/**
 * Extract the body of the fenceIndex-th `\`\`\`leetcode-solve` fence in
 * `noteBody`, BYTE-EXACT (preserves CRLF, leading/trailing whitespace,
 * nested triple backticks, frontmatter-like `---` lines, unicode).
 *
 * Returns null when fenceIndex is out of range.
 */
export function extractFenceBody(
  noteBody: string,
  fenceIndex: number,
): string | null {
  const { lines, eols } = splitPreservingEols(noteBody);
  const bounds = locateFenceByIndex(lines, fenceIndex);
  if (!bounds) return null;
  const { openerLineIdx, closerLineIdx } = bounds;
  if (closerLineIdx - openerLineIdx <= 1) return '';
  // Body = concat of lines[openerLineIdx+1 .. closerLineIdx-1] each followed
  // by its eol, EXCEPT the last body-line whose trailing eol is owned by the
  // closer-line boundary, not the body. Match the original string byte-for-byte.
  let body = '';
  for (let i = openerLineIdx + 1; i <= closerLineIdx - 1; i++) {
    body += lines[i] ?? '';
    if (i < closerLineIdx - 1) body += eols[i] ?? '';
  }
  return body;
}

/**
 * Replace the body of the fenceIndex-th `\`\`\`leetcode-solve` fence with
 * `newBody`, preserving every other byte of `noteBody` exactly. When
 * fenceIndex is out of range, returns `noteBody` unchanged.
 *
 * Round-trip invariant:
 *   rewriteFenceBody(s, i, extractFenceBody(s, i) ?? '') === s
 */
export function rewriteFenceBody(
  noteBody: string,
  fenceIndex: number,
  newBody: string,
): string {
  const { lines, eols } = splitPreservingEols(noteBody);
  const bounds = locateFenceByIndex(lines, fenceIndex);
  if (!bounds) return noteBody;
  const { openerLineIdx, closerLineIdx } = bounds;

  // Reconstruct the file as: prefix + newBody + suffix, where:
  //   prefix = lines[0..openerLineIdx] each followed by their eol
  //   newBody = the user's new body content
  //   suffix = lines[closerLineIdx..end] each followed by their eol
  //
  // The eol BETWEEN newBody's last char and the closer-line must reproduce
  // the eol of the original last body-line (eols[closerLineIdx - 1]).

  // PREFIX: lines [0..openerLineIdx], each + its trailing eol.
  let out = '';
  for (let i = 0; i <= openerLineIdx; i++) {
    out += lines[i] ?? '';
    out += eols[i] ?? '';
  }
  // NEWBODY: insert verbatim. The boundary eol between body and closer-line
  // is owned by the file structure, NOT the body string — the user's
  // `newBody` represents only the INTERIOR of the body region (line text +
  // internal separators) and never includes the boundary eol. ALWAYS append
  // `eols[closerLineIdx - 1]` when the original had ≥1 body line.
  //
  // The two relevant cases when newBody = "":
  //   - Original closerLineIdx === openerLineIdx + 1 (no body lines): the
  //     opener-eol immediately precedes the closer; emitting the boundary eol
  //     would invent a phantom blank line.
  //   - Original closerLineIdx >= openerLineIdx + 2 (≥1 body line): the body
  //     section already contained at least one (possibly empty) line; we
  //     must preserve that line so the round-trip is byte-exact.
  //
  // Skipping the boundary eol unconditionally when `newBody.endsWith('\n')`
  // would lose a newline for multi-line bodies whose last line is blank
  // (e.g. the `ending-mid-byte\n\n\n` corpus case — body ends with eol[i]
  // separating two empty body lines, NOT the boundary eol).
  const hasBodyLines = closerLineIdx > openerLineIdx + 1;
  if (hasBodyLines) {
    out += newBody;
    out += eols[closerLineIdx - 1] ?? '\n';
  }
  // SUFFIX: lines [closerLineIdx..end], each + its trailing eol.
  for (let i = closerLineIdx; i < lines.length; i++) {
    out += lines[i] ?? '';
    out += eols[i] ?? '';
  }
  return out;
}

/**
 * Phase 21 Plan 21-01 — swap the FIRST fence opener under `## Code` to
 * `\`\`\`leetcode-solve`, preserving every other byte of `noteText` exactly.
 *
 * Locator semantics (mirrors `findCodeFence` in src/widget/fenceLocator.ts and
 * `isMigrationCandidate` in src/widget/fenceMigrator.ts):
 *   - Walk lines forward; toggle `inCodeSection = true` on `^\s*## Code\s*$`
 *     and `inCodeSection = false` on any other `^\s*## \S` heading.
 *   - Inside `## Code`, locate the FIRST line matching
 *     `^\s*\`\`\`(?<tag>[A-Za-z0-9_+#-]*)\s*$`.
 *   - If the matched tag is `leetcode-solve`, return input unchanged
 *     (idempotency — D-edge-04 / MIGRATE-04).
 *   - Otherwise, swap the opener line to `\`\`\`<newOpenerTag>` (preserving
 *     the original EOL bytes; CRLF round-trips byte-exact via splitPreservingEols).
 *
 * Permissiveness: the helper is permissive on miss — when there is no
 * `## Code` heading, no fence inside `## Code`, or the fence has no closer,
 * it returns input unchanged. The caller's strict-match predicate
 * (isMigrationCandidate) is the gate; this helper is the body-preserving
 * primitive (Pattern S-02 SSoT discipline — single source of truth for the
 * fence-opener swap).
 *
 * Body byte-exactness contract (T-21-bytes / MIGRATE-03):
 *   - For any input where the located fence body is B (any content including
 *     nested triple backticks, frontmatter-like `---` lines, CRLF EOLs,
 *     trailing whitespace, multi-byte unicode, empty body), the body inside
 *     the resulting `\`\`\`leetcode-solve` fence is also B byte-exact.
 *   - Property-tested in tests/widget/fenceSerialization.property.test.ts
 *     over SHELLS_LEGACY × HOSTILE_BODIES (50+ generated cases).
 *
 * Frontmatter is NEVER touched (D-edge-04). The locator never crosses an H2
 * boundary, so frontmatter-like `---` lines OUTSIDE `## Code` cannot match.
 *
 * Type narrow on `newOpenerTag`: the parameter is locked to the canonical
 * v1.3 fence tag `'leetcode-solve'`. Phase 22 cleanup may rename or generalize.
 */
export function rewriteFenceOpenerTag(
  noteText: string,
  newOpenerTag: 'leetcode-solve',
): string {
  const { lines, eols } = splitPreservingEols(noteText);
  // Locator: walk forward; track `inCodeSection`; find first opener under `## Code`.
  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+\S/;
  const FENCE_OPENER_RE = /^\s*```([A-Za-z0-9_+#-]*)\s*$/;
  const FENCE_CLOSER_RE = /^\s*```\s*$/;
  let inCodeSection = false;
  let openerLineIdx = -1;
  let openerTag: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (H2_CODE_RE.test(text)) {
      inCodeSection = true;
      continue;
    }
    if (H2_ANY_RE.test(text)) {
      inCodeSection = false;
      continue;
    }
    if (inCodeSection) {
      const m = FENCE_OPENER_RE.exec(text);
      if (m) {
        openerLineIdx = i;
        openerTag = m[1] ?? '';
        break;
      }
    }
  }
  if (openerLineIdx === -1) return noteText; // no opener found — caller's gate
  // Idempotency: opener already `leetcode-solve` → return input unchanged.
  if (openerTag === newOpenerTag) return noteText;
  // Closer check: scan forward for `^\s*```\s*$` before the next H2 heading.
  // The helper is permissive — return input unchanged when no closer found.
  let hasCloser = false;
  for (let j = openerLineIdx + 1; j < lines.length; j++) {
    const t = lines[j] ?? '';
    if (H2_ANY_RE.test(t)) break;
    if (FENCE_CLOSER_RE.test(t)) {
      hasCloser = true;
      break;
    }
  }
  if (!hasCloser) return noteText;
  // Reconstruct: walk lines, replace ONLY the opener line; preserve EOLs.
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    if (i === openerLineIdx) {
      out += '```' + newOpenerTag;
    } else {
      out += lines[i] ?? '';
    }
    out += eols[i] ?? '';
  }
  return out;
}

/**
 * Split a string into its constituent lines while preserving each line's
 * original line-ending character(s). Returns parallel arrays:
 *   lines[i] — the line text (no trailing eol)
 *   eols[i]  — the eol that followed lines[i] in the original string ('' for
 *              the last line if there was no trailing newline; '\n' or '\r\n'
 *              otherwise)
 *
 * Round-trip invariant: `lines.map((l, i) => l + eols[i]).join('')` exactly
 * reconstructs the input string.
 *
 * Empty input → lines = [""], eols = [""].
 */
function splitPreservingEols(text: string): { lines: string[]; eols: string[] } {
  const lines: string[] = [];
  const eols: string[] = [];
  if (text.length === 0) {
    return { lines: [''], eols: [''] };
  }
  let cursor = 0;
  while (cursor <= text.length) {
    if (cursor === text.length) {
      // We arrive here only when the previous iteration consumed an eol
      // exactly at the end of the buffer. The original string thus ended in
      // a newline; we have already pushed lines[N-1] and eol="\n"|"\r\n" for
      // that iteration. We do NOT push a trailing empty line — that would
      // double-count the final newline.
      break;
    }
    const next = text.indexOf('\n', cursor);
    if (next === -1) {
      // Last line, no trailing newline.
      lines.push(text.slice(cursor));
      eols.push('');
      break;
    }
    let lineEnd = next;
    let eol = '\n';
    if (lineEnd > 0 && text[lineEnd - 1] === '\r') {
      lineEnd -= 1;
      eol = '\r\n';
    }
    lines.push(text.slice(cursor, lineEnd));
    eols.push(eol);
    cursor = next + 1;
  }
  return { lines, eols };
}
