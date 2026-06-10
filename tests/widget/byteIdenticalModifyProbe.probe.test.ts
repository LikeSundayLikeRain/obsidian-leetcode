// Wave 3 childDirty Design — Empirical probe for byte-identical vault.process
// modify-event behavior.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE QUESTION
// ─────────────────────────────────────────────────────────────────────────────
// Does vault.on('modify') fire when vault.process writes bytes that match
// what is already on disk (a "byte-identical" write)?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY WAVE 3 childDirty DEPENDS ON THIS
// ─────────────────────────────────────────────────────────────────────────────
// The Wave 3 childDirty refactor uses a safety timer that drains dirty entries
// on the echo of the flush that wrote them. The flow is:
//
//   1. Widget detects local change → sets childDirty = true
//   2. DebouncedWriter.flush() → arm(path, hash) → vault.process(…)
//   3. vault.on('modify') fires → tryConsume(path, hash) → 'consumed'
//      → childDirty = false (entry drained)
//
// IF Obsidian short-circuits byte-identical writes (i.e., suppresses the
// modify event when the new bytes equal the pre-write bytes), step 3 never
// executes for no-op flushes. childDirty entries armed by those flushes
// will sit until the 2-second TTL expires. For correct behavior this is
// merely a 2-second delay in clearing a dirty flag. For behavior that
// depends on the echo being timely (e.g., enabling the next flush only after
// the echo lands), this suppression is a WAVE 3 BLOCKER.
//
// ─────────────────────────────────────────────────────────────────────────────
// OBSIDIAN SOURCE-CODE REALITY (HIGH CONFIDENCE — UNVERIFIED IN PLUGIN CONTEXT)
// ─────────────────────────────────────────────────────────────────────────────
// Obsidian 1.12 source: vault.process internally calls Vault.modify, which
// writes via adapter.write and unconditionally fires the modify event
// regardless of byte equality. However, the team has not directly verified
// this for the v1.3 plugin context. The env-gated probe below is the
// definitive check.
//
// ─────────────────────────────────────────────────────────────────────────────
// PROBE PROTOCOL
// ─────────────────────────────────────────────────────────────────────────────
// 1. Run in CI (fake vault, always passes):
//    npm run test -- tests/widget/byteIdenticalModifyProbe.probe.test.ts
//
// 2. Run in a live Obsidian dev-vault (required before Wave 3 ships):
//    OBSIDIAN_DEV_VAULT_PROBE=1 vitest tests/widget/byteIdenticalModifyProbe.probe.test.ts
//    (or trigger the probe command registered in the plugin under dev mode)
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO INTERPRET RESULTS
// ─────────────────────────────────────────────────────────────────────────────
// REAL-OBSIDIAN PROBE PASSES (modify fires for byte-identical write):
//   → Assumption HOLDS. Ship Wave 3 childDirty design as planned.
//
// REAL-OBSIDIAN PROBE FAILS (modify is suppressed):
//   → CRITICAL / WAVE 3 BLOCKER: redesign childDirty to NOT depend on echo
//     arrival. Use a deterministic post-flush callback instead of waiting on
//     the modify event to drain childDirty. See PITFALLS.md Pitfall 27.
//
// ─────────────────────────────────────────────────────────────────────────────
// SEE ALSO: PITFALLS.md § Pitfall 27
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

// ─────────────────────────────────────────────────────────────────────────────
// FAKE VAULT IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

interface FakeFile { path: string }
type ModifyListener = (file: FakeFile) => void;

/**
 * FakeVaultAlwaysEmits — simulates conforming Obsidian behavior.
 *
 * vault.process writes the bytes and then unconditionally fires the modify
 * event, even when the new bytes are identical to the pre-write bytes.
 * This is what Obsidian SHOULD do per the source-code analysis in the file
 * header, and is the assumption Wave 3 childDirty design depends on.
 */
class FakeVaultAlwaysEmits {
  private readonly modifyListeners: ModifyListener[] = [];
  private readonly content = new Map<string, string>();

  setFile(path: string, body: string): void { this.content.set(path, body); }
  read(file: FakeFile): Promise<string> {
    return Promise.resolve(this.content.get(file.path) ?? '');
  }
  on(name: string, cb: ModifyListener): void {
    if (name === 'modify') this.modifyListeners.push(cb);
  }

