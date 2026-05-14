// src/api/LeetCodeClient.ts
// Thin wrapper over @leetnotion/leetcode-api. All network calls flow through
// `installRequestUrlFetcher()`'s replaced fetcher -> throttle -> requestUrl.
//
// OWNERSHIP: `isSessionExpired` is defined here and ONLY here (AUTH-04). Plan 03
// (AuthService) and Plan 06 (ProblemBrowserView) both call it from error paths.
// Neither redefines it.
import { LeetCode, Credential } from '@leetnotion/leetcode-api';
import type { SettingsStore } from '../settings/SettingsStore';

/** LC's `question` object as returned by `lc.problem(slug)`.
 *  Only the fields we consume are declared; LC returns additional fields we ignore.
 *  Verified against node_modules/@leetnotion/leetcode-api/lib/index.js:356 which
 *  contains the literal GraphQL query. */
export interface LeetCodeProblemDetail {
  questionFrontendId: string;
  /** Phase 3 D-30 — LC's internal numeric id, distinct from `questionFrontendId`
   *  for some problems (premium variants). Submitted in the REST body as
   *  `question_id`. Source: `DetailedProblem.questionId` per the library's
   *  `lib/index.d.ts:300-302`. Optional because the library may omit it on
   *  older calls; callers fall back gracefully. */
  questionId?: string | null;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  exampleTestcases?: string;
  /** Phase 5.4 D-08 — JSON-serialized metaData with `params: [{name, type}]`.
   *  Used by RunModal to seed-split exampleTestcases by lines-per-case
   *  (params.length) when blank-line separators are absent, and by the
   *  verdict modal renderer to label per-case input rows. */
  metaData?: string;
  /** Phase 5.4 — first sample case (newline-separated values, one per line).
   *  Used as fallback for arity derivation when metaData is malformed. */
  sampleTestCase?: string;
  topicTags?: Array<{ name: string; slug: string }>;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  stats?: string;
}

export class LeetCodeClient {
  public lc!: InstanceType<typeof LeetCode>;
  private settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.settings = settings;
    // WR-01: construct with an UNAUTHENTICATED baseline synchronously so the
    // .lc field is never undefined. If cookies exist, the caller (main.ts
    // onload / AuthService after login) MUST await reauthenticate() to bind
    // the credential. Previously we fire-and-forgot `void cred.init(...)` —
    // if init rejected, the rejection became an unhandled promise rejection
    // and the client was left attached to a partially-initialised Credential,
    // causing API calls to return null data indistinguishable from session
    // expiry and triggering a spurious logout notice.
    this.lc = new LeetCode();
  }

  /** Rebuild the LeetCode client with current cookies and await Credential bootstrap.
   *  Call this from onload() and from AuthService after login/logout to guarantee
   *  the LC client's credential is fully initialized before the first API call. */
  async reauthenticate(): Promise<void> {
    const cookies = this.settings.getAuthCookies();
    if (!cookies) {
      this.lc = new LeetCode();
      return;
    }
    const cred = new Credential();
    await cred.init(cookies.LEETCODE_SESSION);
    this.lc = new LeetCode(cred);
  }

  /** Fetch the signed-in user's username via LC's `whoami` GraphQL query.
   *  Returns null if not signed in or if the call fails. Never throws — callers
   *  use the result for UI display only (settings tab Status line). */
  async fetchUsername(): Promise<string | null> {
    try {
      const resp = await (this.lc as unknown as {
        whoami: () => Promise<{ username?: string; isSignedIn?: boolean } | null>;
      }).whoami();
      if (!resp || !resp.isSignedIn || !resp.username) return null;
      return resp.username;
    } catch {
      return null;
    }
  }

  /** Fetch the signed-in user's username + premium status in a single whoami
   *  round-trip. Returns null if not signed in or on error. */
  async fetchWhoami(): Promise<{ username: string; isPremium: boolean | null } | null> {
    try {
      const resp = await (this.lc as unknown as {
        whoami: () => Promise<
          { username?: string; isSignedIn?: boolean; isPremium?: boolean | null } | null
        >;
      }).whoami();
      if (!resp || !resp.isSignedIn || !resp.username) return null;
      return {
        username: resp.username,
        isPremium: typeof resp.isPremium === 'boolean' ? resp.isPremium : null,
      };
    } catch {
      return null;
    }
  }

  /** Fetch problem detail by slug. Returns the LC `question` object or null.
   *
   *  DIVERGENCE from fetchWhoami: Phase 2 callers (NoteWriter, D-13) need to
   *  distinguish "LC returned null" (treated as not-found OR session-expired,
   *  disambiguated via isSessionExpired) from "network threw" (treated as
   *  offline — Notice + abort). fetchWhoami conflates the two because it's
   *  display-only. Here we RE-THROW network errors so the caller can branch.
   *
   *  On success: returns the detail.
   *  On LC null-data: returns null (caller checks isSessionExpired vs not-found).
   *  On network error: throws (caller catches, inspects via isSessionExpired,
   *  and shows an appropriate Notice).
   */
  async getProblemDetail(slug: string): Promise<LeetCodeProblemDetail | null> {
    // Re-throw is implicit (no try/catch) — NoteWriter's error dispatch
    // (D-13 + Shared Pattern C) decides between session-expired and the
    // generic couldn't-fetch notice based on `isSessionExpired(err)`.
    const q = await (this.lc as unknown as {
      problem: (s: string) => Promise<LeetCodeProblemDetail | null>;
    }).problem(slug);
    if (!q || !q.questionFrontendId) return null;
    return q;
  }
}

