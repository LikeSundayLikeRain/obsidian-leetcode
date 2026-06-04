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
  countLeetCodeSolveFenceOpenersInCodeSection,
  isFrontmatterRepairCandidate,
  isMigrationCandidate,
  migrateLegacyFenceIfNeeded,
  repairFrontmatterIfNeeded,
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
  adapterListSpy: ReturnType<typeof vi.fn>;
  processFrontMatterSpy: ReturnType<typeof vi.fn>;
  vaultReadSpy: ReturnType<typeof vi.fn>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional `any` so call-site fixtures (38+ direct calls into production functions typed `app: App`, `file: TFile`) don't each need an `as never` cast. Loosely-typed test mocks are the established pattern in this file.
function makeApp(state: MockState): { app: any; file: any } {
  const file = { path: 'LeetCode/two-sum.md', name: 'two-sum.md', extension: 'md' };
  const app = {
    vault: {
      // configDir mirrors Obsidian's default — production code builds the
      // backup root as `${vault.configDir}/plugins/obsidian-leetcode`, which
      // resolves to the literal `.obsidian/...` paths these fixtures expect.
      // eslint-disable-next-line obsidianmd/hardcoded-config-path -- this IS the configDir mock; production code reads it via app.vault.configDir.
      configDir: '.obsidian',
      read: state.vaultReadSpy,
      process: state.vaultProcessSpy,
      adapter: {
        write: state.adapterWriteSpy,
        mkdir: state.adapterMkdirSpy,
        list: state.adapterListSpy,
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
  adapterListImpl?: () => Promise<{ files: string[]; folders: string[] }>;
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
    // Default: empty plugin folder (no prior backups). Tests override per case.
    adapterListSpy: vi.fn(
      opts.adapterListImpl ?? (async () => ({ files: [], folders: [] })),
    ),
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

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-07 Task 2 — WR-03 closure. isMigrationCandidate clause 5
  // (idempotency check) now scopes the leetcode-solve opener count to the
  // `## Code` section only. Stray ```leetcode-solve references in
  // `## Notes` or `## Problem` no longer abort migration of the legacy
  // ## Code fence.
  // ───────────────────────────────────────────────────────────────────────
  describe('WR-03-fix — clause 5 scoped to ## Code section', () => {
    it('WR-03-fix Test A — leetcode-solve fence in ## Code aborts migration (clause 5 fires)', () => {
      const note =
        '---\nlc-slug: x\n---\n## Code\n\n```leetcode-solve\nbody\n```\n\n## Notes\n\nuser content\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'x' })).toBe(false);
    });

    it('WR-03-fix Test B — leetcode-solve reference ONLY in ## Notes does NOT abort migration', () => {
      const note =
        '---\nlc-slug: x\n---\n## Code\n\n```python\nbody\n```\n\n## Notes\n\nFor reference, the v1.3 fence syntax is:\n\n```leetcode-solve\nexample\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'x' })).toBe(true);
    });

    it('WR-03-fix Test C — leetcode-solve in BOTH ## Code AND ## Notes aborts (mixed-state)', () => {
      const note =
        '---\nlc-slug: x\n---\n## Code\n\n```leetcode-solve\nbody\n```\n\n## Notes\n\n```leetcode-solve\nstray\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'x' })).toBe(false);
    });

    it('WR-03-fix Test D — leetcode-solve in ## Problem (above ## Code) does NOT abort', () => {
      const note =
        '---\nlc-slug: x\n---\n## Problem\n\nFor reference: ```leetcode-solve\nexample\n```\n\n## Code\n\n```python\nbody\n```\n';
      expect(isMigrationCandidate(note, { 'lc-slug': 'x' })).toBe(true);
    });

    it('WR-03-fix Test E — countLeetCodeSolveFenceOpenersInCodeSection helper directly', () => {
      // Pure helper: counts ONLY in-code-section openers.
      const noteOnlyInCode =
        '## Code\n\n```leetcode-solve\nbody\n```\n\n## Notes\n\nplain prose\n';
      expect(countLeetCodeSolveFenceOpenersInCodeSection(noteOnlyInCode)).toBe(1);

      const noteOnlyInNotes =
        '## Code\n\n```python\nbody\n```\n\n## Notes\n\n```leetcode-solve\nexample\n```\n';
      expect(countLeetCodeSolveFenceOpenersInCodeSection(noteOnlyInNotes)).toBe(0);

      const noteInProblem =
        '## Problem\n\n```leetcode-solve\nexample\n```\n\n## Code\n\n```python\nbody\n```\n';
      expect(countLeetCodeSolveFenceOpenersInCodeSection(noteInProblem)).toBe(0);

      const noBoundary = 'no headings\n```leetcode-solve\n```\n';
      expect(countLeetCodeSolveFenceOpenersInCodeSection(noBoundary)).toBe(0);
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
      // eslint-disable-next-line obsidianmd/hardcoded-config-path -- expected output of production code given the mock's configDir='.obsidian' (default).
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

  it('D-edge-04: lc-language already set — inner gate preserves it (Plan 21-07 WR-02 — outer needsLang check removed; processFrontMatter is invoked unconditionally; the inner callback gate is the single source of truth)', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const state = makeState({
      fileText: v12NoteWithFm,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' }, // already set
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum', 'lc-language': 'java' };
        fn(fm);
        captured.push(fm);
      },
    });
    const { app, file } = makeApp(state);
    await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    // WR-02: invoked unconditionally — but the inner gate short-circuits.
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    // D-edge-04 behavior preserved: lc-language NOT overwritten.
    expect(captured[0]?.['lc-language']).toBe('java');
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

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-06 CR-02 — pre-existence backup check protects D-backup-02
  // invariant ("one backup per note ever") on the partial-failure retry
  // path. Before writeBackup runs, the orchestrator lists
  // .obsidian/plugins/obsidian-leetcode/ and skips the backup write if a
  // `migration-backup-{slug}-*` folder already exists for THIS slug.
  // ───────────────────────────────────────────────────────────────────────

  it('CR-02-fix Test A — partial-failure retry produces ONE backup folder, not two', async () => {
    const slug = 'two-sum';
    let processCallCount = 0;
    let priorBackupFolder: string | null = null;
    let currentText = v12Note;

    const adapterWriteSpy = vi.fn(async (path: string, _content: string) => {
      // Capture the prior-backup folder path written on the first call so
      // adapter.list can surface it on the second call.
      if (priorBackupFolder === null) {
        // path looks like '.obsidian/plugins/obsidian-leetcode/migration-backup-two-sum-{ISO}/two-sum.md'
        const dir = path.replace(/\/[^/]+$/, '');
        priorBackupFolder = dir;
      }
    });

    const vaultProcessSpy = vi.fn(
      async (_f: unknown, fn: (text: string) => string) => {
        processCallCount++;
        if (processCallCount === 1) {
          // First call: simulate vault.process throwing AFTER writeBackup
          // succeeded (the partial-failure shape). The orchestrator's outer
          // try/catch swallows this and returns false.
          throw new Error('vault locked — simulated partial failure');
        }
        // Second call: rewrite proceeds normally.
        currentText = fn(currentText);
      },
    );

    // adapter.list returns the prior backup folder iff one was captured.
    const adapterListSpy = vi.fn(async () => {
      if (priorBackupFolder === null) {
        return { files: [], folders: [] };
      }
      return { files: [], folders: [priorBackupFolder] };
    });

    const file = { path: 'LeetCode/two-sum.md', name: 'two-sum.md', extension: 'md' };
    const frontmatter = { 'lc-slug': slug, 'lc-language': 'python3' };
    const app = {
      vault: {
        // eslint-disable-next-line obsidianmd/hardcoded-config-path -- this IS the configDir mock; production code reads it via app.vault.configDir.
        configDir: '.obsidian',
        read: vi.fn(async () => currentText),
        process: vaultProcessSpy,
        adapter: {
          write: adapterWriteSpy,
          mkdir: vi.fn(async () => {}),
          list: adapterListSpy,
        },
      },
      metadataCache: {
        getFileCache: (_f: unknown) => ({ frontmatter }),
      },
      fileManager: { processFrontMatter: vi.fn(async () => {}) },
    };

    // First invocation: vault.process throws; orchestrator returns false.
    const r1 = await migrateLegacyFenceIfNeeded(app as never, file as never, {
      autoMigrateOnOpen: true,
    });
    expect(r1).toBe(false);
    expect(adapterWriteSpy).toHaveBeenCalledTimes(1);
    expect(priorBackupFolder).not.toBeNull();

    // Second invocation: vault.process succeeds. Orchestrator's pre-existence
    // check finds the prior backup → writeBackup is SKIPPED.
    const r2 = await migrateLegacyFenceIfNeeded(app as never, file as never, {
      autoMigrateOnOpen: true,
    });
    expect(r2).toBe(true);

    // D-backup-02 invariant: exactly ONE backup write across both calls.
    expect(adapterWriteSpy.mock.calls.length === 1).toBe(true);
    expect(adapterWriteSpy).toHaveBeenCalledTimes(1);

    // vault.process was called twice (once threw, once succeeded).
    expect(vaultProcessSpy).toHaveBeenCalledTimes(2);
  });

  it('CR-02-fix Test B — happy path (no prior backup) writes a single backup', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      adapterListImpl: async () => ({ files: [], folders: [] }),
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r).toBe(true);
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
  });

  it('CR-02-fix Test C — first-install (adapter.list rejects) — migration proceeds; backup written', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      adapterListImpl: async () => {
        throw new Error('ENOENT — plugin folder does not yet exist');
      },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r).toBe(true);
    // Pre-existence check rejected → defensive false → backup IS written.
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
  });

  it('CR-02-fix Test D — different slug, same plugin folder — backup IS written', async () => {
    // Plugin folder contains a backup folder for OTHER-SLUG; current
    // migration is for `two-sum`. Per-slug filter must distinguish.
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      adapterListImpl: async () => ({
        files: [],
        folders: [
          // eslint-disable-next-line obsidianmd/hardcoded-config-path -- mocked adapter.list output; mirrors what production code writes when configDir='.obsidian'.
          '.obsidian/plugins/obsidian-leetcode/migration-backup-other-slug-2026-01-01T00-00-00Z',
        ],
      }),
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r).toBe(true);
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-07 Task 2 — WR-02 closure. The outer `needsLang` check using
  // metadataCache-snapshot fm is REMOVED; the inner re-check inside the
  // processFrontMatter callback is now the single authoritative gate.
  // processFrontMatter is invoked unconditionally for migration candidates;
  // when lc-language is already set, the inner gate short-circuits and
  // Obsidian writes nothing (no-op callback => no file write).
  // ───────────────────────────────────────────────────────────────────────
  it('WR-02-fix Test A — processFrontMatter invoked exactly once when lc-language is already set', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum', 'lc-language': 'java' };
        fn(fm);
        captured.push(fm);
      },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    expect(r).toBe(true);
    // Plan 21-07 WR-02: processFrontMatter is invoked unconditionally.
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    // Inner gate short-circuited: lc-language stays 'java' (NOT overwritten
    // with the default 'python3').
    expect(captured[0]?.['lc-language']).toBe('java');
  });

  it('WR-02-fix Test B — processFrontMatter invoked exactly once when lc-language is missing', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum' }, // no lc-language
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum' };
        fn(fm);
        captured.push(fm);
      },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    expect(r).toBe(true);
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    // Inner gate fired: lc-language was missing, default ('python3') was injected.
    expect(captured[0]?.['lc-language']).toBe('python3');
  });

  it('WR-02-fix Test C — race-safety: stale metadataCache snapshot, real frontmatter has lc-language', async () => {
    // metadataCache returns stale fm WITHOUT lc-language. The pre-21-07
    // outer-check would have fired and tried to inject. Post-21-07: the
    // outer check is gone; processFrontMatter receives the REAL frontmatter
    // (lc-language='java'), and the inner gate correctly preserves it.
    const captured: Array<Record<string, unknown>> = [];
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum' }, // STALE: no lc-language
      processFrontMatterImpl: async (_f, fn) => {
        // Real frontmatter has lc-language='java' (e.g. a recent chevron write).
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum', 'lc-language': 'java' };
        fn(fm);
        captured.push(fm);
      },
    });
    const { app, file } = makeApp(state);
    const r = await migrateLegacyFenceIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'python3',
    });
    expect(r).toBe(true);
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    // Inner gate (the SSoT) preserved the real value — no clobber.
    expect(captured[0]?.['lc-language']).toBe('java');
  });

  it.skip('__placeholder__', () => {});
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-09 — isFrontmatterRepairCandidate predicate (truth-table)
// + repairFrontmatterIfNeeded orchestrator coverage.
//
// Closes UAT Gap 2 (Test 2): asymmetric "v1.3 body + missing lc-language"
// shape. The note already has ` ```leetcode-solve ` as the fence opener
// (so isMigrationCandidate clause 5 short-circuits) but `lc-language` is
// missing from frontmatter — `resolveLangSlug` then emits the Python +
// Notice fallback at widget mount. The repair path injects
// `lc-language: <plugin.settings.getDefaultLanguage()>` BEFORE mount.
// ───────────────────────────────────────────────────────────────────────────

