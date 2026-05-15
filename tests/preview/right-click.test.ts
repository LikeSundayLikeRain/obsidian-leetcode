// tests/preview/right-click.test.ts
//
// Phase 06 Plan 03 PREVIEW-01 — right-click on a row opens an Obsidian Menu
// with a single `Preview problem` entry. Selecting it dispatches
// `routeProblemClick(slug, status, 'preview', { force: true })` so the
// user's `Click behavior` setting cannot suppress the explicit menu choice.
//
// The test grep-asserts the source rather than driving a full DOM contextmenu
// dispatch (which requires an Obsidian leaf + ItemView mount). The ProblemBrowserView
// production source is treated as the source of truth: we read it as a string and
// assert the menu wiring is in place.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_PATH = resolve(__dirname, '../../src/browse/ProblemBrowserView.ts');
const SRC = readFileSync(SRC_PATH, 'utf8');

describe('ProblemBrowserView right-click context menu (PREVIEW-01)', () => {
  it('imports Menu from obsidian (added to the ItemView/WorkspaceLeaf/Notice/setIcon line)', () => {
    // The test pins the obsidian import line includes Menu. Order within
    // the braces is not load-bearing — the grep accepts any position so
    // future re-orderings (e.g. alphabetical) don't break the gate.
    expect(SRC).toMatch(/from\s+'obsidian'/);
    const obsidianImportLine = SRC
      .split('\n')
      .find((l) => /from\s+'obsidian'/.test(l) && l.includes('ItemView'));
    expect(obsidianImportLine).toBeDefined();
    expect(obsidianImportLine).toContain('Menu');
  });

  it('does NOT add Menu to the ../shared/timers import (line 5 corruption guard)', () => {
    // The plan-checker contract: the timers import (line 5 in the current
    // source) must NOT have been edited. Specifically `Menu` should not
    // appear inside the timers import block.
    const timersImport = SRC.match(/import\s*\{[^}]*\}\s*from\s*'\.\.\/shared\/timers'/);
    expect(timersImport).not.toBeNull();
    expect(timersImport?.[0]).not.toContain('Menu');
  });

  it('registers a contextmenu listener on each row', () => {
    expect(SRC).toMatch(/addEventListener\(\s*['"]contextmenu['"]/);
  });

  it("calls e.preventDefault to suppress the browser's default context menu", () => {
    // The contextmenu handler must preventDefault so the browser-native
    // menu doesn't compete with Obsidian's Menu.
    expect(SRC).toMatch(/contextmenu['"][\s\S]{0,400}preventDefault\(\)/);
  });

  it('constructs an Obsidian Menu inside the contextmenu handler', () => {
    expect(SRC).toMatch(/contextmenu['"][\s\S]{0,800}new\s+Menu\(\)/);
  });

  it("calls menu.addItem with title 'Preview problem' and icon 'eye'", () => {
    expect(SRC).toMatch(/setTitle\(\s*['"]Preview problem['"]/);
    expect(SRC).toMatch(/setIcon\(\s*['"]eye['"]/);
  });

  it("onClick dispatches routeProblemClick with intent='preview' and force:true", () => {
    // The right-click menu's onClick MUST pass force:true so the user's
    // Click behavior setting cannot suppress an explicit menu choice
    // (CONTEXT.md decision A).
    expect(SRC).toMatch(/routeProblemClick\([\s\S]{0,200}['"]preview['"][\s\S]{0,200}force:\s*true/);
  });

  it('calls menu.showAtMouseEvent to anchor the menu at the cursor', () => {
    expect(SRC).toMatch(/showAtMouseEvent\(/);
  });
});
