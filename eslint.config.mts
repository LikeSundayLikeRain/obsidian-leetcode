import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  {
    // Type-checked rules need parserOptions only on TS/TSX files. Scoping
    // here (instead of the root) prevents the obsidianmd recommended config
    // from trying to apply typed rules (e.g., `no-plugin-as-component`) to
    // `package.json` — which the plugin handles in its own JSON block via
    // `language: 'json/json'` and `tseslint.configs.disableTypeChecked`.
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended,
  // Plugin-wide rule tuning. `LeetCode` is a brand name (capital C) so the
  // sentence-case rule must treat it like Obsidian's own default brands; the
  // recommended config doesn't ship with LC pre-loaded.
  {
    plugins: { obsidianmd },
    rules: {
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          enforceCamelCaseLower: true,
          brands: ['LeetCode', 'LEETCODE_SESSION', 'csrftoken'],
        },
      ],
    },
  },
  // Test files run under vitest with happy-dom. Production rules (sentence
  // case, popout-window timers, vault casts) target plugin runtime behaviour
  // and don't apply to pure unit tests. The type-checked `no-unsafe-*` rules
  // and `no-deprecated` also don't pull their weight against vi.fn() mocks
  // that return `any` by design. Note: obsidianmd/rule-custom-message is
  // intentionally NOT disabled here — the plugin store rejects any disable
  // of that rule across the project.
  {
    files: ['tests/**/*.ts'],
    plugins: { obsidianmd },
    rules: {
      'obsidianmd/prefer-active-doc': 'off',
      'obsidianmd/prefer-active-window-timers': 'off',
      'obsidianmd/prefer-create-el': 'off',
      'obsidianmd/no-tfile-tfolder-cast': 'off',
      'obsidianmd/no-static-styles-assignment': 'off',
      'obsidianmd/ui/sentence-case': 'off',
      'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-deprecated': 'off',
    },
  },
  globalIgnores([
    "node_modules", "dist", "esbuild.config.mjs", "eslint.config.js",
    "eslint.config.mts",
    "version-bump.mjs", "versions.json", "main.js",
    "scripts/**",
    // Phase 06 FOUND-01 — eslint-plugin-obsidianmd@^0.3.0 hybrid config
    // applies typed rules (e.g., `no-plugin-as-component`) to ALL files
    // because the outer hybrid config block has no `files:` filter, while
    // its embedded JSON-parser block targets only `package.json` via
    // `language: 'json/json'`. Routing `package.json` through the TS
    // parser then dies inside the typed rule's getParserServices call.
    // We rely on the project's own `validate-manifest.json` test
    // (`tests/manifest-version.test.ts`) and `prerelease-check.sh`
    // gate 6 for the manifest contract, so ignoring JSON for lint is safe.
    "package.json", "manifest.json", "package-lock.json", "tsconfig.json",
  ]),
);
