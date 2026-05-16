// src/solve/lastVerdictStore.ts
//
// Phase 08 Plan 01 — In-memory `Map<slug, LastVerdict>` populated by the
// run/submit orchestrator post-resolve callback (see
// src/solve/submissionOrchestrator.ts and src/solve/pollingOrchestrator.ts).
// Consumed by Phase 08 Plan 03's `buildDebugPrompt` to render the last
// failing run/submit verdict as part of the AI Debug prompt.
//
// Lifecycle (08-CONTEXT decision B + 08-PATTERNS §"src/solve/lastVerdictStore.ts"):
//   - In-memory only. NEVER writes to data.json. Cleared on plugin reload.
//   - NO Plugin constructor arg. NO `layout-change` reconcile loop.
//     Verdicts have no "tab is open" lifecycle — they are transient debugging
//     artifacts. Plain Map + clear() on plugin unload is sufficient. This is
//     a deliberate deviation from EphemeralTabStore (which DOES need the
//     reconcile loop because tab-input state is scoped to "the problem note
//     is open in at least one markdown leaf").
//   - Per-slug isolation: two slugs hold independent verdicts so parallel
//     debugging across tabs doesn't collide.
//   - Capture filter (locked, applied by orchestrator): NOT captured on
//     Accepted submissions (Phase 09 territory) — `kind !== 'ac' && kind !==
//     'unknown' && kind !== 'unknown-lc'` per 08-RESEARCH §"Code Examples"
//     Example 6.
//
// Field shape locked against `src/solve/types.ts:71-117`
// (RunCheckResponse / SubmitCheckResponse) per 08-PATTERNS §Pattern 2.
// `runtimeMs` and `memoryMb` are kept as `string` (LC's wire format —
// '120 ms' / '14.5 MB') rather than parsed numbers; the AI prompt consumes
// the raw display strings.
//
// Purity: no imports beyond local types. No DOM, no I/O, no Obsidian
// dependencies. Mirrors the posture of `src/solve/statusMap.ts`.

/** A single captured verdict from a non-Accepted Run/Submit. */
export interface LastVerdict {
  /** 'run-failure' = at least one sample/custom test failed via interpret_solution.
   *  'submit-failure' = judge returned non-Accepted (status_code !== 10). */
  kind: 'run-failure' | 'submit-failure';

  /** Date.now() at capture — diagnostic only. */
  capturedAt: number;

  /** Human-readable verdict via `classifyStatus(code, msg).displayName`.
   *  Examples: 'Wrong Answer', 'Time Limit Exceeded', 'Compile Error'. */
  verdictText: string;

  /** Submit-side: from `res.input || res.last_testcase`.
   *  Run-side: from `joinedDataInput` sliced to the failing case via splitInput(). */
  failingInput?: string;

  /** Submit-side: from `res.expected_output ?? asString(res.expected_code_answer)`.
   *  Run-side: from `expected_code_answer[failingCaseIdx]`. */
  expectedOutput?: string;

  /** Submit-side: from `res.std_output ?? asString(res.code_output)`.
   *  Run-side: from `code_answer[failingCaseIdx]`. */
  actualOutput?: string;

  /** Submit-side: from `res.status_runtime` (string, e.g. '120 ms'). TLE-relevant. */
  runtimeMs?: string;

  /** Submit-side: from `res.status_memory` (string, e.g. '14.5 MB'). MLE-relevant. */
  memoryMb?: string;

  /** First non-empty of:
   *  `[full_compile_error, compile_error, full_runtime_error, runtime_error]`. */
  errorMessage?: string;
}

/** In-memory per-slug verdict store. Lifecycle is plugin-session-scoped:
 *  populated by the orchestrator post-resolve callback and cleared on plugin
 *  reload (`dispose()` is called from `LeetCodePlugin.onunload`). */
export class LastVerdictStore {
  private readonly state = new Map<string, LastVerdict>();

  /** Overwrite (or insert) the verdict for `slug`. No per-slug history —
   *  the previous value is discarded. */
  set(slug: string, v: LastVerdict): void {
    this.state.set(slug, v);
  }

  /** Returns the last captured verdict for `slug`, or `undefined` if none
   *  has been captured this session. */
  get(slug: string): LastVerdict | undefined {
    return this.state.get(slug);
  }

  /** Empty the store. Idempotent. */
  clear(): void {
    this.state.clear();
  }

  /** Test + plugin.onunload path — deterministic full wipe. Mirrors
   *  EphemeralTabStore.dispose semantics (idempotent, equivalent to clear). */
  dispose(): void {
    this.state.clear();
  }
}
