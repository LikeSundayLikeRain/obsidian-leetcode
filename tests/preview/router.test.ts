// tests/preview/router.test.ts
// Phase 06 Plan 02 — RED until LeetCodePlugin.routeProblemClick is wired.
// Target: PREVIEW-02 routing seam — the 8-cell decision matrix for
// (intent ∈ {preview, open}) × (opts.force ∈ {undefined, true}) ×
// (setting ∈ {preview, open}).
//
// Decision flow per 06-PLAN <interfaces> + 06-RESEARCH §Example 2:
//   1. intent === 'open'                    → openProblem(slug, status)
//   2. intent === 'preview' && opts.force   → preview path (Notice placeholder)
//   3. intent === 'preview' && setting==='open' → openProblem(slug, status)
//   4. intent === 'preview'                 → preview path (Notice placeholder)
//
// Plan 06-02 ships the placeholder Notice for the preview path. Plan 06-03
// will swap the Notice for `openOrReusePreview(this, slug)`.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every Notice constructor call across the suite. The mocked
// `Notice` class is wired below to push `(message, timeout)` tuples into
// this array; tests reset it in beforeEach. This is the obsidianmd-test
// idiom — vi.mock at module scope, mutate a shared capture array per test.
const noticeCalls: Array<[string, number | undefined]> = [];

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class Notice {
    constructor(message: string, timeout?: number) {
      noticeCalls.push([message, timeout]);
    }
  }
  return { ...actual, Notice };
});

interface RouterCapablePlugin {
  routeProblemClick(
    slug: string,
    status: 'solved' | 'attempted' | 'untouched' | undefined,
    intent: 'preview' | 'open',
    opts?: { force?: boolean },
  ): Promise<void>;
  openProblem(
    slug: string,
    status?: 'solved' | 'attempted' | 'untouched',
  ): Promise<void>;
}

/**
 * Build a minimal LeetCodePlugin instance for routing tests. We construct the
 * class via Object.create + property assignment rather than calling the
 * constructor (the real Plugin constructor needs a live Obsidian app).
 *
 * The router only reads:
 *   - this.openProblem(slug, status) (when intent='open' or setting='open')
 *   - this.settings.getPreviewClickBehavior() (when intent='preview' && !force)
 *   - new Notice(...) (when preview branch — placeholder until Plan 06-03)
 */
async function makeRouterPlugin(opts: {
  setting: 'preview' | 'open';
}): Promise<{
  plugin: RouterCapablePlugin;
  openProblemSpy: ReturnType<typeof vi.fn>;
}> {
  const openProblemSpy = vi.fn(async () => undefined);

  const mod = await import('../../src/main');
  const PluginCtor = mod.default;

  // Build a minimal plugin instance by hand; we never call onload().
  const plugin = Object.create(PluginCtor.prototype) as RouterCapablePlugin;
  (plugin as unknown as { settings: { getPreviewClickBehavior(): 'preview' | 'open' } }).settings = {
    getPreviewClickBehavior: () => opts.setting,
  };
  // Override openProblem on the instance to capture calls. The router
  // calls `this.openProblem(slug, status)` so the spy must sit on the same
  // instance (overrides the prototype method).
  (plugin as unknown as { openProblem: typeof openProblemSpy }).openProblem = openProblemSpy;

  return { plugin, openProblemSpy };
}

describe('LeetCodePlugin.routeProblemClick — decision matrix (Phase 06 PREVIEW-02)', () => {
  beforeEach(() => {
    noticeCalls.length = 0;
  });

  // ─── intent === 'open' branch (always opens, regardless of setting) ───

  it("intent='open' + setting='preview' → openProblem fires (shift-click bypass)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    expect(typeof plugin.routeProblemClick).toBe('function');
    await plugin.routeProblemClick('two-sum', 'untouched', 'open');
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', 'untouched');
    expect(noticeCalls).toHaveLength(0);
  });

  it("intent='open' + setting='open' → openProblem fires (consistent with v1.0)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'open' });
    await plugin.routeProblemClick('two-sum', 'solved', 'open');
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', 'solved');
    expect(noticeCalls).toHaveLength(0);
  });

  it("intent='open' + opts.force=true (any) → openProblem still fires (force has no effect on 'open')", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    await plugin.routeProblemClick('two-sum', 'attempted', 'open', { force: true });
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', 'attempted');
    expect(noticeCalls).toHaveLength(0);
  });

  // ─── intent === 'preview', no force ───

  it("intent='preview' + setting='preview' → preview path (Notice placeholder)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    await plugin.routeProblemClick('two-sum', 'untouched', 'preview');
    expect(openProblemSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(1);
    // Plan 06-02 ships the placeholder; Plan 06-03 swaps it.
    // Plan 06-02 ships sentence-case copy ("plan 06-03"); the substring
    // "06-03" is the swap-site marker that survives any future copy edits.
    expect(noticeCalls[0]?.[0]).toMatch(/06-03/);
  });

  it("intent='preview' + setting='open' → openProblem fires (user opted into v1.0 behavior)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'open' });
    await plugin.routeProblemClick('two-sum', 'solved', 'preview');
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', 'solved');
    expect(noticeCalls).toHaveLength(0);
  });

  // ─── intent === 'preview' WITH opts.force=true (right-click escape; Plan 06-04) ───

  it("intent='preview' + opts.force=true + setting='preview' → preview path (Notice)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    await plugin.routeProblemClick('two-sum', 'untouched', 'preview', { force: true });
    expect(openProblemSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(1);
  });

  it("intent='preview' + opts.force=true + setting='open' → preview path STILL fires (force overrides setting)", async () => {
    // Right-click → Preview must work even when the user has set
    // click-behavior to 'open'. (CONTEXT.md decision A: right-click intent
    // is explicit, not the default click affordance.) Plan 06-04 wires
    // right-click to call routeProblemClick(..., 'preview', { force: true }).
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'open' });
    await plugin.routeProblemClick('two-sum', 'attempted', 'preview', { force: true });
    expect(openProblemSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(1);
  });

  // ─── opts.force=false treated same as undefined ───

  it("intent='preview' + opts.force=false + setting='open' → openProblem fires (force=false is not force)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'open' });
    await plugin.routeProblemClick('two-sum', 'solved', 'preview', { force: false });
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', 'solved');
    expect(noticeCalls).toHaveLength(0);
  });

  // ─── status pass-through ───

  it("undefined status passes through to openProblem (preserves GAP-2a contract)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    await plugin.routeProblemClick('two-sum', undefined, 'open');
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', undefined);
  });
});
