// tests/widget/applyAuthoritativeBody.test.ts
//
// Audit C2 — unit tests for applyAuthoritativeBody helper.
//
// Covers:
//   (1) suppression provided + v1.3 fence → arm called once with sha1 of
//       post-write fence body; consume returns 'consumed'.
//   (2) suppression provided + legacy fence (no leetcode-solve opener) →
//       arm NOT called; vault.process still runs.
//   (3) suppression omitted → no arming, vault.process runs identically
//       (back-compat path).
//   (4) post-flush hash drift surfaces a console.warn.
//   (5) transform re-evaluated inside vault.process (two invocations):
//       arm uses call-1 result, write uses call-2 result; hashes mismatch →
//       suppression entry dropped via tryConsume 'miss' — proves the
//       RESEARCH §1 fail-safe stays intact.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyAuthoritativeBody } from '../../src/widget/applyAuthoritativeBody';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';
import { sha1 } from '../../src/widget/debouncedWriter';
import { makeMockVaultApp } from '../helpers/mock-vault';

const V13_NOTE =
  '---\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```leetcode-solve\nOLD_BODY\n```\n\n## Notes\nfoo\n';

const LEGACY_NOTE =
  '---\nlc-slug: two-sum\n---\n\n## Code\n```python3\nOLD_BODY\n```\n\n## Notes\nfoo\n';