  /** Writes the bytes unconditionally, then always fires modify — regardless
   *  of whether the new content equals the pre-write content. */
  async process(file: FakeFile, fn: (body: string) => string): Promise<string> {
    const before = this.content.get(file.path) ?? '';
    const after = fn(before);
    this.content.set(file.path, after);
    // Always emit modify — even for byte-identical writes.
    await Promise.resolve();
    for (const cb of this.modifyListeners) cb(file);
    return after;
  }
}

/**
 * FakeVaultSuppressesIdentical — simulates the failure-mode behavior.
 *
 * vault.process writes the bytes but only fires the modify event if the new
 * bytes differ from the pre-write bytes. This simulates what would happen if
 * Obsidian implemented "skip modify for no-op writes" as an optimization.
 *
 * Wave 3 childDirty design BREAKS under this behavior — see file header for
 * full explanation and PITFALLS.md Pitfall 27 for remediation protocol.
 */
class FakeVaultSuppressesIdentical {
  private readonly modifyListeners: ModifyListener[] = [];
  private readonly content = new Map<string, string>();

  setFile(path: string, body: string): void { this.content.set(path, body); }
  read(file: FakeFile): Promise<string> {
    return Promise.resolve(this.content.get(file.path) ?? '');
  }
  on(name: string, cb: ModifyListener): void {
    if (name === 'modify') this.modifyListeners.push(cb);
  }

