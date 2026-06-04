// tests/ai/widgetAutoReviewRegression.test.ts
//
// Regression test for debug session `ai-review-empty-after-accept-1-3`.
//
// BUG (v1.3.0-beta.1): After Submit-from-widget produced "Accepted!", the
// auto AI Review surfaced "The submitted solution is empty — there is no
// code to review." because:
//
//   1. `submitFromWidget` passed `getCurrentBody = () => widget.view.state.doc.toString()`
//      — the RAW fence body (Java source), not a markdown body containing
//      a ```leetcode-solve fence.
//   2. `submitWithCode` reused that thunk as `reviewCtx.currentBody`.
//   3. `startAutoReview` snapshotted it and called `extractFirstFencedBlock`,
//      which walks lines looking for ``` markers, finds none in raw Java,
//      and returns `null`. `code = ''`, prompt is built with empty code.
//
// Submit itself worked because the orchestrator (Phase 20 Plan 20-10 Task 5
// / gap-closure T7) accepts an optional `getCurrentCode` shortcut that
// bypasses `extractFirstFencedBlock`. The review path had no equivalent.
//
// FIX: thread the same `getCurrentCode` (+ `lcLanguage`) shortcut into
// `startAutoReview`, and propagate it through `submitWithCode`'s
// `reviewCtx`. When supplied, the review path snapshots the raw code
// directly and resolves the prompt language from `lc-language` SSoT —
// mirroring the orchestrator's behavior. Legacy `*FromActive` callers
// omit the shortcut and the markdown-body extractor runs verbatim.
//
// Strategy: source-grep gates (mirrors tests/ai/rerunAIReview.test.ts and
// tests/main/aiDebugCommand.test.ts). The bug was a silent extraction
// returning empty string — this test pins the wiring contract that the
// fix introduced. A behavioral test would require driving the full
// VerdictModal + AIClient stream pipeline, which would compound the
// existing tests/ai/AIStreamModal.* matrix without adding signal beyond
// the contract pins below.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SRC_MAIN = fs.readFileSync(path.join(REPO_ROOT, 'src/main.ts'), 'utf-8');

/** Slice from the start of `private startAutoReview(` up to (and not past)
 *  the closing brace of the method. Robust against future growth of the
 *  method body — pins assertions to the right scope without needing a
 *  hand-tuned char window. */
function startAutoReviewBody(): string {
  const idx = SRC_MAIN.indexOf('private startAutoReview(');
  expect(idx).toBeGreaterThan(0);
  // The next method declaration is `runAIReview` (Phase 09 Plan 04). Use
  // it as a hard lower bound for the slice end so we never bleed into a
  // sibling method body.
  const endIdx = SRC_MAIN.indexOf('async runAIReview(', idx);
  expect(endIdx).toBeGreaterThan(idx);
  return SRC_MAIN.slice(idx, endIdx);
}

function submitWithCodeBody(): string {
  const idx = SRC_MAIN.indexOf('private async submitWithCode(');
  expect(idx).toBeGreaterThan(0);
  // submitWithCode is followed by other private methods; cap the slice
  // at a generous +12k chars (the body is ~6k today) so we don't pin a
  // brittle char count.
  return SRC_MAIN.slice(idx, idx + 12_000);
}

describe('Debug session ai-review-empty-after-accept-1-3 — startAutoReview widget shortcut', () => {
  it('startAutoReview ctx accepts optional getCurrentCode + lcLanguage', () => {
    const body = startAutoReviewBody();
    expect(body).toMatch(/getCurrentCode\?:\s*\(\)\s*=>\s*string/);
    expect(body).toMatch(/lcLanguage\?:\s*string\s*\|\s*null/);
  });

  it('startAutoReview snapshots ctx.getCurrentCode() alongside ctx.currentBody()', () => {
    const body = startAutoReviewBody();
    // Locked snapshot pattern — both must be captured before any async
    // work so the review prompt is deterministic w.r.t. the moment the
    // user clicked Submit (CR-02 fix carries forward).
    expect(body).toMatch(/const snapshotBody\s*=\s*ctx\.currentBody\(\);/);
    expect(body).toMatch(/const snapshotCode\s*=\s*ctx\.getCurrentCode\?\.\(\);/);
  });

  it('startAutoReview branches on getCurrentCode and skips extractFirstFencedBlock when supplied', () => {
    const body = startAutoReviewBody();
    expect(body).toMatch(/if\s*\(\s*ctx\.getCurrentCode\s*!==\s*undefined\s*\)/);
    // The else-branch must still call extractFirstFencedBlock for the
    // legacy active-leaf path (otherwise we regress submitFromActive's
    // auto-review).
    expect(body).toMatch(/extractFirstFencedBlock\s*\(/);
  });

  it('startAutoReview language resolution prefers ctx.lcLanguage over settings default on widget branch', () => {
    const body = startAutoReviewBody();
    // The widget branch resolves language from ctx.lcLanguage, falling
    // back to the settings default. The fence-tag fallback (`extracted.lang`)
    // MUST NOT appear on the widget branch — there is no fence to read
    // from.
    expect(body).toMatch(/typeof ctx\.lcLanguage === 'string'/);
    expect(body).toMatch(/this\.settings\.getDefaultLanguage\(\)\s*\?\?\s*'plaintext'/);
  });
});

describe('Debug session ai-review-empty-after-accept-1-3 — submitWithCode reviewCtx wiring', () => {
  it('submitWithCode propagates getCurrentCode + lcLanguage into reviewCtx for the widget path', () => {
    const body = submitWithCodeBody();
    // The reviewCtx literal MUST spread getCurrentCode + lcLanguage when
    // the caller supplied a getCurrentCode thunk. The conditional spread
    // mirrors the orchestrator's posture (Phase 20 Plan 20-10 T7) so
    // legacy *FromActive callers stay byte-for-byte unchanged.
    expect(body).toMatch(/\.\.\.\s*\(\s*getCurrentCode\s*\?\s*\{\s*getCurrentCode\s*,\s*lcLanguage\s*\}\s*:\s*\{\s*\}\s*\)/);
  });

  it('submitWithCode reviewCtx still includes file, slug, title, currentBody (legacy contract preserved)', () => {
    const body = submitWithCodeBody();
    // Legacy ProblemContext fields must remain — submitFromActive's
    // auto-review path depends on `currentBody` being read by the
    // markdown-body branch. Field order is tolerant; presence is the
    // contract.
    expect(body).toMatch(/file\s*,/);
    expect(body).toMatch(/slug\s*,/);
    expect(body).toMatch(/title\s*,/);
    expect(body).toMatch(/currentBody:\s*getCurrentBody\s*,/);
  });
});

describe('Debug session ai-review-empty-after-accept-1-3 — submitFromWidget keeps existing widget contract', () => {
  it('submitFromWidget still hands submitWithCode a getCurrentCode thunk that reads widget.view.state.doc.toString()', () => {
    // The widget-side contract is what triggers the new shortcut on the
    // review side. If this regresses, the fix is silently bypassed.
    const idx = SRC_MAIN.indexOf('async submitFromWidget(');
    expect(idx).toBeGreaterThan(0);
    const body = SRC_MAIN.slice(idx, idx + 1500);
    expect(body).toMatch(/this\.submitWithCode\(/);
    // The 6-arg call shape: file, slug, title, lcLanguage, getCurrentBody,
    // getCurrentCode. Both thunks read widget.view.state.doc.toString().
    const widgetThunkMatches = body.match(/widget\.view\.state\.doc\.toString\(\)/g) ?? [];
    expect(widgetThunkMatches.length).toBeGreaterThanOrEqual(2);
  });
});
