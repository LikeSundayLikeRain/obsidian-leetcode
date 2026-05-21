// tests/preview/command-ids.test.ts
//
// Phase 06 Plan 03 FOUND-03 — locks the new `Open in preview` command's ID
// hygiene. The new command MUST satisfy the lint rules introduced by
// 06-01's eslint-plugin-obsidianmd@^0.3.0 bump:
//   - id has NO plugin-id prefix (no `obsidian-leetcode:` substring).
//   - id has NO `command` substring.
//   - id has NO `obsidian` substring.
//   - id is sentence-case-friendly (kebab-case).
// Reads `src/main.ts` as text and grep-asserts the registration. No bundling
// or import of the plugin (the test would otherwise need a real Obsidian
// app).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_PATH = resolve(__dirname, '../../src/main.ts');
const SRC = readFileSync(SRC_PATH, 'utf8');

describe('Open in preview palette command ID hygiene (FOUND-03)', () => {
  it("registers a command with id: 'open-in-preview'", () => {
    expect(SRC).toMatch(/id:\s*['"]open-in-preview['"]/);
  });

  it("registers a command with name: 'Open in preview'", () => {
    expect(SRC).toMatch(/name:\s*['"]Open in preview['"]/);
  });

  it("does NOT prefix the command id with 'obsidian-leetcode:'", () => {
    expect(SRC).not.toMatch(/id:\s*['"]obsidian-leetcode:/);
  });

  it("does NOT include the substring 'command' inside any command id literal", () => {
    // Match every `id:` literal in addCommand blocks; assert none contains
    // the substring 'command' (case-insensitive). Avoids false positives on
    // surrounding code-comments and matches just the value of an `id:` key.
    const idLiterals = Array.from(SRC.matchAll(/id:\s*['"]([^'"]+)['"]/g))
      .map((m) => m[1] ?? '');
    for (const id of idLiterals) {
      expect(id.toLowerCase()).not.toContain('command');
    }
  });

  it("does NOT include the substring 'obsidian' inside any command id literal", () => {
    const idLiterals = Array.from(SRC.matchAll(/id:\s*['"]([^'"]+)['"]/g))
      .map((m) => m[1] ?? '');
    for (const id of idLiterals) {
      expect(id.toLowerCase()).not.toContain('obsidian');
    }
  });

  it("'Open in preview' command's editorCheckCallback gates on isValidSlug(fm['lc-slug'])", () => {
    // Window the source around the open-in-preview block and assert the
    // gate uses the existing isValidSlug helper. The window must include
    // `fm` access + isValidSlug.
    const windowMatch = SRC.match(
      /id:\s*['"]open-in-preview['"][\s\S]{0,1500}/,
    );
    expect(windowMatch).not.toBeNull();
    expect(windowMatch?.[0]).toMatch(/isValidSlug\(/);
    expect(windowMatch?.[0]).toMatch(/lc-slug/);
  });

  it("'Open in preview' command action calls routeProblemClick with intent='preview' and force:true", () => {
    const windowMatch = SRC.match(
      /id:\s*['"]open-in-preview['"][\s\S]{0,1500}/,
    );
    expect(windowMatch).not.toBeNull();
    expect(windowMatch?.[0]).toMatch(/routeProblemClick\([\s\S]{0,400}['"]preview['"][\s\S]{0,400}force:\s*true/);
  });
});
