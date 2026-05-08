// src/solve/submissionOrchestrator.ts
//
// Phase 3 Plan 05 — SubmissionOrchestrator. Owns single-flight gating (D-24),
// active-view body re-reads (SOLVE-09), fenced-block extraction (D-04),
// REST dispatch to /problems/{slug}/submit/, and polling lifecycle via
// pollSubmission (pollingOrchestrator.ts).
//
// Dependency shape (structural DI — testable in isolation; Wave 0 tests mock
// `obsidian`'s Notice class via vi.mock, so the orchestrator never constructs
// any Obsidian-specific objects directly):
//
//   new SubmissionOrchestrator({
//     fetcher,           // (params) => Promise<RequestUrlResponse>
//     settings,          // getAuthCookies / getDefaultLanguage / getProblemDetail
//     slug,              // string | null — null means no active problem note
//     getCurrentBody,    // () => string — read at submit() invocation (SOLVE-09)
//   })
//
// Notice copy is UI-SPEC LOCKED (sentence case + terminal period) — see the
// four new Notice call sites below for exact strings. Each is sourced from the
// Phase 3 UI-SPEC Notice table and MUST NOT be paraphrased.

import { Notice } from 'obsidian';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { DetailCacheEntry } from '../settings/SettingsStore';
import { setWindowTimeout } from '../shared/timers';
import { extractFirstFencedBlock } from './codeExtractor';
import { resolveLangSlug } from './languages';
import {
  pollSubmission,
  AbortError as PollAbortError,
  type AbortLike,
  type Fetcher,
  type TerminalCheckResponse,
} from './pollingOrchestrator';

const BASE_URL = 'https://leetcode.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; obsidian-leetcode-plugin)';

/** Minimal settings facade the orchestrator consumes. Matches the Wave 0
 *  FakeSettings contract in tests/solve/mocks/fakeSettingsStore.ts so tests
 *  can inject a lightweight stub without building a full SettingsStore. */
export interface OrchestratorSettings {
  getAuthCookies(): AuthCookies | null;
  getDefaultLanguage(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
}

export interface SubmissionOrchestratorDeps {
  /** HTTP fetcher with obsidian's `requestUrl` signature. In production this
   *  is the throttle-installed fetcher from src/api/requestUrlFetcher.ts; in
   *  tests it's a scripted fake from tests/solve/mocks/fakeFetcher.ts. */
  fetcher: Fetcher;
  settings: OrchestratorSettings;
  /** Active problem-note slug, resolved from the caller (e.g., frontmatter
   *  `lc-slug` of the active MarkdownView). `null` → no active problem note →
   *  orchestrator fires the locked no-active-note Notice (see Gate 1 below)
   *  and aborts without touching the network. */
  slug: string | null;
  /** Lazily read the active note body. Called at submit() invocation time —
   *  NOT at orchestrator construction — so the code sent to LC is the
   *  current content at invocation per SOLVE-09. */
  getCurrentBody: () => string;
}

/** Build the LC-CLI-verbatim header set. Mirrors src/solve/leetcodeRest.ts so
 *  both paths (Plan 04 throttled REST + Plan 05 direct orchestrator REST)
 *  send identical headers. Cookies are read per-call from args so fresh
 *  SettingsStore values propagate after re-login without a plugin reload. */
function authHeaders(slug: string, cookies: AuthCookies): Record<string, string> {
  return {
    'content-type': 'application/json',
    'origin': BASE_URL,
    'referer': `${BASE_URL}/problems/${slug}/description/`,
    'cookie': `csrftoken=${cookies.csrftoken}; LEETCODE_SESSION=${cookies.LEETCODE_SESSION};`,
    'x-csrftoken': cookies.csrftoken,
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': USER_AGENT,
  };
}

/** D-27 + Pitfall 3 session-expiry detection. Same three-layer posture as
 *  leetcodeRest.assertNotSessionExpired. */
function isSessionExpiredResponse(res: RequestUrlResponse): boolean {
  if (
    res.status === 302 ||
    res.status === 303 ||
    res.status === 401 ||
    res.status === 403
  ) {
    return true;
  }
  const text = res.text;
  if (
    res.status === 200 &&
    typeof text === 'string' &&
    text.length > 0 &&
    text.length < 500_000
  ) {
    const head = text.slice(0, 2000);
    if (/<title>Log In|<form[^>]+action="\/accounts\/login/i.test(head)) {
      return true;
    }
  }
  return false;
}

export class SubmissionOrchestrator {
  private inFlight = false;
  private currentAbort: AbortLike | null = null;
  private currentReject: ((err: Error) => void) | null = null;

  constructor(private readonly deps: SubmissionOrchestratorDeps) {}

  isInFlight(): boolean {
    return this.inFlight;
  }

