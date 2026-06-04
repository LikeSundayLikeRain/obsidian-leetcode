// Phase 21 Plan 21-04 Task 1 — runMigrationBackupGc unit tests.
//
// Eight tests cover MIGRATE-05 happy path + boundary cases + T-21-gc strict
// regex + Pitfall 4 first-install safety + Pitfall 5 TTL math direction +
// silent-on-failure under partial rmdir failures.
//
// Mocks Obsidian via tests/helpers/obsidian-stub. Builds a minimal App shim
// with a fully-spied `vault.adapter`. Date.now is mocked deterministically
// via vi.useFakeTimers + vi.setSystemTime so the TTL boundary is testable
// without flake.

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  runMigrationBackupGc,
  BACKUP_FOLDER_RE,
  __resetGcRunningForTesting,
} from '../../src/widget/migrationBackupGc';
import { logger } from '../../src/shared/logger';

// ───────────────────────────────────────────────────────────────────────────
// Mock-vault adapter shim. Per PATTERNS §"Mock-vault adapter shim" lines 583-594.
// ───────────────────────────────────────────────────────────────────────────

interface MockAdapter {
  list: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
}

interface MockApp {
  vault: { configDir: string; adapter: MockAdapter };
}

function makeApp(opts: {
  listImpl?: () => Promise<{ files: string[]; folders: string[] }>;
  rmdirImpl?: (path: string, recursive: boolean) => Promise<void>;
}): MockApp {
  const adapter: MockAdapter = {
    list: vi.fn(opts.listImpl ?? (async () => ({ files: [], folders: [] }))),
    rmdir: vi.fn(opts.rmdirImpl ?? (async () => {})),
  };
  // configDir mirrors Obsidian's default — production code builds the
  // backup root as `${vault.configDir}/plugins/obsidian-leetcode`, which
  // resolves to the literal `.obsidian/...` paths the BASE/BASE_PREFIX
  // fixtures expect.
  return { vault: { configDir: '.obsidian', adapter } };
}

// eslint-disable-next-line obsidianmd/hardcoded-config-path -- this is the literal output path the production code is expected to produce when configDir='.obsidian' (the default mocked above); not a runtime path-construction site.
const BASE = '.obsidian/plugins/obsidian-leetcode';
const BASE_PREFIX = `${BASE}/`;

/** Build a sanitized-ISO suffix at `daysAgo` days before the current mocked
 *  `Date.now()`. Mirrors `buildBackupPaths` in fenceMigrator.ts: replaces
 *  `:` with `-` and strips milliseconds (so the regex matches `\d{2}-\d{2}-
 *  \d{2}Z`, not `\d{2}-\d{2}-\d{2}\.\d{3}Z`). */
