// Phase 06 FOUND-01 drift gate.
//
// Asserts that `eslint.config.mts` keeps `obsidianmd.configs.recommended`
// so the 0.3.0 (and forward) recommended ruleset auto-enables. If a
// future refactor inlines rules instead of using the recommended preset,
// this test fails and the planner must re-audit before the bump silently
// disables important rules.
//
// Rationale: 06-CONTEXT.md §D and 06-RESEARCH.md §Open Q4 — the 0.3.0
// hybrid recommended config wires up `no-plugin-as-component`,
// `prefer-instanceof`, `vault/iterate`, `commands/*`, and the deepened
// `no-forbidden-elements` / `no-global-this` / `regex-lookbehind` rules.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

describe('eslint.config.mts — recommended preset wired (FOUND-01)', () => {
  it('imports the obsidianmd plugin', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'eslint.config.mts'), 'utf-8');
    expect(src).toMatch(/eslint-plugin-obsidianmd/);
  });

  it('uses obsidianmd.configs.recommended so 0.3.0 rules auto-enable', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'eslint.config.mts'), 'utf-8');
    expect(src).toMatch(/obsidianmd\.configs\.recommended/);
  });
});
