// Phase 19 Plan 01 — Mutual exclusion source-level invariant test (CONTEXT D-06).
//
// When useInlineWidget=ON and useNestedEditor=ON simultaneously (e.g. corrupt
// data.json), src/main.ts Plugin.onload() must:
//   1. Force useNestedEditor=false via this.settings.setUseNestedEditor(false)
//   2. Surface a Notice to the user
//   3. Run the assert at the TOP of onload, BEFORE either registerEditorExtension call
//
// The assert is a private closure inside onload(), not a separately-exported
// helper. Source-level assertions (readFileSync grep) match the established
// project convention in lifecycle.test.ts:122-130 and nestedEditorExtension.test.ts:597+.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const MAIN_TS = readFileSync('src/main.ts', 'utf-8');

describe('Phase 19 D-06 — useInlineWidget / useNestedEditor mutual exclusion', () => {
  it('src/main.ts onload reads getUseInlineWidget()', () => {
    expect(MAIN_TS).toMatch(/this\.settings\.getUseInlineWidget\(\)/);
  });

  it('src/main.ts onload contains a mutual-exclusion assert (useInlineWidget && useNestedEditor)', () => {
    expect(MAIN_TS).toMatch(/useInlineWidget\s*&&\s*useNestedEditor/);
  });

  it('mutual-exclusion branch calls setUseNestedEditor(false)', () => {
    // Locate a region that contains both the mutual-exclusion guard and a
    // setUseNestedEditor(false) call within the same onload body.
    const onloadMatch = /async\s+onload\(\)[\s\S]*?\n  \}/.exec(MAIN_TS);
    expect(onloadMatch).not.toBeNull();
    const onloadBody = onloadMatch![0];
    expect(onloadBody).toMatch(/useInlineWidget\s*&&\s*useNestedEditor/);
    expect(onloadBody).toMatch(/setUseNestedEditor\(false\)/);
  });

  it('mutual-exclusion branch surfaces a Notice', () => {
    const onloadMatch = /async\s+onload\(\)[\s\S]*?\n  \}/.exec(MAIN_TS);
    expect(onloadMatch).not.toBeNull();
    const onloadBody = onloadMatch![0];
    // Verify a `new Notice(...)` exists somewhere near the mutual-exclusion
    // guard (within 800 chars after the guard).
    const guardIdx = onloadBody.search(/useInlineWidget\s*&&\s*useNestedEditor/);
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    const after = onloadBody.slice(guardIdx, guardIdx + 800);
    expect(after).toMatch(/new Notice\(/);
  });

  it('useInlineWidget gating wraps registerMarkdownCodeBlockProcessor("leetcode-solve", …)', () => {
    expect(MAIN_TS).toMatch(/registerMarkdownCodeBlockProcessor\([\s\S]{0,40}'leetcode-solve'/);
  });

  it('useInlineWidget gating registers leetCodeFenceViewPlugin', () => {
    expect(MAIN_TS).toMatch(/leetCodeFenceViewPlugin/);
  });

  it('Plugin.onunload calls widgetRegistry.destroyAll()', () => {
    expect(MAIN_TS).toMatch(/onunload[\s\S]*?widgetRegistry\??\.destroyAll\(\)/);
  });

  it('useInlineWidget gating block guards both registrations behind the flag (D-05 hard-gate)', () => {
    // Both registrations must appear within an `if (useInlineWidget) {…}` block.
    // Find the if-block; both registrations must appear inside.
    const block = /if\s*\(\s*useInlineWidget\s*\)\s*\{([\s\S]*?)\n    \}/.exec(MAIN_TS);
    expect(block).not.toBeNull();
    const body = block![1];
    expect(body).toMatch(/registerMarkdownCodeBlockProcessor\([\s\S]{0,40}'leetcode-solve'/);
    expect(body).toMatch(/leetCodeFenceViewPlugin/);
  });
});
