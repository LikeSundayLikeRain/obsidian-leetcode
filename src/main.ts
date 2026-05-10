// src/main.ts
// LeetCodePlugin entry — Obsidian lifecycle + wiring. Order is LOCKED by RESEARCH.md Pitfall 1
// AND by AuthService's two-arg constructor (BLOCKER 2 alignment):
//   1. Load settings (has cookies if stored)
//   2. Install requestUrl fetcher (BEFORE any LC client construction — Credential.init fires eagerly)
//   3. Construct LeetCodeClient (depends on SettingsStore)
//   4. Construct AuthService(settings, client) — TWO-ARG; LC client must exist by now
//   5. Construct ProblemListService (depends on client + settings)
//   5.5. Construct NoteWriter (Phase 2 — row-click orchestrator; depends on app + client + settings)
//   5.6. Phase 3 — register solve-path state (commands wired in Step 6c).
//   6. Register view, ribbon, commands, settings tab
//
// Phase 3 note on the solve-path wiring shape: Plan 05 shipped
// SubmissionOrchestrator with a fetcher-based DI shape (NOT the modalFactory
// shape the plan sketch described). Plan 07 therefore wires the modal in the
// COMMAND LAYER rather than inside the orchestrator — the command lambda
// opens VerdictModal, sniffs polling-detail responses off a wrapping fetcher
// to capture the terminal payload, and drives the modal transitions itself.
// This keeps the Plan 05 orchestrator untouched (its public API is just
// submit/cancel/isInFlight) while still satisfying Plan 07's user-facing
// contract (pending → verdict / abort / timeout).
import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher, throttledRequestUrl } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { ProblemBrowserView, BROWSER_VIEW_TYPE } from './browse/ProblemBrowserView';
import { NoteWriter } from './notes/NoteWriter';
import { isLegacyLeetcodeBaseV010 } from './notes/BaseFile';
import { LeetCodeSettingTab } from './settings/SettingsTab';
// Phase 3 Plan 07 imports — orchestrator + modals + REST + pure utilities.
import { SubmissionOrchestrator } from './solve/submissionOrchestrator';
import { VerdictModal } from './solve/VerdictModal';
import { CustomTestModal } from './solve/CustomTestModal';
import { readCasesFromVault } from './solve/customTestStore';
import { forceInjectCodeSection } from './solve/starterCodeInjector';
import { extractFirstFencedBlock } from './solve/codeExtractor';
import { resolveLangSlug } from './solve/languages';
import { interpretSolution, authHeaders } from './solve/leetcodeRest';
import {
  RateLimitError,
  SessionExpiredError,
  UnknownVerdictError,
  isNetworkError,
  TimeoutError,
} from './shared/errors';
import { showSessionExpiredNotice } from './solve/SessionExpiredNotice';
import { classifyStatus } from './solve/statusMap';
// Phase 4 Plan 05 — knowledge-graph wiring.
import { KnowledgeGraphWriter } from './graph/KnowledgeGraphWriter';
import { SubmissionHistoryStore } from './graph/SubmissionHistoryStore';
import {
  listSubmissionsForSlug,
  detailForSubmission,
  type SubmissionRow,
} from './graph/submissionHistoryClient';
import { SubmissionPickerModal } from './graph/SubmissionPickerModal';
import { SubmissionDetailModal } from './graph/SubmissionDetailModal';
import { toIsoLocalTz } from './graph/dateFormat';
// T-03-04-05 mitigation — classify-and-throw helper extracted for testability.
import { assertKnownVerdictOrThrow } from './solve/verdictGuard';

// T-03-05-01 mitigation — slug guard extracted to src/solve/slugGuard.ts for
// independent testability. main.ts imports and re-uses the same guard at all
// 5 editorCheckCallback sites + getActiveProblemContext().
import { isValidSlug } from './solve/slugGuard';
import {
  pollSubmission,
  AbortError as PollAbortError,
  JudgeTimeoutError,
  type AbortLike,
  type TerminalCheckResponse,
} from './solve/pollingOrchestrator';
import { setWindowTimeout } from './shared/timers';
import { logger } from './shared/logger';
import type { SubmitCheckResponse, RunCheckResponse } from './solve/types';

/** Shape returned by getActiveProblemContext — the minimum info every Phase 3
 *  command needs: the TFile (for readCasesFromVault etc.), the slug (from
 *  lc-slug frontmatter), and a live `currentBody()` getter that re-reads at
 *  invocation time (SOLVE-09). */
interface ProblemContext {
  view: MarkdownView;
  file: TFile;
  slug: string;
  title: string;
  currentBody: () => string;
}