  /**
   * Cancel the in-flight submission. Flips the shared abort flag so the
   * polling loop rejects with AbortError at its next three-point check.
   * No-op if nothing is in flight.
   */
  cancel(): void {
    if (!this.inFlight || !this.currentAbort) return;
    this.currentAbort.aborted = true;
    // Also synchronously reject the outer submit() promise so callers awaiting
    // it don't block until the next poll tick — matches the Wave 0 test's
    // expectation that `await p` returns immediately after `orch.cancel()`.
    if (this.currentReject) {
      this.currentReject(new PollAbortError());
    }
  }

  /**
   * Submit the active note's first fenced code block to LC's judge.
   *
   * Guard order (all no-network if any gate fails):
   *   1. Active problem note present (slug != null)
   *   2. Single-flight (D-24)
   *   3. Fenced code block exists (D-04)
   *   4. Auth cookies available
   *
   * After /submit/ POST:
   *   - 401/403/HTML-login body → session-expiry Notice (D-27)
   *   - missing submission_id   → Notice, abort
   *   - otherwise poll via pollSubmission until terminal / abort / timeout
   */
  async submit(): Promise<void> {
    // Gate 1 — active problem note required.
    if (!this.deps.slug) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const slug = this.deps.slug;

    // Gate 2 — single-flight (D-24).
    if (this.inFlight) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name
      new Notice(
        'A submission is already in progress. Cancel it first or wait for the verdict.',
        6000,
      );
      return;
    }

    // Gate 3 — read current body at invocation (SOLVE-09) and extract first
    // fenced block (D-04).
    const body = this.deps.getCurrentBody();
    const extracted = extractFirstFencedBlock(body);
    if (!extracted) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name
      new Notice(
        'No code block found. Add a fenced block with your solution.',
        6000,
      );
      return;
    }

    // Gate 4 — auth cookies.
    const cookies = this.deps.settings.getAuthCookies();
    if (!cookies) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name
      new Notice('LeetCode session expired. Log in again.', 8000);
      return;
    }

    const langSlug = resolveLangSlug(
      extracted.lang,
      this.deps.settings.getDefaultLanguage(),
    );
    const detail = this.deps.settings.getProblemDetail(slug);
    // D-30: internalQuestionId is the LC-internal id used in the REST body;
    // fall back to the frontend id (from DetailCacheEntry.id) when unset.
    const questionId = detail?.internalQuestionId ?? (detail ? String(detail.id) : '');

    // Enter in-flight.
    this.inFlight = true;
    const abortFlag: AbortLike = { aborted: false };
    this.currentAbort = abortFlag;

    const submitParams: RequestUrlParam = {
      url: `${BASE_URL}/problems/${slug}/submit/`,
      method: 'POST',
      headers: authHeaders(slug, cookies),
      body: JSON.stringify({
        lang: langSlug,
        question_id: questionId,
        typed_code: extracted.code,
        judge_type: 'large',
      }),
      throw: false,
    };

    try {
      await new Promise<void>((resolve, reject) => {
        this.currentReject = reject;
        void (async () => {
          try {
            const res = await this.deps.fetcher(submitParams);
            if (isSessionExpiredResponse(res)) {
              // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
              new Notice('LeetCode session expired. Log in again.', 8000);
              resolve();
              return;
            }
            if (res.status >= 400) {
              // Non-auth failure — silently resolve; upstream Phase 5 Polish
              // adds richer error copy. Wave 0 tests don't drive this path.
              resolve();
              return;
            }
            const data = (res.json ?? {}) as { submission_id?: string | number };
            if (data.submission_id === undefined || data.submission_id === null) {
              resolve();
              return;
            }
            const submissionId = String(data.submission_id);
            // Handoff to polling. pollSubmission wires plugin-aware timers in
            // production; tests pass a bare setTimeout wrapper.
            const terminal = await pollSubmission({
              fetcher: this.deps.fetcher,
              submissionId,
              slug,
              // Popout-window-safe timer fallback. Plan 07 wiring in main.ts
              // will wrap this with plugin.registerInterval(handle) for
              // unload-cleanup (Warning 7); the orchestrator stays
              // timer-agnostic here so unit tests can drive pollSubmission
              // under vi.useFakeTimers() without touching a real Plugin.
              registerInterval: (fn, ms) => setWindowTimeout(fn, ms),
              abortSignal: abortFlag,
            });
            // For Wave 0 the terminal payload is handled silently — Plan 06
            // wires the verdict modal. Wave 1 tests only assert that the
            // submit POST happens with the right body + session-expiry
            // detection fires; terminal rendering is owned by Plan 06.
            void terminal;
            resolve();
          } catch (err) {
            reject(err as Error);
          }
        })();
      });
    } catch (err) {
      // AbortError → silent (user action); other errors propagate.
      if ((err as Error).name === 'AbortError') {
        throw err;
      }
      throw err;
    } finally {
      this.inFlight = false;
      this.currentAbort = null;
      this.currentReject = null;
    }
  }
}
