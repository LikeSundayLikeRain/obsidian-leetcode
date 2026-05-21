// Phase 06 FOUND-02 — CI workflow shape contract.
//
// Asserts that `.github/workflows/ci.yml`:
//   - exists
//   - declares `runs-on: ubuntu-latest`
//   - declares `node-version: 20`
//   - runs the 5 steps in this exact order:
//       npm ci -> npm run lint -> npm test -> npm run build -> npm run check:bundle-size
//
// Rationale: the step order is locked in 06-CONTEXT.md §E. We avoid pulling
// in a YAML parser dep (`js-yaml`) — the file is owned by this plan and not
// user-edited, so substring + monotonic-index assertion is sufficient and
// keeps the test footprint dep-free.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const WORKFLOW = resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml');

describe('.github/workflows/ci.yml — CI workflow contract (FOUND-02)', () => {
  it('exists', () => {
    expect(existsSync(WORKFLOW)).toBe(true);
  });

  it('runs on ubuntu-latest with node 22 + npm cache', () => {
    const yaml = readFileSync(WORKFLOW, 'utf-8');
    expect(yaml).toMatch(/runs-on:\s*ubuntu-latest/);
    expect(yaml).toMatch(/node-version:\s*22/);
    expect(yaml).toMatch(/cache:\s*npm/);
  });

  it('triggers on push to main and on pull_request', () => {
    const yaml = readFileSync(WORKFLOW, 'utf-8');
    expect(yaml).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(yaml).toMatch(/pull_request:/);
  });

  it('runs the 5 pipeline steps in the exact locked order', () => {
    const yaml = readFileSync(WORKFLOW, 'utf-8');
    const steps = [
      'npm ci',
      'npm run lint',
      'npm test',
      'npm run build',
      'npm run check:bundle-size',
    ];
    const indices: number[] = steps.map((s) => yaml.indexOf(s));
    // Every step must appear at least once.
    indices.forEach((i, idx) => {
      expect(i, `step "${steps[idx]}" missing from ci.yml`).toBeGreaterThanOrEqual(0);
    });
    // And the indices must be strictly monotonically increasing (correct order).
    for (let i = 1; i < indices.length; i++) {
      const prev = indices[i - 1] as number;
      const curr = indices[i] as number;
      expect(
        curr,
        `step "${steps[i]}" must appear after "${steps[i - 1]}"`,
      ).toBeGreaterThan(prev);
    }
  });
});