export default class LeetCodePlugin extends Plugin {
  settings!: SettingsStore;
  client!: LeetCodeClient;
  auth!: AuthService;
  list!: ProblemListService;
  notes!: NoteWriter;
  // Phase 4 Plan 05 — knowledge-graph singletons. Constructed after notes in
  // onload(); knowledgeGraph.onAccepted is invoked from submitFromActive after
  // the verdict classification (D-08 / D-23 gate). SubmissionHistoryStore is
  // the NoteWriter on-open-hook target (D-02) and the picker's data source
  // (D-03).
  knowledgeGraph!: KnowledgeGraphWriter;
  submissionHistory!: SubmissionHistoryStore;

  // Phase 3 solve-path state.
  //   activeSolve: currently-in-flight submission/run orchestrator-wrapper.
  //     Tracks the single-flight state across ALL phase-3 commands (submit,
  //     run-sample, run-custom) so the Cancel command can abort whichever is
  //     running and the guard fires for any attempted concurrent kick-off.
  private activeSolve: ActiveSolve | null = null;

  async onload(): Promise<void> {
    // Step 1 — load persisted settings (cookies, folder, language, index)
    this.settings = await SettingsStore.load(this);

    // Step 2 — install requestUrl fetcher BEFORE any LC construction (RESEARCH.md Pitfall 1).
    // @leetnotion/leetcode-api's Credential.init() fires an eager fetch; if our shim isn't
    // in place yet, that call hits cross-fetch directly and CORS-fails.
    installRequestUrlFetcher();

    // Step 3 — construct LC client. Must come BEFORE AuthService because AuthService's
    // two-arg constructor takes the client (BLOCKER 2).
    this.client = new LeetCodeClient(this.settings);
    // WR-01: if cookies were persisted from a prior run, reauthenticate NOW
    // so the client's Credential is fully initialised before any feature
    // code issues an API call. Failures here surface as a plain logged-out
    // state on next API call (isSessionExpired catches the null-data
    // signal); swallow so plugin load never fails on a transient network
    // hiccup at startup.
    await this.client.reauthenticate().catch(() => undefined);

    // Step 4 — auth service orchestrates login/logout. TWO-ARG constructor.
    this.auth = new AuthService(this.settings, this.client);

    // Step 5 — list service (depends on client + settings).
    this.list = new ProblemListService(this.client, this.settings);

    // Step 5.5 — note writer (depends on app + client + settings). Phase 2.
    // Row-click in ProblemBrowserView delegates to plugin.openProblem(slug)
    // which in turn delegates to this.notes.openProblem(slug).
    this.notes = new NoteWriter(this.app, this.client, this.settings);
    // Phase 5 D-21 — wire the sticky session-expired Notice's Log in action.
    this.notes.setLogin(() => { void this.auth.login(); });

    // Step 5.6 — Phase 3 solve-path state already nulled; commands wired in 6c.

    // Step 5.7 — Phase 4 knowledge-graph singletons.
    //
    // SubmissionHistoryStore: shared in-memory cache between NoteWriter's
    // on-open prefetch (D-02) and the picker's fetch (D-03). fetchHistory is
    // a thin lambda that reads the current auth cookies at call time so
    // logout → re-login doesn't leave the store pointing at stale credentials.
    // D-07 compliance: no data.json persistence — the store lives only for
    // this plugin session.
    this.submissionHistory = new SubmissionHistoryStore({
      fetchHistory: async (slug: string) => {
        const cookies = this.settings.getAuthCookies();
        if (!cookies) throw new SessionExpiredError();
        return listSubmissionsForSlug(slug, cookies);
      },
    });

    // KnowledgeGraphWriter: on-AC orchestrator for frontmatter + ## Techniques
    // + stub notes (D-08, D-09). Structural settings-facade — passes through
    // only the three methods the writer needs.
    this.knowledgeGraph = new KnowledgeGraphWriter({
      app: this.app,
      settings: {
        getProblemDetail: (slug: string) => this.settings.getProblemDetail(slug),
        getAutoBacklinksEnabled: () => this.settings.getAutoBacklinksEnabled(),
        getTechniquesFolder: () => this.settings.getTechniquesFolder(),
      },
    });

    // D-02 — install the on-open hook so every problem-note reveal fires a
    // background submission-history prefetch. Fire-and-forget; the store's
    // own rejection path (SessionExpiredError + HTTP errors) is swallowed here
    // so a picker opened later sees the fresh list OR a live retry.
    this.notes.setOnNoteOpen((slug) => {
      void this.submissionHistory.prefetch(slug).catch((err) => {
        logger.debug('graph.prefetch: non-fatal (silent-offline per D-02/D-12)', err);
      });
    });

    // Step 6a — register the browser view.
    this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemBrowserView(leaf, this));

