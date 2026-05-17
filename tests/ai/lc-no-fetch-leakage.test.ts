// tests/ai/lc-no-fetch-leakage.test.ts
//
// Phase 08.1 Plan 01 Task 3 — runtime layer-2 regression for AIPROV-05's
// sibling invariant: native fetch() lives ONLY in src/ai/, never in LC paths.
//
// The bash grep gate (scripts/check-no-fetch-in-lc.sh) is layer 1 — blocks at
// CI time via the prelint hook. This file is layer 2 — runs at vitest time
// so a CI that silently disables the bash script still trips this regression.
//
// Sibling of tests/ai/lc-isolation.test.ts (the obsidianFetch-leakage gate).
// Same fs-walk shape; different pattern set tuned to the three load-bearing
// native-fetch call shapes (window.fetch / globalThis.fetch / line-leading
// bare fetch() ).

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

describe('Phase 08.1 — LC modules do not leak native fetch()', () => {
  it('No file under LC-side directories invokes native fetch()', async () => {
    // Multi-pattern grep — see scripts/check-no-fetch-in-lc.sh for parity.
    // The patterns intentionally target the three load-bearing native-fetch
    // call shapes (window.fetch, globalThis.fetch, line-leading bare
    // `fetch(`) and skip the broader `[^a-zA-Z_]fetch\(` clause that the
    // shell gate originally locked — that clause produced false positives on
    // prose comments containing hyphenated words like "re-fetch (" and on
    // legitimate `requestUrlFetcher.fetch(` call sites that are part of the
    // requestUrl bridge.
    const patterns = [
      /\bwindow\.fetch\b/,
      /\bglobalThis\.fetch\b/,
      /^\s*fetch\s*\(/m,
    ];
    const offenders: string[] = [];
    for (const dir of LC_DIRS) {
      const files = await walkTs(dir);
      for (const f of files) {
        const content = await readFileSafe(f);
        if (content && patterns.some((p) => p.test(content))) {
          offenders.push(f);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
