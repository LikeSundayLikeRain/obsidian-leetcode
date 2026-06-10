// src/widget/applyAuthoritativeBody.ts
//
// Audit C2 — shared helper that wraps app.vault.process with SelfWriteSuppression
// arming for the v1.3 leetcode-solve fence body.
//
// Used by copyToCode (src/graph/copyToCode.ts) and resetCodeWithConfirm
// (src/solve/resetCodeWithConfirm.ts) to close the TOCTOU window described in
// C2: both writers mutated the fence body via vault.process without arming
// SelfWriteSuppression, so the resulting modify event was treated as external
// and the widget ran reloadFromDisk('silent'). Under Wave 3 childDirty, the
// ~10–50 ms window between modal close and vault.process completion lets local
// typing get clobbered by the silent reload.
//
// Arming sequence (mirrors DebouncedWriter.flush at debouncedWriter.ts:225-234):
//   1. vault.read currentDisk                                  (fresh snapshot)
//   2. pre-compute nextFullText = transform(currentDisk)       (pure, side-effect-free)
//   3. extract futureFenceBody from nextFullText at index 0    (SSoT: fenceSerialization)
//   4. sha1(futureFenceBody)                                   (same hash debouncedWriter uses)
//   5. suppression.arm(file.path, hash)                        (BEFORE vault.process)
//   6. await vault.process(file, transform)                    (actual mutation)
//   7. post-flush hash diagnostic warn (mirrors debouncedWriter.ts:249-253)
//
// Arming is ONLY performed on the v1.3 leetcode-solve path (countLeetCodeSolveFenceOpeners > 0
// in BOTH the pre-compute disk snapshot AND the resulting nextFullText) — the
// modify-handler only hashes leetcode-solve fence bodies, so arming a non-v1.3
// note would produce a hash that can never be consumed.
//
// The transform is re-evaluated inside vault.process so Obsidian's retry-on-conflict
// semantics are preserved. Read-then-process introduces no new TOCTOU vs the
// status quo: vault.process already does read-modify-write, and the suppression's
// hash-mismatch defensive-delete handles a legitimate external race correctly
// (drops to 'miss', external preserved — RESEARCH §1 fail-safe).
//
// Suppression param is optional so existing tests that call copyToCode /
// resetCodeWithConfirm without a suppression arg keep working unchanged.

import type { App, TFile } from 'obsidian';
import type { SelfWriteSuppression } from './selfWriteSuppression';
import { extractFenceBody } from './fenceSerialization';
import { countLeetCodeSolveFenceOpeners } from './fenceLocator';
import { sha1 } from './debouncedWriter';

export interface ApplyAuthoritativeBodyDeps {
  app: App;
  file: TFile;
  /** Optional — when supplied, arms the suppression entry before vault.process.
   *  When omitted, the call is functionally equivalent to a bare vault.process
   *  (backward-compatible with tests that don't thread suppression). */
  suppression?: SelfWriteSuppression;
}

/**
 * Authoritative fence-body writer: arms SelfWriteSuppression THEN calls
 * vault.process, so the resulting modify event is recognized as a self-write
 * rather than an external edit.
 *
 * The `transform` must be a pure function of the current full-note string
 * (same contract as vault.process's callback). It will be invoked twice:
 *   (a) once during pre-compute (for hash derivation); and
 *   (b) once inside vault.process (actual mutation path).
 *
 * This double-invocation is safe because forceInjectCodeSection is pure
 * (verified by Phase 3 tests). If Obsidian retries vault.process due to a
 * conflict, the second invocation sees post-conflict disk content; the armed
 * hash from pre-compute is stale; suppression's tryConsume returns 'miss' and
 * the modify-handler treats the resolved write as external — correct fail-safe,
 * no data loss, at most an unnecessary widget reload.
 *
 * R2 defensive guard: if the pre-compute text carries ≠1 leetcode-solve fence
 * (corruption / mid-migration), arming is skipped and vault.process runs
 * un-armed (legacy behavior for the corrupt case).
 */
export async function applyAuthoritativeBody(
  deps: ApplyAuthoritativeBodyDeps,
  transform: (current: string) => string,
): Promise<void> {
  const { app, file, suppression } = deps;

  // Only attempt arming when suppression is supplied; otherwise fall through
  // to a plain vault.process (backward-compat path for callers without suppression).
  if (suppression) {
    let didArm = false;
    try {
      // Step 1: read fresh disk content for hash pre-compute.
      const currentDisk = await app.vault.read(file);

      // Step 2: pre-compute what the full note will look like after the write.
      const nextFullText = transform(currentDisk);

      // Step 3: verify both snapshots carry exactly one leetcode-solve fence.
      // The modify-handler only hashes fence bodies of leetcode-solve fences, so
      // arming for non-v1.3 notes or corrupt multi-fence notes would produce a
      // hash that can never match and would leave a stale entry in the map.
      const fenceCountInCurrent = countLeetCodeSolveFenceOpeners(currentDisk, Number.MAX_SAFE_INTEGER);
      const fenceCountInNext = countLeetCodeSolveFenceOpeners(nextFullText, Number.MAX_SAFE_INTEGER);

      if (fenceCountInCurrent > 0 && fenceCountInNext === 1) {
        // Step 4: extract the future fence body (index 0 — single-fence invariant).
        const futureFenceBody = extractFenceBody(nextFullText, 0) ?? '';

        // Step 5: compute hash and arm BEFORE vault.process.
        const expectedHash = await sha1(futureFenceBody);
        suppression.arm(file.path, expectedHash);
        didArm = true;

        // Step 6: run the actual vault mutation.
        let postWriteText = '';
        await app.vault.process(file, (body) => {
          postWriteText = transform(body);
          return postWriteText;
        });

        // Step 7: post-flush hash diagnostic (mirrors debouncedWriter.ts:249-253).
        if (postWriteText) {
          const observedFenceBody = extractFenceBody(postWriteText, 0) ?? '';
          const [obsHash, expHashFuture] = await Promise.all([
            sha1(observedFenceBody),
            sha1(futureFenceBody),
          ]);
          if (obsHash !== expHashFuture) {
            console.warn(`LC applyAuthoritativeBody: post-flush hash drift for ${file.path}`);
          }
        }
        return;
      }
    } catch (err) {
      // If pre-compute read or hash fails, fall through to un-armed vault.process.
      // A failed arm leaves didArm = false so the clean-up logic below skips.
      if (didArm) {
        // Rare: arm succeeded but vault.process threw. Clear the dangling entry
        // so it does not falsely consume a future external modify event.
        suppression.clearForPath(file.path);
      }
      throw err;
    }
    // Re-check: arm was set above and vault.process has returned — we're done.
    if (didArm) return;
  }

  // Fallback (no suppression, or non-v1.3 fence, or R2 multi-fence guard):
  // plain vault.process with no arming — identical to the pre-C2 behavior.
  await app.vault.process(file, transform);
}
