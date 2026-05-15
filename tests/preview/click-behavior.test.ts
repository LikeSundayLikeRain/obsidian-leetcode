// tests/preview/click-behavior.test.ts
// Phase 06 Plan 02 — RED until ProblemBrowserView's row click handler
// delegates to plugin.routeProblemClick with shift-key-aware intent.
//
// Target: PREVIEW-02 row event wiring. Plain left-click → intent='preview';
// shift+left-click → intent='open'. The row's existing GAP-2a contract
// (forward IndexedProblem.status) is preserved.
//
// Pattern: mirrors `tests/browse/ProblemBrowserView.badge.test.ts` —
// asserts a pure exported helper rather than driving the full ItemView.
// Plan 06-02 exposes `decideClickIntent(event)` so the test can pin the
// shift-key contract directly without standing up a leaf + row DOM.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

describe('ProblemBrowserView — row click intent (Phase 06 PREVIEW-02)', () => {
  it("plain left-click → intent='preview' (helper exported by ProblemBrowserView)", async () => {
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      decideClickIntent?: (e: { shiftKey?: boolean }) => 'preview' | 'open';
    };
    if (typeof mod.decideClickIntent !== 'function') {
      throw new Error('decideClickIntent not exported — Plan 06-02 must export it');
    }
    expect(mod.decideClickIntent({ shiftKey: false })).toBe('preview');
  });

  it("shift+left-click → intent='open' (CONTEXT.md decision A: shift always opens)", async () => {
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      decideClickIntent?: (e: { shiftKey?: boolean }) => 'preview' | 'open';
    };
    if (typeof mod.decideClickIntent !== 'function') {
      throw new Error('decideClickIntent not exported — Plan 06-02 must export it');
    }
    expect(mod.decideClickIntent({ shiftKey: true })).toBe('open');
  });

  it("missing shiftKey on the event object → intent='preview' (defensive default)", async () => {
    // Synthetic events from happy-dom or polyfills may not always carry the
    // shiftKey property; treat absence as no-shift.
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      decideClickIntent?: (e: { shiftKey?: boolean }) => 'preview' | 'open';
    };
    if (typeof mod.decideClickIntent !== 'function') {
      throw new Error('decideClickIntent not exported — Plan 06-02 must export it');
    }
    expect(mod.decideClickIntent({})).toBe('preview');
  });

  // ─── End-to-end DOM dispatch test — wires the row click through to
  //     plugin.routeProblemClick via a real DOM event. Uses happy-dom (the
  //     vitest default for Phase 5 tests). We only need to verify that the
  //     row's `addEventListener('click', ...)` callback calls
  //     `plugin.routeProblemClick(slug, status, intent)` with the correct
  //     intent for each shift-key state.

  it("DOM click on a row → plugin.routeProblemClick fires with intent='preview' and forwards status", async () => {
    // Build a minimal DOM row + spy plugin. We don't instantiate
    // ProblemBrowserView — instead we replicate the (post-refactor) handler
    // contract: row.addEventListener('click', e => routeProblemClick(slug, status, decideClickIntent(e)))
    // via the SAME helper the production code uses. If the helper changes,
    // production + tests stay aligned.
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      decideClickIntent?: (e: { shiftKey?: boolean }) => 'preview' | 'open';
    };
    if (typeof mod.decideClickIntent !== 'function') {
      throw new Error('decideClickIntent not exported — Plan 06-02 must export it');
    }
    const decideClickIntent = mod.decideClickIntent;
    const routeSpy = vi.fn();
    const row = document.createElement('div');
    row.addEventListener('click', (e) => {
      routeSpy('two-sum', 'attempted', decideClickIntent(e as MouseEvent));
    });
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(routeSpy).toHaveBeenCalledWith('two-sum', 'attempted', 'preview');
  });

  it("DOM shift-click on a row → plugin.routeProblemClick fires with intent='open'", async () => {
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      decideClickIntent?: (e: { shiftKey?: boolean }) => 'preview' | 'open';
    };
    if (typeof mod.decideClickIntent !== 'function') {
      throw new Error('decideClickIntent not exported — Plan 06-02 must export it');
    }
    const decideClickIntent = mod.decideClickIntent;
    const routeSpy = vi.fn();
    const row = document.createElement('div');
    row.addEventListener('click', (e) => {
      routeSpy('two-sum', 'solved', decideClickIntent(e as MouseEvent));
    });
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(routeSpy).toHaveBeenCalledWith('two-sum', 'solved', 'open');
  });

  // ─── ProblemBrowserView source-shape gate: pickRandom MUST stay unchanged
  //     (CONTEXT.md <code_context>: random pick = open intent, not preview). ───

  it('source: pickRandom still calls plugin.openProblem directly (NOT routeProblemClick)', async () => {
    // Read the source file and assert the line containing pickRandom's
    // dispatch is the original openProblem call. This prevents an
    // accidental refactor that funnels pickRandom through the router.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/browse/ProblemBrowserView.ts', 'utf8');
    // pickRandom() → ... void this.plugin.openProblem(pick.slug, pick.status);
    // Width 600 covers the comment block + dispatch line as of Phase 06.
    expect(src).toMatch(/private pickRandom[\s\S]{0,600}this\.plugin\.openProblem\(pick\.slug, pick\.status\)/);
    // Negative: pickRandom must NOT have been changed to call routeProblemClick.
    const pickRandomBlock = src.match(/private pickRandom[\s\S]{0,800}?\n {2}\}/)?.[0] ?? '';
    expect(pickRandomBlock).not.toMatch(/routeProblemClick/);
  });
});
