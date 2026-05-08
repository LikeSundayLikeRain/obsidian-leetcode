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
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  exampleTestcases?: string;
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
    // Intentional try/catch: the explicit re-throw documents the D-13 contract —
    // NoteWriter's error dispatch (Shared Pattern C) decides between the
    // session-expired notice and the generic couldn't-fetch notice. Lint rule
    // `no-useless-catch` can't see the documentation load the block carries.
    // eslint-disable-next-line no-useless-catch
    try {
      const q = await (this.lc as unknown as {
        problem: (s: string) => Promise<LeetCodeProblemDetail | null>;
      }).problem(slug);
      if (!q || !q.questionFrontendId) return null;
      return q;
    } catch (err) {
      // Re-throw so NoteWriter's error dispatch (D-13 + Shared Pattern C) can
      // decide between the session-expired notice and the generic couldn't-fetch
      // notice.
      throw err;
    }
  }
}

/**
 * Detect LC session expiry from a GraphQL response. (AUTH-04 - Plan 02 OWNS this helper.)
 * Primary signal (most reliable): `data === null`.
 * Secondary signal: error-message pattern.
 */
export function isSessionExpired(resp: unknown): boolean {
  if (!resp || typeof resp !== 'object') return false;
  const r = resp as { data?: unknown; errors?: Array<{ message?: string }> };
  if (r.data === null) return true;
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) =>
    /logged in|authentication|CSRF|unauthori[sz]ed/i.test(e?.message ?? '')
  );
}