/**
 * Detect LC session expiry from a LeetCode response. (AUTH-04 - Plan 02 OWNS this helper.)
 *
 * Overloads:
 *
 *   1. `isSessionExpired(resp)` — Phase 1/3 shape. Inspects a GraphQL-shaped
 *      body where `data === null` is the primary signal and an `errors[]`
 *      message matching /logged in|authentication|CSRF|unauthori[sz]ed/i is
 *      the secondary signal. Kept backward-compatible for NoteWriter,
 *      leetcodeRest assertNotSessionExpired, AuthService.
 *
 *   2. `isSessionExpired(body, status)` — Phase 4 D-30 extension. Widens the
 *      signal set for the submission-history GraphQL client:
 *        (a) HTTP 401 — true (LC's JSON 401 shape for unauthenticated REST,
 *            and GraphQL returns 401 on token-revoked requests)
 *        (b) HTTP 403 — true (bare 403 seen on expired csrftoken against
 *            GraphQL; there's no body shape to inspect)
 *        (c) HTTP 200 + body.errors[] matching an auth-ish message — true
 *            (GraphQL returns 200 on most auth failures, reports via errors[])
 *        (d) Otherwise — falls through to the Phase 1/3 body-only signal
 *            (helps when LC happens to return a 200 + `data: null` shape).
 *
 *  Both overloads are pure: no I/O, no throws. Callers decide whether to
 *  raise SessionExpiredError or surface a different notice.
 */
export function isSessionExpired(resp: unknown): boolean;
export function isSessionExpired(body: unknown, status: number): boolean;
export function isSessionExpired(respOrBody: unknown, status?: number): boolean {
  // Phase 4 D-30 overload — status-aware signals first.
  if (typeof status === 'number') {
    // (a) HTTP 401 — always session-expired for LC. Applies to both REST
    //     (`{"detail": "Authentication credentials were not provided."}`) and
    //     GraphQL (some auth failures return 401 directly).
    if (status === 401) return true;
    // (b) HTTP 403 — GraphQL path's expired-csrftoken shape.
    if (status === 403) return true;
    // (c) HTTP 200 with auth-ish errors[] entries — fall through to the
    //     body-only signal below (which already covers this case).
    // (d) Any other status → inspect body.
  }

  // Phase 1/3 body-only signal (primary: data === null; secondary: auth-ish
  // errors[] message). Shared by both overloads for shape-level detection.
  if (!respOrBody || typeof respOrBody !== 'object') return false;
  const r = respOrBody as { data?: unknown; errors?: Array<{ message?: string }> };
  if (r.data === null) return true;
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) =>
    /logged in|authentication|CSRF|unauthori[sz]ed/i.test(e?.message ?? '')
  );
}
