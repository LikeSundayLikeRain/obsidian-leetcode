// Phase 21 Plan 21-04 Task 3 — Fixture runner / CI release gate.
//
// MIGRATE-10 + D-fixtures-03: scans tests/fixtures/migration/{v1.0,v1.1,v1.2}/,
// pairs each `*.md` (input) with its `*.expected.md`, runs the input through
// `migrateLegacyFenceIfNeeded` against a mock-vault App shim, and asserts the
// post-migration text equals the paired expected output BYTE-EXACT.
//
// Frontmatter-append convention (CRITICAL — both fixture authors AND this
// runner's `applyFrontmatterMutation` shim follow this rule):
//
//   When `lc-language` (or any new key) is added by the orchestrator's
//   `fileManager.processFrontMatter` call, the new key is APPENDED to the
//   end of the frontmatter block, immediately before the closing `---`
//   line. Existing keys are preserved in their original order with their
//   original values verbatim.
//
//   This convention is shared between the fixture authors (see
//   tests/fixtures/migration/v1.0/valid-parentheses.expected.md — the only
//   fixture that exercises injection) and the shim implementation below.
//   Empirical validation against live Obsidian's
//   `fileManager.processFrontMatter` is recorded in
//   `.obsidian-shim-validation.txt` (BLOCKER 4 — currently `skipped` per
//   Plan 21-02 Task 4 Test 7 deferral; the fixture-runner is the
//   ground-truth check while the dev-vault capture remains pending).
//
// Three threats mitigated by this runner per
// .planning/phases/21-v1-2-migration/21-04-PLAN.md threat register:
//   T-21-bytes  — byte-exact body preservation across all 10 fixtures.
//   T-21-backup — backup adapter spy received pre-migration content
//                 byte-exact.
//   T-21-strict — Phase 5.3 lcSlugToFenceTag remaps (python3→python,
//                 golang→go, c→cpp) verified byte-exactly per fixture.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('obsidian', async () => {
  const actual = await import('../../helpers/obsidian-stub');
  return actual;
});

import { migrateLegacyFenceIfNeeded } from '../../../src/widget/fenceMigrator';

// ───────────────────────────────────────────────────────────────────────────
// Fixture discovery.
// ───────────────────────────────────────────────────────────────────────────

const FIXTURE_ROOT = resolve(__dirname);
const VERSIONS = ['v1.0', 'v1.1', 'v1.2'];

interface FixturePair {
  label: string;       // `${version}/${slug}` for `it.each` formatting
  inputPath: string;
  expectedPath: string;
}

function discoverFixtures(): FixturePair[] {
  const pairs: FixturePair[] = [];
  for (const version of VERSIONS) {
    const dir = join(FIXTURE_ROOT, version);
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      if (entry.endsWith('.expected.md')) continue;
      const slug = entry.replace(/\.md$/, '');
      const expected = `${slug}.expected.md`;
      if (!entries.includes(expected)) continue;
      pairs.push({
        label: `${version}/${slug}`,
        inputPath: join(dir, entry),
        expectedPath: join(dir, expected),
      });
    }
  }
  return pairs.sort((a, b) => a.label.localeCompare(b.label));
}

// ───────────────────────────────────────────────────────────────────────────
// applyFrontmatterMutation — shim for Obsidian's
// `fileManager.processFrontMatter`. Reconstructs the frontmatter block by
// preserving existing keys in their original order with their original raw
// values, then appending any newly-added keys at the end (frontmatter-append
// convention documented above). Existing key VALUE updates are written
// in place using `key: <newValue>` syntax (the orchestrator's only
// frontmatter mutation in Phase 21 is appending `lc-language`; existing-key
// value updates are exercised here for forward-compatibility but not
// triggered by Phase 21 fixtures).
// ───────────────────────────────────────────────────────────────────────────

const FM_DELIM = '---';

interface ParsedFrontmatter {
  /** Keys in their original order. */
  keyOrder: string[];
  /** Map key → raw value string (everything after `: ` on the original line). */
  values: Record<string, string>;
}

/** Pure helper. Parses a single YAML-like `key: value` line into [key, value].
 *  Returns null on lines that don't match. */
function parseFmLine(line: string): [string, string] | null {
  const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
  if (!m) return null;
  return [m[1] ?? '', m[2] ?? ''];
}

