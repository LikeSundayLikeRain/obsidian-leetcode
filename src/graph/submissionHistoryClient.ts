// src/graph/submissionHistoryClient.ts
//
// Phase 4 Plan 03 — Submission history GraphQL client (D-27 revised, D-28,
// D-29 revised, D-30 new). Post-2026-05-09 drift: LC migrated submission
// detail from HTML scrape to Next.js SPA + GraphQL. Both list and detail
// surfaces are now GraphQL; transport consistency buys us one client code
// path, one failure mode, one session-expiry check (D-27).
//
// CONTEXT: .planning/phases/04-knowledge-graph-wiring/04-CONTEXT.md §GraphQL / API
//          Mechanics (revised 2026-05-09) at L196-215 — AUTHORITATIVE. Fixtures
//          live at tests/fixtures/lc-submissions/. RESEARCH.md §Pattern B is
//          STALE and must NOT be used for the client design.
//
// Contract pins:
//   - All HTTP through Plan 03's `throttledRequestUrl` (CF-01, D-28). Method:
//     POST; content-type: application/json; body: JSON.stringify({query,
//     variables, operationName}).
//   - Mirrors the `src/solve/leetcodeRest.ts` shape — no dependency on
//     `@leetnotion/leetcode-api`'s submission helpers (library lags LC's
//     drift; see 04-CONTEXT.md D-27 rejected alternatives).
//   - Uses `authHeaders()` from leetcodeRest.ts for the LC-CLI-verbatim header
//     set. Detail calls pass `refererOverride` pointing at
//     `/submissions/detail/{id}/` because LC returns 403 when the referer
//     points at the problem URL (D-29 revised).
//   - submissionId is typed `Int!` in LC's schema — client parses the string
//     to a number and guards for non-numeric / path-injection attempts BEFORE
//     any network call. Guard regex: /^[0-9]+$/ + finite-positive numeric
//     check.
//   - Session-expiry fires on HTTP 401 + JSON detail, HTTP 403 bare, and HTTP
//     200 with errors[] containing /auth(enticat|oriz)/i (D-30). The widened
//     `isSessionExpired(body, status)` overload in src/api/LeetCodeClient.ts
//     handles all three signals in one call.
//   - NO persistence (D-07). Every picker invocation hits LC live. Throttle
//     absorbs the request volume (CF-09).
//
// Two exports:
//   - listSubmissionsForSlug(slug, cookies) → SubmissionRow[]
//   - detailForSubmission(id, cookies) → SubmissionDetail
//
// SubmissionPickerModal (Plan 04-04) calls listSubmissionsForSlug once on
// open; each row click lazy-fetches via detailForSubmission.

import { throttledRequestUrl } from '../api/throttle';
import { SessionExpiredError } from '../shared/errors';
import { isSessionExpired } from '../api/LeetCodeClient';
import { authHeaders } from '../solve/leetcodeRest';
import type { AuthCookies } from '../settings/SettingsStore';

const BASE_URL = 'https://leetcode.com';
const GRAPHQL_URL = `${BASE_URL}/graphql/`;

// ── Wire types — captured from live LC 2026-05-09 ─────────────────────────
//
// Canonical fixtures: tests/fixtures/lc-submissions/list-many.graphql.json
//                     tests/fixtures/lc-submissions/detail-ac.graphql.json
//                     tests/fixtures/lc-submissions/detail-wa.graphql.json
//
// Exported shapes are the *mapper output* — SubmissionRow + SubmissionDetail —
// which the picker/detail modal consumes. Internal wire shapes (with LC's
// quirks like `isPending: 'Not Pending'`, string timestamps, etc.) live only
// inside this module.

/** Normalised row for SubmissionPickerModal. Maps LC's `questionSubmissionList`
 *  entry shape. `timestamp` is a number (parsed from LC's string) for easy
 *  Date construction in the modal. */
export interface SubmissionRow {
  /** LC submission id (string — `questionSubmissionList` returns it as string,
   *  but the `submissionDetails($submissionId: Int!)` query requires an Int.
   *  Callers pass this to detailForSubmission which parses + validates. */
  id: string;
  title: string;
  titleSlug: string;
  /** LC status_code (10 = AC, 11 = WA, 14 = TLE, etc.). See statusMap.ts. */
  status: number;
  statusDisplay: string;
  /** LC langSlug (python3, java, cpp, …). */
  lang: string;
  langName: string;
  /** LC's display string — `"12 ms"` on success, `"N/A"` on non-terminal. */
  runtime: string;
  /** Unix seconds. LC returns it as a string; mapper parses to number. */
  timestamp: number;
  /** LC path — `/submissions/detail/{id}/`. */
  url: string;
  memory: string;
  hasNotes: boolean;
  notes: string;
  flagType: string;
  frontendId: number;
  topicTags: Array<{ name: string; slug: string }>;
}

/** Normalised detail for SubmissionDetailModal. Passes through every useful
 *  field from LC's `submissionDetails` query. Fields LC returns null for
 *  (percentiles on N/A runs, etc.) stay null. */
