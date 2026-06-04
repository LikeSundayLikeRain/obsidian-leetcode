// Phase 19 Plan 02 — Debounced one-way writer: typing → vault.process.
//
// CONTEXT C-04, C-06, C-08, D-09 + RESEARCH Pattern 2 + Specific Findings §1
// + Pitfall 19-A + Pitfall 19-E.
//
// Lifecycle (per flush):
//   1. Rate-limit gate (≤1 flush per 200ms — SYNC-07).
//   2. Read fresh disk content via app.vault.read.
//   3. Pitfall 19-E drift detection: count `\`\`\`leetcode-solve` openers in
//      fresh disk content; if more openers exist than expected, abort with
//      Notice 'Fence position changed; reload to continue editing.'
//   4. Compute the future fence body via the same rewriteFenceBody that
//      vault.process will call → hash it (sha1) for arming the suppression.
//   5. arm(file.path, expectedHash) BEFORE vault.process (RESEARCH §1; the
//      probe in Plan 19-02 Task 1 confirms this is safe).
//   6. await vault.process(file, body => rewriteFenceBody(body, idx, newBody)).
//   7. Post-flush hash diagnostic: re-extract the body from the post-write
//      text; if it doesn't match the widget doc hash, console.warn (D-09 —
//      ALWAYS-ON in Phase 19 per CONTEXT specifics).
//
// The hash function uses Web Crypto SubtleCrypto.digest('SHA-1', ...) per
// RESEARCH "Don't Hand-Roll" + A7 (no security implication; SHA-1 is fine
// for echo detection). We co-locate the helper here (no separate hash.ts) to
// keep the import surface minimal.

import { Notice, debounce, type App, type TFile, type Debouncer } from 'obsidian';
import { extractFenceBody, rewriteFenceBody } from './fenceSerialization';
import { SelfWriteSuppression } from './selfWriteSuppression';

