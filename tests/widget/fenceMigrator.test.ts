// Phase 21 Plan 21-01 — fenceMigrator unit + integration tests.
//
// Covers MIGRATE-01..MIGRATE-04, MIGRATE-07, and the 5-clause
// isMigrationCandidate predicate (D-edge-01) exhaustively.
//
// Mocks Obsidian via tests/helpers/obsidian-stub. Builds a minimal App shim
// with vault.read / vault.process / vault.adapter.write+mkdir / metadataCache
// / fileManager.processFrontMatter — all wired through vi.fn() spies. Tests
// NEVER write to real disk; tests NEVER call real vault APIs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  isMigrationCandidate,
  migrateLegacyFenceIfNeeded,
  writeBackup,
} from '../../src/widget/fenceMigrator';

// ───────────────────────────────────────────────────────────────────────────
// Mock App / TFile shims.
// ───────────────────────────────────────────────────────────────────────────

interface MockState {
  fileText: string;
  frontmatter: Record<string, unknown> | undefined;
  vaultProcessSpy: ReturnType<typeof vi.fn>;
  adapterWriteSpy: ReturnType<typeof vi.fn>;
  adapterMkdirSpy: ReturnType<typeof vi.fn>;
  processFrontMatterSpy: ReturnType<typeof vi.fn>;
  vaultReadSpy: ReturnType<typeof vi.fn>;
}

function makeApp(state: MockState): { app: any; file: any } {
  const file = { path: 'LeetCode/two-sum.md', name: 'two-sum.md', extension: 'md' };
  const app = {
    vault: {
      read: state.vaultReadSpy,
      process: state.vaultProcessSpy,
      adapter: {
        write: state.adapterWriteSpy,
        mkdir: state.adapterMkdirSpy,
      },
    },
    metadataCache: {
      getFileCache: (_f: unknown) => ({ frontmatter: state.frontmatter }),
    },
    fileManager: {
      processFrontMatter: state.processFrontMatterSpy,
    },
  };
  return { app, file };
}