export interface SubmissionDetail {
  runtime: number;
  runtimeDisplay: string;
  runtimePercentile: number | null;
  memory: number;
  memoryDisplay: string;
  memoryPercentile: number | null;
  code: string;
  timestamp: number;
  statusCode: number;
  user: {
    username: string;
    profile: { realName: string; userAvatar: string } | null;
  };
  lang: { name: string; verboseName: string };
  question: { questionId: string; titleSlug: string; hasFrontendPreview: boolean };
  notes: string;
  flagType: string;
  topicTags: Array<{ tagId: string; slug: string; name: string }>;
  runtimeError: string | null;
  compileError: string | null;
  fullCodeOutput: string | null;
  testDescriptions: string | null;
  testBodies: string | null;
  testInfo: string | null;
}

// ── GraphQL query bodies (verbatim from live LC 2026-05-09) ───────────────

/** `questionSubmissionList` — LC's own submission panel uses this. Returns
 *  a bounded page (20 rows by default) plus `hasNext` + `lastKey` for
 *  pagination. Phase 4 requests a single page; pagination is a Phase 5
 *  Polish item if users want to scroll past 20 submissions per problem. */
const LIST_QUERY = `query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!, $lang: Int, $status: Int) {
  questionSubmissionList(
    offset: $offset
    limit: $limit
    lastKey: $lastKey
    questionSlug: $questionSlug
    lang: $lang
    status: $status
  ) {
    lastKey
    hasNext
    submissions {
      id
      title
      titleSlug
      status
      statusDisplay
      lang
      langName
      runtime
      timestamp
      url
      isPending
      memory
      hasNotes
      notes
      flagType
      frontendId
      topicTags {
        name
        slug
      }
    }
  }
}`;

/** `submissionDetails` — per-submission code + metadata. `$submissionId` is
 *  typed `Int!` — LC enforces this at the schema level (string coercion
 *  returns a schema-validation error). Referer header must point at the
 *  detail URL or LC returns 403 (D-29 revised). */
const DETAIL_QUERY = `query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtime
    runtimeDisplay
    runtimePercentile
    memory
    memoryDisplay
    memoryPercentile
    code
    timestamp
    statusCode
    user {
      username
      profile {
        realName
        userAvatar
      }
    }
    lang {
      name
      verboseName
    }
    question {
      questionId
      titleSlug
      hasFrontendPreview
    }
    notes
    flagType
    topicTags {
      tagId
      slug
      name
    }
    runtimeError
    compileError
    fullCodeOutput
    testDescriptions
    testBodies
    testInfo
  }
}`;

// ── Session-expiry assertion (D-30) ───────────────────────────────────────

/** Raise SessionExpiredError on any D-30 signal. Delegates to the widened
 *  `isSessionExpired(body, status)` overload added in Phase 4. Kept here as
 *  a tight helper so the two public exports share one guard site. */
function assertNotGraphqlSessionExpired(status: number, body: unknown): void {
  if (isSessionExpired(body, status)) {
    throw new SessionExpiredError();
  }
}

// ── listSubmissionsForSlug ────────────────────────────────────────────────

/** Fetch the submission list for `slug`. Single page (20 rows) per call;
 *  pagination is a Phase 5 enhancement (D-28 throttle absorbs the single
 *  round trip).
 *
 *  Throws SessionExpiredError on D-30 signal; Error on any other HTTP ≥ 400;
 *  raw requestUrl rejection propagates (Obsidian surfaces it as a network
 *  error — caller's inline-in-modal handling per D-06 picks up the message).
 */
export async function listSubmissionsForSlug(
  slug: string,
  cookies: AuthCookies,
): Promise<SubmissionRow[]> {
  const body = {
    operationName: 'submissionList',
    query: LIST_QUERY,
    variables: {
      offset: 0,
      limit: 20,
      lastKey: null,
      questionSlug: slug,
      // lang + status omitted — picker shows ALL verdicts + ALL languages (D-05).
    },
  };

  const res = await throttledRequestUrl({
    url: GRAPHQL_URL,
    method: 'POST',
    headers: authHeaders(slug, cookies),
    body: JSON.stringify(body),
    throw: false,
  });

  assertNotGraphqlSessionExpired(res.status, res.json);

  if (res.status >= 400) {
    throw new Error(
      `listSubmissionsForSlug HTTP ${String(res.status)}: ${res.text.slice(0, 200)}`,
    );
  }

  const payload = res.json as {
    data?: {
      questionSubmissionList?: {
        submissions?: Array<Record<string, unknown>>;
      };
    };
  };
  const raw = payload.data?.questionSubmissionList?.submissions ?? [];
  return raw.map(mapListRow);
}

/** Map LC's wire-shape submission entry into our normalised SubmissionRow.
 *  Handles the quirky string-typed fields (id, timestamp, frontendId on older
 *  responses) via defensive casts. Unknown-shape entries fall back to
 *  sensible defaults rather than throwing — one malformed row shouldn't blow
 *  up the whole picker. */