    // Step 6b — ribbon icon (BROWSE-01). Lucide name from UI-SPEC.md § Icons.
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
    this.addRibbonIcon('code-2', 'Open LeetCode browser', () => {
      void this.activateBrowser();
    });

    // Step 6c — command palette entries. Shared Pattern 8 rules:
    //   - id does NOT contain the plugin id ('leetcode') or the word 'command'
    //   - name is sentence case and does NOT start with the plugin name
    //   - NO hotkeys field (commands/no-default-hotkeys)
    // Plan 06 acceptance criterion LOCKS the 'open-leetcode-browser' id verbatim;
    // Obsidian prefixes it at runtime with the plugin id.
    this.addCommand({
      // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id -- Plan 06 acceptance grep pins this id verbatim
      id: 'open-leetcode-browser',
      name: 'Open problem browser',
      callback: () => { void this.activateBrowser(); },
    });

    // GAP-11 — explicit "Refresh current problem" command. editorCheckCallback
    // so the command is only enabled when the active note has an `lc-slug`
    // frontmatter entry (i.e., is a plugin-generated problem note). Community
    // plugin rules carried forward:
    //   - id does NOT contain 'obsidian' or 'command' (substring check in CR gate)
    //   - id does NOT contain the plugin id 'leetcode' (no-plugin-id-in-command-id)
    //   - name is sentence case and does NOT start with the plugin name
    //   - NO hotkeys field (commands/no-default-hotkeys)
    this.addCommand({
      id: 'refresh-current-problem',
      // Name deliberately omits "LeetCode" — Obsidian's command palette already
      // prefixes the plugin display name, so including it would duplicate it
      // (`LeetCode: Refresh current problem from LeetCode`). Keeping it short
      // also satisfies the obsidianmd/commands/no-plugin-name-in-command-name
      // lint rule.
      name: 'Refresh current problem',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const fm: Record<string, unknown> | undefined = cache?.frontmatter;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) {
          void this.refreshProblem(slug);
        }
        return true;
      },
    });

    // ── Phase 3 Plan 07 command set (5 commands) ────────────────────────
    // All five gate on the active editor having an `lc-slug` frontmatter
    // entry (so the Obsidian command palette disables them on non-problem
    // notes via editorCheckCallback returning false). Cancel is the
    // exception — it is enabled whenever an activeSolve is present.

    // Run code (sample) — invokes LC's /interpret_solution/ endpoint with the
    // problem's exampleTestcases. Opens a VerdictModal in pending state, polls
    // via pollSubmission, then renders the terminal verdict (RunCheckResponse).
    this.addCommand({
      id: 'run-sample',
      name: 'Run code (sample)',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!isValidSlug(fm?.['lc-slug'])) return false;
        if (!checking) { void this.runSampleFromActive(); }
        return true;
      },
    });

    // Run code (custom input) — opens CustomTestModal seeded from the note's
    // `## Custom Tests` section (readCasesFromVault). On Run, invokes LC's
    // /interpret_solution/ with the active tab's dataInput and renders the
    // VerdictModal. Persist-on-close is owned by CustomTestModal itself (D-17).
    this.addCommand({
      id: 'run-custom',
      name: 'Run code (custom input)',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!isValidSlug(fm?.['lc-slug'])) return false;
        if (!checking) { void this.openCustomTestModalFromActive(file); }
        return true;
      },
    });

    // Submit — full judge run. Delegates to SubmissionOrchestrator (Plan 05)
    // for gate enforcement + /submit/ POST + polling cadence. The command
    // lambda wraps the orchestrator with VerdictModal lifecycle glue.
    this.addCommand({
      id: 'submit',
      name: 'Submit',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!isValidSlug(fm?.['lc-slug'])) return false;
        if (!checking) { void this.submitFromActive(); }
        return true;
      },
    });

    // Insert starter code — unconditionally replaces the first recognized
    // fenced block under `## Code` with a fresh starter from the cached
    // detail's codeSnippets (D-07 forced variant). Uses Plan 02 Task 4's
    // forceInjectCodeSection helper — Plan 07 only imports and invokes.
    this.addCommand({
      id: 'insert-starter-code',
      name: 'Insert starter code',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) { void this.insertStarterCodeForced(file, slug); }
        return true;
      },
    });

    // Phase 4 Plan 05 (D-03) — View past submissions.
    // Opens SubmissionPickerModal against the active problem note; the picker
    // reads through this.submissionHistory (prefetched on open per D-02 via
    // the NoteWriter hook). Row click hands off to SubmissionDetailModal
    // which lazy-fetches the full detail via detailForSubmission (D-04).
    this.addCommand({
      id: 'view-past-submissions',
      // Name per 04-CONTEXT §D-03 — sentence-case, no plugin-id prefix.
      name: 'View past submissions',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!isValidSlug(fm?.['lc-slug'])) return false;
        if (!checking) { void this.openSubmissionPickerFromActive(); }
        return true;
      },
    });

    // Cancel running submission — global checkCallback (not editor-scoped).
    // Enabled whenever an activeSolve is present; disabled otherwise. Flips
    // the shared abort flag so the polling loop rejects with AbortError at
    // its next three-point check.
    this.addCommand({
      id: 'cancel-submission',
      name: 'Cancel running submission',
      checkCallback: (checking) => {
        if (!this.activeSolve) return false;
        if (!checking) {
          const modal = this.activeSolve.modal;
          this.cancelActiveSolve();
          // Palette cancel: close the modal directly. The modal's own
          // onClose guard no-ops because we just nulled activeSolve.
          try { modal.close(); } catch { /* headless */ }
        }
        return true;
      },
    });

    // Step 6d — settings tab.
    this.addSettingTab(new LeetCodeSettingTab(this.app, this));

    // GAP-6: fire-and-forget one-time migration Notice for users on the
    // v0.1.0 broken LeetCode.base schema. Non-blocking; never throws into
    // plugin activation (D-18 never-overwrite — user must delete manually).
    void this.checkLegacyLeetcodeBase().catch(() => undefined);
  }

  /**
   * GAP-6: one-time migration Notice for users on the v0.1.0 broken
   * LeetCode.base schema. Shows once per install; user must manually delete
   * the file to regenerate — we never auto-delete or auto-overwrite (D-18).
   */
  private async checkLegacyLeetcodeBase(): Promise<void> {
    await runLegacyBaseCheck({
      settings: this.settings,
      readBaseFile: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        try {
          return await this.app.vault.read(file);
        } catch {
          return null;
        }
      },
      showNotice: (msg, ms) => {
        new Notice(msg, ms);
      },
    });
  }

  onunload(): void {
    // FND-05: plugin must enable/disable without crashes.
    // Obsidian tears down registered views / commands / ribbon icons automatically;
    // we do not need explicit cleanup because all subscriptions go through plugin.registerX().
    // Phase 3: abort any in-flight solve so its polling timers don't fire
    // after the plugin is torn down. setWindowTimeout-scheduled polls still
    // chain to real setTimeouts; flipping the abort flag ensures the next
    // three-point check rejects and the chain stops.
    if (this.activeSolve) {
      this.activeSolve.abort.aborted = true;
      this.activeSolve = null;
    }
  }

  /** Phase 2 entry point for row-click in ProblemBrowserView.
   *  Delegates to NoteWriter.openProblem(slug, initialStatus). Safe-to-await;
   *  errors are swallowed inside NoteWriter (D-12 silent-offline) or surfaced
   *  via Notice (D-13 new-note fetch failure).
   *
   *  GAP-2a: `initialStatus` is the user's current LC submission status for
   *  this problem, sourced from the clicked IndexedProblem row. NoteWriter
   *  translates this into the on-disk `lc-status` vocabulary on first write.
   *  D-04 non-downgrade guard in applyFrontmatter means an existing
   *  'accepted' never gets clobbered on re-open. */
  async openProblem(
    slug: string,
    initialStatus?: 'solved' | 'attempted' | 'untouched',
  ): Promise<void> {
    return this.notes.openProblem(slug, initialStatus);
  }

  /** GAP-11: force-refresh the `## Problem` body of the currently-open note,
   *  bypassing the 7-day cache TTL. Invoked by the "Refresh current problem"
   *  command palette entry. Delegates to NoteWriter.forceRefresh which owns
   *  cache invalidation, body rewrite (via vault.process), and frontmatter
   *  update (via processFrontMatter). All error surfaces via Notice — unlike
   *  background-refresh (D-12 silent), this is an explicit user action so
   *  failure copy is surfaced. */
  async refreshProblem(slug: string): Promise<void> {
    return this.notes.forceRefresh(slug);
  }

  private async activateBrowser(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(BROWSER_VIEW_TYPE);
    if (existing[0]) {
      // revealLeaf is a Promise<void> in Obsidian 1.7.2+; we await it. For older Obsidian it
      // returns void (Promise semantics still safe to await via microtask).
      // eslint-disable-next-line obsidianmd/no-unsupported-api -- FND-05 tested against desktop 1.5+ per smoke plan; revealLeaf works in 1.5.x at runtime with harmless return-type drift
      await workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: BROWSER_VIEW_TYPE, active: true });
    // eslint-disable-next-line obsidianmd/no-unsupported-api -- see above: smoke test covers 1.5+
    await workspace.revealLeaf(leaf);
  }

  // ── Phase 3 command helpers ─────────────────────────────────────────

  /** Return the active problem-note context, or null if no eligible note is
   *  focused. Rejects non-markdown views and markdown views without an
   *  lc-slug frontmatter entry (editorCheckCallback already gates the
   *  palette but this helper is used by the custom-input path which is
   *  invoked from other command lambdas). */
  private getActiveProblemContext(): ProblemContext | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return null;
    const file = view.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    const slug = fm?.['lc-slug'];
    const title = fm?.['lc-title'];
    if (!isValidSlug(slug)) return null;
    return {
      view,
      file,
      slug,
      title: typeof title === 'string' ? title : slug,
      currentBody: () => view.editor.getValue(),
    };
  }

  /** D-24 single-flight guard — shared across all Phase 3 solve commands.
   *  Fires the locked Notice and returns false when an in-flight op exists. */
  private guardSingleFlight(): boolean {
    if (!this.activeSolve) return true;
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
    new Notice(
      'A submission is already in progress. Cancel it first or wait for the verdict.',
      6000,
    );
    return false;
  }

  /** Cancel the current activeSolve (if any). Flips the abort flag; the
   *  polling loop rejects at its next three-point check. The command
   *  lambda's .catch branch then closes the modal. Also clears
   *  this.activeSolve eagerly so a rapid re-kick succeeds. */
  private cancelActiveSolve(): void {
    if (!this.activeSolve) return;
    this.activeSolve.abort.aborted = true;
    // NOTE: do NOT close the modal here. Callers are expected to be either:
    //   (a) the Cancel button inside the modal — Obsidian closes via
    //       the button's own `this.close()` after onCancel returns;
    //   (b) VerdictModal.onClose's pending-state guard — modal is already
    //       closing when onCancel runs here, so calling `modal.close()`
    //       would either no-op or, worse, race against a NEW modal if
    //       the user has re-submitted between close and the orchestrator's
    //       poll-reject settling (#UAT-flash).
    // Clearing activeSolve here is safe because the orchestrator's finally
    // block also clears it when the poll rejection settles; whichever gets
    // there first wins.
    this.activeSolve = null;
  }

  /** Submit the active note via SubmissionOrchestrator (Plan 05). Opens a
   *  VerdictModal, drives it through pending → terminal / abort / timeout. */
  private async submitFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    if (!this.guardSingleFlight()) return;

    const modal = new VerdictModal(this.app, {
      problemTitle: ctx.title,
      onCancel: () => { this.cancelActiveSolve(); },
      onCopyFailingInput: (input: string) => {
        void this.openCustomTestModalWithSeeded(input);
      },
    });
    modal.open();

    // Sniff the polling-detail responses off the wrapping fetcher so we can
    // capture the terminal payload (Plan 05 orchestrator discards it). The
    // orchestrator uses the `throttledRequestUrl` fetcher; we wrap it with a
    // closure-local capture of the last terminal body.
    let terminal: TerminalCheckResponse | null = null;
    const sniffingFetcher = async (params: RequestUrlParam): Promise<RequestUrlResponse> => {
      const res = await throttledRequestUrl(params);
      try {
        const url = params.url;
        if (typeof url === 'string' && url.includes('/submissions/detail/') && url.endsWith('/check/')) {
          const body = (res.json ?? {}) as { state?: string; status_code?: unknown };
          const isTerminal =
            body.state === 'SUCCESS' ||
            (body.state !== 'PENDING' && body.state !== 'STARTED' &&
              typeof body.status_code === 'number');
          if (isTerminal) {
            terminal = body as TerminalCheckResponse;
          }
        }
      } catch (err) {
        logger.debug('solve.submit.sniff: non-fatal', err);
      }
      return res;
    };

    const abort: AbortLike = { aborted: false };
    const orch = new SubmissionOrchestrator({
      fetcher: sniffingFetcher,
      settings: {
        getAuthCookies: () => this.settings.getAuthCookies(),
        getDefaultLanguage: () => this.settings.getDefaultLanguage(),
        getProblemDetail: (s) => this.settings.getProblemDetail(s),
      },
      slug: ctx.slug,
      getCurrentBody: ctx.currentBody,
      // D-21 — login wiring for the sticky session-expired Notice's button.
      login: () => { void this.auth.login(); },
    });
    this.activeSolve = { modal, abort, orchestrator: orch };

    try {
      await orch.submit();
      if (terminal) {
        // T-03-04-05 mitigation — D-15 unknown-verdict path. Delegates to
        // assertKnownVerdictOrThrow (src/solve/verdictGuard.ts): throws
        // UnknownVerdictError when status_code is outside the KNOWN map; is a
        // no-op for all known codes so renderVerdict proceeds normally.
        const terminalTyped = terminal as SubmitCheckResponse;
        assertKnownVerdictOrThrow(terminalTyped);
        modal.renderVerdict(terminalTyped, ctx.title);
        // Phase 4 Plan 05 (D-08, D-23) — on-AC knowledge-graph write. Fires
        // only when classifyStatus confirms Accepted; KnowledgeGraphWriter's
        // own gate double-checks (defense-in-depth). Silent on failure per
        // CF-19 — VerdictModal already shows "Accepted"; a graph-write toast
        // would be noise. Also invalidate the submission history cache so a
        // picker opened after AC sees the latest submission.
        if (classifyStatus(terminalTyped.status_code, terminalTyped.status_msg).kind === 'ac') {
          try {
            await this.knowledgeGraph.onAccepted(
              { file: ctx.file, slug: ctx.slug, title: ctx.title },
              terminalTyped,
            );
          } catch (err) {
            logger.debug('graph.onAccepted: non-fatal (invisible-by-design)', err);
          }
          this.submissionHistory.invalidate(ctx.slug);
        }
      } else {
        // Gate failure (Notice already fired) or orchestrator resolved
        // silently — close the pending modal.
        modal.close();
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || err instanceof PollAbortError) {
        try { modal.close(); } catch { /* headless */ }
      } else if ((err as Error).name === 'JudgeTimeoutError' || err instanceof JudgeTimeoutError) {
        modal.renderTimeout();
      } else if (err instanceof UnknownVerdictError) {
        // D-15 — hand the raw payload to the modal; its internal classifier
        // routes kind==='unknown' through renderUnknownVerdict which exposes
        // the copy-payload affordance (redacted via logger.redact).
        modal.renderVerdict(err.payload as SubmitCheckResponse, ctx.title);
      } else if (err instanceof SessionExpiredError || (err as Error).name === 'SessionExpiredError') {
        // D-21: sticky Notice + Log in button.
        showSessionExpiredNotice(() => { void this.auth.login(); });
        try { modal.close(); } catch { /* headless */ }
      } else if (isNetworkError(err)) {
        // D-19 LOCKED copy + D-22 command-palette Notice surface.
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
        new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof TimeoutError || (err as Error).name === 'TimeoutError') {
        // D-20 LOCKED copy + D-22 command-palette Notice surface.
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
        new Notice('LeetCode is slow to respond. Try again.', 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof RateLimitError) {
        const seconds = Math.ceil(err.retryAfterMs / 1000);
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name
        new Notice(`LeetCode rate limit reached. Wait ${String(seconds)}s before retrying.`, 6000);
        try { modal.close(); } catch { /* headless */ }
      } else {
        logger.debug('solve.submit: unexpected error', err);
        try { modal.close(); } catch { /* headless */ }
      }
    } finally {
      if (this.activeSolve && this.activeSolve.orchestrator === orch) {
        this.activeSolve = null;
      }
    }
  }

  /** Run sample (exampleTestcases) or custom input via LC's
   *  /interpret_solution/ endpoint. Opens a VerdictModal + drives the same
   *  pending/terminal/abort/timeout state machine as submit. */
  private async runSampleFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const detail = this.settings.getProblemDetail(ctx.slug);
    const sample = detail?.exampleTestcases ?? '';
    await this.runInterpretedInput(ctx, sample);
  }

  /** Shared helper — used by both runSample and CustomTestModal's onRun. */
  private async runInterpretedInput(ctx: ProblemContext, dataInput: string): Promise<void> {
    if (!this.guardSingleFlight()) return;

    // Gate: fenced block present (D-04).
    const body = ctx.currentBody();
    const extracted = extractFirstFencedBlock(body);
    if (!extracted) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
      new Notice(
        'No code block found. Add a fenced block with your solution.',
        6000,
      );
      return;
    }
    // Gate: auth cookies.
    const cookies = this.settings.getAuthCookies();
    if (!cookies) {
      // D-21: sticky Notice + Log in button (CF-04 LOCKED copy is in the helper).
      showSessionExpiredNotice(() => { void this.auth.login(); });
      return;
    }

    const lang = resolveLangSlug(extracted.lang, this.settings.getDefaultLanguage());
    const detail = this.settings.getProblemDetail(ctx.slug);
    const questionId = detail?.internalQuestionId ?? (detail ? String(detail.id) : '');

    const modal = new VerdictModal(this.app, {
      problemTitle: ctx.title,
      onCancel: () => { this.cancelActiveSolve(); },
      onCopyFailingInput: (input: string) => {
        void this.openCustomTestModalWithSeeded(input);
      },
    });
    modal.open();

    const abort: AbortLike = { aborted: false };
    this.activeSolve = { modal, abort, orchestrator: null };

    try {
      const { interpret_id } = await interpretSolution({
        slug: ctx.slug,
        cookies,
        lang,
        questionId,
        typedCode: extracted.code,
        dataInput,
      });
      const terminal = await pollSubmission({
        fetcher: throttledRequestUrl,
        submissionId: interpret_id,
        slug: ctx.slug,
        registerInterval: (fn, ms) => setWindowTimeout(fn, ms),
        abortSignal: abort,
        headers: authHeaders(ctx.slug, cookies),
      });
      modal.renderVerdict(terminal as RunCheckResponse, ctx.title);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || err instanceof PollAbortError) {
        try { modal.close(); } catch { /* headless */ }
      } else if ((err as Error).name === 'JudgeTimeoutError' || err instanceof JudgeTimeoutError) {
        modal.renderTimeout();
      } else if ((err as Error).name === 'SessionExpiredError') {
        // D-21: sticky Notice + Log in button.
        showSessionExpiredNotice(() => { void this.auth.login(); });
        try { modal.close(); } catch { /* headless */ }
      } else if (isNetworkError(err)) {
        // D-19 LOCKED copy + D-22 command-palette Notice surface.
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
        new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof TimeoutError || (err as Error).name === 'TimeoutError') {
        // D-20 LOCKED copy + D-22 command-palette Notice surface.
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
        new Notice('LeetCode is slow to respond. Try again.', 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof RateLimitError) {
        const seconds = Math.ceil(err.retryAfterMs / 1000);
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name
        new Notice(`LeetCode rate limit reached. Wait ${String(seconds)}s before retrying.`, 6000);
        try { modal.close(); } catch { /* headless */ }
      } else {
        logger.debug('solve.run: unexpected error', err);
        try { modal.close(); } catch { /* headless */ }
      }
    } finally {
      if (this.activeSolve && this.activeSolve.abort === abort) {
        this.activeSolve = null;
      }
    }
  }

  /** Open CustomTestModal seeded from `## Custom Tests` section of the given
   *  problem note. On Run, invokes runInterpretedInput. */
  private async openCustomTestModalFromActive(file: TFile): Promise<void> {
    const existing = await readCasesFromVault(this.app, file);
    const initialCases = existing.map((c) => c.input);
    new CustomTestModal(this.app, {
      file,
      initialCases,
      onRun: (input: string) => {
        const ctx = this.getActiveProblemContext();
        if (ctx) void this.runInterpretedInput(ctx, input);
      },
    }).open();
  }

  /** Open CustomTestModal pre-seeded with an additional failing-input tab —
   *  invoked from VerdictModal's "Copy failing testcase to custom input"
   *  affordance (D-25). Appends the failing input to existing cases. */
  private async openCustomTestModalWithSeeded(seedInput: string): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const file = view.file;
    const existing = await readCasesFromVault(this.app, file);
    const initialCases = [...existing.map((c) => c.input), seedInput];
    new CustomTestModal(this.app, {
      file,
      initialCases,
      initialActiveTab: initialCases.length - 1,
      onRun: (input: string) => {
        const ctx = this.getActiveProblemContext();
        if (ctx) void this.runInterpretedInput(ctx, input);
      },
    }).open();
  }

  /**
   * Phase 4 Plan 05 (D-03) — open SubmissionPickerModal against the active
   * problem note. Delegates to `this.submissionHistory` as the data source so
   * a prefetch fired by the NoteWriter on-open hook (D-02) is reused when
   * fresh. Row click opens SubmissionDetailModal which lazy-fetches the full
   * detail via detailForSubmission (D-04).
   */
  private async openSubmissionPickerFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const picker = new SubmissionPickerModal(this.app, {
      file: ctx.file,
      slug: ctx.slug,
      title: ctx.title,
      submissionHistoryStore: this.submissionHistory,
      openDetailModal: (row: SubmissionRow) => {
        void this.openSubmissionDetailFromRow(ctx.file, ctx.title, row);
      },
      // D-21 — login wiring for the sticky session-expired Notice's button.
      login: () => { void this.auth.login(); },
    });
    picker.open();
  }

  /**
   * Phase 4 Plan 05 (D-04) — open SubmissionDetailModal for a picker row.
   * Lazy-fetches the full submission detail via detailForSubmission (which
   * enforces the T-04-03-02 numeric-id guard + D-30 session-expiry signals
   * before the network call). Errors surface as inline feedback — a 403 or
   * missing-detail response closes the picker+detail flow silently beyond the
   * one debug log; a SessionExpiredError fires the locked CF-04 Notice.
   */
  private async openSubmissionDetailFromRow(
    file: TFile,
    title: string,
    row: SubmissionRow,
  ): Promise<void> {
    const cookies = this.settings.getAuthCookies();
    if (!cookies) {
      // D-21: sticky Notice + Log in button.
      showSessionExpiredNotice(() => { void this.auth.login(); });
      return;
    }
    let detail;
    try {
      detail = await detailForSubmission(row.id, cookies);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        // D-21: sticky Notice + Log in button.
        showSessionExpiredNotice(() => { void this.auth.login(); });
        return;
      }
      if (isNetworkError(err)) {
        // D-19 LOCKED copy + D-22 command-palette Notice surface.
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
        new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
        return;
      }
      if (err instanceof TimeoutError || (err as Error).name === 'TimeoutError') {
        // D-20 LOCKED copy + D-22 command-palette Notice surface.
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
        new Notice('LeetCode is slow to respond. Try again.', 8000);
        return;
      }
      logger.debug('graph.openSubmissionDetail: fetch failed', err);
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
      new Notice("Couldn't load submission. Check your connection.", 4000);
      return;
    }
    const verdictDisplay = classifyStatus(detail.statusCode).displayName;
    new SubmissionDetailModal(this.app, {
      file,
      problemTitle: title,
      verdictDisplay,
      code: detail.code,
      lang: detail.lang?.name ?? row.lang,
      runtimeDisplay: detail.runtimeDisplay,
      memoryDisplay: detail.memoryDisplay,
      submittedAt: formatLocalTz(detail.timestamp),
    }).open();
  }

  /** Unconditionally replace the first recognized fenced block under
   *  `## Code` with the fresh starter snippet for the user's default
   *  language (D-07 forced variant). Uses Plan 02 Task 4's
   *  forceInjectCodeSection helper — Plan 07 only imports + invokes. */
  private async insertStarterCodeForced(file: TFile, slug: string): Promise<void> {
    const detail = this.settings.getProblemDetail(slug);
    const langSlug = this.settings.getDefaultLanguage();
    const starter = detail?.codeSnippets?.find((s) => s.langSlug === langSlug)?.code ?? '';
    await this.app.vault.process(file, (current) =>
      forceInjectCodeSection(current, { starterCode: starter, langSlug }),
    );
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED
    new Notice('Starter code inserted.', 3000);
  }
}

