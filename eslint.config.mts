import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js', 'eslint.config.mts', 'vitest.config.ts', 'manifest.json'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  // Disable obsidianmd rules in tests — those rules target plugin runtime
  // behavior (popout-window timers, vault interactions), not pure logic.
  // Test files run under vitest with happy-dom and don't have access to
  // Obsidian's `activeDocument` / `activeWindow` shims.
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
      'obsidianmd/rule-custom-message': 'off',
      'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
    },
  },
  globalIgnores([
    "node_modules", "dist", "esbuild.config.mjs", "eslint.config.js",
    "version-bump.mjs", "versions.json", "main.js",
  ]),
);
