// src/api/LeetCodeClient.ts
// Thin wrapper over @leetnotion/leetcode-api. All network calls flow through
// `installRequestUrlFetcher()`'s replaced fetcher -> throttle -> requestUrl.
//
// OWNERSHIP: `isSessionExpired` is defined here and ONLY here (AUTH-04). Plan 03
// (AuthService) and Plan 06 (ProblemBrowserView) both call it from error paths.
// Neither redefines it.
import { LeetCode, Credential } from '@leetnotion/leetcode-api';
import type { SettingsStore } from '../settings/SettingsStore';

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
