// Phase 17 Plan 05 — childEditorTheme tests (D-15/D-16).
//
// Coverage targets:
//   1. createThemedHighlight() returns a non-empty Extension array (>= 2
//      elements: HighlightStyle wrapper + EditorView.theme block).
//   2. HighlightStyle uses Obsidian CSS variables (var(--code-keyword) etc.).
//   3. .cm-matchingBracket theme block exists with the expected high-contrast
//      shape (uses --background-modifier-active-hover for tinted background +
//      outline + --code-keyword foreground — D-16 Phase 16 cosmetic gap fix).
//   4. createThemedHighlight() does NOT include CM6's `bracketMatching()`
//      extension — Pitfall 5 mitigation: the bracket-match firing logic stays
//      at childEditorFactory.ts:178; only the styling lives in this module.
//
// Test strategy: import the module's exported constants directly
// (themedHighlightStyle, bracketMatchThemeSpec) so we can introspect them
// without needing a live CM6 EditorView. The factory itself is also asserted
// to return an array of length >= 2.

import { describe, it, expect, vi } from 'vitest';

// `obsidian` import in upstream modules is mocked here for safety even
// though childEditorTheme.ts does not currently import it.
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  createThemedHighlight,
  themedHighlightStyle,
  themedBracketMatchTheme,
  bracketMatchThemeSpec,
} from '../../src/main/childEditorTheme';