describe('isFrontmatterRepairCandidate — Plan 21-09 truth-table', () => {
  // C1: lc-slug present + C2: ## Code + C3: leetcode-solve opener + C4: closer
  const v13Note =
    '## Code\n\n```leetcode-solve\ndef solve(): pass\n```\n';
  const v13NoteWithNotes =
    '## Code\n\n```leetcode-solve\ndef solve(): pass\n```\n\n## Notes\n\nuser content\n';

  it('Test 1 — lc-slug + ## Code + leetcode-solve opener + closer + lc-language MISSING → true', () => {
    expect(
      isFrontmatterRepairCandidate(v13NoteWithNotes, { 'lc-slug': 'two-sum' }),
    ).toBe(true);
  });

  it("Test 2 — lc-slug + ## Code + leetcode-solve opener + closer + lc-language='java' → false (D-edge-04 no clobber)", () => {
    expect(
      isFrontmatterRepairCandidate(v13NoteWithNotes, {
        'lc-slug': 'two-sum',
        'lc-language': 'java',
      }),
    ).toBe(false);
  });

  it("Test 3 — lc-slug + ## Code + leetcode-solve opener + closer + lc-language='' (empty string) → true", () => {
    expect(
      isFrontmatterRepairCandidate(v13NoteWithNotes, {
        'lc-slug': 'two-sum',
        'lc-language': '',
      }),
    ).toBe(true);
  });

  it('Test 4 — lc-slug MISSING → false', () => {
    expect(isFrontmatterRepairCandidate(v13NoteWithNotes, {})).toBe(false);
    expect(isFrontmatterRepairCandidate(v13NoteWithNotes, undefined)).toBe(
      false,
    );
  });

  it('Test 5 — no ## Code heading → false', () => {
    const note = '## Notes\n\n```leetcode-solve\nbody\n```\n';
    expect(isFrontmatterRepairCandidate(note, { 'lc-slug': 'two-sum' })).toBe(
      false,
    );
  });

  it('Test 6 — ## Code present but first fence is ```python (legacy shape) → false (routes through isMigrationCandidate, not repair)', () => {
    const note = '## Code\n\n```python\nbody\n```\n';
    expect(isFrontmatterRepairCandidate(note, { 'lc-slug': 'two-sum' })).toBe(
      false,
    );
  });

  it('Test 7 — ## Code + ```leetcode-solve opener but NO closer before next H2 → false', () => {
    const note = '## Code\n\n```leetcode-solve\nbody\n## Notes\n';
    expect(isFrontmatterRepairCandidate(note, { 'lc-slug': 'two-sum' })).toBe(
      false,
    );
  });

  it('Test 8 — ## Code present (no fence) + ```leetcode-solve only under ## Notes → false', () => {
    const note =
      '## Code\n\nplain prose\n\n## Notes\n\n```leetcode-solve\nstray\n```\n';
    expect(isFrontmatterRepairCandidate(note, { 'lc-slug': 'two-sum' })).toBe(
      false,
    );
  });

  it('Test 9 — Multiple ## Code regions; second ## Code has the leetcode-solve opener + closer → true', () => {
    const note =
      '## Code\n\nplain prose\n\n## Notes\n\nuser\n\n## Code\n\n```leetcode-solve\nbody\n```\n';
    expect(isFrontmatterRepairCandidate(note, { 'lc-slug': 'two-sum' })).toBe(
      true,
    );
  });

  it('Test 10 — lc-language is a number (123) → true (per spec: not a string OR empty)', () => {
    expect(
      isFrontmatterRepairCandidate(v13Note, {
        'lc-slug': 'two-sum',
        'lc-language': 123,
      }),
    ).toBe(true);
  });
});