function isoSuffixDaysAgo(daysAgo: number): string {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return ts.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

function backupFolderPath(slug: string, daysAgo: number): string {
  return `${BASE_PREFIX}migration-backup-${slug}-${isoSuffixDaysAgo(daysAgo)}`;
}

// ───────────────────────────────────────────────────────────────────────────
// describe('runMigrationBackupGc — MIGRATE-05 cleanup contract').
// ───────────────────────────────────────────────────────────────────────────

describe('runMigrationBackupGc — MIGRATE-05 cleanup contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    // Plan 21-06 WR-05 — reset module-level gcRunning lock between tests for
    // hermeticity. The lock is module-scoped, so a test that holds it open
    // (e.g. WR-05-fix Test A simulating a concurrent in-flight call) must
    // not bleed into the next test.
    __resetGcRunningForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetGcRunningForTesting();
  });

  it('Test 1 (MIGRATE-05 happy path) — deletes 62-day-old, keeps 2-day-old', async () => {
    const oldFolder = backupFolderPath('two-sum', 62);
    const freshFolder = backupFolderPath('reverse-string', 2);
    const app = makeApp({
      listImpl: async () => ({
        files: [],
        folders: [oldFolder, freshFolder],
      }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.list).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.list).toHaveBeenCalledWith(BASE);
    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.rmdir).toHaveBeenCalledWith(oldFolder, true);
    // Fresh folder NOT touched.
    expect(
      app.vault.adapter.rmdir.mock.calls.some((c) => c[0] === freshFolder),
    ).toBe(false);
  });

  it('Test 2 (MIGRATE-05 TTL boundary) — 29.96-day-old folder REMAINS', async () => {
    // 2026-06-01T00:00:00Z minus ~29.96 days = 2026-05-02T01:00:00Z
    const folderFull = `${BASE_PREFIX}migration-backup-test-2-2026-05-02T01-00-00Z`;
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).not.toHaveBeenCalled();
  });

  it('Test 3 (MIGRATE-05 TTL boundary) — 31-day-old folder DELETED', async () => {
    // 2026-06-01T00:00:00Z minus exactly 31 days = 2026-05-01T00:00:00Z
    const folderFull = `${BASE_PREFIX}migration-backup-test-3-2026-05-01T00-00-00Z`;
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.rmdir).toHaveBeenCalledWith(folderFull, true);
  });

  it('Test 4 (MIGRATE-05 + Pitfall 4) — adapter.list rejection on first-install resolves silently', async () => {
    // ENOENT-like rejection — plugin folder does not yet exist.
    const app = makeApp({
      listImpl: async () => {
        throw new Error('ENOENT: no such file or directory');
      },
    });

    // Should resolve, NOT throw.
    await expect(runMigrationBackupGc(app as never)).resolves.toBeUndefined();
    expect(app.vault.adapter.rmdir).not.toHaveBeenCalled();
  });

  it('Test 5 (MIGRATE-05 + T-21-gc) — strict regex rejects non-backup folders', async () => {
    // The `data` folder under the plugin dir holds settings — never a
    // backup. The malformed entry `migration-backup-malformed` lacks the
    // strict ISO suffix.
    const app = makeApp({
      listImpl: async () => ({
        files: [],
        folders: [
          `${BASE_PREFIX}data`,
          `${BASE_PREFIX}migration-backup-malformed`,
          `${BASE_PREFIX}cache`,
        ],
      }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).not.toHaveBeenCalled();
  });

  it('Test 6 (MIGRATE-05) — malformed ISO suffix folder is skipped', async () => {
    // Body content of the folder name has the slug-like prefix but the
    // tail is not the strict ISO shape; regex rejects.
    const app = makeApp({
      listImpl: async () => ({
        files: [],
        folders: [
          `${BASE_PREFIX}migration-backup-test-3-not-an-iso-Z`,
          `${BASE_PREFIX}migration-backup-foo-2026-06-01`, // no time portion
        ],
      }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).not.toHaveBeenCalled();
  });

  it('Test 7 (MIGRATE-05 + Pattern S-05) — adapter.rmdir rejection swallowed silently', async () => {
    const oldFolder = backupFolderPath('two-sum', 90);
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [oldFolder] }),
      rmdirImpl: async () => {
        throw new Error('EPERM: operation not permitted');
      },
    });

    // Resolves cleanly even when rmdir throws.
    await expect(runMigrationBackupGc(app as never)).resolves.toBeUndefined();
    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(1);
  });

  it('Test 8 (MIGRATE-05) — multiple folders, partial deletion of expired only', async () => {
    const expired1 = backupFolderPath('p1', 35);
    const expired2 = backupFolderPath('p2', 60);
    const expired3 = backupFolderPath('p3', 100);
    const fresh1 = backupFolderPath('p4', 5);
    const fresh2 = backupFolderPath('p5', 15);

    const app = makeApp({
      listImpl: async () => ({
        files: [],
        folders: [expired1, fresh1, expired2, fresh2, expired3],
      }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(3);
    const deletedPaths = app.vault.adapter.rmdir.mock.calls.map((c) => c[0]);
    expect(deletedPaths).toEqual(
      expect.arrayContaining([expired1, expired2, expired3]),
    );
    expect(deletedPaths).not.toContain(fresh1);
    expect(deletedPaths).not.toContain(fresh2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Plan 21-06 CR-03 — tightened BACKUP_FOLDER_RE to LC-slug shape
  //   /^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/
  // Slug: starts with [a-z0-9], body [a-z0-9-]*, ends with [a-z0-9].
  // Multi-segment slugs (foo-bar-baz) accepted; non-LC-shape (uppercase,
  // mixed-case, single-char, leading/trailing hyphen) rejected.
  // ─────────────────────────────────────────────────────────────────────────

  it('CR-03-fix Test A — multi-segment slug (foo-bar-baz) matches and is deleted', async () => {
    // Sanity: regex shape inspection.
    expect(
      BACKUP_FOLDER_RE.test('migration-backup-two-sum-2026-01-01T00-00-00Z'),
    ).toBe(true);
    expect(
      BACKUP_FOLDER_RE.test(
        'migration-backup-foo-bar-baz-2026-01-01T12-00-00Z',
      ),
    ).toBe(true);

    const folderFull = `${BASE_PREFIX}migration-backup-foo-bar-baz-2026-01-01T12-00-00Z`;
    // 2026-12-01 is much more than 30 days after 2026-01-01.
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.rmdir).toHaveBeenCalledWith(folderFull, true);
    const deletedPaths = app.vault.adapter.rmdir.mock.calls.map((c) => c[0]);
    expect(deletedPaths.some((p) => String(p).includes('foo-bar-baz'))).toBe(
      true,
    );
  });

  it('CR-03-fix Test B — uppercase slug rejected (migration-backup-FOO-...)', async () => {
    expect(
      BACKUP_FOLDER_RE.test('migration-backup-FOO-2026-01-01T00-00-00Z'),
    ).toBe(false);
    const folderFull = `${BASE_PREFIX}migration-backup-FOO-2026-01-01T00-00-00Z`;
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(0);
  });

  it('CR-03-fix Test C — mixed-case slug rejected (migration-backup-Test-...)', async () => {
    expect(
      BACKUP_FOLDER_RE.test('migration-backup-Test-2026-01-01T00-00-00Z'),
    ).toBe(false);
    const folderFull = `${BASE_PREFIX}migration-backup-Test-2026-01-01T00-00-00Z`;
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(0);
  });

  it('CR-03-fix Test D — single-char slug rejected (migration-backup-a-...)', async () => {
    expect(
      BACKUP_FOLDER_RE.test('migration-backup-a-2026-01-01T00-00-00Z'),
    ).toBe(false);
    const folderFull = `${BASE_PREFIX}migration-backup-a-2026-01-01T00-00-00Z`;
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(0);
  });

  it('CR-03-fix Test E — leading-hyphen slug rejected', async () => {
    expect(
      BACKUP_FOLDER_RE.test(
        'migration-backup--leading-hyphen-2026-01-01T00-00-00Z',
      ),
    ).toBe(false);
    const folderFull = `${BASE_PREFIX}migration-backup--leading-hyphen-2026-01-01T00-00-00Z`;
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(0);
  });

  it('CR-03-fix Test F — trailing-hyphen slug rejected', async () => {
    expect(
      BACKUP_FOLDER_RE.test(
        'migration-backup-trailing-hyphen--2026-01-01T00-00-00Z',
      ),
    ).toBe(false);
    const folderFull = `${BASE_PREFIX}migration-backup-trailing-hyphen--2026-01-01T00-00-00Z`;
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [folderFull] }),
    });

    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.rmdir).toHaveBeenCalledTimes(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Plan 21-06 WR-05 — module-level gcRunning concurrency lock.
  //   - Entry guard short-circuits second concurrent call at debug level.
  //   - finally resets the lock so transient errors don't permanently
  //     disable the GC.
  //   - Lock is module-scoped (one in-flight sweep per plugin lifetime
  //     is sufficient).
  // ─────────────────────────────────────────────────────────────────────────

  it('WR-05-fix Test A — concurrent invocation skipped at lock', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');

    // First call: adapter.list returns a slow promise (never resolves until
    // we manually resolve it) — the call stays "in flight" while we issue
    // the second.
    let slowResolve: ((value: { files: string[]; folders: string[] }) => void) | undefined;
    const slowPromise = new Promise<{ files: string[]; folders: string[] }>(
      (resolve) => {
        slowResolve = resolve;
      },
    );
    const app1 = makeApp({
      listImpl: () => slowPromise,
    });

    // Kick off the first call (don't await — let it stall on the slow list).
    const inFlight = runMigrationBackupGc(app1 as never);

    // Now invoke a second call concurrently with a different App.
    const app2 = makeApp({
      listImpl: async () => ({ files: [], folders: [] }),
    });
    await runMigrationBackupGc(app2 as never);

    // app2's adapter.list MUST NOT have been called — second call short-
    // circuited at the lock.
    expect(app2.vault.adapter.list).not.toHaveBeenCalled();

    // Debug log records the skip. Match the message substring.
    const skippedLog = debugSpy.mock.calls.some((c) =>
      String(c[0] ?? '').includes('skipping concurrent invocation'),
    );
    expect(skippedLog).toBe(true);

    // Cleanup — resolve the slow promise so the in-flight call completes
    // and releases the lock.
    slowResolve?.({ files: [], folders: [] });
    await inFlight;
  });

  it('WR-05-fix Test B — finally resets the lock on success', async () => {
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [] }),
    });

    // First call — completes normally.
    await runMigrationBackupGc(app as never);
    expect(app.vault.adapter.list).toHaveBeenCalledTimes(1);

    // Second call AFTER first completes — lock was reset in finally;
    // the body executes again.
    await runMigrationBackupGc(app as never);
    expect(app.vault.adapter.list).toHaveBeenCalledTimes(2);
  });

  it('WR-05-fix Test C — finally resets the lock on failure path (adapter.list throws)', async () => {
    let throwOnce = true;
    const app = makeApp({
      listImpl: async () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('ENOENT — first install');
        }
        return { files: [], folders: [] };
      },
    });

    // First call — list throws; orchestrator silently returns; finally must
    // reset the lock.
    await expect(runMigrationBackupGc(app as never)).resolves.toBeUndefined();
    expect(app.vault.adapter.list).toHaveBeenCalledTimes(1);

    // Second call AFTER failure — lock should NOT be stuck. Body executes;
    // adapter.list called a second time.
    await runMigrationBackupGc(app as never);
    expect(app.vault.adapter.list).toHaveBeenCalledTimes(2);
  });

  it('WR-05-fix Test D — sequential happy paths each fully execute (lock toggled per-call)', async () => {
    const app = makeApp({
      listImpl: async () => ({ files: [], folders: [] }),
    });

    await runMigrationBackupGc(app as never);
    await runMigrationBackupGc(app as never);
    await runMigrationBackupGc(app as never);

    expect(app.vault.adapter.list).toHaveBeenCalledTimes(3);
  });
});
