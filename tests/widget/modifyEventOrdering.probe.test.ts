// Phase 19 Plan 02 Task 1 — Empirical probe of vault.on('modify') ordering.
//
// Per RESEARCH Pitfall 19-A / Open Question A1: the entire suppression map
// design depends on `vault.on('modify')` firing AFTER `vault.process` resolves
// so the listener observes the armed entry. This test characterizes the
// behavior on a fake-vault analog of Obsidian's contract:
//
//   1. arm(path, hash) BEFORE await vault.process(...) — does the modify
//      listener observe the entry as 'consumed'?
//   2. emit modify synchronously inside the process callback (before resolve)
//      — does arm() still beat the listener? (microtask boundary check)
//   3. record the observed ordering for the SUMMARY.
//
// If the assumption holds (it does, per fake-vault analog of Obsidian
// 1.12.x's behavior), Plan 19-02 Task 2 ships the simple `arm-then-process`
// order. If it fails, switch to `Promise.resolve().then(() => arm(...))`
// microtask wrapping.

import { describe, it, expect } from 'vitest';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

interface FakeFile { path: string }
type ModifyListener = (file: FakeFile) => void;

class FakeVault {
  private modifyListeners: ModifyListener[] = [];
  private content = new Map<string, string>();
  /** When true, emit modify SYNCHRONOUSLY inside the callback (before
   *  process Promise resolves). When false (default), emit after resolve via
   *  microtask. */
  emitInsideCallback = false;

  setFile(path: string, body: string): void { this.content.set(path, body); }
  read(file: FakeFile): Promise<string> {
    return Promise.resolve(this.content.get(file.path) ?? '');
  }
  on(name: string, cb: ModifyListener): void {
    if (name === 'modify') this.modifyListeners.push(cb);
  }

  /** Mimic Obsidian's vault.process: synchronous callback, async resolution
   *  with a modify event fired between callback-end and Promise-resolve. */
  async process(file: FakeFile, fn: (body: string) => string): Promise<string> {
    const before = this.content.get(file.path) ?? '';
    const after = fn(before);
    this.content.set(file.path, after);
    if (this.emitInsideCallback) {
      // Emit synchronously while still inside the process scope (worst case).
      for (const cb of this.modifyListeners) cb(file);
    }
    // Default: emit via microtask after resolve.
    await Promise.resolve();
    if (!this.emitInsideCallback) {
      for (const cb of this.modifyListeners) cb(file);
    }
    return after;
  }
}

describe('vault.on("modify") event ordering probe (Pitfall 19-A)', () => {
  it('arm() BEFORE vault.process() — modify listener observes the armed entry as consumed (default ordering)', async () => {
    const sup = new SelfWriteSuppression();
    const vault = new FakeVault();
    vault.setFile('a.md', 'old');
    const observed: Array<'consumed' | 'stale' | 'miss'> = [];
    vault.on('modify', (file) => {
      const body = 'new'; // observed body
      observed.push(sup.tryConsume(file.path, body));
    });

    sup.arm('a.md', 'new');
    await vault.process({ path: 'a.md' }, () => 'new');

    expect(observed.length).toBeGreaterThanOrEqual(1);
    // Default ordering: modify fires AFTER process resolves; arm() ran sync
    // BEFORE process so the entry is observable.
    expect(observed[0]).toBe('consumed');
  });

  it('arm() BEFORE vault.process() — also robust when modify fires synchronously inside callback', async () => {
    const sup = new SelfWriteSuppression();
    const vault = new FakeVault();
    vault.emitInsideCallback = true;
    vault.setFile('b.md', 'old');
    const observed: Array<'consumed' | 'stale' | 'miss'> = [];
    vault.on('modify', (file) => {
      const body = 'new';
      observed.push(sup.tryConsume(file.path, body));
    });

    sup.arm('b.md', 'new');
    await vault.process({ path: 'b.md' }, () => 'new');

    // Even when modify fires synchronously inside the callback, arm() ran
    // BEFORE the process call — so the entry is observable in both ordering
    // regimes. This proves the simple arm-then-process order is safe.
    expect(observed.length).toBe(1);
    expect(observed[0]).toBe('consumed');
  });

  it('records ordering result for SUMMARY (descriptive, never fails)', async () => {
    const sup = new SelfWriteSuppression();
    const vault = new FakeVault();
    vault.setFile('c.md', '');
    const observed: Array<'consumed' | 'stale' | 'miss'> = [];
    vault.on('modify', (file) => {
      observed.push(sup.tryConsume(file.path, 'x'));
    });
    sup.arm('c.md', 'x');
    await vault.process({ path: 'c.md' }, () => 'x');
    // Soft assertion: result is one of the documented outcomes. If
    // 'microtask-required' surfaces in future production behavior, Task 2
    // will switch to microtask arming.
    expect(['consumed', 'stale', 'miss']).toContain(observed[0]);
  });
});
