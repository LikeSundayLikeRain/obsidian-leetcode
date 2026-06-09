// tests/preview/router.test.ts
// Phase 06 Plan 03 — REVISED from Plan 06-02. The 8-cell decision matrix is
// unchanged (intent × opts.force × setting), but the preview-path branch now
// resolves to `openOrReusePreview(plugin, slug)` instead of the placeholder
// Notice that Plan 06-02 shipped. Tests assert on the openOrReusePreview
// spy where they previously asserted on noticeCalls; the matrix shape stays
// identical.
//
// Decision flow per 06-PLAN <interfaces> + 06-RESEARCH §Example 2:
//   1. intent === 'open'                    → openProblem(slug, status)
//   2. intent === 'preview' && opts.force   → openOrReusePreview(plugin, slug)
//   3. intent === 'preview' && setting==='open' → openProblem(slug, status)
//   4. intent === 'preview'                 → openOrReusePreview(plugin, slug)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every openOrReusePreview call. vi.mock the preview-router module
// so the spy intercepts the call regardless of how main.ts imported it
// (static import binding is replaced at the module-graph level).
const previewCalls: Array<[unknown, string]> = [];
vi.mock('../../src/preview/previewRouter', () => ({
  openOrReusePreview: vi.fn(async (plugin: unknown, slug: string) => {
    previewCalls.push([plugin, slug]);
  }),
}));

// Capture Notice constructor calls — kept around so any leftover Notice
// surface (e.g. an error path) is still visible to assertions.
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
  (plugin as unknown as { lcSettings: { getPreviewClickBehavior(): 'preview' | 'open' } }).lcSettings = {
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
    previewCalls.length = 0;
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

  it("intent='preview' + setting='preview' → openOrReusePreview fires", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    await plugin.routeProblemClick('two-sum', 'untouched', 'preview');
    expect(openProblemSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(0);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0]?.[1]).toBe('two-sum');
  });

  it("intent='preview' + setting='open' → openProblem fires (user opted into v1.0 behavior)", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'open' });
    await plugin.routeProblemClick('two-sum', 'solved', 'preview');
    expect(openProblemSpy).toHaveBeenCalledWith('two-sum', 'solved');
    expect(noticeCalls).toHaveLength(0);
  });

  // ─── intent === 'preview' WITH opts.force=true (right-click escape; Plan 06-04) ───

  it("intent='preview' + opts.force=true + setting='preview' → openOrReusePreview fires", async () => {
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'preview' });
    await plugin.routeProblemClick('two-sum', 'untouched', 'preview', { force: true });
    expect(openProblemSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(0);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0]?.[1]).toBe('two-sum');
  });

  it("intent='preview' + opts.force=true + setting='open' → openOrReusePreview STILL fires (force overrides setting)", async () => {
    // Right-click → Preview must work even when the user has set
    // click-behavior to 'open'. (CONTEXT.md decision A: right-click intent
    // is explicit, not the default click affordance.) Plan 06-03 / 06-04
    // wire right-click to call routeProblemClick(..., 'preview', { force: true }).
    const { plugin, openProblemSpy } = await makeRouterPlugin({ setting: 'open' });
    await plugin.routeProblemClick('two-sum', 'attempted', 'preview', { force: true });
    expect(openProblemSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(0);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0]?.[1]).toBe('two-sum');
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