/** Find the frontmatter block boundaries in `text`. Returns null when the
 *  text does NOT begin with `---\n`. */
function locateFrontmatter(
  text: string,
): { start: number; end: number; bodyStart: number; lines: string[] } | null {
  // Frontmatter must begin at byte 0 with `---` followed by a newline.
  if (!text.startsWith(`${FM_DELIM}\n`) && !text.startsWith(`${FM_DELIM}\r\n`)) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  // First line is the opening `---`. Find the closing `---` at line >= 1.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FM_DELIM) {
      close = i;
      break;
    }
  }
  if (close === -1) return null;
  return { start: 0, end: close, bodyStart: close + 1, lines };
}

function parseFrontmatter(
  fmLines: string[],
): ParsedFrontmatter {
  const keyOrder: string[] = [];
  const values: Record<string, string> = {};
  for (const line of fmLines) {
    const kv = parseFmLine(line);
    if (!kv) continue;
    const [k, v] = kv;
    if (!k) continue;
    if (!(k in values)) keyOrder.push(k);
    values[k] = v;
  }
  return { keyOrder, values };
}

/**
 * Reconstruct `noteText` after applying `mutator` to its parsed frontmatter
 * object. The mutator receives a plain `Record<string, unknown>` (mirroring
 * Obsidian's `fileManager.processFrontMatter` callback contract). After the
 * mutator returns, the frontmatter block is re-serialized using the
 * **append-at-end** convention: existing keys keep their position + raw
 * value (unless the mutator changed it via key reassignment, in which case
 * the new value is serialized via `String(value)`); newly-added keys are
 * appended in insertion order at the end of the block, just before the
 * closing `---`. Body text after the closing `---` is preserved BYTE-EXACT.
 */
/**
 * Coerce a frontmatter value to its YAML scalar form for re-serialization.
 * Phase 21 fixtures only set string / number / boolean / null; for objects
 * the test would need explicit JSON intent so we fall through to JSON.stringify
 * rather than silently emit `[object Object]` (the no-base-to-string lint
 * rule's exact concern).
 */
function stringifyFmValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

