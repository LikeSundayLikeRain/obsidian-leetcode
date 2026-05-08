// src/solve/types.ts
//
// Phase 3 — shared types for the Run/Submit flow (D-16, D-30).
// Discriminated unions so the verdict-modal renderer (Plan 06) can switch on
// `state` and `status_code` with full compiler coverage.
//
// Field names are LC's wire format (verified against fixture captures from
// Plan 01 Task 2 — see tests/fixtures/ and node_modules/@leetnotion/leetcode-api
// lib/index.d.ts:1158-1199). Keep LC's exact casing (snake_case) because the
// REST response is JSON-decoded as-is — renaming here would mean adding a
// mapper step at Plan 04's REST boundary.
//
// Plan 04 (leetcodeRest.ts) imports the arg types.
// Plan 05 (SubmissionOrchestrator.ts) imports SubmissionContext + isTerminal.
// Plan 06 (VerdictModal.ts) imports CheckResponse + the two SUCCESS variants.

import type { AuthCookies } from '../auth/types';

// ── Submission context ────────────────────────────────────────────────────

/** Everything the orchestrator needs to submit. Assembled once per invocation
 *  from the active note + SettingsStore + LeetCodeClient resolution. */
export interface SubmissionContext {
  slug: string;
  langSlug: string;
  typedCode: string;
  /** LC's internal questionId (D-30) — NOT questionFrontendId. */
  questionId: string;
  problemTitle: string;
}

// ── REST args (consumed by Plan 04 leetcodeRest.ts) ───────────────────────

export interface InterpretArgs {
  slug: string;
  lang: string;         // LC langSlug (python3, java, cpp, …)
  questionId: string;   // LC internal id
  typedCode: string;
  dataInput: string;    // LC raw format — one value per line
  cookies: AuthCookies;
}

export interface SubmitArgs {
  slug: string;
  lang: string;
  questionId: string;
  typedCode: string;
  cookies: AuthCookies;
}

export interface CheckArgs {
  /** `interpret_id` (from interpretSolution) or `submission_id` (from submitSolution). */
  id: string;
  /** Slug passed in so the caller can build the `Referer: /problems/{slug}/` header per Plan 04 Pattern 1. */
  slug: string;
  cookies: AuthCookies;
}

// ── Check response (polling) ──────────────────────────────────────────────

/** Still-running judge poll. LC returns this while the judge is queued or
 *  mid-execution. Caller keeps polling until `state === 'SUCCESS'`. */
export interface PendingCheckResponse {
  state: 'PENDING' | 'STARTED';
}

/** Interpret (Run Code) terminal response. Present when the user invokes
 *  `LeetCode: Run code (sample | custom input)`. Field set differs from Submit:
 *  has `code_answer` + `expected_code_answer` + `correct_answer` for per-case
 *  comparison; no runtime/memory percentiles. */
export interface RunCheckResponse {
  state: 'SUCCESS';
  status_code: number;
  status_msg?: string;
  status_runtime?: string;
  status_memory?: string;
  run_success?: boolean;
  code_answer?: string | string[];
  expected_code_answer?: string | string[];
  code_output?: string | string[];
  correct_answer?: boolean;
  lang?: string;
  runtime_error?: string;
  compile_error?: string;
  full_runtime_error?: string;
  full_compile_error?: string;
  /** Forward-compat: LC may add fields between versions. Keeping an index
   *  signature lets the unknown-verdict fallback (D-15) preserve the raw
   *  payload for UnknownVerdictError.payload without narrowing to `never`. */
  [k: string]: unknown;
}

/** Submit terminal response. Present when the user invokes `LeetCode: Submit`.
 *  Includes runtime_percentile / memory_percentile when accepted; input +
 *  last_testcase + std_output + expected_output when WA. */
export interface SubmitCheckResponse {
  state: 'SUCCESS';
  status_code: number;
  status_msg?: string;
  status_runtime?: string;
  runtime_percentile?: number;
  status_memory?: string;
  memory_percentile?: number;
  total_correct?: number;
  total_testcases?: number;
  input?: string;
  last_testcase?: string;
  std_output?: string;
  expected_output?: string;
  runtime_error?: string;
  compile_error?: string;
  full_runtime_error?: string;
  full_compile_error?: string;
  submission_id?: string | number;
  lang?: string;
  [k: string]: unknown;
}

/** Union over the three poll states. Plan 05 narrows with `isTerminal`. */
export type CheckResponse = PendingCheckResponse | RunCheckResponse | SubmitCheckResponse;

/** Narrowing predicate: SUCCESS state is terminal; PENDING / STARTED are not. */
export function isTerminal(res: CheckResponse): res is RunCheckResponse | SubmitCheckResponse {
  return res.state === 'SUCCESS';
}
