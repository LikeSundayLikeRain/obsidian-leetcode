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
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
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

  constructor(
    private readonly app: App,
    private readonly file: TFile,
    private readonly getDoc: () => string,
    private readonly getFenceIndex: () => number,
    private readonly suppression: SelfWriteSuppression,
    delayMs: number,
  ) {
    this.delayMs = delayMs;
    this.deb = debounce(() => { void this.flush(); }, this.delayMs, /*resetTimer=*/true);
  }

  /** Schedule a debounced flush. Reset timer on subsequent calls (resetTimer=true). */
  run(): void {
    this.deb();
  }

  /** Cancel any pending debounced flush AND any pending rate-limit retry. */
  cancel(): void {
    this.deb.cancel();
    if (this.rateLimitTimer !== null) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
  }

  /** Cancel pending timer and flush synchronously. Returns the flush Promise. */
  forceFlush(): Promise<void> {
    this.deb.cancel();
    return this.flush();
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
        this.rateLimitTimer = setTimeout(() => {
          this.rateLimitTimer = null;
          void this.flush();
        }, wait);
      }
      return;
    }
    this.lastFlushAt = now;

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
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- intentional capitalization for the user-facing Notice
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
    this.suppression.arm(this.file.path, expectedHash);

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
      // eslint-disable-next-line no-console -- D-09 runtime diagnostic
      console.warn(`LC widget: post-flush hash drift for ${this.file.path}`);
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