  /** Writes the bytes but SUPPRESSES modify when new bytes === pre-write bytes. */
  async process(file: FakeFile, fn: (body: string) => string): Promise<string> {
    const before = this.content.get(file.path) ?? '';
    const after = fn(before);
    this.content.set(file.path, after);
    await Promise.resolve();
    // Suppress modify for byte-identical writes — this is the failure mode.
    if (after !== before) {
      for (const cb of this.modifyListeners) cb(file);
    }
    return after;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIBE BLOCK 1: CONTRACT TEST — always runs, fake vault
// ─────────────────────────────────────────────────────────────────────────────

describe('CONTRACT TEST — assumption documentation (always runs, fake vault)', () => {
  it('CONTRACT: vault.on(modify) MUST fire when vault.process writes byte-identical content (Wave 3 childDirty assumption)', async () => {
    // This test uses FakeVaultAlwaysEmits — a vault that conforms to the
    // assumption Wave 3 requires. The test documents the contract:
    //
    //   "vault.on('modify') MUST fire after vault.process even when the
    //    written bytes are identical to the pre-write bytes."
    //
    // Against a conforming vault (FakeVaultAlwaysEmits) this test PASSES.
    //
    // If Obsidian ever introduces byte-identical write suppression, the
    // real-Obsidian probe below will catch it — this contract test will
    // not because the fake vault's behavior is hardcoded to always emit.

    const sup = new SelfWriteSuppression();
    const vault = new FakeVaultAlwaysEmits();
    const initialContent = 'def two_sum(nums, target):\n    pass\n';
    vault.setFile('1-two-sum.md', initialContent);

    const modifyCallCount: number[] = [];
    const observedResults: Array<'consumed' | 'stale' | 'miss'> = [];

    vault.on('modify', (file) => {
      modifyCallCount.push(Date.now());
      // Simulate the modify handler's tryConsume call with the armed hash.
      observedResults.push(sup.tryConsume(file.path, initialContent));
    });

    // Arm BEFORE vault.process — the canonical Wave 3 arm-then-process order.
    sup.arm('1-two-sum.md', initialContent);

    // Write byte-identical content — this is the case under test.
    await vault.process({ path: '1-two-sum.md' }, (body) => body);

    // Assertion: modify fired exactly once even though bytes were identical.
    expect(modifyCallCount.length).toBe(1);

    // Assertion: the modify listener observed 'consumed' — the armed entry
    // was found and matched. This is what Wave 3 childDirty drain depends on.
    expect(observedResults[0]).toBe('consumed');
  });

  it('ANTI-CONTRACT: if Obsidian suppresses byte-identical modify events, childDirty drain breaks — Wave 3 BLOCKER', async () => {
    // This test uses FakeVaultSuppressesIdentical to demonstrate the failure
    // mode Wave 3 MUST NOT encounter in the real Obsidian environment.
    //
    // Scenario:
    //   1. Widget is in the middle of a typing burst.
    //   2. DebouncedWriter.flush() writes byte-identical content (e.g., user
    //      typed characters and then undid them — resulting in the same body
    //      as what is already on disk).
    //   3. arm(path, hash) is called before vault.process.
    //   4. vault.process writes the bytes. But Obsidian suppresses the modify
    //      event because new bytes == pre-write bytes.
    //   5. The suppress-on-byte-equal vault never fires modify.
    //   6. tryConsume is never called. The suppression entry with the armed
    //      hash sits in the map until its 2s TTL expires.
    //   7. childDirty is never drained via the echo handshake.
    //      The safety timer may re-fire, causing an unnecessary additional
    //      flush, or childDirty state becomes stale.
    //
    // The test ASSERTS (via the empty observedResults array) that this failure
    // mode is real if Obsidian behaves like FakeVaultSuppressesIdentical.
    //
    // If this test EVER runs against a real Obsidian instance (env-gated) and
    // the observedResults assertion FAILS (i.e., modify was unexpectedly
    // consumed), that means Obsidian does NOT suppress byte-identical writes —
    // which is the good outcome. The test is designed so a PASS here means
    // "the failure mode is confirmed as a real risk" (fake vault suppresses),
    // and the env-gated real-Obsidian test below is the definitive verdict.

    const sup = new SelfWriteSuppression();
    const vault = new FakeVaultSuppressesIdentical();
    const initialContent = 'def two_sum(nums, target):\n    pass\n';
    vault.setFile('1-two-sum.md', initialContent);

    const observedResults: Array<'consumed' | 'stale' | 'miss'> = [];

    vault.on('modify', (file) => {
      observedResults.push(sup.tryConsume(file.path, initialContent));
    });

    // Arm BEFORE vault.process.
    sup.arm('1-two-sum.md', initialContent);

    // Write byte-identical content through the suppressing vault.
    await vault.process({ path: '1-two-sum.md' }, (body) => body);

    // ANTI-CONTRACT ASSERTION: the modify listener was NEVER called because
    // FakeVaultSuppressesIdentical suppressed the event.
    // observedResults is empty — the suppression entry was never consumed.
    expect(observedResults).toHaveLength(0);

    // The armed entry is still sitting in the suppression map (not consumed).
    // In real Wave 3 code this means childDirty was never cleared via echo.
    // The 2s TTL will eventually clean up the suppression entry, but the
    // childDirty clearing was delayed — and any logic depending on timely
    // echo arrival is broken.
    expect(sup.size).toBe(1); // entry still present

    // WAVE 3 BLOCKER WARNING — surfaces in CI output if this test ever fails
    // (which would mean the fake vault unexpectedly emitted, contradicting
    // FakeVaultSuppressesIdentical's contract):
    //
    // If you see an UNEXPECTED FAILURE of this test, read PITFALLS.md
    // Pitfall 27 and re-evaluate whether FakeVaultSuppressesIdentical is
    // implemented correctly.
    //
    // If the REAL-OBSIDIAN probe (below) FAILS its consumed assertion,
    // Wave 3 childDirty design is INVALID — see PITFALLS.md Pitfall 27.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIBE BLOCK 2: ENV-GATED REAL-OBSIDIAN PROBE — skipped by default
// ─────────────────────────────────────────────────────────────────────────────

describe('ENV-GATED REAL-OBSIDIAN PROBE — skipped by default', () => {
  // HOW TO RUN THIS TEST IN A LIVE OBSIDIAN DEV-VAULT:
  //
  // This test CANNOT be run under happy-dom + vitest because it requires a
  // live Obsidian Vault instance with a real file-system adapter. The
  // env var OBSIDIAN_DEV_VAULT_PROBE=1 gates the test so it is skipped in CI
  // and all normal test runs.
  //
  // MAINTAINER PROTOCOL (required before Wave 3 ships):
  //
  //   Option A — CLI (if you have a plugin-dev harness that injects globals):
  //     1. Build the plugin with dev mode on.
  //     2. Open a dev vault in Obsidian.
  //     3. In the dev vault's console or a debug command, set
  //        window.__OBSIDIAN_DEV_VAULT_PROBE = true.
  //     4. Trigger the plugin's registered "run byte-identical probe" command
  //        (see the TODO in main.ts for the probe command registration).
  //     5. Observe the console output: "PROBE RESULT: modify fired" or
  //        "PROBE RESULT: modify suppressed — WAVE 3 BLOCKER".
  //
  //   Option B — manual verification:
  //     1. In a dev vault, register a vault.on('modify') listener that logs
  //        every modify event for a test file.
  //     2. Call vault.process on that test file with a function that returns
  //        the same bytes already on disk.
  //     3. Check the console: did the modify listener log fire?
  //     4. Record the result in PITFALLS.md Pitfall 27.
  //
  // INTERPRETATION:
  //   modify fired  → assumption HOLDS; ship Wave 3 as planned
  //   modify silent → WAVE 3 BLOCKER; redesign childDirty (see Pitfall 27)

  it.skipIf(!process.env['OBSIDIAN_DEV_VAULT_PROBE'])(
    'REAL-OBSIDIAN PROBE: vault.on(modify) fires for byte-identical vault.process writes (OBSIDIAN_DEV_VAULT_PROBE=1 required)',
    async () => {
      // This test is NOT runnable under happy-dom + vitest. It is a TODO
      // marker and contract documentation for the maintainer's manual
      // dev-vault verification session.
      //
      // When OBSIDIAN_DEV_VAULT_PROBE=1 is set, this test will run and
      // immediately throw the protocol stub below — replace the stub with
      // actual real-Obsidian glue code when the dev-vault harness is ready.
      //
      // The test exists because:
      //   (a) it documents the required manual verification step in a
      //       machine-readable, searchable location (the test suite);
      //   (b) it will fail loudly in CI if someone accidentally sets the
      //       env var without providing the real-Obsidian harness;
      //   (c) it serves as the anchor for the dev-vault verification
      //       protocol described in PITFALLS.md Pitfall 27.

      // ── REAL-OBSIDIAN HARNESS STUB ─────────────────────────────────────
      // Replace this throw with real harness code when available:
      //
      //   const vault = (global as any).__obsidianApp?.vault;
      //   if (!vault) throw new Error('real-Obsidian vault not injected');
      //   const testFile = await vault.create('__probe-byte-identical.md', 'probe-content');
      //   const sup = new SelfWriteSuppression();
      //   const results: string[] = [];
      //   const unregister = vault.on('modify', (f: any) => {
      //     if (f.path === testFile.path) {
      //       results.push(sup.tryConsume(f.path, 'probe-content'));
      //     }
      //   });
      //   sup.arm(testFile.path, 'probe-content');
      //   await vault.process(testFile, () => 'probe-content'); // byte-identical
      //   unregister();
      //   await vault.delete(testFile);
      //   expect(results).toHaveLength(1); // FAILS if Obsidian suppresses
      //   expect(results[0]).toBe('consumed'); // FAILS if hash mismatch
      //   console.log('PROBE RESULT: modify fired for byte-identical write — Wave 3 assumption HOLDS');
      // ──────────────────────────────────────────────────────────────────

      throw new Error(
        'REAL-OBSIDIAN PROBE STUB: Run this test from inside a live Obsidian dev-vault — ' +
        'see PITFALLS.md Pitfall 27 for protocol. Replace this throw with real-Obsidian ' +
        'harness glue code (see inline comments above).'
      );
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIBE BLOCK 3: DOCUMENTATION — descriptive output for SUMMARY.md
// ─────────────────────────────────────────────────────────────────────────────

describe('DOCUMENTATION — probe environment and contract summary (descriptive)', () => {
  it('DOCUMENTATION: probe environment + contract summary (descriptive, always passes)', () => {
    const isRealObsidian = !!process.env['OBSIDIAN_DEV_VAULT_PROBE'];
    const environment = isRealObsidian
      ? 'REAL-OBSIDIAN dev-vault (OBSIDIAN_DEV_VAULT_PROBE=1)'
      : 'happy-dom + vitest (fake-vault only; real-Obsidian env-gated test skipped)';

    // This block intentionally has no assertion — it exists to provide a
    // stable, searchable artifact in the test output for plan-summary scrapers
    // and for maintainers reviewing what the probe covers.
    //
    // CONTRACT UNDER TEST:
    //   vault.on('modify') MUST fire after vault.process even when the new
    //   bytes are identical to the pre-write bytes on disk.
    //
    // WAVE 3 childDirty DEPENDENCY:
    //   The safety timer in the Wave 3 childDirty design is load-bearing ONLY
    //   IF Obsidian fires modify events even for byte-identical writes. The
    //   contract test (Block 1) documents this assumption against a conforming
    //   fake vault. The env-gated probe (Block 2) is the definitive real-world
    //   verification — it must be run in a live dev-vault before Wave 3 ships.
    //
    // PROBE RESULT LOCATION:
    //   Record results in PITFALLS.md § Pitfall 27.
    //
    // Current environment: ${environment}
    void environment; // consumed to avoid 'unused variable' lint warning

    expect(true).toBe(true);
  });
});