function makeState(opts: {
  fileText: string;
  frontmatter?: Record<string, unknown>;
  adapterWriteImpl?: () => Promise<void>;
  vaultProcessImpl?: (file: unknown, fn: (text: string) => string) => Promise<void>;
  processFrontMatterImpl?: (file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>;
}): MockState {
  let currentText = opts.fileText;
  const frontmatter: Record<string, unknown> = { ...(opts.frontmatter ?? {}) };
  const state: MockState = {
    fileText: opts.fileText,
    frontmatter: opts.frontmatter,
    vaultReadSpy: vi.fn(async () => currentText),
    vaultProcessSpy: vi.fn(
      opts.vaultProcessImpl ??
        (async (_f: unknown, fn: (text: string) => string) => {
          currentText = fn(currentText);
          state.fileText = currentText;
        }),
    ),
    adapterWriteSpy: vi.fn(opts.adapterWriteImpl ?? (async () => {})),
    adapterMkdirSpy: vi.fn(async () => {}),
    processFrontMatterSpy: vi.fn(
      opts.processFrontMatterImpl ??
        (async (_f: unknown, fn: (fm: Record<string, unknown>) => void) => {
          fn(frontmatter);
          // Also reflect updated frontmatter for subsequent reads.
          state.frontmatter = { ...frontmatter };
        }),
    ),
  };
  return state;
}

// ───────────────────────────────────────────────────────────────────────────
// describe('isMigrationCandidate') — 5-clause predicate exhaustion.
// ───────────────────────────────────────────────────────────────────────────

describe('isMigrationCandidate — 5-clause strict-match predicate', () => {
  const goodNote = '## Code\n\n```python\ncode\n```\n';

  describe('Clause 1 — lc-slug presence', () => {
    it('undefined frontmatter — returns false', () => {
      expect(isMigrationCandidate(goodNote, undefined)).toBe(false);
    });
    it('empty {} frontmatter — returns false', () => {
      expect(isMigrationCandidate(goodNote, {})).toBe(false);
    });
    it("frontmatter with lc-slug='' — returns false", () => {
      expect(isMigrationCandidate(goodNote, { 'lc-slug': '' })).toBe(false);
    });
    it('frontmatter with lc-slug=null — returns false', () => {
      expect(isMigrationCandidate(goodNote, { 'lc-slug': null })).toBe(false);
    });
    it('frontmatter with lc-slug=123 (non-string) — returns false', () => {
      expect(isMigrationCandidate(goodNote, { 'lc-slug': 123 })).toBe(false);
    });
    it('frontmatter with lc-slug=valid string + recognized fence — returns true', () => {
      expect(isMigrationCandidate(goodNote, { 'lc-slug': 'two-sum' })).toBe(true);
    });
  });

  describe('Clause 5 — idempotency early-out (already-leetcode-solve)', () => {
    it('note with `leetcode-solve` opener — returns false (mixed-state)', () => {
      const mixedNote =
        '## Code\n\n```leetcode-solve\nbody\n```\n\n## Other\n\n```python\nstray\n```\n';
      expect(isMigrationCandidate(mixedNote, { 'lc-slug': 'two-sum' })).toBe(false);
    });
    it('note with only `leetcode-solve` fence — returns false', () => {
      const note = '## Code\n\n```leetcode-solve\nbody\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
  });

  describe('Clause 2 — `## Code` heading missing', () => {
    it('no `## Code` heading at all — returns false', () => {
      const note = '## Notes\n\n```python\nstray\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
    it('fence under `## Notes` only — returns false', () => {
      const note = '## Problem\n\nintro\n\n## Notes\n\n```python\nstray\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
  });

  describe('Clause 3 — recognized langSlug + alias coverage', () => {
    const recognized = [
      'python3', 'python', 'java', 'cpp', 'c++', 'golang', 'go',
      'rust', 'rs', 'javascript', 'js', 'typescript', 'ts',
      'c', 'py', 'py3', 'kt', 'rb',
    ];
    it.each(recognized)('recognized tag `%s` — returns true', (tag) => {
      const note = `## Code\n\n\`\`\`${tag}\ncode\n\`\`\`\n`;
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(true);
    });

    const unrecognized = ['text', 'bash', 'pseudo', 'shell', 'sh', 'plaintext'];
    it.each(unrecognized)('unrecognized tag `%s` — returns false', (tag) => {
      const note = `## Code\n\n\`\`\`${tag}\ncode\n\`\`\`\n`;
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });

    it('empty fence tag (bare ```) — returns false', () => {
      const note = '## Code\n\n```\ncode\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
  });

  describe('Clause 4 — fence has closer', () => {
    it('fence with closer before next H2 — returns true', () => {
      const note = '## Code\n\n```python\ncode\n```\n## Notes\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(true);
    });
    it('next `## ` heading appears before closer — returns false', () => {
      const note = '## Code\n\n```python\ncode\n## Notes\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
    it('EOF before closer — returns false', () => {
      const note = '## Code\n\n```python\ncode\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('multiple H2 sections — fence only counts when in `## Code` section', () => {
      const note =
        '## Problem\n\nintro\n\n## Code\n\n```python\ncode\n```\n\n## Notes\n\n```bash\nstray\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(true);
    });
    it('fence inside `## Notes` only (no fence in `## Code`) — returns false', () => {
      const note =
        '## Code\n\nplain prose\n\n## Notes\n\n```python\nstray\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'two-sum' })).toBe(false);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// describe('writeBackup') — ISO timestamp + path shape + byte-exact contents.
// ───────────────────────────────────────────────────────────────────────────

describe('writeBackup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T14:32:08.123Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ISO timestamp sanitization: `:` replaced with `-`, millis stripped', async () => {
    const state = makeState({ fileText: 'note content' });
    const { app, file } = makeApp(state);
    const path = await writeBackup(app, file, 'two-sum', 'note content');
    expect(path).toBe(
      '.obsidian/plugins/obsidian-leetcode/migration-backup-two-sum-2026-06-01T14-32-08Z/two-sum.md',
    );
  });

  it('Backup folder name matches `migration-backup-{slug}-{ISO}` regex', async () => {
    const state = makeState({ fileText: 'x' });
    const { app, file } = makeApp(state);
    const path = await writeBackup(app, file, 'test-slug', 'x');
    expect(path).toMatch(
      /\.obsidian\/plugins\/obsidian-leetcode\/migration-backup-test-slug-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\/test-slug\.md/,
    );
  });

  it('File contents passed to adapter.write equals fileText byte-exact', async () => {
    const fileText = '---\nlc-slug: two-sum\n---\n## Code\n\n```python\nbody\n```\n';
    const state = makeState({ fileText });
    const { app, file } = makeApp(state);
    await writeBackup(app, file, 'two-sum', fileText);
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    expect(state.adapterWriteSpy.mock.calls[0]?.[1]).toBe(fileText);
  });

  it('mkdir is called with the backup folder before write', async () => {
    const state = makeState({ fileText: 'x' });
    const { app, file } = makeApp(state);
    await writeBackup(app, file, 'two-sum', 'x');
    expect(state.adapterMkdirSpy).toHaveBeenCalled();
    expect(state.adapterMkdirSpy.mock.calls[0]?.[0]).toMatch(
      /^\.obsidian\/plugins\/obsidian-leetcode\/migration-backup-two-sum-/,
    );
    // mkdir invoked before write (check invocationCallOrder).
    const mkdirOrder = state.adapterMkdirSpy.mock.invocationCallOrder[0]!;
    const writeOrder = state.adapterWriteSpy.mock.invocationCallOrder[0]!;
    expect(mkdirOrder).toBeLessThan(writeOrder);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// describe('migrateLegacyFenceIfNeeded') — orchestrator coverage.
// ───────────────────────────────────────────────────────────────────────────

describe('migrateLegacyFenceIfNeeded', () => {
  const v12Note = '## Code\n\n```python\ndef f():\n    return 1\n```\n';
  const v12NoteWithFm = '---\nlc-slug: two-sum\nlc-language: python3\n---\n## Code\n\n```python\ncode\n```\n';

  it('MIGRATE-01: triggers migration on lazy file open with autoMigrateOnOpen=true', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);
    const result = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
    });
    expect(result).toBe(true);
    expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    expect(state.adapterWriteSpy.mock.calls[0]?.[0]).toMatch(
      /migration-backup-two-sum-.+\/two-sum\.md$/,
    );
  });

  it('MIGRATE-02: backup ordering — adapter.write BEFORE vault.process (T-21-backup)', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    const writeOrder = state.adapterWriteSpy.mock.invocationCallOrder[0]!;
    const processOrder = state.vaultProcessSpy.mock.invocationCallOrder[0]!;
    expect(writeOrder).toBeLessThan(processOrder);
  });

  it('MIGRATE-03: body byte-exact in the rewritten fence', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    // Post-migration text replaces the python opener with leetcode-solve;
    // body line must be byte-equal to pre-migration body line.
    expect(state.fileText).toBe(
      '## Code\n\n```leetcode-solve\ndef f():\n    return 1\n```\n',
    );
  });

  it('MIGRATE-04: idempotency — second call returns false; no second backup; no second vault.process', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);
    const r1 = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r1).toBe(true);
    // Second call: file is now leetcode-solve fenced; predicate's clause 5
    // (idempotency) short-circuits.
    const r2 = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r2).toBe(false);
    expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    // D-backup-02: at most one mkdir call across re-opens.
    expect(state.adapterMkdirSpy).toHaveBeenCalledTimes(1);
    // mock.invocationCallOrder primitive is referenced in this test.
    expect(state.vaultProcessSpy.mock.invocationCallOrder.length).toBe(1);
  });

  it('MIGRATE-07: atomic two-write — both vault.process AND processFrontMatter called when lc-language missing', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum' }, // lc-language missing!
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    // Spy ordering: adapter.write < vault.process < processFrontMatter.
    const writeOrder = state.adapterWriteSpy.mock.invocationCallOrder[0]!;
    const processOrder = state.vaultProcessSpy.mock.invocationCallOrder[0]!;
    const fmOrder = state.processFrontMatterSpy.mock.invocationCallOrder[0]!;
    expect(writeOrder).toBeLessThan(processOrder);
    expect(processOrder).toBeLessThan(fmOrder);
  });

  it('D-edge-04: lc-language already set — processFrontMatter is NOT called', async () => {
    const state = makeState({
      fileText: v12NoteWithFm,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' }, // already set
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(state.processFrontMatterSpy).not.toHaveBeenCalled();
  });

  it('D-edge-04: lc-language is empty string — processFrontMatter IS called (treats empty as missing)', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': '' },
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'cpp',
    });
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
  });

  it('D-edge-04 default-language injection: missing lc-language fills with opts.defaultLanguage', async () => {
    let captured: Record<string, unknown> | null = null;
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum' },
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = {};
        fn(fm);
        captured = fm;
      },
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'cpp',
    });
    expect(captured).toEqual({ 'lc-language': 'cpp' });
  });

  it('autoMigrateOnOpen=false + force=false — returns false WITHOUT vault.read / write / process', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: false,
      force: false,
    });
    expect(r).toBe(false);
    expect(state.vaultReadSpy).not.toHaveBeenCalled();
    expect(state.adapterWriteSpy).not.toHaveBeenCalled();
    expect(state.vaultProcessSpy).not.toHaveBeenCalled();
  });

  it('autoMigrateOnOpen=false + force=true — runs migration anyway (D-auto-03)', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: false,
      force: true,
    });
    expect(r).toBe(true);
    expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
  });

  it('isMigrationCandidate=false (text fence tag) — returns false; no backup; no vault.process', async () => {
    const state = makeState({
      fileText: '## Code\n\n```text\nstuff\n```\n',
      frontmatter: { 'lc-slug': 'two-sum' },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r).toBe(false);
    expect(state.adapterWriteSpy).not.toHaveBeenCalled();
    expect(state.vaultProcessSpy).not.toHaveBeenCalled();
    expect(state.processFrontMatterSpy).not.toHaveBeenCalled();
  });

  it('Backup write throws — returns false; vault.process NOT called (T-21-backup invariant)', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      adapterWriteImpl: async () => {
        throw new Error('disk full');
      },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r).toBe(false);
    expect(state.vaultProcessSpy).not.toHaveBeenCalled();
  });

  it('vault.process throws (post-backup) — returns false; processFrontMatter NOT called', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum' }, // would otherwise call processFrontMatter
      vaultProcessImpl: async () => {
        throw new Error('process boom');
      },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    expect(r).toBe(false);
    expect(state.processFrontMatterSpy).not.toHaveBeenCalled();
  });

  it('strict-match predicate is false (lc-slug missing) — returns false; no I/O', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: {}, // no lc-slug
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r).toBe(false);
    expect(state.adapterWriteSpy).not.toHaveBeenCalled();
    expect(state.vaultProcessSpy).not.toHaveBeenCalled();
  });
});
