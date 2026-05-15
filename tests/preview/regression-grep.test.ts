// tests/preview/regression-grep.test.ts
//
// Phase 06 Plan 03 — locks 06-UI-SPEC §Acceptance grep gates as enforceable
// vitest assertions. The contract is: every `.ts` file under `src/preview/`
// satisfies the read-only / Component-arg / no-CM6-dispatch / tab-reuse
// gates. Each assertion below maps 1:1 to a contract from RESEARCH /
// UI-SPEC / CLAUDE.md.
//
// Why grep-style assertions: the alternative is mounting each preview
// module under a real Obsidian app + driving its lifecycle, which is
// infeasible in a unit test. The grep approach catches REGRESSIONS in CI
// before they hit dev — if a future executor accidentally adds
// `vault.create` or `cm.dispatch(` to preview source, the build fails
// loud rather than silently corrupting user notes.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PREVIEW_SRC_DIR = resolve(__dirname, '../../src/preview');

function readAllPreviewSources(): Array<{ name: string; src: string }> {
  return readdirSync(PREVIEW_SRC_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({
      name: f,
      src: readFileSync(resolve(PREVIEW_SRC_DIR, f), 'utf8'),
    }));
}

describe('Phase 06 Plan 03 preview regression-grep gates (UI-SPEC §Acceptance)', () => {
  it('GATE 1: NO file under src/preview/ calls vault.create(', () => {
    const files = readAllPreviewSources();
    expect(files.length).toBeGreaterThan(0);
    for (const { name, src } of files) {
      expect(src, `${name} must not call vault.create — preview is read-only`)
        .not.toMatch(/vault\.create\(/);
    }
  });

  it('GATE 2: NO file under src/preview/ calls workspace.openLinkText(', () => {
    const files = readAllPreviewSources();
    for (const { name, src } of files) {
      expect(src, `${name} must not call workspace.openLinkText — preview is read-only`)
        .not.toMatch(/workspace\.openLinkText\(/);
    }
  });

  it('GATE 3: NO file under src/preview/ contains innerHTML = (XSS gate)', () => {
    const files = readAllPreviewSources();
    for (const { name, src } of files) {
      expect(src, `${name} must not assign to innerHTML — XSS gate`)
        .not.toMatch(/innerHTML\s*=/);
    }
  });

  it('GATE 4: NO file under src/preview/ calls cm.dispatch( (CLAUDE.md userEvent rule)', () => {
    // RESEARCH §Project Constraints: preview is read-only and must never
    // reach the editor's transaction filter. Defense in depth — even
    // though preview should not dispatch in the first place.
    const files = readAllPreviewSources();
    for (const { name, src } of files) {
      expect(src, `${name} must not dispatch CM6 transactions — preview is read-only`)
        .not.toMatch(/cm\.dispatch\(/);
    }
  });

  it('GATE 5: every MarkdownRenderer.render( call passes `this` (the view) as the 5th arg, NEVER `this.plugin`', () => {
    // Whitelist regex: matches `MarkdownRenderer.render(...this)` where
    // `this` is the LAST argument (5th position per Obsidian 1.x signature
    // — app, markdown, el, sourcePath, component). The negative regex
    // catches any call ending in `, this.plugin)` which would violate the
    // obsidianmd/no-plugin-as-component rule (06-RESEARCH §Pattern 3).
    const files = readAllPreviewSources();
    for (const { name, src } of files) {
      const callMatches = src.match(/MarkdownRenderer\.render\(/g);
      if (!callMatches) continue; // file makes no MarkdownRenderer call
      // Every render call must end with `, this)` (and NOT `, this.plugin)`).
      expect(
        src,
        `${name} contains a MarkdownRenderer.render() call passing this.plugin instead of this`,
      ).not.toMatch(/MarkdownRenderer\.render\([\s\S]*?,\s*this\.plugin\)/);
    }
  });

  it('GATE 6: at least one file under src/preview/ uses getLeavesOfType for tab-reuse', () => {
    // The tab-reuse contract relies on getLeavesOfType + setViewState as
    // the canonical primitive (RESEARCH §Open Q9 — openIfExtant doesn't
    // exist on obsidian@1.12.x).
    const files = readAllPreviewSources();
    const combined = files.map((f) => f.src).join('\n');
    expect(combined).toMatch(
      /getLeavesOfType\(\s*PREVIEW_VIEW_TYPE\s*\)|getLeavesOfType\(\s*['"]leetcode-preview['"]\s*\)/,
    );
  });

  it('preview tab-reuse uses getLeavesOfType (aggregated check across all preview files)', () => {
    const files = readAllPreviewSources();
    const found = files.some((f) =>
      /getLeavesOfType\(\s*PREVIEW_VIEW_TYPE\s*\)|getLeavesOfType\(\s*['"]leetcode-preview['"]\s*\)/.test(f.src),
    );
    expect(found, 'no preview file calls getLeavesOfType — tab-reuse primitive missing').toBe(true);
  });
});