const FENCE_OPENER_RE = /^\s*```leetcode-solve\b/;

/** SHA-1 hash of a UTF-8 string. Returns lowercase hex digest. Falls back to
 *  a hand-rolled deterministic hash if `crypto.subtle` is unavailable
 *  (happy-dom test envs may omit it). */
export async function sha1(s: string): Promise<string> {
  const subtle = (window as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const enc = new TextEncoder().encode(s);
      const buf = await subtle.digest('SHA-1', enc);
      const arr = Array.from(new Uint8Array(buf));
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to hand-rolled.
    }
  }
  // Hand-rolled deterministic FNV-1a 32-bit fallback (NOT cryptographic, but
  // sufficient for echo detection — see RESEARCH A7).
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

export class DebouncedWriter {
  private deb: Debouncer<[], void>;
  private lastFlushAt = 0;
  private rateLimitMs = 200;
  private delayMs: number;
  private rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Phase 20 Plan 20-03 (SYNC-05) — sentinel for `hasPending()`. Set to true
   *  whenever `run()` schedules a debounced flush; reset to false on every
   *  flush completion (success or error path) and on `cancel()`. The
   *  conflict-modal trigger gate (`vault.on('modify')` → if writer is mid-
   *  edit, open ConflictModal) reads this via `hasPending()`. */
  private pending = false;

  /** Plan 21-17 — optional registryKey of the owning WidgetController.
   *  Passed as the third argument to selfWriteSuppression.arm(...) so the
   *  modify-handler peer-sync fan-out can identify the originating pane
   *  (and skip it — its caret is already correct because its own typing
   *  produced the new doc state). Optional to preserve backward compat
   *  with existing test fixtures that construct DebouncedWriter without
   *  threading a registryKey through. */
  private readonly registryKey?: string;

  constructor(
    private readonly app: App,
    private readonly file: TFile,
    private readonly getDoc: () => string,
    private readonly getFenceIndex: () => number,
    private readonly suppression: SelfWriteSuppression,
    delayMs: number,
    registryKey?: string,
  ) {
    this.delayMs = delayMs;
    this.registryKey = registryKey;
    this.deb = debounce(() => { void this.flush(); }, this.delayMs, /*resetTimer=*/true);
  }

  /** Schedule a debounced flush. Reset timer on subsequent calls (resetTimer=true). */
  run(): void {
    this.pending = true;
    this.deb();
  }

  /** Cancel any pending debounced flush AND any pending rate-limit retry. */
  cancel(): void {
    this.deb.cancel();
    if (this.rateLimitTimer !== null) {
      window.clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
    this.pending = false;
  }

  /** Cancel pending timer and flush synchronously. Returns the flush Promise. */
  forceFlush(): Promise<void> {
    this.deb.cancel();
    // WR-12 (review-fix) — also clear any rate-limit retry timer that
    // setTimeout deferred behind the rateLimitMs window. Without this
    // clear, a forceFlush during the rate-limit defer window would
    // produce TWO vault.process calls: one from this.flush() below
    // (which now races past the rate-limit gate by updating
    // lastFlushAt), and a second from the deferred timer firing later.
    if (this.rateLimitTimer !== null) {
      window.clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
    // forceFlush leaves `pending = true` until flush() completes — the
    // sentinel is reset in the flush body's try/finally so any awaited
    // forceFlush observes a clean post-condition.
    return this.flush();
  }

  /** Phase 20 Plan 20-03 (SYNC-05) — accessor for the conflict-modal trigger
   *  gate. Returns `true` IFF a debounced flush is scheduled OR a flush is
   *  currently in flight. Returns `false` once the flush completes (success
   *  or error path) or after `cancel()`. */
  hasPending(): boolean {
    return this.pending;
  }

  /** Hot-reconfigure the debounce delay (live applied without note reload —
   *  D-08 / SettingsTab onChange). Cancels any pending flush; subsequent
   *  run() calls use the new delay. */
  setDelay(ms: number): void {
    this.delayMs = ms;
    this.deb.cancel();
    this.deb = debounce(() => { void this.flush(); }, this.delayMs, /*resetTimer=*/true);
  }

  /** The actual write path. Public ONLY for tests; production callers go
   *  through run() / forceFlush(). */
  private async flush(): Promise<void> {
    const now = Date.now();
    // SYNC-07 rate-limit (CONTEXT C-08): if we flushed less than rateLimitMs
    // ago, defer this call. setTimeout coalesces — multiple deferred calls
    // collapse because subsequent rate-limit-deferred flushes will bail out
    // again until the window clears.
    if (now - this.lastFlushAt < this.rateLimitMs) {
      if (this.rateLimitTimer === null) {
        const wait = this.rateLimitMs - (now - this.lastFlushAt);
        // WR-12 (review-fix) — the previous code only set the new timer
        // when `rateLimitTimer === null`, so concurrent calls coalesce
        // on the existing timer. That coalescing remains correct, but
        // the symmetry with cancel() / forceFlush() is reinforced here
        // for readers: every assignment to rateLimitTimer is paired
        // with an explicit clear elsewhere (cancel sets back to null;
        // forceFlush clears before re-entering flush). Don't add a
        // pre-clear here — it would re-arm the wait window on every
        // burst and never fire.
        this.rateLimitTimer = window.setTimeout(() => {
          this.rateLimitTimer = null;
          void this.flush();
        }, wait);
      }
      // Phase 20 Plan 20-03 — pending stays true while we're rate-limit-
      // deferring; the deferred flush will reset it on completion.
      return;
    }
    this.lastFlushAt = now;

    // Phase 20 Plan 20-03 (SYNC-05) — wrap the entire flush body in
    // try/finally so `this.pending` resets to false regardless of which
    // exit path we take (success / error / vault.read failure / drift Notice).
    try {
      const newBody = this.getDoc();
      const expectedFenceIndex = this.getFenceIndex();

      // Read fresh disk content. Required for both drift detection and the
      // expected-hash computation (RESEARCH Specific Findings §1).
      let currentDisk: string;
      try {
        currentDisk = await this.app.vault.read(this.file);
      } catch {
        // Defensive: if read fails, abort silently (file deleted or other I/O).
        return;
      }

      // Pitfall 19-E: drift detection. Count `\`\`\`leetcode-solve` openers in
      // fresh disk content; if it exceeds the expected count (mount-time idx +
      // 1 = "the active fence + everything before it"), an external insert
      // happened above — abort and surface a Notice.
      const actualCount = countLcOpeners(currentDisk);
      if (actualCount > expectedFenceIndex + 1) {

        new Notice('Fence position changed; reload to continue editing.', 5000);
        return;
      }

      // Compute the future fence body via the same rewriteFenceBody that
      // vault.process will call — this keeps the arming hash byte-aligned with
      // what the modify listener observes (RESEARCH §1).
      const futureFullText = rewriteFenceBody(currentDisk, expectedFenceIndex, newBody);
      const futureFenceBody = extractFenceBody(futureFullText, expectedFenceIndex) ?? newBody;
      const expectedHash = await sha1(futureFenceBody);

      // Arm BEFORE vault.process (CONTEXT C-04; probe-confirmed safe per
      // Plan 19-02 Task 1's modifyEventOrdering.probe.test.ts).
      // Plan 21-17 — thread registryKey when provided so the modify-handler
      // peer-sync fan-out can identify the originating pane via
      // selfWriteSuppression.peekOriginator(path) and skip it.
      this.suppression.arm(this.file.path, expectedHash, this.registryKey);

      // Write through vault.process. Idempotent — if `body !== currentDisk`
      // due to a race, the suppression entry won't consume and external-edit
      // is preserved (RESEARCH §1 fail-safe).
      let postWriteText = '';
      await this.app.vault.process(this.file, (body) => {
        postWriteText = rewriteFenceBody(body, expectedFenceIndex, newBody);
        return postWriteText;
      });


      // CONTEXT D-09 post-flush hash diagnostic: ALWAYS-ON in Phase 19.
      // Re-extract observed body from postWriteText; warn if it doesn't match
      // the widget doc.
      const observedBody = extractFenceBody(postWriteText, expectedFenceIndex) ?? '';
      const [obsHash, expHashWidget] = await Promise.all([sha1(observedBody), sha1(newBody)]);
      if (obsHash !== expHashWidget) {

        console.warn(`LC widget: post-flush hash drift for ${this.file.path}`);
      }
    } finally {
      // Phase 20 Plan 20-03 — reset pending sentinel on every exit path
      // (success / abort / Notice / error). The conflict-modal trigger
      // gate observes a clean post-condition once the flush completes.
      this.pending = false;
    }
  }
}

/** Count the number of `\`\`\`leetcode-solve` opener lines in a file. Used for
 *  Pitfall 19-E drift detection at flush time. */
function countLcOpeners(text: string): number {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    if (FENCE_OPENER_RE.test(line)) count++;
  }
  return count;
}