describe('repairFrontmatterIfNeeded — Plan 21-09 orchestrator', () => {
  const v13Note = '## Code\n\n```leetcode-solve\ndef solve(): pass\n```\n';
  const legacyNote = '## Code\n\n```python\ncode\n```\n';

  it('Test 11 — gate (neither force nor autoMigrateOnOpen) → false; no I/O', async () => {
    const state = makeState({
      fileText: v13Note,
      frontmatter: { 'lc-slug': 'two-sum' },
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: false,
      force: false,
    });
    expect(r).toBe(false);
    expect(state.vaultReadSpy).not.toHaveBeenCalled();
    expect(state.processFrontMatterSpy).not.toHaveBeenCalled();
  });

  it("Test 12 — candidate + opts.defaultLanguage='java' → callback writes 'java'; resolves true", async () => {
    let captured: Record<string, unknown> | null = null;
    const state = makeState({
      fileText: v13Note,
      frontmatter: { 'lc-slug': 'two-sum' },
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum' };
        fn(fm);
        captured = fm;
      },
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'java',
    });
    expect(r).toBe(true);
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    expect(captured).toEqual({ 'lc-slug': 'two-sum', 'lc-language': 'java' });
  });

  it("Test 13 — candidate but inner-gate finds lc-language already 'cpp' → callback NO-OP; resolves true", async () => {
    let captured: Record<string, unknown> | null = null;
    const state = makeState({
      fileText: v13Note,
      // metadataCache snapshot says missing — predicate accepts.
      frontmatter: { 'lc-slug': 'two-sum' },
      processFrontMatterImpl: async (_f, fn) => {
        // Real frontmatter has lc-language='cpp' — inner gate must preserve.
        const fm: Record<string, unknown> = {
          'lc-slug': 'two-sum',
          'lc-language': 'cpp',
        };
        fn(fm);
        captured = fm;
      },
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage: 'java',
    });
    expect(r).toBe(true);
    expect(state.processFrontMatterSpy).toHaveBeenCalledTimes(1);
    // Inner gate (SSoT) preserved 'cpp' — NO clobber.
    expect(captured?.['lc-language']).toBe('cpp');
  });

  it('Test 14 — vault.read rejects → resolves false; no processFrontMatter; debug log called (Pattern S-05)', async () => {
    const state = makeState({
      fileText: v13Note,
      frontmatter: { 'lc-slug': 'two-sum' },
    });
    state.vaultReadSpy = vi.fn(async () => {
      throw new Error('disk read failed');
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: true,
    });
    expect(r).toBe(false);
    expect(state.processFrontMatterSpy).not.toHaveBeenCalled();
  });

  it('Test 15 — not a candidate (legacy fence shape) → resolves false; processFrontMatter never invoked', async () => {
    const state = makeState({
      fileText: legacyNote,
      frontmatter: { 'lc-slug': 'two-sum' },
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: true,
    });
    expect(r).toBe(false);
    expect(state.processFrontMatterSpy).not.toHaveBeenCalled();
  });

  it("Test 16 — opts.defaultLanguage undefined → falls back to 'python3' (matches migrator)", async () => {
    let captured: Record<string, unknown> | null = null;
    const state = makeState({
      fileText: v13Note,
      frontmatter: { 'lc-slug': 'two-sum' },
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum' };
        fn(fm);
        captured = fm;
      },
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: true,
    });
    expect(r).toBe(true);
    expect(captured?.['lc-language']).toBe('python3');
  });

  it('Test 17 — force=true bypasses autoMigrateOnOpen=false (D-auto-03 parity); candidate + force → runs repair', async () => {
    let captured: Record<string, unknown> | null = null;
    const state = makeState({
      fileText: v13Note,
      frontmatter: { 'lc-slug': 'two-sum' },
      processFrontMatterImpl: async (_f, fn) => {
        const fm: Record<string, unknown> = { 'lc-slug': 'two-sum' };
        fn(fm);
        captured = fm;
      },
    });
    const { app, file } = makeApp(state);
    const r = await repairFrontmatterIfNeeded(app, file, {
      autoMigrateOnOpen: false,
      force: true,
      defaultLanguage: 'java',
    });
    expect(r).toBe(true);
    expect(captured?.['lc-language']).toBe('java');
  });
});

