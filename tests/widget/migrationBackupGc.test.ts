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

import { runMigrationBackupGc } from '../../src/widget/migrationBackupGc';

// ───────────────────────────────────────────────────────────────────────────
// Mock-vault adapter shim. Per PATTERNS §"Mock-vault adapter shim" lines 583-594.
// ───────────────────────────────────────────────────────────────────────────

interface MockAdapter {
  list: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
}

interface MockApp {
  vault: { adapter: MockAdapter };
}

function makeApp(opts: {
  listImpl?: () => Promise<{ files: string[]; folders: string[] }>;
  rmdirImpl?: (path: string, recursive: boolean) => Promise<void>;
}): MockApp {
  const adapter: MockAdapter = {
    list: vi.fn(opts.listImpl ?? (async () => ({ files: [], folders: [] }))),
    rmdir: vi.fn(opts.rmdirImpl ?? (async () => {})),
  };
  return { vault: { adapter } };
}

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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
});
