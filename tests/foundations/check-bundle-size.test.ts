// Phase 06 FOUND-02 — bundle-size gate behavior contract.
//
// Asserts that `scripts/check-bundle-size.mjs`:
//   - Exits 1 with FAIL when main.js > 1_200_000 bytes
//   - Exits 0 with WARN when 1_080_000 < size <= 1_200_000
//   - Exits 0 (no warn) when size <= 1_080_000
//   - Exits 1 with FAIL when main.js does not exist
//
// Phase 07 Plan 03 ceiling bump (Rule 3): 500 KB → 1 MB when the AI SDK
// landed on the bundle graph (tree-shake-false-green resolved).
//
// Phase 08 Plan 02 ceiling bump (Rule 3): 1 MB → 1.2 MB when streamText
// became a live runtime consumer (Phase 07 import-only stub vs Phase 08
// AIStreamModal actually iterating the textStream). Soft warning held at
// 90% of HARD_LIMIT.
//
// Spawns the script via `child_process.execFileSync` against fixture
// directories under `os.tmpdir()` so the real `main.js` is never modified.
// `cwd` is overridden so the script reads the fixture's `main.js` (the
// script reads `'main.js'` as a relative path).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'check-bundle-size.mjs');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runWithFixture(size: number | null): RunResult {
  const tmp = mkdtempSync(join(tmpdir(), 'lc-bundle-'));
  try {
    if (size !== null) {
      // Create a deterministic fixture file of `size` bytes.
      const buf = Buffer.alloc(size, 0x61); // ASCII 'a'
      writeFileSync(join(tmp, 'main.js'), buf);
    }
    const result = spawnSync('node', [SCRIPT_PATH], {
      cwd: tmp,
      encoding: 'utf-8',
    });
    return {
      status: typeof result.status === 'number' ? result.status : -1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe('scripts/check-bundle-size.mjs (FOUND-02)', () => {
  it('exits 0 with no warn when main.js is under the soft warn threshold', () => {
    const r = runWithFixture(100_000);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/BUNDLE CHECK OK/);
    expect(r.stderr).not.toMatch(/WARN/);
  });

  it('exits 0 with WARN when 1_080_000 < size <= 1_200_000 (soft warn band)', () => {
    const r = runWithFixture(1_140_000);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/WARN/);
    expect(r.stderr).toMatch(/heading toward the gate/);
  });

  it('exits 1 with FAIL when main.js > 1_200_000 bytes (hard limit)', () => {
    const r = runWithFixture(1_300_000);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
    expect(r.stderr).toMatch(/exceeds 1200000 bytes/);
  });

  it('exits 1 with FAIL when main.js is missing', () => {
    const r = runWithFixture(null);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAIL/);
    expect(r.stderr).toMatch(/main\.js missing/);
  });
});

describe('package.json — check:bundle-size script registration (FOUND-02)', () => {
  it('registers `check:bundle-size` to invoke the Node script', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['check:bundle-size']).toBe(
      'node scripts/check-bundle-size.mjs',
    );
  });
});

describe('scripts/check-bundle-size.mjs — threshold constants (FOUND-02 + Phase 08 Plan 02 bump)', () => {
  it('uses HARD_LIMIT=1_200_000 and SOFT_WARN=1_080_000 (1.2 MB ceiling for live streamText consumer)', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(src).toMatch(/HARD_LIMIT\s*=\s*1_?200_?000/);
    expect(src).toMatch(/SOFT_WARN\s*=\s*1_?080_?000/);
  });
});

describe('scripts/check-bundle-size.sh — legacy bash version removed (FOUND-02)', () => {
  it('the bash version is gone (replaced by .mjs)', () => {
    const result = spawnSync('test', ['-e', resolve(REPO_ROOT, 'scripts', 'check-bundle-size.sh')]);
    // `test -e` exits 0 when the path exists; we require exit != 0 (gone).
    expect(result.status).not.toBe(0);
  });
});

