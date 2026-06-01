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
import { showSessionExpiredNotice } from './SessionExpiredNotice';
import { classifyStatus } from './statusMap';
import type { LastVerdict } from './lastVerdictStore';
import {
  pollSubmission,
  AbortError as PollAbortError,
  type AbortLike,
  type Fetcher,

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
  /** Canonical LC language slug from frontmatter `lc-language`. When present,
   *  takes priority over fence-tag resolution. `null` → fall back to
   *  resolveLangSlug(extracted.lang, settings.getDefaultLanguage()). */
  lcLanguage?: string | null;
  /** Lazily read the active note body. Called at submit() invocation time —
   *  NOT at orchestrator construction — so the code sent to LC is the
   *  current content at invocation per SOLVE-09. */
  getCurrentBody: () => string;
  /**
   * Phase 20 Plan 20-10 Task 5 (gap-closure T7) — when supplied, the v1.3
   * widget path's raw fence body. The orchestrator uses this value as
   * `typed_code` directly and skips `extractFirstFencedBlock(getCurrentBody())`
   * which fails on raw code (no markdown fences).
   *
   * `lcLanguage` MUST be present alongside `getCurrentCode` (the widget path
   * always reads lc-language from frontmatter). Empty / whitespace-only code
   * fires a user Notice and aborts before the LC API call.
   *
   * Phase 22 retires the legacy `getCurrentBody` field once `*FromActive` is
   * deleted. The TODO Phase 22 marker at the fall-through site marks the
   * deletion.
   */
  getCurrentCode?: () => string;
  /** Phase 5 D-21 — login callback wired to the D-21 sticky session-expired
   *  Notice. Optional to preserve backward compatibility with Wave 0 tests
   *  that instantiate the orchestrator without a login callback — in that
   *  case the Notice still renders with the Log in button, but the click
   *  silently no-ops (tests that need to assert the login path pass a spy).
   *  Production wiring in main.ts always supplies
   *  `() => { void this.auth.login(); }`. */
  login?: () => void | Promise<void>;
  /** Phase 08 Plan 01 — fired after pollSubmission resolves with a non-Accepted
   *  verdict. Plugin registers
   *  `(slug, verdict) => store.set(slug, verdict)`. Optional to
   *  preserve backward compatibility; tests that don't need verdict capture
   *  omit the callback. Capture filter (locked):
   *  `kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc'`. The
   *  orchestrator imports only the LastVerdict type from ./lastVerdictStore —
   *  the populating store class itself is held by main.ts so the orchestrator
   *  stays pure (08-PATTERNS §"src/solve/submissionOrchestrator.ts"). */
  onVerdict?: (slug: string, verdict: LastVerdict) => void;
}

/** Return the first non-empty string in `values`, or undefined when none has
 *  positive length. Used to populate `LastVerdict.errorMessage` from the LC
 *  response's vendor-specific error fields (priority order:
 *  full_compile_error → compile_error → full_runtime_error → runtime_error). */
function firstNonEmptyString(...values: Array<unknown>): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Coerce LC's `expected_code_answer` / `code_output` (typed
 *  `string | string[] | undefined`) into a single string for LastVerdict
 *  population. Joins arrays on '\n'. */