function mapListRow(raw: Record<string, unknown>): SubmissionRow {
  const timestampRaw = raw.timestamp;
  let timestamp = 0;
  if (typeof timestampRaw === 'number') {
    timestamp = timestampRaw;
  } else if (typeof timestampRaw === 'string') {
    const parsed = Number(timestampRaw);
    if (Number.isFinite(parsed)) timestamp = parsed;
  }

  const topicTagsRaw = Array.isArray(raw.topicTags) ? raw.topicTags : [];
  const topicTags: Array<{ name: string; slug: string }> = topicTagsRaw
    .map((t: unknown) => {
      if (!t || typeof t !== 'object') return null;
      const rec = t as { name?: unknown; slug?: unknown };
      if (typeof rec.name === 'string' && typeof rec.slug === 'string') {
        return { name: rec.name, slug: rec.slug };
      }
      return null;
    })
    .filter((t): t is { name: string; slug: string } => t !== null);

  // id — LC returns a numeric-string. Narrow to primitive before String()
  // to avoid '[object Object]' from the typescript-eslint/no-base-to-string
  // rule (malformed LC response defensive mitigation).
  const idPrimitive =
    typeof raw.id === 'string' || typeof raw.id === 'number'
      ? raw.id
      : '';

  return {
    id: String(idPrimitive),
    title: typeof raw.title === 'string' ? raw.title : '',
    titleSlug: typeof raw.titleSlug === 'string' ? raw.titleSlug : '',
    status: typeof raw.status === 'number' ? raw.status : 0,
    statusDisplay: typeof raw.statusDisplay === 'string' ? raw.statusDisplay : '',
    lang: typeof raw.lang === 'string' ? raw.lang : '',
    langName: typeof raw.langName === 'string' ? raw.langName : '',
    runtime: typeof raw.runtime === 'string' ? raw.runtime : '',
    timestamp,
    url: typeof raw.url === 'string' ? raw.url : '',
    memory: typeof raw.memory === 'string' ? raw.memory : '',
    hasNotes: raw.hasNotes === true,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    flagType: typeof raw.flagType === 'string' ? raw.flagType : '',
    frontendId: typeof raw.frontendId === 'number' ? raw.frontendId : 0,
    topicTags,
  };
}

// ── detailForSubmission ───────────────────────────────────────────────────

/** Fetch `submissionDetails` for a single submission id.
 *
 *  Security posture (T-04-03-02 threat mitigation):
 *  The `id` parameter MUST be all-digit numeric before any network call.
 *  LC's schema types `submissionId` as `Int!` — path-injection attempts
 *  (`'../../admin'`), non-numeric strings, empty strings, or overflow
 *  values trip the guard and reject BEFORE throttledRequestUrl is invoked.
 *
 *  Throws:
 *   - Error — id fails the numeric guard (no network call made)
 *   - SessionExpiredError — D-30 signal (any of 401 / 403 / 200+auth-errors)
 *   - Error — HTTP ≥ 400 with request context in the message
 *   - Error — well-formed response missing submissionDetails
 */
export async function detailForSubmission(
  id: string,
  cookies: AuthCookies,
): Promise<SubmissionDetail> {
  // T-04-03-02 — defense-in-depth. Reject everything that isn't a positive
  // decimal integer BEFORE the network call.
  if (typeof id !== 'string' || id.length === 0 || !/^[0-9]+$/.test(id)) {
    throw new Error(
      `detailForSubmission: submission id must be a numeric string (got ${JSON.stringify(id)})`,
    );
  }
  const submissionId = Number(id);
  if (!Number.isFinite(submissionId) || submissionId <= 0 || !Number.isInteger(submissionId)) {
    throw new Error(
      `detailForSubmission: submission id out of range (got ${JSON.stringify(id)})`,
    );
  }

  const body = {
    operationName: 'submissionDetails',
    query: DETAIL_QUERY,
    variables: { submissionId }, // Int, not string — LC enforces via schema.
  };

  // D-29 revised: referer MUST point at the submission detail URL. LC returns
  // 403 if the referer points at the problem URL for this query. `slug` is
  // passed to authHeaders for completeness (it populates other header logic
  // unchanged) but the refererOverride wins.
  const referer = `${BASE_URL}/submissions/detail/${id}/`;
  // We don't have the slug at this boundary (picker → detail is id-driven);
  // pass a sentinel slug that authHeaders won't use because refererOverride
  // replaces the one header that would otherwise consume it.
  const headers = authHeaders('_submission-detail', cookies, referer);

  const res = await throttledRequestUrl({
    url: GRAPHQL_URL,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    throw: false,
  });

  assertNotGraphqlSessionExpired(res.status, res.json);

  if (res.status >= 400) {
    throw new Error(
      `detailForSubmission HTTP ${String(res.status)}: ${res.text.slice(0, 200)}`,
    );
  }

  const payload = res.json as {
    data?: { submissionDetails?: SubmissionDetail | null };
  };
  const detail = payload.data?.submissionDetails;
  if (!detail) {
    throw new Error(
      `detailForSubmission: missing submissionDetails in response for id ${id}`,
    );
  }
  return detail;
}
