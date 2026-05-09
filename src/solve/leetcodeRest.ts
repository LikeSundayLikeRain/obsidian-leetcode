// src/solve/leetcodeRest.ts
//
// Hand-rolled REST client for LeetCode's undocumented run/submit/check endpoints.
// CONTEXT: D-28 (hand-rolled), D-29 (endpoints), D-30 (body shape), D-27 (session expiry).
// RESEARCH: Pattern 1 verified against node_modules/@leetnotion/leetcode-api/lib/index.js:1780-1959
//           and skygragon/leetcode-cli lib/plugins/leetcode.js (2026-05-08).
//
// Contract pins (must_haves from Plan 03-04):
//   - All HTTP through Plan 03's `throttledRequestUrl` (CF-01, D-25, D-28).
//     NEVER direct requestUrl/fetch/axios here — single pipe only.
//   - interpretSolution POSTs { lang, question_id, test_mode: false, typed_code, data_input }
//     to /problems/{slug}/interpret_solution/
//   - submitSolution POSTs { lang, question_id, typed_code, judge_type: 'large' }
//     to /problems/{slug}/submit/
//   - checkSubmission GETs /submissions/detail/{id}/check/
//   - All three send the LC-CLI-verbatim header set (cookie + x-csrftoken + referer + ...)
//   - Session-expiry detection is defense-in-depth (RESEARCH Pitfall 3 + A2):
//       (1) status 302/303/401/403 → SessionExpiredError
//       (2) 200 with login HTML in body (title/form sniff) → SessionExpiredError
//       (3) GraphQL-shape session signal via isSessionExpired(body) → SessionExpiredError
//   - Missing interpret_id / submission_id → Error (surfaces to orchestrator)
//   - Cookies read PER CALL via args.cookies — never module state (Pitfall 2).
//
// Plan 05 (orchestrator) and Plan 06 (modals) never touch requestUrl directly —
// every LC hit goes through this file.

import { throttledRequestUrl } from '../api/throttle';
import { SessionExpiredError } from '../shared/errors';
import { isSessionExpired } from '../api/LeetCodeClient';
import type { InterpretArgs, SubmitArgs, CheckArgs, CheckResponse } from './types';
import type { AuthCookies } from '../settings/SettingsStore';

const BASE_URL = 'https://leetcode.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; obsidian-leetcode-plugin)';

/** LC-CLI-verbatim header set. Matches LeetCodeCLI.authHeaders() in
 *  node_modules/@leetnotion/leetcode-api/lib/index.js:1786 and skygragon/leetcode-cli
 *  lib/plugins/leetcode.js. Cookie and CSRF are read per-call from args.cookies
 *  (NOT captured at module-load) so fresh SettingsStore values propagate after
 *  re-login without a plugin reload (Pitfall 2 mitigation).
 *
 *  Phase 4 D-29 revision: accepts an optional `refererOverride`. When omitted,
 *  defaults to the Phase 3 problem-description URL (`/problems/{slug}/description/`)
 *  so existing Phase 3 callers keep their exact header shape. When supplied,
 *  the override wins — Phase 4's submission-detail GraphQL call sets it to
 *  `/submissions/detail/{id}/` because LC returns 403 if the referer points at
 *  the problem URL on a submissionDetails query.
 */
export function authHeaders(
  slug: string,
  cookies: AuthCookies,
  refererOverride?: string,
): Record<string, string> {
  return {
    'content-type': 'application/json',
    'origin': BASE_URL,
    'referer': refererOverride ?? `${BASE_URL}/problems/${slug}/description/`,
    'cookie': `csrftoken=${cookies.csrftoken}; LEETCODE_SESSION=${cookies.LEETCODE_SESSION};`,
    'x-csrftoken': cookies.csrftoken,
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': USER_AGENT,
  };
}

/** Defense-in-depth session-expiry detection (D-27, Pitfall 3).
 *
 * Order matters:
 *   1. status-code check — most reliable when LC returns explicit 302/401/403
 *   2. HTML-body sniff — catches silent-follow-to-200 redirect to login page
 *   3. isSessionExpired(body) — Phase 1 helper; catches GraphQL-error-shaped responses
 *
 * If the Wave 0 redirect spike (Plan 01 Task 3) resolved that requestUrl surfaces 302s
 * as res.status === 302: the status-code path is primary.
 * If it resolved silent-follow-to-200-HTML: the HTML sniff path is primary.
 * BOTH run unconditionally — no code change needed regardless of spike outcome.
 */
