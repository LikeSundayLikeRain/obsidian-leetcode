// tests/widget/legacyFenceBanner.test.ts
//
// Phase 21 Plan 21-02 Task 2 — legacyFenceBanner unit tests (DOM render +
// click handler dispatch + byte-exact source preservation + no-innerHTML
// guard + three-mode dispatch).
//
// Pattern S-07 mirror — DOM construction via host.createEl with text option;
// happy-dom fallback path uses document.createElement + textContent. Test
// file constructs a mock TFile + mock App + mock plugin, then renders the
// banner into a host div and asserts the resulting tree shape.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// vi.mock the migrator so the click handler's dispatch can be observed
// without actually performing vault writes. The real migrator is exercised
// by tests/widget/fenceMigrator.test.ts.
const migrateSpy = vi.fn(async () => true);
vi.mock('../../src/widget/fenceMigrator', () => ({
  migrateLegacyFenceIfNeeded: migrateSpy,
}));

import { mountLegacyFenceBanner } from '../../src/widget/legacyFenceBanner';

interface MockPlugin {
  app: { vault: unknown; metadataCache: unknown };
  settings: {
    getDefaultLanguage?(): string;
  };
}

function makePlugin(): MockPlugin {
  return {
    app: { vault: {}, metadataCache: {} },
    settings: {
      getDefaultLanguage: () => 'python3',
    },
  };
}

function makeFile() {
  return { path: 'LeetCode/two-sum.md', name: 'two-sum.md', extension: 'md' };
}

describe('mountLegacyFenceBanner', () => {
  beforeEach(() => {
    migrateSpy.mockClear();
  });

  it("Test 1: mode='manual-prompt' creates banner with [Migrate now] button + read-only <pre><code>", () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin = makePlugin();
    mountLegacyFenceBanner(
      host,
      'def f(): return 1\n',
      file as never,
      plugin as never,
      'manual-prompt',
    );

    const banner = host.querySelector('.leetcode-migration-banner');
    expect(banner).not.toBeNull();
    expect(banner!.classList.contains('leetcode-migration-banner--manual-prompt')).toBe(true);

    const button = host.querySelector('.leetcode-migration-banner button');
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('Migrate now');

    // Read-only <pre><code> renders the source (byte-exact in Test 4).
    const pre = host.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre!.querySelector('code');
    expect(code).not.toBeNull();
  });

  it("Test 2: clicking [Migrate now] dispatches migrateLegacyFenceIfNeeded with force: true", async () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin = makePlugin();
    mountLegacyFenceBanner(
      host,
      'pass\n',
      file as never,
      plugin as never,
      'manual-prompt',
    );

    const button = host.querySelector('.leetcode-migration-banner button') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();

    // Click handler is async; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(migrateSpy).toHaveBeenCalledTimes(1);
    const args = migrateSpy.mock.calls[0]!;
    // (app, file, opts) — assert force: true and defaultLanguage is threaded.
    expect(args[1]).toBe(file);
    const opts = args[2] as { force?: boolean; defaultLanguage?: string; autoMigrateOnOpen?: boolean };
    expect(opts.force).toBe(true);
    expect(opts.defaultLanguage).toBe('python3');
  });

  it("Test 3: byte-exact source — <code> textContent === input source (whitespace + newlines preserved)", () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin = makePlugin();
    const source = 'def f():\n    return 1\n';
    mountLegacyFenceBanner(host, source, file as never, plugin as never, 'manual-prompt');
    const code = host.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe(source);
  });

  it("Test 4: mode='auto-migrating' renders banner without button + without <pre><code>", () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin = makePlugin();
    mountLegacyFenceBanner(
      host,
      'def f(): return 1\n',
      file as never,
      plugin as never,
      'auto-migrating',
    );

    const banner = host.querySelector('.leetcode-migration-banner');
    expect(banner).not.toBeNull();
    expect(banner!.classList.contains('leetcode-migration-banner--auto-migrating')).toBe(true);
    // Auto-migrating mode: no button (migration is in flight).
    const button = host.querySelector('.leetcode-migration-banner button');
    expect(button).toBeNull();
    // No read-only legacy display in auto-migrating mode.
    const pre = host.querySelector('pre');
    expect(pre).toBeNull();
    // Banner copy reflects in-flight state.
    const copy = host.querySelector('.leetcode-migration-banner__copy');
    expect(copy).not.toBeNull();
    expect(copy!.textContent).toBe('Migrating note to v1.3 format...');
  });

  it("Test 5: mode='read-only-legacy' renders <pre><code> only, no banner", () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin = makePlugin();
    mountLegacyFenceBanner(
      host,
      'pass\n',
      file as never,
      plugin as never,
      'read-only-legacy',
    );
    // No banner element.
    const banner = host.querySelector('.leetcode-migration-banner');
    expect(banner).toBeNull();
    // <pre><code> with the source.
    const code = host.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('pass\n');
  });

  it("Test 6: empties host element before mounting (no double-render on re-call)", () => {
    const host = document.createElement('div');
    // Pre-populate host to simulate Obsidian's pre-rendered fence content.
    const stale = document.createElement('span');
    stale.textContent = 'stale';
    host.appendChild(stale);
    expect(host.children.length).toBe(1);

    const file = makeFile();
    const plugin = makePlugin();
    mountLegacyFenceBanner(host, 'pass\n', file as never, plugin as never, 'manual-prompt');

    // Stale child gone; only the banner DOM remains.
    expect(host.querySelector('span')).toBeNull();
  });

  it("Test 7: manual-prompt copy reads 'This note uses the v1.2 format.'", () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin = makePlugin();
    mountLegacyFenceBanner(host, 'pass', file as never, plugin as never, 'manual-prompt');
    const copy = host.querySelector('.leetcode-migration-banner__copy');
    expect(copy).not.toBeNull();
    expect(copy!.textContent).toBe('This note uses the v1.2 format.');
  });

  it("Test 8: defaultLanguage falls back to 'python3' when settings getter is undefined", async () => {
    const host = document.createElement('div');
    const file = makeFile();
    const plugin: MockPlugin = {
      app: { vault: {}, metadataCache: {} },
      settings: {}, // no getDefaultLanguage
    };
    mountLegacyFenceBanner(host, 'pass', file as never, plugin as never, 'manual-prompt');
    const button = host.querySelector('.leetcode-migration-banner button') as HTMLButtonElement | null;
    button!.click();
    await Promise.resolve();
    await Promise.resolve();
    const opts = migrateSpy.mock.calls.at(-1)![2] as { defaultLanguage?: string };
    expect(opts.defaultLanguage).toBe('python3');
  });
});