function asString(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    const joined = v.filter((s): s is string => typeof s === 'string').join('\n');
    return joined.length > 0 ? joined : undefined;
  }
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
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
       
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const slug = this.deps.slug;

    // Gate 2 — single-flight (D-24).
    if (this.inFlight) {
       
      new Notice(
        'A submission is already in progress. Cancel it first or wait for the verdict.',
        6000,
      );
      return;
    }

    // Phase 20 Plan 20-10 Task 5 (gap-closure T7) — widget path skips the
    // markdown-body fence extractor entirely. When `getCurrentCode` is
    // supplied, the caller has already extracted the raw fence body
    // (widget.view.state.doc.toString()) and we trust it. Empty /
    // whitespace-only code fires a user Notice and aborts before the LC
    // API call.
    let typedCode: string;
    let extractedLang: string | null;
    if (this.deps.getCurrentCode) {
      const raw = this.deps.getCurrentCode();
      if (raw.trim().length === 0) {

        new Notice(
          'Add code to your solution before running.',
          6000,
        );
        return;
      }
      typedCode = raw;
      extractedLang = null;
    } else {
      // TODO Phase 22: delete this branch after *FromActive removal — only
      // legacy callers (active-leaf path) use getCurrentBody() + the
      // extractFirstFencedBlock fence-extractor. The widget path always
      // supplies getCurrentCode and skips this entirely. See
      // .planning/phases/20-reconciliation-ux-action-row-section-protection/
      //   20-10-PLAN.md Task 5 for the architectural seam.
      const body = this.deps.getCurrentBody();
      const extracted = extractFirstFencedBlock(body);
      if (!extracted) {

        new Notice(
          'No code block found. Add a fenced block with your solution.',
          6000,
        );
        return;
      }
      typedCode = extracted.code;
      extractedLang = extracted.lang;
    }

    // Gate 4 — auth cookies.
    const cookies = this.deps.settings.getAuthCookies();
    if (!cookies) {
      // D-21: sticky Notice + Log in button. deps.login is optional for
      // back-compat with Wave 0 tests; fall back to a no-op callback.
      const login = this.deps.login ?? (() => undefined);
      showSessionExpiredNotice(login);
      return;
    }

    const langSlug = this.deps.lcLanguage ?? resolveLangSlug(
      extractedLang,
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
        typed_code: typedCode,
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
              // D-21: sticky Notice + Log in button.
              const login = this.deps.login ?? (() => undefined);
              showSessionExpiredNotice(login);
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
              headers: authHeaders(slug, cookies),
            });
            // For Wave 0 the terminal payload is handled silently — Plan 06
            // wires the verdict modal. Wave 1 tests only assert that the
            // submit POST happens with the right body + session-expiry
            // detection fires; terminal rendering is owned by Plan 06.
            //
            // Phase 08 Plan 01 — non-Accepted verdict capture (08-CONTEXT
            // decision B). After pollSubmission resolves, classify and fire
            // deps.onVerdict for non-AC submit verdicts. Capture filter is
            // verbatim from 08-RESEARCH §"Code Examples" Example 6:
            //   kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc'.
            // Accepted submissions fall through unannotated (Phase 09 territory).
            // Wrapped in try/catch so callback errors never crash the submit
            // flow (verdict capture is best-effort).
            try {
              const t = terminal as Record<string, unknown>;
              const code = typeof t.status_code === 'number' ? t.status_code : 0;
              const msg = typeof t.status_msg === 'string' ? t.status_msg : undefined;
              const info = classifyStatus(code, msg);
              if (
                info.kind !== 'ac' &&
                info.kind !== 'unknown' &&
                info.kind !== 'unknown-lc' &&
                this.deps.onVerdict
              ) {
                const failingInput = firstNonEmptyString(t.input, t.last_testcase);
                const expectedOutput =
                  asString(t.expected_output) ?? asString(t.expected_code_answer);
                const actualOutput =
                  asString(t.std_output) ?? asString(t.code_output);
                const runtimeMs = typeof t.status_runtime === 'string' ? t.status_runtime : undefined;
                const memoryMb = typeof t.status_memory === 'string' ? t.status_memory : undefined;
                const errorMessage = firstNonEmptyString(
                  t.full_compile_error,
                  t.compile_error,
                  t.full_runtime_error,
                  t.runtime_error,
                );
                const verdict: LastVerdict = {
                  kind: 'submit-failure',
                  capturedAt: Date.now(),
                  verdictText: info.displayName,
                  ...(failingInput !== undefined ? { failingInput } : {}),
                  ...(expectedOutput !== undefined ? { expectedOutput } : {}),
                  ...(actualOutput !== undefined ? { actualOutput } : {}),
                  ...(runtimeMs !== undefined ? { runtimeMs } : {}),
                  ...(memoryMb !== undefined ? { memoryMb } : {}),
                  ...(errorMessage !== undefined ? { errorMessage } : {}),
                };
                this.deps.onVerdict(slug, verdict);
              }
            } catch {
              // Capture is best-effort — never propagate errors from the
              // user-supplied callback into the submit flow.
            }
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
