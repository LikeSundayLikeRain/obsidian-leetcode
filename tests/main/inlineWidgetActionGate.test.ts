// Phase 19 Plan 05 — Action-row registration gate test (UAT Test 1 BLOCKER 2 / CONTEXT D-03 + D-05).
//
// When useInlineWidget=ON, the v1.2 codeActionsPostProcessor and
// codeActionsEditorExtension are FENCE-TAG-AGNOSTIC — they match by `lc-slug`
// frontmatter, NOT by fence tag. They will surface Run/Submit/AI Debug buttons
// under any <pre>/``` fence in the ## Code section, including the new widget's
// `leetcode-solve` fence. Phase 19 D-03 explicitly excludes the action row.
//
// This test asserts via source-level grep that:
// - When useInlineWidget=true, both registrations are skipped.
// - When useInlineWidget=false, both registrations fire (D-05 — v1.2 unchanged).
//
// Source-level assertions match the established project convention
// (mutualExclusion.test.ts, lifecycle.test.ts).

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const MAIN_TS = readFileSync('src/main.ts', 'utf-8');

describe('Phase 19 gap-closure — v1.2 action-row registration gated on !useInlineWidget', () => {
  describe('useInlineWidget=true -> action-row registrations skipped', () => {
    it('registerCodeBlockActionProcessor is wrapped in a !useInlineWidget gate', () => {
      // The call to registerCodeBlockActionProcessor must appear inside a
      // block that checks !this.settings.getUseInlineWidget() (negation gate).
      const gatePattern = /if\s*\(\s*!this\.settings\.getUseInlineWidget\(\)\s*\)\s*\{[\s\S]*?registerCodeBlockActionProcessor/;
      expect(MAIN_TS).toMatch(gatePattern);
    });

    it('buildCodeActionsEditorExtension registration is wrapped in a !useInlineWidget gate', () => {
      const gatePattern = /if\s*\(\s*!this\.settings\.getUseInlineWidget\(\)\s*\)\s*\{[\s\S]*?buildCodeActionsEditorExtension/;
      expect(MAIN_TS).toMatch(gatePattern);
    });

    it('both action-row registrations are inside the SAME !useInlineWidget gate block', () => {
      // Find the if-block with the negation gate; both registrations must
      // appear within a single block (not two separate gates).
      // Match from the if-opening to the closing brace at the same indent level.
      const blockPattern = /if\s*\(\s*!this\.settings\.getUseInlineWidget\(\)\s*\)\s*\{([\s\S]*?)\n    \}/;
      const match = blockPattern.exec(MAIN_TS);
      expect(match).not.toBeNull();
      const blockBody = match![1];
      expect(blockBody).toMatch(/registerCodeBlockActionProcessor/);
      expect(blockBody).toMatch(/buildCodeActionsEditorExtension/);
    });
  });

  describe('useInlineWidget=false -> both registrations fire (D-05 regression guard)', () => {
    it('registerCodeBlockActionProcessor call still exists in src/main.ts', () => {
      expect(MAIN_TS).toMatch(/registerCodeBlockActionProcessor\(this\)/);
    });

    it('buildCodeActionsEditorExtension registration still exists in src/main.ts', () => {
      expect(MAIN_TS).toMatch(/this\.registerEditorExtension\(buildCodeActionsEditorExtension\(this\)\)/);
    });
  });

  describe('mutual-exclusion compat', () => {
    it('the new action-row gate appears BEFORE the mutual-exclusion assert', () => {
      // The action-row gate uses this.settings.getUseInlineWidget() directly
      // (called before the `const useInlineWidget = ...` declaration).
      // The mutex assert (`useInlineWidget && useNestedEditor`) comes later
      // in the onload body. The action-row gate MUST come first.
      const actionGateIdx = MAIN_TS.search(/if\s*\(\s*!this\.settings\.getUseInlineWidget\(\)\s*\)/);
      const mutexIdx = MAIN_TS.search(/useInlineWidget\s*&&\s*useNestedEditor/);
      expect(actionGateIdx).toBeGreaterThanOrEqual(0);
      expect(mutexIdx).toBeGreaterThanOrEqual(0);
      expect(actionGateIdx).toBeLessThan(mutexIdx);
    });

    it('Phase 22 D-cutover-02 inversion guard is present and forces useInlineWidget=true on 1.2.x carry-over', () => {
      // Pre-Phase-22 invariant was `useInlineWidget && useNestedEditor → setUseNestedEditor(false)`.
      // Phase 22 sub-step A inverts this: `!useInlineWidget && useNestedEditor → setUseInlineWidget(true)`.
      // File is scheduled for deletion in sub-step D's audit-expand.
      expect(MAIN_TS).toMatch(/!useInlineWidget\s*&&\s*useNestedEditor/);
      expect(MAIN_TS).toMatch(/setUseInlineWidget\(true\)/);
    });
  });
});
