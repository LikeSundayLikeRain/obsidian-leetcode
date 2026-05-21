// tests/ai/lc-isolation.test.ts
//
// Phase 07 Plan 02 Task 3 — runtime layer-2 regression for the AIPROV-05
// invariant: leetcode.com NEVER goes through obsidianFetch.
//
// The bash grep gate (scripts/check-no-obsidianfetch-in-lc.sh) is layer 1 —
// blocks at CI time. This file is layer 2 — runs at vitest time so a CI that
// silently disables the bash script still trips this regression.
//
// Tests are filesystem-based: read source files via fs and assert that no
// LC-side directory contains the `obsidianFetch` substring. Cold cache
// completes in < 200 ms.

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const LC_DIRS = [
  'src/api',
  'src/auth',
  'src/browse',
  'src/notes',
  'src/solve',
  'src/graph',
  'src/preview',
];

async function readFileSafe(rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkTs(rel)));
    } else if (
      e.isFile() &&
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.d.ts') &&
      !e.name.endsWith('.test.ts')
    ) {
      out.push(rel);
    }
  }
  return out;
}

describe('Phase 07 AIPROV-05 — LC modules do not import obsidianFetch', () => {
  it('LeetCodeClient module does not statically import obsidianFetch', async () => {
    const content = await readFileSafe('src/api/LeetCodeClient.ts');
    expect(content).not.toBeNull();
    expect(content).not.toContain('obsidianFetch');
    expect(content).not.toContain("'../ai/obsidianFetch'");
  });

  it('requestUrlFetcher module does not statically import obsidianFetch', async () => {
    const content = await readFileSafe('src/api/requestUrlFetcher.ts');
    expect(content).not.toBeNull();
    expect(content).not.toContain('obsidianFetch');
  });

  it('No file under LC-side directories imports obsidianFetch', async () => {
    const offenders: string[] = [];
    for (const dir of LC_DIRS) {
      const files = await walkTs(dir);
      for (const f of files) {
        const content = await readFileSafe(f);
        if (content && content.includes('obsidianFetch')) {
          offenders.push(f);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src/ai/obsidianFetch.ts is the ONLY file that defines obsidianFetch', async () => {
    const definers: string[] = [];
    // Walk every .ts under src/ and look for the export-function-obsidianFetch
    // signature. Only src/ai/obsidianFetch.ts should match.
    const allTs = await walkTs('src');
    for (const f of allTs) {
      const content = await readFileSafe(f);
      if (content && /export\s+function\s+obsidianFetch\b/.test(content)) {
        definers.push(f);
      }
    }
    expect(definers).toEqual(['src/ai/obsidianFetch.ts']);
  });
});
