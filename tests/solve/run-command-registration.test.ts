// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-07 D-01 — the two Phase 3 commands (`run-sample` +
// `run-custom`) are deleted and replaced with a single `run` command.
// Turns green when Plan 04 ships the unified Run command registration
// helper. Chosen import path: `../../src/solve/runCommandRegistration`
// — Plan 04 may instead inline this directly in main.ts; in that case
// Plan 04 should create a thin `registerRunCommand(plugin, deps)` helper
// so this test remains a unit test rather than a main.ts integration test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakePlugin } from './mocks/fakeWorkspace';
import { makeFakeSettingsStore } from './mocks/fakeSettingsStore';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

describe('Phase 5 Run command registration (D-01)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('registers exactly one command with id="run"', async () => {
    // Target helper path (planner-chosen). If Plan 04 lands the wiring
    // inline in main.ts instead, extract a small helper so this test has a
    // focused unit to drive.
    const mod = (await import('../../src/solve/runCommandRegistration')) as unknown as {
      registerRunCommand?: (plugin: unknown, deps: unknown) => void;
    };
    expect(typeof mod.registerRunCommand).toBe('function');

    const plugin = createFakePlugin();
    const settings = makeFakeSettingsStore();
    mod.registerRunCommand!(plugin, { settings });

    const calls = plugin.addCommand.mock.calls;
    const runCalls = calls.filter((c) => {
      const spec = c[0] as { id?: unknown };
      return spec?.id === 'run';
    });
    expect(runCalls).toHaveLength(1);
  });

  it('does NOT register the deleted Phase 3 commands (run-sample, run-custom)', async () => {
    const mod = (await import('../../src/solve/runCommandRegistration')) as unknown as {
      registerRunCommand?: (plugin: unknown, deps: unknown) => void;
    };
    expect(typeof mod.registerRunCommand).toBe('function');

    const plugin = createFakePlugin();
    const settings = makeFakeSettingsStore();
    mod.registerRunCommand!(plugin, { settings });

    const calls = plugin.addCommand.mock.calls;
    const staleIds = calls
      .map((c) => (c[0] as { id?: unknown })?.id)
      .filter((id): id is string => typeof id === 'string');
    expect(staleIds).not.toContain('run-sample');
    expect(staleIds).not.toContain('run-custom');
  });
});