/**
 * Phase 4 Plan 05 — render LC's unix-seconds timestamp as ISO-8601 local-tz
 * for SubmissionDetailModal's "Submitted:" metadata line. Reuses the D-10
 * toIsoLocalTz helper; returns an empty string on non-finite / zero / negative
 * inputs so the detail-modal renderer omits the field.
 */
function formatLocalTz(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '';
  return toIsoLocalTz(new Date(unixSeconds * 1000));
}

/** Tracks the currently-in-flight solve operation. orchestrator is non-null
 *  for submit-path operations; null for interpret-path (run sample / custom). */
interface ActiveSolve {
  modal: VerdictModal;
  abort: AbortLike;
  orchestrator: SubmissionOrchestrator | null;
}

/**
 * GAP-6 pure helper extracted for testability.
 *
 * Three-condition gate — all must be TRUE for the Notice to fire:
 *   1. `hasShownLegacyBaseNotice()` is false (one-time-per-install)
 *   2. `{folder}/LeetCode.base` exists in the vault
 *   3. Its contents match the v0.1.0 signature (`isLegacyLeetcodeBaseV010`)
 *
 * On success: fires the Notice and marks the flag so it never fires again.
 * Never auto-modifies the .base file (D-18 preservation).
 *
 * Consumes a minimal `deps` interface so tests can drive it without a real
 * Plugin / Vault / Notice. Exported for tests in tests/base-file-detect-stale.test.ts.
 */
export async function runLegacyBaseCheck(deps: {
  settings: {
    hasShownLegacyBaseNotice(): boolean;
    markLegacyBaseNoticeShown(): Promise<void>;
    getProblemsFolder(): string;
  };
  readBaseFile: (path: string) => Promise<string | null>;
  showNotice: (message: string, timeoutMs: number) => void;
}): Promise<void> {
  if (deps.settings.hasShownLegacyBaseNotice()) return;
  const folder = deps.settings.getProblemsFolder().replace(/[\\/]+$/, '');
  const path = `${folder}/LeetCode.base`;
  const contents = await deps.readBaseFile(path);
  if (contents == null) return;   // no .base yet — nothing to migrate
  if (!isLegacyLeetcodeBaseV010(contents)) return;
  deps.showNotice(
    'LeetCode.base may need to be regenerated. Delete it to get the updated view.',
    8000,
  );
  await deps.settings.markLegacyBaseNoticeShown();
}