describe('migrateLegacyFenceIfNeeded — Plan 21-09 dummy block (kept for symmetry)', () => {
  const v12Note = '## Code\n\n```python\ndef f():\n    return 1\n```\n';
  it('CR-02-fix Test E — second-open of an already-migrated note short-circuits BEFORE pre-existence check', async () => {
    const state = makeState({
      fileText: v12Note,
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { app, file } = makeApp(state);

    // First call: full migration runs; one backup write; one vault.process.
    const r1 = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r1).toBe(true);
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);

    // Now mock adapter.list to return the prior backup (in case it gets called).
    state.adapterListSpy.mockResolvedValue({
      files: [],
      folders: [
        // eslint-disable-next-line obsidianmd/hardcoded-config-path -- mocked adapter.list output; mirrors what production code writes when configDir='.obsidian'.
        '.obsidian/plugins/obsidian-leetcode/migration-backup-two-sum-2026-06-01T14-32-08Z',
      ],
    });

    const listCallsBefore = state.adapterListSpy.mock.calls.length;

    // Second call: idempotency check (predicate clause 5) returns false →
    // orchestrator skips Step 3 entirely; pre-existence check NEVER fires.
    const r2 = await migrateLegacyFenceIfNeeded(app, file, { autoMigrateOnOpen: true });
    expect(r2).toBe(false);

    // Still only one backup write across both calls.
    expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    // Pre-existence check was NOT called on the second invocation
    // (idempotency short-circuited first).
    expect(state.adapterListSpy.mock.calls.length).toBe(listCallsBefore);
  });
});