describe('applyAuthoritativeBody', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // (1) v1.3 fence with suppression → arm + consume
  // ---------------------------------------------------------------------------
  it('(1) v1.3 fence: arms suppression before vault.process; tryConsume returns consumed', async () => {
    const m = makeMockVaultApp({ 'note.md': V13_NOTE });
    const file = m.app.vault.getAbstractFileByPath('note.md')!;
    const suppression = new SelfWriteSuppression();

    await applyAuthoritativeBody(
      { app: m.app as never, file: file as never, suppression },
      (current) => current.replace('OLD_BODY', 'NEW_BODY'),
    );

    // vault.process ran.
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    // Content was written.
    expect(m.getContent('note.md')).toContain('NEW_BODY');

    // Suppression was armed (size > 0 before TTL drains).
    expect(suppression.size).toBe(1);

    // The armed hash matches the post-write fence body.
    const postWriteText = m.getContent('note.md')!;
    // Extract fence body from post-write text manually (between opener and closer).
    const fenceBodyMatch = postWriteText.match(/```leetcode-solve\n([\s\S]*?)\n```/);
    const fenceBody = fenceBodyMatch?.[1] ?? '';
    const expectedHash = await sha1(fenceBody);
    expect(suppression.tryConsume('note.md', expectedHash)).toBe('consumed');
  });

  // ---------------------------------------------------------------------------
  // (2) Legacy fence with suppression → NO arm; vault.process still runs
  // ---------------------------------------------------------------------------
  it('(2) legacy fence: suppression not armed; vault.process still runs', async () => {
    const m = makeMockVaultApp({ 'note.md': LEGACY_NOTE });
    const file = m.app.vault.getAbstractFileByPath('note.md')!;
    const suppression = new SelfWriteSuppression();

    await applyAuthoritativeBody(
      { app: m.app as never, file: file as never, suppression },
      (current) => current.replace('OLD_BODY', 'NEW_BODY'),
    );

    expect(m.spies.process).toHaveBeenCalledTimes(1);
    expect(m.getContent('note.md')).toContain('NEW_BODY');
    // No arming for legacy fence.
    expect(suppression.size).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // (3) suppression omitted → back-compat; vault.process runs, no arming
  // ---------------------------------------------------------------------------
  it('(3) suppression omitted: vault.process runs unchanged (back-compat)', async () => {
    const m = makeMockVaultApp({ 'note.md': V13_NOTE });
    const file = m.app.vault.getAbstractFileByPath('note.md')!;

    await applyAuthoritativeBody(
      { app: m.app as never, file: file as never },
      (current) => current.replace('OLD_BODY', 'NEW_BODY'),
    );

    expect(m.spies.process).toHaveBeenCalledTimes(1);
    expect(m.getContent('note.md')).toContain('NEW_BODY');
  });

  // ---------------------------------------------------------------------------
  // (4) post-flush hash drift → console.warn
  // ---------------------------------------------------------------------------
  it('(4) post-flush hash drift surfaces console.warn', async () => {
    // Construct a note where the transform itself introduces drift: the
    // pre-compute returns text A, but vault.process produces text B because
    // we intercept the spy to simulate an external write between reads.
    const m = makeMockVaultApp({ 'note.md': V13_NOTE });
    const file = m.app.vault.getAbstractFileByPath('note.md')!;
    const suppression = new SelfWriteSuppression();

    // After vault.read (pre-compute), vault.process will see DIFFERENT content
    // because the spy mutates the store mid-flight.
    // We simulate this by making vault.process write something different from
    // what the transform would produce for the pre-compute snapshot.
    let callCount = 0;
    m.spies.process.mockImplementation(async (f: { path: string }, fn: (s: string) => string) => {
      // On the vault.process call inside applyAuthoritativeBody: return a body
      // that differs from what transform(pre-compute-disk) would produce.
      const injected = fn('---\nlc-slug: x\n---\n\n## Code\n```leetcode-solve\nEXTERNAL_WRITE\n```\n');
      callCount++;
      const state = (m as { state: { contents: Map<string, string> } }).state;
      state.contents.set(f.path, injected);
      return injected;
    });

    await applyAuthoritativeBody(
      { app: m.app as never, file: file as never, suppression },
      (current) => current.replace('OLD_BODY', 'NEW_BODY'),
    );

    // Hash drift warn should have fired.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('post-flush hash drift'),
    );
    expect(callCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // (5) transform invoked twice (pre-compute + vault.process); RESEARCH §1
  //     fail-safe: armed hash is for pre-compute snapshot A; vault.process
  //     callback sees different disk B and produces a different fence body.
  //     Post-flush diagnostic warns; tryConsume with the arm hash returns
  //     'consumed' (map still holds arm hash) — the fail-safe is that the
  //     armed hash DIFFERS from the observed post-write body hash, so the
  //     modify-handler would call tryConsume with the observed hash and get
  //     'miss' (defensive delete). We test that chain explicitly.
  // ---------------------------------------------------------------------------
  it('(5) transform double-invocation: armed hash differs from post-write body hash when disk changes between read and process', async () => {
    // pre-compute snapshot (vault.read returns this)
    const noteA = V13_NOTE; // fence body = OLD_BODY
    // vault.process callback sees noteB (external write landed between read and process)
    const noteB = V13_NOTE.replace('OLD_BODY', 'EXTERNALLY_CHANGED_XYZ');

    const m = makeMockVaultApp({ 'note.md': noteA });
    const file = m.app.vault.getAbstractFileByPath('note.md')!;
    const suppression = new SelfWriteSuppression();

    // Override vault.process to feed noteB to the transform callback (simulating race).
    // The transform replaces only 'OLD_BODY' — when applied to noteB it does nothing,
    // so the post-write fence body stays 'EXTERNALLY_CHANGED_XYZ'.
    m.spies.process.mockImplementation(async (f: { path: string }, fn: (s: string) => string) => {
      const result = fn(noteB);
      const state = (m as { state: { contents: Map<string, string> } }).state;
      state.contents.set(f.path, result);
      return result;
    });

    // Transform replaces OLD_BODY only — has no effect on noteB content.
    await applyAuthoritativeBody(
      { app: m.app as never, file: file as never, suppression },
      (current) => current.replace('OLD_BODY', 'REPLACED'),
    );

    // Post-flush diagnostic warned because armed hash (for 'REPLACED') ≠
    // observed hash (for 'EXTERNALLY_CHANGED_XYZ').
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('post-flush hash drift'),
    );

    // The suppression map still holds the arm entry (armed with hash of 'REPLACED').
    // tryConsume with the OBSERVED post-write body hash returns 'miss' (defensive
    // delete) — this is exactly what the modify-handler would do, and it correctly
    // treats the write as external (RESEARCH §1 fail-safe).
    const postWriteText = m.getContent('note.md')!;
    const fenceBodyMatch = postWriteText.match(/```leetcode-solve\n([\s\S]*?)\n```/);
    const observedFenceBody = fenceBodyMatch?.[1] ?? '';
    const observedHash = await sha1(observedFenceBody);
    // Observed body is EXTERNALLY_CHANGED_XYZ (transform had no effect on noteB).
    expect(observedFenceBody).toBe('EXTERNALLY_CHANGED_XYZ');
    // Consuming with the observed hash: mismatch → 'miss' + defensive delete.
    expect(suppression.tryConsume('note.md', observedHash)).toBe('miss');
    // After the defensive delete, a subsequent consume also misses.
    const armedHash = await sha1('REPLACED');
    expect(suppression.tryConsume('note.md', armedHash)).toBe('miss');
  });

  // ---------------------------------------------------------------------------
  // R2 guard: multi-fence note (corrupt) → no arming, vault.process still runs
  // ---------------------------------------------------------------------------
  it('R2: multi-fence note skips arming; vault.process still runs', async () => {
    const multiFenceNote =
      '---\nlc-slug: x\n---\n\n## Code\n```leetcode-solve\nBODY_A\n```\n\n## Notes\n```leetcode-solve\nBODY_B\n```\n';
    const m = makeMockVaultApp({ 'note.md': multiFenceNote });
    const file = m.app.vault.getAbstractFileByPath('note.md')!;
    const suppression = new SelfWriteSuppression();

    await applyAuthoritativeBody(
      { app: m.app as never, file: file as never, suppression },
      (current) => current.replace('BODY_A', 'REPLACED'),
    );

    expect(m.spies.process).toHaveBeenCalledTimes(1);
    // No arming for multi-fence corrupt note.
    expect(suppression.size).toBe(0);
  });
});
