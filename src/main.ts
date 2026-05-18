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
import { Component, MarkdownRenderer, MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
// Phase 08 Plan 04 — type-only import; openAIDebug coerces a freshly-fetched
// LeetCodeProblemDetail into the cached shape (both share contentHtml).
import type { DetailCacheEntry } from './settings/SettingsStore';
import { installRequestUrlFetcher, throttledRequestUrl } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AIClient } from './ai/AIClient';
// Phase 08 Plan 04 (AIDBG-01) — single-entrypoint AI Debug surface.
//   AIStreamModal: live-streaming response modal (Plan 08-03).
//   buildDebugPrompt: pure prompt assembler (Plan 08-03).
//   DISCLOSURE_BASE_COPY + withDebugBullet: composition factory for the
//     extended disclosure copy (Plan 08-03; the base const is frozen at
//     module load — withDebugBullet returns a fresh object).
//   LastVerdictStore: in-memory per-slug verdict map (Plan 08-01).
//   htmlToMarkdown: same converter Preview uses (already in repo) so the
//     ## Problem text shipped to the AI provider matches what the user sees
//     in their preview.
import { AIStreamModal } from './ai/AIStreamModal';
import { buildDebugPrompt } from './ai/buildDebugPrompt';
import { DISCLOSURE_BASE_COPY, withDebugBullet, withReviewBullet } from './ai/disclosure';
import { LastVerdictStore } from './solve/lastVerdictStore';
import { htmlToMarkdown } from './notes/htmlToMarkdown';
// Phase 09 Plan 03 (AIREV-01) — auto-review on AC wiring.
import { buildReviewPrompt } from './ai/buildReviewPrompt';
import { mergeAIReviewSection } from './ai/mergeAIReviewSection';
import { estimateCostUsd } from './ai/pricing';
// Phase 07 Plan 04 — `prettyName` provides the verbatim brand string for
// every Test connection Notice. `AIProvider` + `ProbeResult` are imported as
// types only (no runtime cost). The aiProbeInflight Map debounces concurrent
// probes per provider per CONTEXT decision E + 07-UI-SPEC §"Test connection
// — debouncing": single in-flight per provider, subsequent clicks are no-ops.
import { prettyName } from './ai/types';
import type { AIProvider, ProbeResult, ProviderConfig } from './ai/types';
// Phase 07 Plan 05 — disclosure modal (AIPROV-04). The plugin owns the
// helper because the modal needs `this.app` + SettingsStore access; AIClient
// gets the helper via constructor injection. AIDisclosureModal itself is
// UI-only — see src/ai/disclosure.ts.
import { AIDisclosureModal } from './ai/disclosure';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { ProblemBrowserView, BROWSER_VIEW_TYPE } from './browse/ProblemBrowserView';
// Phase 06 Plan 03 — preview view + tab-reuse router. Static imports keep
// the module graph deterministic; cyclic-type risk is avoided because both
// preview modules type-import from `./main` rather than runtime-importing.
import {
  ProblemPreviewView,
  PREVIEW_VIEW_TYPE,
} from './preview/ProblemPreviewView';
import { openOrReusePreview } from './preview/previewRouter';
import { NoteWriter } from './notes/NoteWriter';
import { isLegacyLeetcodeBaseV010 } from './notes/BaseFile';
import { LeetCodeSettingTab } from './settings/SettingsTab';
// Phase 3 Plan 07 imports — orchestrator + modals + REST + pure utilities.
import { SubmissionOrchestrator } from './solve/submissionOrchestrator';
import { VerdictModal } from './solve/VerdictModal';
// Phase 5 Plan 04 — unified Run modal (D-01 / D-10) replaces the Phase 3
// modal + case-region persistence path entirely. In-memory tab state lives
// in EphemeralTabStore; the plugin NEVER writes to `## Custom Tests`
// (D-08 ignore-legacy).
import { RunModal } from './solve/RunModal';
import { EphemeralTabStore } from './solve/ephemeralTabStore';
import { deriveArity } from './solve/runArity';
import { registerRunCommand } from './solve/runCommandRegistration';
import { retrofit as retrofitStarterCode } from './solve/starterCodeInjector';
import { resetCodeWithConfirm } from './solve/resetCodeWithConfirm';
import { makeFileOpenHandler } from './main/fileOpenHook';
import { extractFirstFencedBlock } from './solve/codeExtractor';
import { resolveLangSlug, lcSlugToFenceTag, LC_LANG_DISPLAY_LABELS } from './solve/languages';
// Phase 5.3 D-13 parity — chevron's atomic dispatch reuses Phase 5.1's exported
// `findCodeFence` so fence detection has one source of truth.
import { findCodeFence, languageRefreshEffect } from './main/codeActionsEditorExtension';
// @codemirror/view is a transitive peer of obsidian@1.12.3; external in esbuild.
// `view.editor.cm as EditorView` is the canonical (undocumented internal) path
// for plugins reaching CM6 from a click handler — RESEARCH §Pitfall 6 +
// CLAUDE.md acknowledged.
 
import type { EditorView } from '@codemirror/view';
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
// Phase 5 Plan 05 (D-11) — reading-mode Run/Submit buttons below fenced code blocks.
import { registerCodeBlockActionProcessor } from './main/codeActionsPostProcessor';
// Phase 5.1 (POLISH-07 / 05-UAT G1 gap-closure) — edit-mode Run/Submit buttons in CM6.
import { buildCodeActionsEditorExtension } from './main/codeActionsEditorExtension';
// Phase 05.5 (POLISH) — section locking for lc-slug notes. Hard read-only
// enforcement on plugin-owned regions via CM6 EditorState.changeFilter.
import { buildSectionLockExtension } from './main/sectionLockExtension';
// Phase 5.2 D-13 — python3 → python language-tag alias for Reading-Mode Prism highlighting.
import { registerPython3Highlighter } from './main/python3Highlighter';
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
import { setWindowTimeout, clearWindowTimeout, type TimerHandle } from './shared/timers';
import { logger } from './shared/logger';
import type { SubmitCheckResponse, RunCheckResponse } from './solve/types';
// Phase 10 Plan 03 — contest session manager (state machine + timer).
import { ContestSessionManager } from './contest/ContestSessionManager';
// Phase 10 Plan 04 — contest solve view (dedicated editing surface).
import {
  ContestSolveView,
  CONTEST_SOLVE_VIEW_TYPE,
} from './contest/ContestSolveView';

