// tests/ai/lc-no-fetch-leakage.test.ts
//
// Phase 08.1 Plan 01 Task 1 — Wave 0 scaffold for the runtime layer-2
// regression that mirrors tests/ai/lc-isolation.test.ts (sibling gate).
// Body fills in Task 3 (TDD).
//
// Sibling of tests/ai/lc-isolation.test.ts (the obsidianFetch-leakage gate).
// Same fs-walk shape; different pattern set.

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

// Suppress unused-symbol lint at the scaffold gate without using `it(`. Task 3
// fills in the real assertion that consumes ROOT / LC_DIRS / readFileSafe / walkTs.
void ROOT;
void LC_DIRS;
void readFileSafe;
void walkTs;
void expect;

describe('Phase 08.1 — LC modules do not leak native fetch()', () => {
  it.todo('No file under LC-side directories invokes native fetch()');
});