describe('childEditorTheme', () => {
  describe('createThemedHighlight()', () => {
    it('returns a non-empty Extension array (>= 2 elements: highlight + theme)', () => {
      const result = createThemedHighlight();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT include bracketMatching() — Pitfall 5: that lives in childEditorFactory.ts', async () => {
      // Re-import bracketMatching live to get its identity-by-call sentinel.
      const lang = await import('@codemirror/language');
      const bracketMatchingExt = lang.bracketMatching();
      const result = createThemedHighlight();
      // Spread-equality check: createThemedHighlight's array elements are NOT
      // the same identity as a freshly-built bracketMatching() — this is a
      // structural sanity check (each call returns a new Extension), but the
      // contract is "this module does NOT export the bracketMatching firing
      // logic". The existence of the theme block + HighlightStyle wrapper is
      // the real assertion (length >= 2 above).
      // We additionally assert the array length is exactly 2 — if a future
      // change added bracketMatching() into this factory, the array would
      // become length 3.
      expect(result.length).toBe(2);
      // (No-op use of `bracketMatchingExt` to keep the import meaningful.)
      expect(bracketMatchingExt).toBeDefined();
    });
  });

  describe('themedHighlightStyle', () => {
    it('is exported (truthy)', () => {
      expect(themedHighlightStyle).toBeDefined();
    });
  });

  describe('themedBracketMatchTheme', () => {
    it('is exported (truthy)', () => {
      expect(themedBracketMatchTheme).toBeDefined();
    });
  });

  describe('bracketMatchThemeSpec (introspectable raw spec)', () => {
    it('contains a .cm-matchingBracket selector', () => {
      expect(bracketMatchThemeSpec).toHaveProperty('.cm-matchingBracket');
    });

    it('uses --background-modifier-active-hover for tinted bg (D-16 contrast)', () => {
      const spec = bracketMatchThemeSpec as Record<string, Record<string, string>>;
      const matching = spec['.cm-matchingBracket'];
      expect(matching).toBeDefined();
      // Concatenate all values for an "any field references the variable" sanity check.
      const allValues = Object.values(matching ?? {}).join(' ');
      expect(allValues).toContain('var(--background-modifier-active-hover)');
    });

    it('uses --code-keyword for high-contrast foreground (D-16)', () => {
      const spec = bracketMatchThemeSpec as Record<string, Record<string, string>>;
      const matching = spec['.cm-matchingBracket'];
      const allValues = Object.values(matching ?? {}).join(' ');
      expect(allValues).toContain('var(--code-keyword)');
    });

    it('contains a .cm-nonmatchingBracket selector with --text-error', () => {
      expect(bracketMatchThemeSpec).toHaveProperty('.cm-nonmatchingBracket');
      const spec = bracketMatchThemeSpec as Record<string, Record<string, string>>;
      const nonMatching = spec['.cm-nonmatchingBracket'];
      const allValues = Object.values(nonMatching ?? {}).join(' ');
      expect(allValues).toContain('var(--text-error)');
    });
  });

  describe('Obsidian CSS variable bindings (D-15)', () => {
    // The HighlightStyle's spec list isn't a public introspectable surface,
    // so for these assertions we read the source file directly. This keeps
    // the test resilient to internal CM6 representation changes while still
    // asserting the core D-15 contract (Lezer tags → Obsidian CSS variables).
    it('source binds keyword/string/comment/etc to var(--code-*)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/main/childEditorTheme.ts'),
        'utf-8',
      );
      // Check at least the core trio + a few more from the D-15 contract.
      expect(source).toContain('var(--code-keyword)');
      expect(source).toContain('var(--code-string)');
      expect(source).toContain('var(--code-comment)');
      expect(source).toContain('var(--code-function)');
      expect(source).toContain('var(--code-tag)');
      expect(source).toContain('var(--code-property)');
      expect(source).toContain('var(--code-operator)');
      expect(source).toContain('var(--code-value)');
      expect(source).toContain('var(--text-error)');
    });

    it('source uses HighlightStyle.define and syntaxHighlighting', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/main/childEditorTheme.ts'),
        'utf-8',
      );
      expect(source).toContain('HighlightStyle.define');
      expect(source).toContain('syntaxHighlighting');
    });
  });

  // Phase 17 Plan 10 — theme-scoped --code-* fallback palette in styles.css.
  //
  // Background (17-UAT.md Issue 4, Tests 13 + 14): the themed HighlightStyle
  // from Plan 17-05 binds Lezer tags to var(--code-*), but inside the child
  // editor's Decoration.widget({block:true}) DOM subtree the variables don't
  // resolve to a theme-dependent value — community themes scope --code-* to
  // selectors the widget DOM doesn't match. Plan 17-10 ships theme-scoped
  // fallback definitions in styles.css under :where(.theme-light/.theme-dark)
  // .lc-nested-editor so the variables track Obsidian's mode automatically.
  //
  // These tests are SOURCE-LEVEL (read styles.css with fs) because vitest has
  // no real Obsidian DOM to query computed styles against. The grep-style
  // assertions prove (a) both theme scopes exist, (b) the keyword color
  // VALUE differs between scopes (theme tracking proven), (c) ≥5 of the 8
  // consumed --code-* variables are defined in each scope, and (d) Plan 17-05's
  // childEditorTheme.ts var(--code-keyword) consumer reference is unchanged.
  describe('Plan 17-10 — theme-scoped --code-* fallback palette in styles.css', () => {
    const STYLES_PATH = 'styles.css';
    const CONSUMED_VARS = [
      '--code-keyword',
      '--code-string',
      '--code-comment',
      '--code-function',
      '--code-tag',
      '--code-property',
      '--code-operator',
      '--code-value',
    ];

    // Match the body of either `.theme-LIGHT|DARK .lc-nested-editor { ... }`
    // OR `:where(.theme-LIGHT|DARK) .lc-nested-editor { ... }`. The body is
    // captured (group 1) so we can scan for variable declarations inside it.
    function buildScopeRegex(mode: 'light' | 'dark'): RegExp {
      return new RegExp(
        `(?:\\.theme-${mode}|:where\\(\\s*\\.theme-${mode}\\s*\\))\\s+\\.lc-nested-editor\\s*\\{([^}]*)\\}`,
        'i',
      );
    }

    function readStyles(): string {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path');
      return fs.readFileSync(path.join(process.cwd(), STYLES_PATH), 'utf-8');
    }

    function extractKeywordColor(scopeBody: string | undefined): string | null {
      if (!scopeBody) return null;
      const match = scopeBody.match(/--code-keyword\s*:\s*([^;]+);/i);
      return match ? match[1].trim().toLowerCase() : null;
    }

    it('Test N+1: styles.css defines --code-keyword in BOTH .theme-light and .theme-dark .lc-nested-editor scopes', () => {
      const source = readStyles();
      const lightMatch = source.match(buildScopeRegex('light'));
      const darkMatch = source.match(buildScopeRegex('dark'));

      expect(lightMatch, 'light scope rule block should exist').not.toBeNull();
      expect(darkMatch, 'dark scope rule block should exist').not.toBeNull();
      // And each block must define --code-keyword.
      expect(lightMatch?.[1] ?? '').toMatch(/--code-keyword\s*:/);
      expect(darkMatch?.[1] ?? '').toMatch(/--code-keyword\s*:/);
    });

    it('Test N+2: --code-keyword VALUE differs between light and dark scopes (proves theme tracking)', () => {
      const source = readStyles();
      const lightMatch = source.match(buildScopeRegex('light'));
      const darkMatch = source.match(buildScopeRegex('dark'));

      const lightKeyword = extractKeywordColor(lightMatch?.[1]);
      const darkKeyword = extractKeywordColor(darkMatch?.[1]);

      expect(lightKeyword, 'light --code-keyword color should be parseable').not.toBeNull();
      expect(darkKeyword, 'dark --code-keyword color should be parseable').not.toBeNull();
      // The KEY invariant — different colors per mode means tokens repaint
      // when Obsidian flips theme. Specific hex values are NOT locked.
      expect(lightKeyword).not.toEqual(darkKeyword);
    });

    it('Test N+3: at least 5 of the 8 consumed --code-* variables are defined in each scope', () => {
      const source = readStyles();
      const lightBody = source.match(buildScopeRegex('light'))?.[1] ?? '';
      const darkBody = source.match(buildScopeRegex('dark'))?.[1] ?? '';

      const countDefined = (body: string): number =>
        CONSUMED_VARS.filter((v) =>
          new RegExp(`${v.replace(/-/g, '\\-')}\\s*:`, 'i').test(body),
        ).length;

      expect(countDefined(lightBody)).toBeGreaterThanOrEqual(5);
      expect(countDefined(darkBody)).toBeGreaterThanOrEqual(5);
    });

    it("Test N+4: childEditorTheme.ts still references 'var(--code-keyword)' — Plan 17-05 binding shape preserved", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/main/childEditorTheme.ts'),
        'utf-8',
      );
      // The literal consumer string — guards against a future maintainer
      // assuming the new CSS rules alone fix highlighting and removing the
      // var() reference from the HighlightStyle binding.
      expect(source).toContain("'var(--code-keyword)'");
    });
  });
});