/** Shape returned by getActiveProblemContext — the minimum info every Phase 3
 *  command needs: the TFile (used by RunModal / submit / starter-code paths),
 *  the slug (from lc-slug frontmatter), and a live `currentBody()` getter that
 *  re-reads at invocation time (SOLVE-09). */
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

  // Phase 5 Plan 04 (D-09) — ephemeral Run-modal tab store. In-memory only;
  // layout-change + active-leaf-change reconcile wipes slugs with no open
  // markdown leaf. Constructed in onload Step 5.8; disposed in onunload.
  ephemeralTabs!: EphemeralTabStore;

  // Phase 07 Plan 03 — AI provider facade. Constructed AFTER SettingsStore.load
  // (settings are required by AIClient ctor) and BEFORE registerView (so any
  // view that wants AIClient access can grab it from this.aiClient). Holds no
  // listeners, no timers, no open sockets — no onunload teardown required.
  aiClient!: AIClient;

  // Phase 08 Plan 04 (AIDBG-01) — in-memory per-slug Map<slug, LastVerdict>.
  // Populated by SubmissionOrchestrator's onVerdict callback (registered in
  // onload below). Read by openAIDebug to feed the last failing verdict into
  // buildDebugPrompt. NO Plugin arg, NO data.json persistence, NO workspace
  // event subscriptions — verdicts have no "tab is open" lifecycle, plain
  // Map + clear() on plugin unload is sufficient (08-PATTERNS §"Anti-Patterns
  // to Avoid" #6 deviates from EphemeralTabStore which DOES need a reconcile
  // loop because tab-input state is scoped to "the problem note is open in
  // at least one markdown leaf"). dispose() is called from onunload for a
  // deterministic wipe in test runs that re-instantiate the plugin.
  lastVerdictStore!: LastVerdictStore;

  // Phase 10 Plan 03 — Contest session manager. Manages the contest lifecycle
  // state machine (start/pause/resume/abort/finish) with epoch-based timer.
  // Constructed in onload after settings. The callbacks (onTick, onExpired,
  // onVerdictChange) are no-ops initially — Plan 04 wires the real handlers.
  contestSessionManager!: ContestSessionManager;

  // Phase 07 Plan 04 — single-in-flight gate for AIClient.probe. Keys are
  // AIProvider; values are the in-flight probe Promise. Cleared in the
  // testActiveAIConnection() finally block so a fresh click after the probe
  // resolves goes through. Subsequent clicks WHILE a probe is running are
  // no-ops (07-UI-SPEC §"Test connection — debouncing"). The Map is local to
  // the plugin instance — no need for global serialization across plugins.
  private aiProbeInflight = new Map<AIProvider, Promise<ProbeResult>>();

  // Phase 3 solve-path state (Phase 5 D-01 consolidated Run commands).
  //   activeSolve: currently-in-flight submission/run orchestrator-wrapper.
  //     Tracks the single-flight state across the unified `run` command +
  //     `submit` so the Cancel command can abort whichever is running and
  //     the guard fires for any attempted concurrent kick-off.
  private activeSolve: ActiveSolve | null = null;

  async onload(): Promise<void> {
    // Step 0.5 — warm the login-shell PATH cache so credential_process
    // can find tools like isengardcli/aws-vault in ~/.toolbox/bin etc.
    // Async fire-and-forget — never blocks plugin load.
    import('./ai/credentialProcess')
      .then(m => m.warmLoginShellPath())
      .catch(() => { /* non-critical */ });

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

    // Step 5.8 — Phase 5 Plan 04 (D-09) — ephemeral tab store for the unified
    // Run modal. Registers `layout-change` + `active-leaf-change` via
    // `plugin.registerEvent` so it auto-detaches on unload; dispose() is still
    // called in onunload() for a deterministic wipe.
    this.ephemeralTabs = new EphemeralTabStore(this);

    // Step 5.9 — Phase 07 AI client. Constructed AFTER SettingsStore.load
    // (settings are required by AIClient ctor) and BEFORE registerView (so any
    // future view that wants AIClient access can grab it from this.aiClient).
    // Synchronous: AIClient ctor takes only SettingsStore + the disclosure
    // helper, does no eager network — mirrors LeetCodeClient ctor at line 163.
    // No onunload teardown: AIClient holds no listeners, no timers, no open
    // sockets.
    //
    // Plan 07-05 — inject `requireAIDisclosure` so AIClient.probe + invoke
    // gate on `disclosureAcknowledged` BEFORE any HTTP. The arrow keeps
    // `this` binding without `.bind`. The helper itself opens
    // AIDisclosureModal and resolves on the user's button click.
    this.aiClient = new AIClient(
      this.settings,
      (provider, cfg) => this.requireAIDisclosure(provider, cfg),
    );

    // Step 5.10 — Phase 08 Plan 04 (AIDBG-01) — LastVerdictStore. In-memory
    // per-slug Map populated by the SubmissionOrchestrator's onVerdict
    // callback (registered at orchestrator construction below in
    // submitFromActive). Plain Map; no Plugin arg; no workspace events;
    // no data.json persistence (08-CONTEXT decision B). Disposed in
    // onunload(). Order: ephemeralTabs → aiClient → lastVerdictStore.
    this.lastVerdictStore = new LastVerdictStore();

    // Step 5.11 — Phase 10 Plan 03 — ContestSessionManager. State machine for
    // contest lifecycle (start/pause/resume/abort/finish). Callbacks are no-ops
    // initially — Plan 04 wires the real onTick/onExpired/onVerdictChange
    // handlers that drive the timer UI in ProblemBrowserView.
    this.contestSessionManager = new ContestSessionManager(
      this.settings,
      {
        onTick: () => { /* Plan 04 wires real handler */ },
        onExpired: () => { /* Plan 04 wires real handler */ },
        onVerdictChange: () => { /* Plan 04 wires real handler */ },
      },
    );

    // Step 6a — register the browser view.
    this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemBrowserView(leaf, this));

    // Phase 06 Plan 03 — register the preview view. View type
    // 'leetcode-preview' is the canonical SSoT (PREVIEW_VIEW_TYPE constant);
    // tab-reuse + setViewState in `previewRouter.ts` rely on it. The factory
    // wires the plugin instance through to the view so action-button clicks
    // can call `plugin.openProblem(slug)` (existing v1.0 path).
    this.registerView(PREVIEW_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemPreviewView(leaf, this));

    // Phase 10 Plan 04 — register the contest solve view. Dedicated ItemView
    // for solving contest problems (code editor + Run/Submit). Tab-reuse via
    // openContestProblem() helper below.
    this.registerView(CONTEST_SOLVE_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ContestSolveView(leaf, this));

    // Step 6b — ribbon icon (BROWSE-01). Lucide name from UI-SPEC.md § Icons.
     
    this.addRibbonIcon('code-2', 'Open LeetCode browser', () => {
      void this.activateBrowser();
    });

    // Step 6c — command palette entries. Shared Pattern 8 rules:
    //   - id does NOT contain the plugin id ('leetcode') or the word 'command'
    //   - name is sentence case and does NOT start with the plugin name
    //   - NO hotkeys field (commands/no-default-hotkeys)
    // Obsidian prefixes the user-visible palette label with the plugin name
    // ("LeetCode: Open problem browser"), so the id is kept generic.
    this.addCommand({
      id: 'open-problem-browser',
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
    // Phase 06 Plan 03 FOUND-03 — clean-ID palette command for
    // `Open in preview`. Mirrors the editorCheckCallback shape from
    // `refresh-current-problem` below: gates on the active note having an
    // `lc-slug` frontmatter entry via `isValidSlug`. Action calls
    // `routeProblemClick(slug, undefined, 'preview', { force: true })` so the
    // command works even when the user has set `Click behavior = open`
    // (palette is an explicit user action, not a default affordance —
    // matches the right-click escape contract). ID has NO plugin-id prefix,
    // NO `command` substring, NO hotkey — passes `obsidianmd/commands/no-*`
    // lint rules introduced by 06-01's eslint-plugin-obsidianmd@0.3.0 bump.
    this.addCommand({
      id: 'open-in-preview',
      name: 'Open in preview',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const fm: Record<string, unknown> | undefined = cache?.frontmatter;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) {
          void this.routeProblemClick(slug, undefined, 'preview', { force: true });
        }
        return true;
      },
    });

    // Phase 07 Plan 04 — palette entry for AI Test connection. Shares the
    // exact same probe path as the Settings button via the plugin-level
    // testActiveAIConnection() method, so Notice copy + debounce semantics
    // are identical across both surfaces. ID rules (eslint-plugin-obsidianmd
    // commands/no-* family): no plugin-id prefix ('leetcode-'), no 'command'
    // substring, no hotkey field. Sentence-case name does not start with the
    // plugin name — Obsidian's palette already prefixes it with "LeetCode: ".
    // Global callback (NOT editorCheckCallback): the command is always
    // available; gating is internal (provider null → empty-state Notice).
    this.addCommand({
      id: 'test-ai-connection',
      name: 'Test AI connection',
      callback: () => { void this.testActiveAIConnection(); },
    });

    // Phase 07 Plan 05 — palette entry for AIPROV-04 reset escape hatch.
    // Clears all 5 providers' `disclosureAcknowledged` flags so the
    // AIDisclosureModal re-fires on the next AI call regardless of which
    // provider is active. ID rules (eslint-plugin-obsidianmd commands/no-*
    // family): no plugin-id prefix ('leetcode-'), no 'command' substring,
    // no hotkey field. Sentence-case name does not start with the plugin
    // name — Obsidian's palette already prefixes it with "LeetCode: ".
    this.addCommand({
      id: 'reset-ai-disclosures',
      name: 'Reset AI provider disclosures',
      callback: () => { void this.resetAIDisclosures(); },
    });

    // Phase 07 Plan 06 — palette entry for AIPROV-06 credential-rotation
    // escape hatch. Wipes ONLY the active provider's `apiKey` (other
    // providers' keys preserved per CONTEXT decision C; disclosure flag
    // preserved per T-07-06-disclosure — clearing the key is a credential
    // lifecycle action, NOT a disclosure-reset action). ID rules
    // (eslint-plugin-obsidianmd commands/no-* family): no plugin-id prefix
    // ('leetcode-'), no 'command' substring, no hotkey field. Sentence-case
    // name does not start with the plugin name — Obsidian's palette already
    // prefixes it with "LeetCode: ". UI-SPEC §"Destructive actions" rules
    // out a confirmation modal: user typed the command name explicitly,
    // re-pasting from provider dashboard is trivial recovery.
    this.addCommand({
      id: 'clear-ai-key',
      name: 'Clear AI key',
      callback: () => { void this.clearActiveAIKey(); },
    });

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

    // Phase 5 Plan 04 (D-01) — single unified `Run` command replaces Phase 3's
    // `run-sample` + `run-custom` pair. Opens RunModal seeded from the
    // EphemeralTabStore; the modal's Run button drives
    // `runInterpretedInput` with the active tab's input (D-07).
    registerRunCommand(this, {
      settings: this.settings,
      openRun: () => { void this.runFromActive(); },
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

    // Phase 08 Plan 04 (AIDBG-01) — palette command for AI Debug. Verbatim
    // mirror of the Submit command shape: editorCheckCallback returns false
    // for non-LC notes (hides the command from palette in that context),
    // returns true and dispatches openAIDebug(slug) on confirm. Clean ID
    // (no plugin-id prefix per FOUND-03), sentence-case name (Obsidian
    // already prefixes "LeetCode: " in the palette so the locked label
    // surfaces as "LeetCode: AI: Debug current code"). NO default hotkey
    // per project rule (commands/no-default-hotkeys lint rule).
    //
    // openAIDebug(slug) is the SOLE entrypoint — fence-row button (via
    // aiDebugFromActive) AND palette command BOTH funnel through it so
    // the disclosure gate, prompt assembly, and modal open are
    // single-sourced (locked T-08-04-T-host mitigation).
    this.addCommand({
      id: 'ai-debug',
      name: 'AI: Debug current code',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) { void this.openAIDebug(slug); }
        return true;
      },
    });

    // Phase 09 Plan 04 (AIREV-05) — palette command for manual AI Review
    // re-run. Same editorCheckCallback gate shape as ai-debug: returns false
    // for non-LC notes (hides from palette), returns true and dispatches
    // runAIReview(slug, file) on confirm. Clean ID (no plugin-id prefix per
    // FOUND-03), sentence-case name. NO default hotkey per project rule.
    this.addCommand({
      id: 'rerun-ai-review',
      name: 'Re-run AI review on current note',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) { void this.runAIReview(slug, file); }
        return true;
      },
    });

    // Phase 5.2 D-05 / D-07 — legacy insert-starter command is removed; the
    // file-open hook (Step 6g below) now handles first-open auto-insert (D-06),
    // and this `Reset code` command is the only remaining user-initiated flow.
    // Deliberate destructive reset is gated behind ConfirmOverwriteModal when
    // an existing fence is non-empty (D-11 keeps the modal class alive).
    this.addCommand({
      id: 'reset-code',
      name: 'Reset code',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        const slug = fm?.['lc-slug'];
        if (!isValidSlug(slug)) return false;
        if (!checking) { void this.resetCode(file, slug); }
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

    // Step 6e — Phase 5 Plan 05 (D-11) reading-mode Run/Submit buttons.
    // Registers a MarkdownPostProcessor that appends neutral Run + Submit
    // buttons below each <pre><code> inside notes with `lc-slug` frontmatter.
    // Click handlers dispatch `${manifest.id}:run` / `:submit` via
    // executeCommandById (Pitfall 14); idempotent per Pitfall 3.
    registerCodeBlockActionProcessor(this);

    // Step 6f — Phase 5.1 (POLISH-07 / 05-UAT G1 gap-closure) edit-mode Run/Submit buttons.
    // Registers a CM6 StateField<DecorationSet> that paints an inline widget below
    // the `## Code` fence in Live Preview + Source Mode. Gated on `lc-slug`
    // frontmatter (D-06). WidgetType.eq() guards idempotency (RESEARCH Pitfall 2).
    // Click handlers call plugin.runFromActive() / submitFromActive() directly
    // (D-05 — avoids editorCheckCallback gate regression from 05-05 live smoke).
    this.registerEditorExtension(buildCodeActionsEditorExtension(this));

    // Step 6f-bis — Phase 05.5 (POLISH) section locking for lc-slug notes.
    // Hard read-only enforcement via CM6 EditorState.changeFilter; gated on
    // lc-slug frontmatter (D-06) + Edit Mode (D-07). Locks `## Problem`
    // entirely; `## Code` heading + fence opener + closing fence;
    // `## Techniques` heading; `## Notes` heading. `## Code` body and
    // `## Techniques`/`## Notes` bodies stay editable. Plugin-side dispatches
    // with userEvent='leetcode.*' bypass the lock so chevron switch keeps
    // working (RESEARCH Pitfall 5).
    this.registerEditorExtension(buildSectionLockExtension(this));

    // Step 6g — Phase 5.2 D-06 auto-insert starter code on file-open.
    // Fires for every note reveal; the handler gates on `lc-slug` frontmatter
    // via `isValidSlug` before calling `retrofit(...)`. retrofit is idempotent
    // (RESEARCH Pitfall 5) and silent-on-failure (D-09), so double-fire with
    // the existing row-click retrofit in NoteWriter is safe.
    this.registerEvent(
      this.app.workspace.on(
        'file-open',
        makeFileOpenHandler({
          app: this.app,
          settings: this.settings,
          retrofit: retrofitStarterCode,
        }),
      ),
    );

    // Step 6h — Phase 5.2 D-13 python3 → python language-tag alias for
    // Reading-Mode Prism highlighting. Global application (not gated on
    // lc-slug) so any note with a ```python3 fence benefits. Synchronous
    // class swap avoids the loadPrism() race (RESEARCH Pitfall 7).
    registerPython3Highlighter(this);

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
    // Phase 5 Plan 04 — deterministic wipe of the ephemeral tab store. The
    // registerEvent subscriptions also auto-detach here, but dispose() keeps
    // the in-memory Maps clean for test runs that re-instantiate the plugin.
    this.ephemeralTabs?.dispose();

    // Phase 08 Plan 04 (AIDBG-01) — deterministic wipe of the LastVerdictStore.
    // No subscriptions/timers to detach (Map-only), but dispose() resets the
    // in-memory Map so plugin reload starts with a clean slate.
    this.lastVerdictStore?.dispose();
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

  /**
   * Phase 06 PREVIEW-02 — single row-activation entry point. ProblemBrowserView's
   * row click handler delegates here; future surfaces (right-click context
   * menu in Plan 06-04, palette `Open in preview` command, Phase 10 contest
   * mode) reuse the same router.
   *
   * Decision flow (06-PLAN <interfaces> + 06-RESEARCH §Code Examples §Example 2;
   * CONTEXT.md decision A locks the precedence):
   *   1. intent === 'open'  → ALWAYS opens the note. Shift-click bypass + the
   *      `Click behavior = open` setting both land here.
   *   2. intent === 'preview' && opts?.force  → preview path. Right-click ->
   *      Preview (Plan 06-04) sets force=true so the user's setting can't
   *      suppress an explicit menu choice.
   *   3. intent === 'preview' && setting === 'open'  → opens the note. The
   *      user has opted into v1.0 click-to-open behavior.
   *   4. intent === 'preview'  → preview path.
   *
   * Plan 06-02 shipped a placeholder `Notice` for the preview path so the
   * routing seam was observable in dev without standing up the view; Plan
   * 06-03 (this commit) lands `ProblemPreviewView` and swaps the Notice for
   * `await openOrReusePreview(this, slug)` — the preview leaf is reused if
   * one is already open, otherwise a new center tab opens.
   */
  async routeProblemClick(
    slug: string,
    status: 'solved' | 'attempted' | 'untouched' | undefined,
    intent: 'preview' | 'open',
    opts?: { force?: boolean },
  ): Promise<void> {
    if (intent === 'open') {
      return this.openProblem(slug, status);
    }
    // intent === 'preview' from here on.
    if (!opts?.force && this.settings.getPreviewClickBehavior() === 'open') {
      return this.openProblem(slug, status);
    }
    // Phase 06 Plan 03 — preview path. Reuses an existing leetcode-preview
    // leaf (via `getLeavesOfType` + `setViewState`) or opens a new center
    // tab; either way the new slug renders into the SAME leaf. Replaces
    // Plan 06-02's placeholder Notice (#TODO(06-03) anchor).
    return openOrReusePreview(this, slug);
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

  /**
   * Phase 10 Plan 04 — open a contest problem in the dedicated ContestSolveView.
   * Reuses the tab-reuse pattern from previewRouter: if a ContestSolveView leaf
   * already exists, swap its state; otherwise open a new center tab. Plan 05's
   * timer header problem badges delegate here.
   */
  async openContestProblem(problemIdx: number): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(CONTEST_SOLVE_VIEW_TYPE);
    if (existing.length > 0 && existing[0]) {
      const leaf = existing[0];
      await leaf.setViewState({
        type: CONTEST_SOLVE_VIEW_TYPE,
        active: true,
        state: { problemIdx },
      });
      await workspace.revealLeaf(leaf);
      return;
    }
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({
      type: CONTEST_SOLVE_VIEW_TYPE,
      active: true,
      state: { problemIdx },
    });
    await workspace.revealLeaf(leaf);
  }

  private async activateBrowser(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(BROWSER_VIEW_TYPE);
    if (existing[0]) {
      // revealLeaf is a Promise<void> in Obsidian 1.7.2+; we await it. For older Obsidian it
      // returns void (Promise semantics still safe to await via microtask).
       
      await workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: BROWSER_VIEW_TYPE, active: true });
     
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

  /**
   * Phase 07 Plan 04 — shared entry point for the Settings "Test connection"
   * button + the `test-ai-connection` palette command. NEVER throws — every
   * branch ends in a `Notice` (success / failure / empty-state guard) so
   * callers (Settings + palette) treat this as fire-and-forget.
   *
   * Flow (07-UI-SPEC §"Notice copy" + §"Test connection — debouncing"):
   *   1. Read activeAIProvider; if null, fire the no-provider Notice
   *      (3000ms) and return without contacting the network.
   *   2. Read provider config. If provider is anthropic/openai/openrouter AND
   *      apiKey is empty, fire the empty-key Notice (3000ms) and return —
   *      the guard prevents a wasted 401-bound network call. Ollama and
   *      Custom may legitimately have empty keys (default install / no-auth
   *      backends) so they fall through to probe.
   *   3. Single-in-flight gate: if aiProbeInflight has an entry for this
   *      provider, return immediately — concurrent click during in-flight
   *      probe is a no-op. The button label flip + Notice arrive when the
   *      original probe resolves.
   *   4. Store the probe promise in the map, await it, fire the result Notice
   *      per the 07-UI-SPEC matrix (success-with-count / Anthropic / Ollama
   *      zero-models / failure-truncated). The whole Notice text is truncated
   *      to 200 chars per CONTEXT decision E.
   *   5. Always clear the map entry in `finally`.
   *
   * Plan 07-05 will wrap `aiClient.probe()` with the disclosure gate by
   * modifying AIClient.probe's body — this caller-side method does NOT need
   * to change for that wrapping. Phase 08 reuses the same probe surface for
   * pre-invoke connectivity checks.
   */
  async testActiveAIConnection(): Promise<void> {
    const provider = this.settings.getActiveAIProvider();
    if (!provider) {

      new Notice('Pick an AI provider first.', 3000);
      return;
    }
    const cfg = this.settings.getProviderConfig(provider);
    if (
      (provider === 'anthropic' || provider === 'openai' || provider === 'openrouter') &&
      cfg.apiKey === ''
    ) {

      new Notice(`Enter an API key for ${prettyName(provider)} first.`, 3000);
      return;
    }
    // Phase 07 Plan 07 — CR-02 main.ts guard. Symmetric with the apiKey
    // guard above: custom + ollama require a Base URL before probe is
    // worth attempting. The probe-side guards (probeCustom, probeOllama)
    // also early-return on empty baseUrl, but this caller-side guard
    // surfaces a friendlier Notice ('Enter a Base URL for X first.') and
    // skips the aiProbeInflight Map churn entirely. Defense-in-depth.
    //
    // Phase 07 Plan 08 — WR-03-whitespace tightens this guard from
    // `cfg.baseUrl === ''` (strict empty) to `!cfg.baseUrl?.trim()` so
    // single-space, tab, and mixed-whitespace inputs are also rejected
    // — symmetric with probeCustom and probeOllama. The `?.` is
    // belt-and-braces against future shape drift; sanitizeProviderConfig
    // currently coerces missing/non-string baseUrl to '' so it cannot be
    // undefined in practice today.
    if (
      (provider === 'custom' || provider === 'ollama') &&
      !cfg.baseUrl?.trim()
    ) {

      new Notice(`Enter a Base URL for ${prettyName(provider)} first.`, 3000);
      return;
    }
    if (this.aiProbeInflight.has(provider)) {
      // Single-in-flight: subsequent clicks while a probe is running are
      // no-ops. The original click's Notice will fire when the in-flight
      // probe resolves.
      return;
    }
    const probePromise = this.aiClient.probe(provider);
    this.aiProbeInflight.set(provider, probePromise);
    try {
      const result = await probePromise;
      if (result.ok) {
        if (result.modelCount === null) {
          // Anthropic — no public model-list endpoint, modelCount is null.

          new Notice('AI provider connection OK (Anthropic)', 4000);
        } else if (result.modelCount === 0 && provider === 'ollama') {
          // Ollama reachable but no models pulled yet — special-case copy
          // (07-UI-SPEC §"Notice copy" with the pull-suggestion hint).

          new Notice(
            'Ollama reachable, 0 models installed — run `ollama pull llama3.2`',
            6000,
          );
        } else {
          // Standard success branch — modelCount is a non-null number.
          // `?? 0` is defensive against a future adapter returning undefined;
          // the 07-UI-SPEC copy renders the number directly.

          new Notice(
            `AI provider connection OK (${prettyName(provider)}, ${String(result.modelCount ?? 0)} models available)`,
            4000,
          );
        }
      } else {
        // Failure — the adapter already truncated errorMessage to 200 chars
        // (provider adapter discipline from Plan 07-02), but truncate again
        // on the COMBINED prefix+message string per 07-UI-SPEC §"Error state
        // copy posture" (200 chars TOTAL including the `{provider name}: `
        // prefix).
        const combined = `${prettyName(provider)}: ${result.errorMessage ?? 'unknown error'}`;

        new Notice(combined.slice(0, 200), 6000);
      }
    } finally {
      this.aiProbeInflight.delete(provider);
    }
  }

  /**
   * Phase 07 Plan 05 — disclosure gate helper injected into AIClient. Opens
   * AIDisclosureModal for the given (provider, cfg) pair and resolves with
   * `true` on Continue, `false` on Cancel. AIClient.probe + invoke await
   * this Promise BEFORE issuing any HTTP — Cancel short-circuits the call.
   *
   * Lives on the plugin (not in disclosure.ts) because it needs both the
   * App reference (for `new AIDisclosureModal(this.app, ...)`) and the
   * SettingsStore (so the cancel Notice can use locked verbatim copy).
   * The `resolved` guard prevents double-resolution if both onCancel (from
   * onClose Esc fallback) AND a direct button click somehow fire — defensive
   * complement to the modal's own `acknowledged`/`decided` guard.
   *
   * Cancel fires the locked Notice 'AI call cancelled' (3000ms — 07-UI-SPEC
   * §"Notice copy"). The Notice surfaces in addition to the Plan-07-04
   * testActiveAIConnection failure Notice ('<provider name>: AI call
   * cancelled'); the two are deliberately distinct so the user sees both
   * the cancel acknowledgement AND the per-call disposition.
   */
  requireAIDisclosure(provider: AIProvider, cfg: ProviderConfig): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const modal = new AIDisclosureModal(
        this.app,
        provider,
        cfg,
        () => {
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        },
        () => {
          if (!resolved) {
            resolved = true;

            new Notice('AI call cancelled', 3000);
            resolve(false);
          }
        },
      );
      modal.open();
    });
  }

  /**
   * Phase 07 Plan 05 — palette command implementation for
   * `reset-ai-disclosures`. Iterates over all 5 AIProvider literals; when a
   * provider's `disclosureAcknowledged` is true, persists a sanitized copy
   * with the flag flipped to false. After the iteration completes, fires
   * the locked Notice (07-UI-SPEC §"Notice copy", 4000ms duration).
   *
   * Idempotent skip path: providers whose flag is already false are NOT
   * written. Avoids churning data.json on every reset (and the ledger
   * day-rollover discipline relies on the setter being side-effect-free
   * when no actual change is needed).
   */
  async resetAIDisclosures(): Promise<void> {
    const providers: AIProvider[] = ['anthropic', 'openai', 'openrouter', 'ollama', 'custom'];
    for (const p of providers) {
      const cfg = this.settings.getProviderConfig(p);
      if (cfg.disclosureAcknowledged) {
        await this.settings.setProviderConfig(p, {
          ...cfg,
          disclosureAcknowledged: false,
        });
      }
    }

    new Notice(
      'AI provider disclosures reset. The disclosure modal will show on the next AI call.',
      4000,
    );
  }

  /**
   * Phase 07 Plan 06 — palette command implementation for `clear-ai-key`
   * (AIPROV-06). Wipes the ACTIVE provider's `apiKey` only; every other
   * field (baseUrl, model, disclosureAcknowledged) is preserved, and other
   * providers' configs are untouched (T-07-06-other-keys mitigation).
   *
   * Empty-state guard: when activeAIProvider is null, the locked Notice
   * fires and the method returns without touching SettingsStore. Notice
   * copy is verbatim from 07-UI-SPEC §"Notice copy" — both branches at
   * 3000ms duration.
   *
   * NOT a disclosure-reset path — clearing the key is a credential
   * lifecycle action; users who want to re-trigger the disclosure modal
   * should run `reset-ai-disclosures` (Plan 07-05). Both palette commands
   * are intentionally separate so users can rotate keys without losing
   * the prior disclosure acknowledgement.
   */
  async clearActiveAIKey(): Promise<void> {
    const provider = this.settings.getActiveAIProvider();
    if (!provider) {

      new Notice('No active AI provider — nothing to clear.', 3000);
      return;
    }
    const cfg = this.settings.getProviderConfig(provider);
    await this.settings.setProviderConfig(provider, { ...cfg, apiKey: '' });

    new Notice(`Cleared AI key for ${prettyName(provider)}`, 3000);
  }

  /**
   * Phase 08 Plan 04 (AIDBG-01) — single entrypoint for the AI Debug surface.
   *
   * Called from THREE surfaces (locked T-08-04-T-host mitigation): the
   * fence-row "AI: Debug" button (via `aiDebugFromActive`), the `ai-debug`
   * palette command, and (Plan 08-05) the verdict-modal-footer "AI: Debug"
   * button. All three surfaces funnel through this method so the disclosure
   * gate, prompt assembly, and modal open are single-sourced.
   *
   * Flow (08-UI-SPEC §"Open path" + 08-PATTERNS §"src/main.ts"):
   *   1. Resolve problem markdown via DetailCache (cache-first; fetch on
   *      miss). Same path Preview uses — htmlToMarkdown(detail.contentHtml)
   *      so the ## Problem text shipped to the AI matches the reading-mode
   *      preview byte-for-byte.
   *   2. Read the active note's body via the active MarkdownView's editor
   *      (mirrors getActiveProblemContext.currentBody — read-at-invocation
   *      per SOLVE-09; the AI sees the user's CURRENT code).
   *   3. extractFirstFencedBlock(body) → { lang, code }. If null, surface a
   *      Notice and bail (no fence ⇒ nothing to debug).
   *   4. Read the last verdict (may be undefined — buildDebugPrompt's
   *      empty-store path handles this with a literal placeholder).
   *   5. buildDebugPrompt({ problemMd, code, language, lastVerdict }) —
   *      pure transform; ## Notes is NEVER included (locked decision A).
   *   6. Read activeAIProvider; bail with Notice when null.
   *   7. Open AIStreamModal with `disclosureCopy: withDebugBullet(...)` —
   *      the disclosure gate inside AIClient.invokeStream fires on first
   *      use of an unacknowledged provider; the disclosureCopy field is
   *      a forward-compat anchor so future phases (Phase 09 review) that
   *      surface the extended copy in the confirm strip can read it from
   *      the modal args.
   *
   * Notice paths (3 fail surfaces):
   *   - No active MarkdownView with valid lc-slug → caller (aiDebugFromActive
   *     / palette command) gates BEFORE openAIDebug. openAIDebug itself
   *     assumes a valid slug came in; this is enforced by the verbatim
   *     editorCheckCallback shape that mirrors the Submit command.
   *   - No fence found in the active body → "No `## Code` block found.";
   *     same wording as run/submit (no need to invent new copy).
   *   - No active AI provider → "No AI provider configured. Open
   *     Settings → AI." (locked verbatim per UI-SPEC §"Open path").
   */
  async openAIDebug(slug: string): Promise<void> {
    // Step 1 — resolve the active MarkdownView (we need the editor body
    // even though the caller already validated lc-slug at the gate). If
    // the active view has shifted off the LC note between the gate firing
    // and this method running, bail with the generic Notice.
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const body = view.editor.getValue();

    // Step 2 — read the first fenced code block. extractFirstFencedBlock
    // is scoped to ## Code when the heading exists (CodeExtractor §preference
    // order); locked decision A guarantees ## Notes content can't leak in
    // because the helper rejects fences in other sections.
    const extracted = extractFirstFencedBlock(body);
    if (!extracted) {
      new Notice('No `## Code` block found. Add a fenced block with your solution.', 6000);
      return;
    }
    const language = extracted.lang ?? this.settings.getDefaultLanguage() ?? 'plaintext';

    // Step 3 — resolve problem markdown. DetailCache first (same path Preview
    // uses); on miss, fetch via the LeetCodeClient. Failures bail with a
    // Notice (the user can still attempt AI Debug — but we'd be sending an
    // empty problem statement, which buys nothing).
    // DetailCache hit (DetailCacheEntry shape — `.contentHtml`) OR fetch
    // (LeetCodeProblemDetail shape — `.content`). The two field names differ;
    // we read whichever is present so the prompt always gets the problem
    // markdown, regardless of which path populated `detail`.
    let problemHtml = '';
    const cached = this.settings.getProblemDetail(slug);
    if (cached?.contentHtml) {
      problemHtml = cached.contentHtml;
    } else {
      try {
        const fetched = await this.client.getProblemDetail(slug);
        if (!fetched) {
          new Notice('Problem details unavailable. Refresh the note and try again.', 6000);
          return;
        }
        problemHtml = fetched.content ?? '';
      } catch {
        new Notice('Problem details unavailable. Refresh the note and try again.', 6000);
        return;
      }
    }
    const problemMd = htmlToMarkdown(problemHtml);

    // Step 4 — last verdict (may be undefined — buildDebugPrompt handles).
    const lastVerdict = this.lastVerdictStore.get(slug);

    // Step 5 — assemble the prompt (pure transform).
    const prompt = buildDebugPrompt({
      problemMd,
      code: extracted.code,
      language,
      lastVerdict,
    });

    // Step 6 — gate on active provider. Empty-state Notice copy locked per
    // 08-UI-SPEC §"Open path". The AIClient.invokeStream call would also
    // throw 'No AI provider configured' but surfacing it here gives the
    // user actionable copy ("Open Settings → AI.") instead of a generic
    // error.
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      // Sentence case per Obsidian community-plugin guidelines
      // (eslint-plugin-obsidianmd ui/sentence-case rule). The "settings"
      // word is lowercased to match plugin store expectations.
      new Notice('No AI provider configured. Open settings → AI.', 4000);
      return;
    }
    const providerCfg = this.settings.getProviderConfig(provider);

    // Step 7 — open the modal. disclosureCopy is the composition-factory
    // output (locked: NEW object, NEVER mutates the frozen base). The
    // disclosure gate itself fires inside AIClient.invokeStream via the
    // plugin-injected requireAIDisclosure factory — disclosureCopy is a
    // contract anchor on the modal args (08-04-PLAN.md key_links lock).
    new AIStreamModal(this.app, {
      provider,
      prompt,
      aiClient: this.aiClient,
      model: providerCfg.model,
      disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY),
    }).open();
  }

  /**
   * Phase 09 Plan 03 (AIREV-01) — host implementation for the auto-review
   * stream. Invoked by VerdictModal's onStartReviewStream callback after
   * "Accepted!" renders. Assembles the prompt, calls AIClient.invokeStream,
   * streams chunks into reviewAreaEl via debounced MarkdownRenderer.render,
   * and writes the completed review to the note via vault.process.
   *
   * Ordering (D-07, D-13, Pitfall 1): knowledgeGraph.onAccepted has already
   * completed by the time VerdictModal calls this callback (it fires after
   * renderVerdict which is called after the AC gate awaits onAccepted).
   *
   * Anti-zombie (Pitfall 2): VerdictModal.onClose calls abort() on the
   * returned handle — if the modal closes mid-stream, vault.process is
   * never called.
   */
  private startAutoReview(
    ctx: { file: TFile; slug: string; title: string; currentBody: () => string },
    reviewAreaEl: HTMLElement,
    component: Component,
  ): { abort: () => void; promise: Promise<void> } {
    const abortController = new AbortController();
    const RENDER_DEBOUNCE_MS = 100;
    // Snapshot body immediately — before any async work — so edits during the
    // network round-trip don't contaminate the review prompt (CR-02 fix).
    const snapshotBody = ctx.currentBody();

    // Show a loading indicator immediately so user knows review is in progress.
    const spinnerEl = reviewAreaEl.createDiv({ cls: 'leetcode-ai-review-loading' });
    spinnerEl.setText('Reviewing…');

    const promise = (async () => {
      // Step 1 — resolve problem markdown for prompt assembly.
      let problemHtml = '';
      const cached = this.settings.getProblemDetail(ctx.slug);
      if (cached?.contentHtml) {
        problemHtml = cached.contentHtml;
      } else {
        try {
          const fetched = await this.client.getProblemDetail(ctx.slug);
          problemHtml = fetched?.content ?? '';
        } catch {
          problemHtml = '';
        }
      }
      const problemMd = htmlToMarkdown(problemHtml);

      // Step 2 — extract code from the snapshotted body.
      const body = snapshotBody;
      const extracted = extractFirstFencedBlock(body);
      const code = extracted?.code ?? '';
      const language = extracted?.lang ?? this.settings.getDefaultLanguage() ?? 'plaintext';

      // Step 3 — assemble the prompt.
      const prompt = buildReviewPrompt({ problemMd, code, language });

      // Step 4 — resolve provider (already gated at modal construction).
      const provider = this.settings.getActiveAIProvider()!;
      const providerCfg = this.settings.getProviderConfig(provider);

      // Step 5 — invoke the AI stream. Disclosure gate fires automatically
      // inside AIClient.invokeStream via requireAIDisclosure (Phase 07).
      const handle = await this.aiClient.invokeStream({
        prompt,
        stream: true,
        signal: abortController.signal,
      });

      // Step 6 — consume stream / buffered response.
      let buffer = '';
      let renderTimer: TimerHandle | null = null;

      const scheduleRender = (): void => {
        if (renderTimer != null) return;
        renderTimer = setWindowTimeout(() => {
          renderTimer = null;
          void flushRender();
        }, RENDER_DEBOUNCE_MS);
      };

      const flushRender = async (): Promise<void> => {
        if (renderTimer != null) {
          clearWindowTimeout(renderTimer);
          renderTimer = null;
        }
        // Empty + re-render (same pattern as AIStreamModal).
        while (reviewAreaEl.firstChild) reviewAreaEl.removeChild(reviewAreaEl.firstChild);
        await MarkdownRenderer.render(this.app, buffer, reviewAreaEl, '', component);
      };

      if (handle.kind === 'stream') {
        const textStream = (
          handle.result as unknown as { textStream: AsyncIterable<string> }
        ).textStream;
        for await (const chunk of textStream) {
          if (abortController.signal.aborted) throw new Error('aborted');
          if (typeof chunk !== 'string' || chunk.length === 0) continue;
          buffer += chunk;
          scheduleRender();
        }
        // Natural completion — flush final render.
        await flushRender();

        // Cost ledger.
        let cost = 0;
        try {
          const usage = await (
            handle.result as unknown as {
              usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }>;
            }
          ).usage;
          if (usage) {
            cost = estimateCostUsd(providerCfg.model ?? '', {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            });
          }
        } catch {
          cost = 0;
        }
        await this.aiClient.addCost(cost);
      } else {
        // Buffered fallback — await text, render once.
        const text = await handle.text;
        if (abortController.signal.aborted) throw new Error('aborted');
        buffer = text;
        await flushRender();
        await this.aiClient.addCost(0);
      }

      // Guard: if aborted between stream-end and here, skip vault write.
      if (abortController.signal.aborted) return;

      // Step 7 — write review to note via vault.process (D-20, D-21).
      // Build attribution line (D-03): local date via getFullYear/getMonth/getDate.
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const attributionLine = `*Reviewed by ${prettyName(provider)} (${providerCfg.model ?? 'unknown'}) — ${yyyy}-${mm}-${dd}*`;
      const reviewContent = buffer + '\n\n' + attributionLine;

      await this.app.vault.process(ctx.file, (noteBody) =>
        mergeAIReviewSection(noteBody, reviewContent),
      );
    })().catch((err) => {
      // Anti-zombie: if aborted (modal closed), silently swallow.
      if (abortController.signal.aborted) {
        void this.aiClient.addCost(0);
        return;
      }
      // D-11: non-blocking failure — subtle Notice, no vault write.
      const reason = err instanceof Error ? err.message : String(err);
      new Notice(`AI review skipped — ${reason.slice(0, 100)}`, 4000);
      void this.aiClient.addCost(0);
    });

    return {
      abort: () => abortController.abort(),
      promise,
    };
  }

  /**
   * Phase 09 Plan 04 (AIREV-05) — manual AI Review re-run. Invoked by the
   * `rerun-ai-review` palette command. Opens AIStreamModal with the review
   * prompt; on stream completion, writes the review + attribution to the
   * note via vault.process (idempotent — replaces existing ## AI Review).
   *
   * Notice paths:
   *   - No active AI provider → "No AI provider configured. Open settings → AI."
   *   - No code fence found → "No `## Code` block found."
   *   - Problem details unavailable → "Problem details unavailable."
   */
  async runAIReview(slug: string, file: TFile): Promise<void> {
    // Step 1 — gate on active provider (same pattern as openAIDebug Step 6).
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      new Notice('No AI provider configured. Open settings → AI.', 4000);
      return;
    }
    const providerCfg = this.settings.getProviderConfig(provider);

    // Step 2 — resolve the active MarkdownView for reading the editor body.
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const body = view.editor.getValue();

    // Step 3 — extract first fenced code block.
    const extracted = extractFirstFencedBlock(body);
    if (!extracted) {
      new Notice('No `## Code` block found. Add a fenced block with your solution.', 6000);
      return;
    }
    const language = extracted.lang ?? this.settings.getDefaultLanguage() ?? 'plaintext';

    // Step 4 — resolve problem markdown (DetailCache hit or fetch).
    let problemHtml = '';
    const cached = this.settings.getProblemDetail(slug);
    if (cached?.contentHtml) {
      problemHtml = cached.contentHtml;
    } else {
      try {
        const fetched = await this.client.getProblemDetail(slug);
        if (!fetched) {
          new Notice('Problem details unavailable. Refresh the note and try again.', 6000);
          return;
        }
        problemHtml = fetched.content ?? '';
      } catch {
        new Notice('Problem details unavailable. Refresh the note and try again.', 6000);
        return;
      }
    }
    const problemMd = htmlToMarkdown(problemHtml);

    // Step 5 — assemble the review prompt (pure transform).
    const prompt = buildReviewPrompt({ problemMd, code: extracted.code, language });

    // Step 6 — open AIStreamModal with onStreamComplete callback for vault write.
    new AIStreamModal(this.app, {
      provider,
      prompt,
      aiClient: this.aiClient,
      model: providerCfg.model,
      title: `AI Review — ${prettyName(provider)}`,
      disclosureCopy: withReviewBullet(DISCLOSURE_BASE_COPY),
      onStreamComplete: async (fullText: string) => {
        // Build attribution line (D-03 format).
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const attributionLine = `*Reviewed by ${prettyName(provider)} (${providerCfg.model ?? 'unknown'}) — ${yyyy}-${mm}-${dd}*`;
        const reviewContent = fullText + '\n\n' + attributionLine;

        // D-20/D-21: vault.process is atomic + idempotent (replaces existing).
        await this.app.vault.process(file, (noteBody) =>
          mergeAIReviewSection(noteBody, reviewContent),
        );
      },
    }).open();
  }

  /**
   * Phase 08 Plan 04 (AIDBG-01) — host method invoked by the fence-row
   * "AI: Debug" button (via the CodeBlockButtonRowHost interface). Resolves
   * the active MarkdownView's lc-slug frontmatter, validates it, then
   * delegates to `openAIDebug(slug)`.
   *
   * The fence-row factory is shared between Edit Mode (CM6 widget) and
   * Reading Mode (post-processor) so this single host method serves both
   * surfaces. Uses `getActiveViewOfType(MarkdownView)` per project rule
   * (NEVER `workspace.activeLeaf` direct access).
   *
   * Notice paths (3 surfaces):
   *   - No active MarkdownView → "Open a LeetCode problem note first."
   *   - No frontmatter / no lc-slug → "Active note has no `lc-slug` frontmatter."
   *   - Valid slug → delegates to openAIDebug (which has its own Notice paths).
   */
  async aiDebugFromActive(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const slug = fm?.['lc-slug'];
    if (!isValidSlug(slug)) {
      new Notice('Active note has no `lc-slug` frontmatter.', 4000);
      return;
    }
    await this.openAIDebug(slug);
  }

  /** Submit the active note via SubmissionOrchestrator (Plan 05). Opens a
   *  VerdictModal, drives it through pending → terminal / abort / timeout. */
  async submitFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
       
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    if (!this.guardSingleFlight()) return;

    const modal = new VerdictModal(this.app, {
      problemTitle: ctx.title,
      onCancel: () => { this.cancelActiveSolve(); },
      onCopyFailingInput: (input: string) => {
        void this.openRunModalWithSeedAppended(input);
      },
      // Phase 08 Plan 05 (AIDBG-01) — AI: Debug button in verdict modal
      // footer. Same single entrypoint as the fence-row + palette surfaces
      // (T-08-05-T-host single-host mitigation). slug captured at modal
      // construction time — this is the active problem at submit time so
      // it stays correct even if the user navigates away while the verdict
      // is rendering. VerdictModal handles the close-then-fire ordering.
      onOpenAIDebug: () => { void this.openAIDebug(ctx.slug); },
      // Phase 09 Plan 03 (AIREV-01) — auto-review on AC. Gates on BOTH
      // autoAIReviewOnAC toggle AND an active provider being configured.
      // The callback is invoked by VerdictModal AFTER renderVerdict paints
      // "Accepted!" — the host handles prompt assembly, AIClient.invokeStream,
      // buffer accumulation, debounced render, and vault.process write.
      onStartReviewStream: this.settings.getAutoAIReviewOnAC() && this.settings.getActiveAIProvider()
        ? (reviewAreaEl, component) => this.startAutoReview(ctx, reviewAreaEl, component)
        : undefined,
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
      // Phase 08 Plan 04 (AIDBG-01) — capture non-Accepted verdicts into the
      // LastVerdictStore so openAIDebug can feed them into buildDebugPrompt.
      // Plan 08-01 locked the capture filter inside the orchestrator
      // (kind !== 'ac' && kind !== 'unknown' && kind !== 'unknown-lc');
      // main.ts only registers the sink. The orchestrator stays pure: it
      // imports only the LastVerdict TYPE — never the store class itself —
      // so test instantiations without a store remain valid (locked
      // T-08-04-T-orch mitigation).
      onVerdict: (slug, verdict) => this.lastVerdictStore.set(slug, verdict),
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
         
        new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof TimeoutError || (err as Error).name === 'TimeoutError') {
        // D-20 LOCKED copy + D-22 command-palette Notice surface.
         
        new Notice('LeetCode is slow to respond. Try again.', 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof RateLimitError) {
        const seconds = Math.ceil(err.retryAfterMs / 1000);
         
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

  /** Phase 5 Plan 04 (D-01, D-03, D-07) — open the unified RunModal seeded
   *  from the ephemeral tab store. The modal's Run button calls onRun with
   *  ONLY the active tab's input (D-07 single-active-tab semantics) and we
   *  forward it to `runInterpretedInput` which drives the same pending /
   *  terminal / abort / timeout state machine as submit. */
  async runFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
       
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const detail = this.settings.getProblemDetail(ctx.slug);
    const exampleTestcases = detail?.exampleTestcases ?? '';
    // Phase 5.4 UAT fix — derive lines-per-case so RunModal can split LC's
    // single-newline-formatted exampleTestcases (observed live for two-sum)
    // into per-case tabs. deriveArity falls back to 1 when both metaData
    // and sampleTestCase are absent.
    const linesPerCase = deriveArity(detail?.metaData, detail?.sampleTestCase);
    new RunModal(this.app, {
      slug: ctx.slug,
      exampleTestcases,
      linesPerCase,
      store: this.ephemeralTabs,
      onRun: (input: string) => {
        // Re-resolve context at run time (the modal is asynchronous; the user
        // may have closed + reopened the note in between).
        const current = this.getActiveProblemContext();
        if (current) void this.runInterpretedInput(current, input);
      },
    }).open();
  }

  /**
   * Phase 5.3 (POLISH-09 / D-05..D-12) — chevron-driven LC language switch on
   * the active note's `## Code` fence.
   *
   * Sequence is LOAD-BEARING (UI-SPEC §"Dropdown item click → language switch"):
   *
   *   Step A — Fetch starter code via `client.getProblemDetail` (cache-then-
   *            network; existing `LeetCodeClient` path with 7-day TTL). On
   *            rejection: ONE Notice "Couldn't fetch starter code for {Label}."
   *            and return — fence + frontmatter unchanged (Pitfall 4).
   *   Step B — Single CM6 `view.dispatch({ changes: [openerChange, bodyChange],
   *            userEvent: 'leetcode.lang-switch' })`. ONE transaction → ONE
   *            Cmd-Z reverts opener + body atomically (D-08).
   *   Step C — `await app.fileManager.processFrontMatter(file, fm => { … })`.
   *            Lands on Obsidian's vault undo stack — separate from CM6's
   *            editor undo (Pitfall 1; accepted divergence).
   *
   * Order matters: doing C before B opens a 5–20 ms window where `lc-language`
   * says the new language but the fence still has the old one (Run during
   * that window dispatches mismatched language to LC).
   *
   * Silent no-ops:
   *   - Active leaf moved off `file` between click and execution → bail.
   *   - `findCodeFence(state)` returns null (fence deleted mid-edit) → bail.
   *
   * Atomicity guard: a single `cm.dispatch({ changes: [...] })` carries BOTH
   * range edits. NEVER split into two dispatch calls — that would create two
   * undo steps and break D-08.
   */
  async switchFenceLanguage(file: TFile, newSlug: string): Promise<void> {
    // Step 1 — active-view guard (UI-SPEC §"silent" cases). Raced with leaf
    // change → bail silently; no Notice.
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file !== file) return;

    // Read current note's lc-slug from frontmatter so we can fetch the LC
    // detail. Same shape as getActiveProblemContext.
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlugRaw = fm?.['lc-slug'];
    if (!isValidSlug(lcSlugRaw)) return; // silent no-op — chevron rendered on a non-lc-slug note (race)
    const lcSlug = lcSlugRaw;

    // Friendly label for the network-failure Notice.
    const newLabel = LC_LANG_DISPLAY_LABELS[newSlug] ?? newSlug;

    // Step A — Fetch starter code. Existing client path (`requestUrl` +
    // throttle + 7-day cache via SettingsStore.getProblemDetail). On
    // rejection: locked Notice copy from UI-SPEC §Copywriting.
    let snippet: string;
    try {
      const detail = await this.client.getProblemDetail(lcSlug);
      snippet = detail?.codeSnippets?.find((s) => s.langSlug === newSlug)?.code ?? '';
    } catch {
       
      new Notice(`Couldn't fetch starter code for ${newLabel}.`, 6000);
      return;
    }

    // Step B — atomic CM6 dispatch. `view.editor.cm` is undocumented internal
    // API; canonical path for plugin click handlers (RESEARCH §Pitfall 6 +
    // CLAUDE.md acknowledged). Double-cast through `unknown` because the
    // public `Editor` interface doesn't expose `cm` in obsidian.d.ts.
    const cm = (view.editor as unknown as { cm: EditorView }).cm;
    const fence = findCodeFence(cm.state);
    if (!fence) return; // silent no-op — fence missing/unterminated mid-edit (UI-SPEC §"Error state — findCodeFence returns null")

    const openerLine = cm.state.doc.line(fence.openerLine);
    const closerLine = cm.state.doc.line(fence.closerLine);
    const newFenceTag = lcSlugToFenceTag(newSlug);
    // Preserve any leading whitespace on the opener line (rare but possible
    // in nested-list contexts) — RESEARCH §Pattern 1.
    const tagMatch = /^(\s*```)\s*\S*\s*$/.exec(openerLine.text);
    const newOpenerText = tagMatch
      ? `${tagMatch[1]}${newFenceTag}`
      : `\`\`\`${newFenceTag}`;

    // Body spans from start-of-line-after-opener to start-of-closer-line.
    const bodyStart = openerLine.to + 1; // newline after opener
    const bodyEnd = closerLine.from;

    // Single dispatch — both edits + the chevron-refresh effect land in one
    // transaction. D-08 atomicity (one undo step) is preserved because
    // CM6 only counts `changes` toward the undo history; the effect rides
    // along without creating an extra undo entry.
    //
    // Phase 05.5 chevron-refresh hardening: the effect carries `newSlug` as
    // payload so `buildDecorations` paints the correct language immediately
    // even though the metadataCache's `lc-language` value won't reflect the
    // new slug until `processFrontMatter` (Step C) resolves AND Obsidian's
    // metadataCache subscriber fires `'changed'`. Without this payload, the
    // chevron's StateField would re-read stale frontmatter and paint the
    // old label until the user typed in the fence body.
    cm.dispatch({
      changes: [
        { from: openerLine.from, to: openerLine.to, insert: newOpenerText },
        { from: bodyStart, to: bodyEnd, insert: snippet + '\n' },
      ],
      effects: languageRefreshEffect.of(newSlug),
      userEvent: 'leetcode.lang-switch',
    });

    // Step C — frontmatter write (separate undo stack — Pitfall 1 accepted).
    // The metadataCache `'changed'` listener will fire later and dispatch a
    // second `languageRefreshEffect.of(undefined)` once the cache is fresh;
    // by then `buildDecorations` reads the correctly-flushed `lc-language`
    // and the override-payload path becomes unnecessary. The two refresh
    // paths converge to the same DOM state.
    await this.app.fileManager.processFrontMatter(file, (fmObj: Record<string, unknown>) => {
      fmObj['lc-language'] = newSlug;
    });
  }

  /**
   * Phase 5.3 D-06 — `LanguageChevronHost` interface alias. Chevron widget
   * calls `plugin.switchLanguage(file, slug)`; thin wrapper around
   * `switchFenceLanguage` for naming hygiene at the host-contract layer.
   */
  switchLanguage(file: TFile, newSlug: string): Promise<void> {
    return this.switchFenceLanguage(file, newSlug);
  }

  /** D-25 — "Copy failing testcase" affordance from VerdictModal. Appends the
   *  seed input as a new tab in the ephemeral store, then opens RunModal with
   *  that tab active. The in-memory store is the single source of truth; no
   *  vault write, no `## Custom Tests` interaction (D-08). */
  private openRunModalWithSeedAppended(seedInput: string): void {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
       
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const detail = this.settings.getProblemDetail(ctx.slug);
    const exampleTestcases = detail?.exampleTestcases ?? '';
    // Phase 5.4 UAT fix — same arity derivation as runFromActive.
    const linesPerCase = deriveArity(detail?.metaData, detail?.sampleTestCase);
    // Pre-seed via getOrSeed + append — RunModal's onOpen will read what
    // we just set. setTabs overwrites; we want to preserve existing tabs so
    // the user's in-progress edits from an earlier Run are not clobbered.
    const existing = this.ephemeralTabs.getOrSeed(ctx.slug, exampleTestcases, linesPerCase);
    const newTabs = [...existing, seedInput];
    this.ephemeralTabs.setTabs(ctx.slug, newTabs);
    new RunModal(this.app, {
      slug: ctx.slug,
      exampleTestcases,
      linesPerCase,
      // UAT-G4: focus the just-appended failing-case tab (last index).
      initialActiveTab: newTabs.length - 1,
      store: this.ephemeralTabs,
      onRun: (input: string) => {
        const current = this.getActiveProblemContext();
        if (current) void this.runInterpretedInput(current, input);
      },
    }).open();
  }

  /** Shared helper — used by RunModal's onRun. Drives the interpret-solution
   *  pipeline + VerdictModal + error routing. */
  private async runInterpretedInput(ctx: ProblemContext, dataInput: string): Promise<void> {
    if (!this.guardSingleFlight()) return;

    // Gate: fenced block present (D-04).
    const body = ctx.currentBody();
    const extracted = extractFirstFencedBlock(body);
    if (!extracted) {
       
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
        void this.openRunModalWithSeedAppended(input);
      },
      // Phase 08 Plan 05 (AIDBG-01) — AI: Debug button in verdict modal
      // footer for the Run path too (custom-input runs that fail). The
      // verdict footer is rendered by the SAME renderer as Submit, so the
      // same conditional union {wa,tle,mle,re,ce} applies and the same
      // single openAIDebug entrypoint is invoked.
      onOpenAIDebug: () => { void this.openAIDebug(ctx.slug); },
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
      // Phase 5.4 D-08: forward LC `metaData` (when cached on detail) +
      // the exact `data_input` that was sent so the renderer can label
      // per-case Input rows. `detail?.metaData` is undefined today (the
      // DetailCacheEntry shape — src/settings/SettingsStore.ts:18-40 —
      // does NOT yet cache metaData / sampleTestCase); the renderer
      // hits the D-08 raw-dump fallback in that case. Caching of
      // metaData is a follow-up gap surfaced in 05.4-03-SUMMARY.md.
      const detailMetaData =
        typeof (detail as unknown as { metaData?: unknown })?.metaData === 'string'
          ? ((detail as unknown as { metaData?: string }).metaData ?? undefined)
          : undefined;
      modal.renderVerdict(terminal as RunCheckResponse, ctx.title, {
        metaData: detailMetaData,
        joinedDataInput: dataInput,
      });
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
         
        new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof TimeoutError || (err as Error).name === 'TimeoutError') {
        // D-20 LOCKED copy + D-22 command-palette Notice surface.
         
        new Notice('LeetCode is slow to respond. Try again.', 8000);
        try { modal.close(); } catch { /* headless */ }
      } else if (err instanceof RateLimitError) {
        const seconds = Math.ceil(err.retryAfterMs / 1000);
         
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
       
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const picker = new SubmissionPickerModal(this.app, {
      file: ctx.file,
      slug: ctx.slug,
      title: ctx.title,
      submissionHistoryStore: this.submissionHistory,
      // G-PICKER-MODAL-NOCLOSE-ON-COPY (Plan 05.3-09): the picker supplies
      // an `onSuccess` callback as the 2nd argument here; we thread it into
      // openSubmissionDetailFromRow which forwards it to the
      // SubmissionDetailModal constructor's deps.onSuccess. When the inner
      // detail modal's click handler invokes deps.onSuccess?.() after a
      // successful Copy-to-Code, the picker also dismisses (chain-close).
      openDetailModal: (row: SubmissionRow, onSuccess?: () => void) => {
        void this.openSubmissionDetailFromRow(ctx.file, ctx.title, row, onSuccess);
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
    onSuccess?: () => void,
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
         
        new Notice("Couldn't reach LeetCode. Check your connection.", 8000);
        return;
      }
      if (err instanceof TimeoutError || (err as Error).name === 'TimeoutError') {
        // D-20 LOCKED copy + D-22 command-palette Notice surface.
         
        new Notice('LeetCode is slow to respond. Try again.', 8000);
        return;
      }
      logger.debug('graph.openSubmissionDetail: fetch failed', err);
       
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
      // G-PICKER-MODAL-NOCLOSE-ON-COPY (Plan 05.3-09): forward the picker's
      // chain-close callback so the detail modal's click-handler
      // (`this.deps.onSuccess?.()`) dismisses the outer picker on success.
      onSuccess,
    }).open();
  }

  /** Phase 5.2 D-07 — thin wrapper around the testable
   *  `resetCodeWithConfirm` helper. Opens ConfirmOverwriteModal (D-11)
   *  when the existing fence is non-empty; bypasses the modal when the
   *  fence is empty or absent. Success Notice copy is locked to
   *  "Code reset to starter." per UI-SPEC §Copywriting. */
  private async resetCode(file: TFile, slug: string): Promise<void> {
    await resetCodeWithConfirm({
      app: this.app,
      file,
      slug,
      settings: this.settings,
      confirm: () =>
        new Promise<boolean>((resolve) => {
          void import('./graph/ConfirmOverwriteModal').then(
            ({ ConfirmOverwriteModal }) => {
              new ConfirmOverwriteModal(this.app, resolve).open();
            },
          );
        }),
      notify: (message) => {
        new Notice(message, 3000);
      },
    });
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
