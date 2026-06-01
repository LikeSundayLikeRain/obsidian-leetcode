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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// vi.mock the migrator so the click handler's dispatch can be observed
// without actually performing vault writes. The real migrator is exercised
// by tests/widget/fenceMigrator.test.ts. vi.hoisted is required because
// vi.mock factories are hoisted above import statements; declaring the spy
// inside hoisted() lets the factory reference it without TDZ.
const { migrateSpy } = vi.hoisted(() => ({
  migrateSpy: vi.fn(async () => true),
}));
vi.mock('../../src/widget/fenceMigrator', () => ({
  migrateLegacyFenceIfNeeded: migrateSpy,
}));

import { mountLegacyFenceBanner } from '../../src/widget/legacyFenceBanner';
import { logger } from '../../src/shared/logger';

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
    const args = migrateSpy.mock.calls[0] as unknown as unknown[];
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
    const lastCall = migrateSpy.mock.calls.at(-1) as unknown as unknown[] | undefined;
    expect(lastCall).toBeDefined();
    const opts = lastCall![2] as { defaultLanguage?: string };
    expect(opts.defaultLanguage).toBe('python3');
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-07 Task 1 — CR-04 closure. Defensive DOM in renderReadOnly +
  // top-level try/catch in mountLegacyFenceBanner. Banner DOM construction
  // never throws into the editor render cycle, even on synthetic
  // non-Obsidian hosts (test runners, iframes, popup windows where
  // Obsidian's HTMLElement.prototype patches haven't fired).
  // ───────────────────────────────────────────────────────────────────────
  describe('CR-04-fix — defensive DOM construction', () => {
    let debugSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    });
    afterEach(() => {
      debugSpy.mockRestore();
    });

    it("CR-04-fix Test A — pre lacks createEl, source preserved as textContent (renderReadOnly defensive path)", () => {
      const file = makeFile();
      const plugin = makePlugin();
      // Construct a host whose createEl returns a pre element with NO
      // .createEl helper. The obsidian-stub installs createEl on
      // HTMLElement.prototype globally, so we explicitly delete it on the
      // returned pre to simulate non-Obsidian environments (iframes /
      // popup windows / test envs where the prototype patch hasn't fired).
      const host = document.createElement('div');
      const createElStub = vi.fn((tag: string, opts?: { text?: string; cls?: string }) => {
        const el = document.createElement(tag);
        if (opts?.text !== undefined) el.textContent = opts.text;
        if (opts?.cls !== undefined) {
          for (const c of opts.cls.split(/\s+/).filter(Boolean)) el.classList.add(c);
        }
        host.appendChild(el);
        // Hide the prototype createEl on this specific element by defining
        // an own-property setter to undefined (jsdom inherits createEl from
        // the obsidian-stub's prototype patch otherwise). The defensive code
        // sees `pre.createEl` as undefined and takes the textContent path.
        Object.defineProperty(el, 'createEl', {
          configurable: true,
          value: undefined,
        });
        return el;
      });
      (host as unknown as { createEl: typeof createElStub }).createEl = createElStub;

      const source = 'def f():\n    return 1\n';
      expect(() => {
        mountLegacyFenceBanner(
          host,
          source,
          file as never,
          plugin as never,
          'manual-prompt',
        );
      }).not.toThrow();

      // The pre was created via host.createEl, but pre.createEl is undefined,
      // so the defensive fallback ran: pre.textContent = source.
      const pre = host.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre!.textContent).toBe(source);
      // No <code> wrapper because the chained createEl was not callable.
      expect(pre!.querySelector('code')).toBeNull();
    });

    it("CR-04-fix Test B — mountLegacyFenceBanner top-level throw caught + plain-text fallback", () => {
      const file = makeFile();
      const plugin = makePlugin();
      const host = document.createElement('div');
      // Force createEl to throw. Without the top-level try/catch, this
      // propagates into the editor render cycle.
      (host as unknown as { createEl: () => HTMLElement }).createEl = vi
        .fn()
        .mockImplementation(() => {
          throw new TypeError('synthetic banner failure');
        });

      const source = 'fence body';
      expect(() => {
        mountLegacyFenceBanner(
          host,
          source,
          file as never,
          plugin as never,
          'manual-prompt',
        );
      }).not.toThrow();

      // logger.debug was called once with a 'mount failed' message.
      expect(debugSpy).toHaveBeenCalled();
      const messages = (debugSpy.mock.calls as unknown[][])
        .map((call) => String((call[0] as unknown) ?? ''))
        .join(' | ');
      expect(messages).toContain('mount failed');

      // Plain-text fallback: host.textContent = source.
      expect(host.textContent).toBe(source);
    });

    it("CR-04-fix Test C — 'auto-migrating' mode also wrapped in top-level try/catch", () => {
      const file = makeFile();
      const plugin = makePlugin();
      const host = document.createElement('div');
      (host as unknown as { createEl: () => HTMLElement }).createEl = vi
        .fn()
        .mockImplementation(() => {
          throw new TypeError('synthetic auto-migrating failure');
        });

      const source = 'auto body';
      expect(() => {
        mountLegacyFenceBanner(
          host,
          source,
          file as never,
          plugin as never,
          'auto-migrating',
        );
      }).not.toThrow();

      expect(debugSpy).toHaveBeenCalled();
      expect(host.textContent).toBe(source);
    });

    it("CR-04-fix Test D — 'read-only-legacy' mode hits the renderReadOnly defensive path (pre lacks createEl)", () => {
      const file = makeFile();
      const plugin = makePlugin();
      const host = document.createElement('div');
      const createElStub = vi.fn((tag: string) => {
        // Return a stock pre with the prototype createEl explicitly hidden
        // (simulates non-Obsidian environments).
        const el = document.createElement(tag);
        host.appendChild(el);
        Object.defineProperty(el, 'createEl', {
          configurable: true,
          value: undefined,
        });
        return el;
      });
      (host as unknown as { createEl: typeof createElStub }).createEl = createElStub;

      const source = 'read-only legacy body\n';
      expect(() => {
        mountLegacyFenceBanner(
          host,
          source,
          file as never,
          plugin as never,
          'read-only-legacy',
        );
      }).not.toThrow();

      const pre = host.querySelector('pre');
      expect(pre).not.toBeNull();
      // Defensive fallback: pre.textContent = source.
      expect(pre!.textContent).toBe(source);
    });

    it("CR-04-fix Test E — host.textContent setter throws (paranoid catch — nothing escapes)", () => {
      const file = makeFile();
      const plugin = makePlugin();
      // Build a host with both throwing createEl AND throwing textContent
      // setter — degenerate iframe-detached scenario.
      const host = document.createElement('div');
      (host as unknown as { createEl: () => HTMLElement }).createEl = vi
        .fn()
        .mockImplementation(() => {
          throw new TypeError('synthetic createEl failure');
        });
      // Override textContent setter to throw.
      Object.defineProperty(host, 'textContent', {
        configurable: true,
        get() {
          return '';
        },
        set() {
          throw new TypeError('synthetic textContent setter failure');
        },
      });

      expect(() => {
        mountLegacyFenceBanner(
          host,
          'fence body',
          file as never,
          plugin as never,
          'manual-prompt',
        );
      }).not.toThrow();
      // logger.debug was called for the outer mount-failed branch.
      expect(debugSpy).toHaveBeenCalled();
    });
  });
});