export function applyFrontmatterMutation(
  noteText: string,
  mutator: (fm: Record<string, unknown>) => void,
): string {
  const fm = locateFrontmatter(noteText);
  if (!fm) return noteText; // No frontmatter — nothing to mutate.

  const fmLines = fm.lines.slice(1, fm.end); // between opening and closing `---`
  const parsed = parseFrontmatter(fmLines);

  // Build the mutable object passed to the mutator. The keys mirror the
  // parsed frontmatter; values are the raw strings (Phase 21 fixtures only
  // store string-valued keys, matching the v1.0/v1.1/v1.2 plugin output).
  const obj: Record<string, unknown> = {};
  for (const k of parsed.keyOrder) obj[k] = parsed.values[k];

  // Pre-mutator key set (snapshot of the parsed key set).
  const preKeys = new Set(parsed.keyOrder);

  mutator(obj);

  // Reconstruct frontmatter block.
  const newLines: string[] = [FM_DELIM];
  // Existing keys in their original order (preserve raw value when the
  // mutator did not touch the key; serialize new value when changed).
  for (const k of parsed.keyOrder) {
    if (k in obj) {
      const v = obj[k];
      // If the mutator left the value untouched (still equal to the raw
      // parsed value), emit the original line verbatim; otherwise serialize.
      if (v === parsed.values[k]) {
        newLines.push(`${k}: ${parsed.values[k]}`);
      } else {
        newLines.push(`${k}: ${stringifyFmValue(v)}`);
      }
    }
    // (Keys deleted by the mutator drop out — Phase 21 doesn't exercise
    // this, but the convention matches Obsidian's contract.)
  }
  // Newly-added keys (present in obj, not in preKeys) — appended in
  // insertion order.
  for (const k of Object.keys(obj)) {
    if (preKeys.has(k)) continue;
    const v = obj[k];
    newLines.push(`${k}: ${stringifyFmValue(v)}`);
  }
  newLines.push(FM_DELIM);

  // Body — bytes after the closing `---` line, joined with `\n` per
  // fixture authoring convention.
  const bodyLines = fm.lines.slice(fm.bodyStart);
  return [...newLines, ...bodyLines].join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// Mock App / TFile shims.
// ───────────────────────────────────────────────────────────────────────────

interface RunnerSpies {
  vaultProcess: ReturnType<typeof vi.fn>;
  adapterWrite: ReturnType<typeof vi.fn>;
  adapterMkdir: ReturnType<typeof vi.fn>;
  processFrontMatter: ReturnType<typeof vi.fn>;
  vaultRead: ReturnType<typeof vi.fn>;
}

interface RunnerHandle {
  app: unknown;
  file: unknown;
  spies: RunnerSpies;
  /** The current note text after all writes. */
  getCurrentText: () => string;
}

function createMockApp(input: string, slug: string): RunnerHandle {
  let currentText = input;
  const file = {
    path: `LeetCode/${slug}.md`,
    name: `${slug}.md`,
    extension: 'md',
  };

  // Parse the initial frontmatter so metadataCache.getFileCache returns a
  // realistic `frontmatter` object (the orchestrator reads this to gate on
  // lc-slug + lc-language presence per Step 1 of the pipeline).
  const initialFm = locateFrontmatter(input);
  const fmObj: Record<string, unknown> = {};
  if (initialFm) {
    const parsed = parseFrontmatter(initialFm.lines.slice(1, initialFm.end));
    for (const k of parsed.keyOrder) fmObj[k] = parsed.values[k];
  }

  const spies: RunnerSpies = {
    vaultRead: vi.fn(async () => currentText),
    vaultProcess: vi.fn(
      async (_f: unknown, fn: (text: string) => string) => {
        currentText = fn(currentText);
      },
    ),
    adapterWrite: vi.fn(async () => {}),
    adapterMkdir: vi.fn(async () => {}),
    processFrontMatter: vi.fn(
      async (
        _f: unknown,
        mutator: (fm: Record<string, unknown>) => void,
      ) => {
        currentText = applyFrontmatterMutation(currentText, mutator);
      },
    ),
  };

  const app = {
    vault: {
      read: spies.vaultRead,
      process: spies.vaultProcess,
      adapter: {
        write: spies.adapterWrite,
        mkdir: spies.adapterMkdir,
      },
    },
    metadataCache: {
      getFileCache: (_f: unknown) => ({ frontmatter: fmObj }),
    },
    fileManager: {
      processFrontMatter: spies.processFrontMatter,
    },
  };

  return {
    app,
    file,
    spies,
    getCurrentText: () => currentText,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Test suite — drives the runner through `it.each` over discovered fixtures.
// ───────────────────────────────────────────────────────────────────────────

const fixtures = discoverFixtures();

describe('Phase 21 Plan 21-04 Task 3 — fixture runner (MIGRATE-10 release gate)', () => {
  it('discovers exactly 10 fixture pairs (3 v1.0 + 3 v1.1 + 4 v1.2)', () => {
    expect(fixtures.length).toBe(10);
    const v10 = fixtures.filter((f) => f.label.startsWith('v1.0/')).length;
    const v11 = fixtures.filter((f) => f.label.startsWith('v1.1/')).length;
    const v12 = fixtures.filter((f) => f.label.startsWith('v1.2/')).length;
    expect(v10).toBe(3);
    expect(v11).toBe(3);
    expect(v12).toBe(4);
  });

  it.each(fixtures)(
    'migrates $label byte-exact and writes byte-exact backup',
    async ({ label, inputPath, expectedPath }) => {
      const input = readFileSync(inputPath, 'utf-8');
      const expected = readFileSync(expectedPath, 'utf-8');
      const slug = label.split('/')[1] ?? 'unknown';
      const handle = createMockApp(input, slug);

      const ran = await migrateLegacyFenceIfNeeded(handle.app, handle.file, {
        force: true,
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });

      expect(ran).toBe(true);

      // Byte-exact post-migration content.
      const reconstructed = handle.getCurrentText();
      expect(reconstructed).toBe(expected);

      // Backup correctness — adapter.write called once with byte-exact
      // pre-migration text (T-21-backup invariant).
      expect(handle.spies.adapterWrite).toHaveBeenCalledTimes(1);
      const writeArgs = handle.spies.adapterWrite.mock.calls[0];
      expect(writeArgs).toBeDefined();
      expect(writeArgs?.[1]).toBe(input);
    },
  );
});