export function assertNotSessionExpired(status: number, text: string, body: unknown): void {
  if (status === 302 || status === 303 || status === 401 || status === 403) {
    throw new SessionExpiredError();
  }
  // HTML-body sniff — guards against redirect-followed-silently-to-200-HTML (Pitfall 3 + A2).
  // Limit to reasonable text-body size to avoid scanning huge JSON payloads.
  if (status === 200 && typeof text === 'string' && text.length > 0 && text.length < 500_000) {
    const head = text.slice(0, 2000);
    if (/<title>Log In|<form[^>]+action="\/accounts\/login/i.test(head)) {
      throw new SessionExpiredError();
    }
  }
  // Final fallback — Phase 1 CF-04 helper; matches GraphQL-shape { data: null } or
  // error-message patterns. Rare for REST but cheap to include (defense in depth).
  if (isSessionExpired(body)) {
    throw new SessionExpiredError();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  interpretSolution — runs code against sample or custom test input
//  POST /problems/{slug}/interpret_solution/
//  Returns { interpret_id } which Plan 05 polls via checkSubmission.
// ──────────────────────────────────────────────────────────────────────────────

export async function interpretSolution(
  args: InterpretArgs,
): Promise<{ interpret_id: string; interpret_expected_id?: string }> {
  const res = await throttledRequestUrl({
    url: `${BASE_URL}/problems/${args.slug}/interpret_solution/`,
    method: 'POST',
    headers: authHeaders(args.slug, args.cookies),
    body: JSON.stringify({
      lang: args.lang,
      question_id: args.questionId,
      test_mode: false,
      typed_code: args.typedCode,
      data_input: args.dataInput,
    }),
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  if (res.status >= 400) {
    throw new Error(`interpretSolution HTTP ${String(res.status)}: ${res.text.slice(0, 200)}`);
  }
  const data = res.json as { interpret_id?: string; interpret_expected_id?: string };
  if (!data.interpret_id) {
    throw new Error('interpretSolution: missing interpret_id in response');
  }
  return {
    interpret_id: data.interpret_id,
    interpret_expected_id: data.interpret_expected_id,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
//  submitSolution — full judge submission
//  POST /problems/{slug}/submit/ with judge_type: 'large'
//  Returns { submission_id } which Plan 05 polls via checkSubmission.
// ──────────────────────────────────────────────────────────────────────────────

export async function submitSolution(args: SubmitArgs): Promise<{ submission_id: string }> {
  const res = await throttledRequestUrl({
    url: `${BASE_URL}/problems/${args.slug}/submit/`,
    method: 'POST',
    headers: authHeaders(args.slug, args.cookies),
    body: JSON.stringify({
      lang: args.lang,
      question_id: args.questionId,
      typed_code: args.typedCode,
      judge_type: 'large',
    }),
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  if (res.status >= 400) {
    throw new Error(`submitSolution HTTP ${String(res.status)}: ${res.text.slice(0, 200)}`);
  }
  const data = res.json as { submission_id?: string | number };
  if (data.submission_id === undefined || data.submission_id === null) {
    throw new Error('submitSolution: missing submission_id in response');
  }
  // Normalize to string — LC sometimes returns number, sometimes string.
  // Plan 05 polling treats it uniformly as a path component.
  return { submission_id: String(data.submission_id) };
}

// ──────────────────────────────────────────────────────────────────────────────
//  checkSubmission — judge-status poll
//  GET /submissions/detail/{id}/check/
//  Returns CheckResponse (discriminated union: PENDING | STARTED | SUCCESS).
// ──────────────────────────────────────────────────────────────────────────────

export async function checkSubmission(args: CheckArgs): Promise<CheckResponse> {
  const res = await throttledRequestUrl({
    url: `${BASE_URL}/submissions/detail/${args.id}/check/`,
    method: 'GET',
    headers: authHeaders(args.slug, args.cookies),
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  if (res.status >= 400) {
    throw new Error(`checkSubmission HTTP ${String(res.status)}: ${res.text.slice(0, 200)}`);
  }
  return res.json as CheckResponse;
}
