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
import { DISCLOSURE_BASE_COPY, withDebugBullet, withReviewBullet, withContestAnalysisBullet } from './ai/disclosure';
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
import { NoteWriter, toDetailCacheEntry } from './notes/NoteWriter';
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
import { resetCodeWithConfirm, extractFenceBodyFromFullNote } from './solve/resetCodeWithConfirm';
import { makeFileOpenHandler } from './main/fileOpenHook';
import { extractFirstFencedBlock } from './solve/codeExtractor';
import { resolveLangSlug, lcSlugToFenceTag, LC_LANG_DISPLAY_LABELS } from './solve/languages';
// Phase 5.3 D-13 parity — chevron's atomic dispatch reuses Phase 5.1's exported
// `findCodeFence` so fence detection has one source of truth.
import { findCodeFence, languageRefreshEffect } from './main/codeActionsEditorExtension';
// Phase 16 Plan 04 (LANG-01, D-12) — child editor language Compartment.
// `switchFenceLanguage` dispatches a Compartment.reconfigure on the child
// (when present) immediately after the parent CM6 dispatch, so the child's
// parser, indent unit, closeBrackets, and Cmd-/ keymap binding switch in
// lock-step with the visible fence-tag flip.
import { languageCompartment, buildLanguageExtensions } from './main/childEditorLanguage';
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
// Phase 20 Plan 01 — narrowed v1.3 protection extension. Mutually exclusive
// with sectionLockExtension via the useInlineWidget gate (D-protect-03).
import { buildSectionProtectionExtension } from './main/sectionProtectionExtension';
// Phase 13 — nested child EditorView for ## Code fence (Plans 01-03).
import { ChildEditorRegistry } from './main/childEditorRegistry';
import { buildNestedEditorExtension, nestedEditorRebuildEffect } from './main/nestedEditorExtension';
// Phase 5.2 D-13 — python3 → python language-tag alias for Reading-Mode Prism highlighting.
import { registerPython3Highlighter } from './main/python3Highlighter';
import { registerVaultModifyRepairTrigger } from './main/childEditorSync';
// Phase 19 Plan 01 — v1.3 inline widget primitives. Hard-gated behind
// useInlineWidget=ON (default OFF) per CONTEXT D-05; v1.2 nested-editor
// stays the user-facing default through Phase 21.
import { WidgetRegistry } from './widget/widgetRegistry';
import { leetCodeBlockProcessor } from './widget/codeBlockProcessor';
// Phase 20 Plan 20-01 (VIM-02) — canonical reader for the undocumented
// `app.vault.getConfig('vimMode')` boolean. Single cast site.
import { readVimModeFromVault } from './widget/vimMode';
import { registerThemeListener } from './widget/themeListener';
// Phase 20 Plan 20-04 (multi-pane "Take over" affordance) — single global
// active-leaf-change + layout-change listener that walks widgetRegistry.values()
// and flips each widget's pane state ('active' vs 'peer'). UI-SPEC §3 contract.
import { registerMultiPaneCoordinator } from './widget/multiPaneCoordinator';
import { leetCodeFenceViewPlugin } from './widget/liveModeViewPlugin';
// Phase 19 Plan 02 — selfWriteSuppression + sha1 helper for the modify-event
// consumer. extractFenceBody for hashing observed disk fence body.
import { SelfWriteSuppression } from './widget/selfWriteSuppression';
import { sha1 } from './widget/debouncedWriter';
import { extractFenceBody } from './widget/fenceSerialization';
import type { WidgetController } from './widget/WidgetController';
// Phase 20 Plan 20-03 (SYNC-04 / SYNC-05) — conflict modal opens when an
// external edit lands during local in-flight typing. The plugin holds a
// single `activeConflictModal` reference; the modal's constructor callback
// resets it inside onClose() (BLOCKER fix; D-conflict-04 in-place update).
import { ConflictModal } from './widget/ConflictModal';
// Phase 19 Plan 03 — state persistence map (CONTEXT C-09 + D-01 + RESEARCH
// Pattern 4). Captures cursor + scroll + history JSON on unmount; hydrates on
// remount within 30s TTL. Belt-and-suspenders companion to Plan 19-01's
// mousedown.stopPropagation listener (D-02).
import { StatePersistenceMap } from './widget/statePersistence';
// Phase 4 Plan 05 — knowledge-graph wiring.
import { KnowledgeGraphWriter } from './graph/KnowledgeGraphWriter';
import { PatternClusterEngine } from './graph/PatternClusterEngine';
import { ClusterHubWriter } from './graph/ClusterHubWriter';
import { SubmissionHistoryStore } from './graph/SubmissionHistoryStore';
import {
  listSubmissionsForSlug,
  detailForSubmission,
  type SubmissionRow,
} from './graph/submissionHistoryClient';
import { SubmissionPickerModal } from './graph/SubmissionPickerModal';
import { SubmissionDetailModal } from './graph/SubmissionDetailModal';
import { toIsoLocalTz } from './graph/dateFormat';
import { normalizePatternName } from './graph/patternTaxonomy';
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
import { getRemainingMs } from './contest/types';
// Phase 10 Plan 04 — contest solve view (dedicated editing surface).
import { ContestSolveView, CONTEST_SOLVE_VIEW_TYPE } from './contest/ContestSolveView';
import { ContestScratchManager } from './contest/ContestScratchManager';
// Phase 10 Plan 07 — contest integration wiring (finalizer, AI analysis,
// list service, preview modal, abort modal).
import { finalizeContest } from './contest/ContestFinalizer';
import { ContestListService } from './contest/ContestListService';
import { ContestPreviewModal } from './contest/ContestPreview';
import { AbortContestModal } from './contest/AbortContestModal';
import { buildContestAnalysisPrompt } from './contest/buildContestAnalysisPrompt';
import { mergeAIContestAnalysisSection } from './contest/mergeAIContestAnalysisSection';

/** Shape returned by getActiveProblemContext — the minimum info every Phase 3
 *  command needs: the TFile (used by RunModal / submit / starter-code paths),
 *  the slug (from lc-slug frontmatter), and a live `currentBody()` getter that
 *  re-reads at invocation time (SOLVE-09). */
interface ProblemContext {
  view: MarkdownView;
  file: TFile;
  slug: string;
  title: string;
  lcLanguage: string | null;
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

  // Phase 11 Plan 03 — AI Knowledge Graph hub writer + classification engine.
  // Constructed after AIClient in onload. hubWriter is exposed for the
  // reconcile-pattern-hubs palette command and 1-hour interval timer.
  private hubWriter!: ClusterHubWriter;

  // Phase 5 Plan 04 (D-09) — ephemeral Run-modal tab store. In-memory only;
  // layout-change + active-leaf-change reconcile wipes slugs with no open
  // markdown leaf. Constructed in onload Step 5.8; disposed in onunload.
  ephemeralTabs!: EphemeralTabStore;

  // Phase 07 Plan 03 — AI provider facade. Phase 12 Plan 04 (D-10) deferred
  // construction: backing field is null until first access via the lazy getter.
  // All AI operations are user-initiated (AI Debug click, AC with AI review,
  // test connection, KG classification) so the getter triggers on first user
  // action — never during plugin cold-start. Holds no listeners, no timers,
  // no open sockets — no onunload teardown required.
  private _aiClient: AIClient | null = null;

  /** Lazy getter — defers AIClient construction until first AI action (D-10).
   *  Cold-start path never hits this; only user-initiated AI flows trigger it. */
  get aiClient(): AIClient {
    if (!this._aiClient) {
      this._aiClient = new AIClient(
        this.settings,
        (provider, cfg) => this.requireAIDisclosure(provider, cfg),
      );
    }
    return this._aiClient;
  }

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
  // Constructed in onload after settings. Plan 07 wires the real callbacks.
  contestSessionManager!: ContestSessionManager;

  // Phase 10 Plan 07 — Contest list service. Constructed in onload after client
  // + settings. Provides refresh/search/surpriseMe for ProblemBrowserView's
  // contest mode and the `start-random-contest` palette command.
  contestListService!: ContestListService;
  contestScratch!: ContestScratchManager;

  // Phase 13 — LRU cache for nested child EditorViews (cap=5, per D-12).
  childEditorRegistry!: ChildEditorRegistry;
  // Phase 19 Plan 01 — instantiated only when useInlineWidget=ON (D-05
  // hard-gate). Optional field; main.ts onunload uses optional chaining when
  // calling destroyAll() so the v1.2 baseline path remains unaffected.
  widgetRegistry?: WidgetRegistry;
  // Phase 19 Plan 02 — plugin-singleton self-write suppression map. Same
  // gating as widgetRegistry (instantiated under useInlineWidget=ON only).
  // Consumed by the vault.on('modify') handler to drop self-write echoes;
  // armed by DebouncedWriter.flush BEFORE vault.process (CONTEXT C-04).
  selfWriteSuppression?: SelfWriteSuppression;
  // Phase 19 Plan 03 — plugin-singleton state persistence map (CONTEXT C-09
  // + D-01). Same gating as widgetRegistry (instantiated under
  // useInlineWidget=ON only). Captures cursor + scroll + history JSON on
  // mount/unmount; hydrates on remount within 30s TTL. CONTEXT D-02
  // belt-and-suspenders companion to the Plan 19-01 mousedown.stopPropagation
  // listener.
  statePersistence?: StatePersistenceMap;

  // Phase 20 Plan 20-05 — gap-closure for widget-thrash-on-type. Hook 1
  // flushAll fires only on cross-file leaf transitions; same-leaf focus
  // reaffirmations (mousedown inside widget → contentDOM.focus →
  // active-leaf-change refire) are no-ops because each flush produces a
  // vault.process echo on the parent CM6 that rebuilds the ViewPlugin's
  // DecorationSet (sourceHash changes) and remounts the widget — destroying
  // focus/cursor/vim state on every keystroke. See
  // .planning/debug/widget-thrash-on-type.md for full trace.
  // Initially undefined; first active-leaf-change populates it. Reset on
  // plugin onunload.
  private lastActiveLeafFilePath: string | null | undefined = undefined;

  // Phase 20 Plan 20-03 (SYNC-05 + D-conflict-04) — single global reference
  // to the currently-open ConflictModal, if any. Set when the vault.on('modify')
  // handler decides to open the modal (in-flight typing path); reset to null
  // by the modal's constructor callback fired inside `onClose()` (BLOCKER fix
  // — guaranteed-fired exactly once across every close trigger). The
  // D-conflict-04 second-modify path checks `activeConflictModal?.isOpen` to
  // decide between updating the External pane in place vs. constructing a
  // fresh modal. NEVER stack two modals.
  activeConflictModal: ConflictModal | null = null;

  /**
   * Phase 17 Plan 09 (gap closure 17-UAT.md Issue 3 / Test 12) — per-child
   * slug tracker. Records the language slug currently applied to each child
   * editor's `languageCompartment`. Updated whenever a Compartment.reconfigure
   * dispatch lands (chevron switch path AND fm-reactivity listener path).
   *
   * Gate 3 of the fm-reactivity listener
   * (`handleFmChangeForLanguageReactivity`) reads from this tracker — NOT
   * from the parent fence opener tag — because per D-14 the listener does
   * not rewrite the opener, so reading "current applied child language" from
   * the opener is unsound and produces the asymmetric round-trip bug
   * described in 17-UAT.md Issue 3 (Java → Python3 swaps but Python3 → Java
   * silently no-ops).
   *
   * WeakMap auto-GCs entries when the EditorView is destroyed (registry
   * destroy + browser GC) — no explicit cleanup needed. Pre-mount or
   * pre-first-dispatch the tracker has no entry; Gate 3 treats absent
   * entries as "unknown current" and proceeds to dispatch (idempotent —
   * Compartment.reconfigure with an equal LanguageSupport is a no-op
   * visually but updates the tracker for the next swap).
   */
  childLanguageTracker: WeakMap<EditorView, string> = new WeakMap();

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

    // Step 5.9 — Phase 12 Plan 04 (D-10) DEFERRED AIClient construction.
    // AIClient is now constructed lazily on first access via the `get aiClient()`
    // getter. Cold-start no longer pays constructor cost. The getter triggers on
    // first user-initiated AI action (AI Debug click, AC review, test connection,
    // KG classification). SettingsStore.load is already complete so the getter
    // can safely access settings whenever triggered.

    // Step 5.9b — Phase 11 Plan 03 — AI Knowledge Graph wiring. ClusterHubWriter
    // + PatternClusterEngine are constructed AFTER settings load. Engine receives
    // a getter function `() => this.aiClient` so AIClient construction is truly
    // deferred until the engine's first classify call (not at onload time).
    this.hubWriter = new ClusterHubWriter({
      app: this.app,
      problemsFolder: this.settings.getProblemsFolder(),
    });
    const patternClusterEngine = new PatternClusterEngine({
      app: this.app,
      aiClient: () => this.aiClient,
      settings: this.settings,
      hubWriter: this.hubWriter,
    });
    this.knowledgeGraph.setPatternClusterEngine(patternClusterEngine);
    this.knowledgeGraph.setHubWriter(this.hubWriter);

    // D-07 mechanism 3 — 1-hour interval for background hub reconcile.
    // registerInterval auto-cleans on plugin unload.
    this.registerInterval(
      window.setInterval(() => { void this.hubWriter.reconcile(); }, 60 * 60 * 1000),
    );

    // Step 5.10 — Phase 08 Plan 04 (AIDBG-01) — LastVerdictStore. In-memory
    // per-slug Map populated by the SubmissionOrchestrator's onVerdict
    // callback (registered at orchestrator construction below in
    // submitFromActive). Plain Map; no Plugin arg; no workspace events;
    // no data.json persistence (08-CONTEXT decision B). Disposed in
    // onunload(). Order: ephemeralTabs → aiClient → lastVerdictStore.
    this.lastVerdictStore = new LastVerdictStore();

    // Step 5.10 — Phase 10 Plan 07 — ContestListService. Provides
    // refresh/search/surpriseMe for the start-random-contest palette command.
    // ProblemBrowserView constructs its own instance (Plan 03 pattern) so this
    // plugin-level instance is only for the palette command surface.
    this.contestListService = new ContestListService(this.client, this.settings);
    this.contestScratch = new ContestScratchManager(this.app, this.settings.getProblemsFolder());

    // Step 5.11 — Phase 10 Plan 03 + Plan 07 — ContestSessionManager. State
    // machine for contest lifecycle (start/pause/resume/abort/finish). Plan 07
    // wires the real callbacks: onExpired triggers finalization, onTick and
    // onVerdictChange are display-layer concerns handled by ProblemBrowserView's
    // internal polling of getSession().
    this.contestSessionManager = new ContestSessionManager(
      this.settings,
      {
        onTick: () => { /* ProblemBrowserView polls getSession() for display */ },
        onExpired: () => { void this.handleContestEnd(false); },
        onVerdictChange: () => {
          // D-06: Trigger re-render on any open ProblemBrowserView so verdict
          // badges update immediately. wireContestCallbacks() patches this
          // callback with a direct badge-update, but this fallback ensures the
          // sidebar refreshes even if the view was closed and re-opened without
          // re-wiring (e.g., workspace layout restore).
          const leaves = this.app.workspace.getLeavesOfType(BROWSER_VIEW_TYPE);
          for (const leaf of leaves) {
            const view = leaf.view as ProblemBrowserView;
            if (typeof view.onOpen === 'function') {
              void view.onOpen();
            }
          }
        },
      },
    );

    // Step 5.12 — Phase 10 Plan 07 — restore any active contest session from
    // PluginData. Resumes tick if session is still running; fires onExpired if
    // the contest timed out while the plugin was unloaded.
    this.contestSessionManager.restore();

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

    // ── Phase 10 Plan 07 contest command set (4 commands) ────────────────
    // All IDs: no plugin-id prefix, no 'command' substring, no hotkey.
    // Per D-03: start-random-contest from palette.
    this.addCommand({
      id: 'start-random-contest',
      name: 'Start random contest',
      callback: () => { void this.handleStartRandomContest(); },
    });

    // Per CONTEST-06: pause/resume toggle.
    this.addCommand({
      id: 'pause-contest',
      name: 'Pause contest',
      callback: () => {
        const session = this.contestSessionManager.getSession();
        if (!session) return;
        if (session.isPaused) {
          this.contestSessionManager.resume();
          new Notice('Contest resumed.', 3000);
        } else {
          this.contestSessionManager.pause();
          new Notice('Contest paused.', 3000);
        }
      },
    });

    // Per CONTEST-06: abort with confirmation modal (D-07).
    this.addCommand({
      id: 'abort-contest',
      name: 'Abort contest',
      callback: () => {
        if (!this.contestSessionManager.isActive()) return;
        const session = this.contestSessionManager.getSession();
        if (!session) return;
        const solvedCount = session.problems.filter(p => p.verdict === 'accepted').length;
        new AbortContestModal(
          this.app,
          solvedCount,
          session.problems.length,
          getRemainingMs(session),
          () => { void this.handleContestEnd(true); },
        ).open();
      },
    });

    // Per D-20: manual AI contest analysis on a summary note.
    // editorCheckCallback gates on lc-contest-id frontmatter (T-10-14 mitigation).
    this.addCommand({
      id: 'generate-contest-analysis',
      name: 'Generate contest analysis',
      editorCheckCallback: (checking, _editor, view) => {
        const file = view.file;
        if (!file) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!fm?.['lc-contest-id']) return false;
        if (!checking) { void this.handleManualContestAnalysis(file); }
        return true;
      },
    });

    // Phase 11 Plan 03 (D-07 mechanism 4) — palette command for manual hub reconcile.
    // No editorCheckCallback — always available (reconcile is vault-wide, not note-specific).
    this.addCommand({
      id: 'reconcile-pattern-hubs',
      name: 'Reconcile pattern hubs',
      callback: () => {
        void this.hubWriter.reconcile().then(() => {
          new Notice('Pattern hubs reconciled');
        }).catch((err) => {
          logger.debug('reconcile-pattern-hubs: failed', err);
        });
      },
    });

    // Step 6d — settings tab.
    this.addSettingTab(new LeetCodeSettingTab(this.app, this));

    // Phase 19 gap-closure (UAT Test 1 BLOCKER 2 / CONTEXT D-03 + D-05):
    // The v1.2 codeActionsPostProcessor and codeActionsEditorExtension are
    // FENCE-TAG-AGNOSTIC — they match `lc-slug + first <pre> under ## Code`
    // and `lc-slug + first ``` fence under ## Code` respectively. With
    // useInlineWidget=ON, both happily fire on the new `leetcode-solve` fence
    // and render Run/Submit/AI Debug buttons under the widget — but Phase 19
    // D-03 explicitly excludes the action row (Phase 20 territory). Hard-gate
    // them off when the widget is active. When useInlineWidget=OFF, BOTH must
    // fire (D-05 — v1.2 path unchanged). useInlineWidget is read at onload
    // only (reload-apply-only per CONTEXT D-05 hard-gate).
    if (!this.settings.getUseInlineWidget()) {
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
    }

    // Phase 13 — child editor registry (must exist before extensions fire).
    this.childEditorRegistry = new ChildEditorRegistry(5);

    // Phase 19 vq4 — read once: the nested-editor toggle is reload-apply-only.
    let useNestedEditor = this.settings.getUseNestedEditor();
    // Phase 19 Plan 01 — read the v1.3 inline-widget master toggle (CONTEXT D-05).
    const useInlineWidget = this.settings.getUseInlineWidget();

    // Phase 19 D-06 mutual-exclusion assert — must run BEFORE either
    // registration path fires (RESEARCH Pitfall 19-G timing). Forces
    // useNestedEditor=false when useInlineWidget=true so corrupt data.json
    // (both flags ON) cannot produce two CM6 instances per fence.
    // Issue 1 of 17-UAT.md style: this assert is the bisection boundary —
    // any unexpected widget activation must come from the user explicitly
    // flipping the toggle, never from data.json corruption.
    if (useInlineWidget && useNestedEditor) {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- 'useInlineWidget' / 'useNestedEditor' are persistent setting field names (proper nouns in this domain).
      new Notice('useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)', 5000);
      await this.settings.setUseNestedEditor(false);
      useNestedEditor = false;
    }

    // Step 6f-nested — Phase 13: nested child EditorView for ## Code fence.
    // Mounts a block widget containing a child CM6 EditorView with Python
    // syntax highlighting; hides raw fence lines via CSS Decoration.line.
    // Registered BETWEEN code-actions and section-lock so the cursor-redirect
    // transactionFilter processes before section-lock's cursor snap (Pitfall 3).
    if (useNestedEditor) {
      this.registerEditorExtension(buildNestedEditorExtension(this));
    }

    // Step 6f-widget — Phase 19 Plan 01+02: v1.3 inline widget mount (hard-gated).
    // Plan 19-01 registered:
    //   1. registerMarkdownCodeBlockProcessor('leetcode-solve', …) — Reading mode
    //   2. registerEditorExtension([leetCodeFenceViewPlugin(this)]) — Live Preview
    //      with EditorView.atomicRanges Facet contribution.
    // Plan 19-02 adds:
    //   3. selfWriteSuppression instance for echo suppression.
    //   4. Six flush-on-transition hooks (CONTEXT C-07; RESEARCH Pattern 5).
    //   5. vault.on('modify') consumer that drops self-writes via the
    //      suppression map; external writes log a Plan 20 reload-TBD message.
    if (useInlineWidget) {
      this.widgetRegistry = new WidgetRegistry();
      this.selfWriteSuppression = new SelfWriteSuppression();
      // Phase 19 Plan 03 — state persistence map. Captures cursor + scroll +
      // history JSON on unmount/destroy; hydrates on remount within 30s TTL.
      // Sweep stale entries every 60s via registerInterval (auto-cleans on
      // plugin unload). 60s sweep beats 30s TTL — entries are at most ~90s
      // stale before the sweep, but a remount past TTL also lazy-evicts.
      this.statePersistence = new StatePersistenceMap();
      const persistenceForInterval = this.statePersistence;
      this.registerInterval(
        window.setInterval(() => {
          persistenceForInterval.sweepExpired();
        }, 60_000),
      );
      this.registerMarkdownCodeBlockProcessor(
        'leetcode-solve',
        leetCodeBlockProcessor(this),
      );
      this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);

      // Plan 19-02 — six flush-on-transition hooks (CONTEXT C-07).

      // Hook 1: leaf change (file/leaf switch). Flush all live widgets.
      // Phase 20 Plan 20-05 — gate flushAll on actual file-path transition.
      // Same-leaf focus reaffirmations (mousedown inside widget →
      // contentDOM.focus → active-leaf-change refire) MUST NOT trigger
      // flushAll, because each flush produces a vault.process echo on the
      // parent CM6 that rebuilds the ViewPlugin's DecorationSet (sourceHash
      // changes) and remounts the widget — destroying focus/cursor/vim
      // state on every keystroke. See
      // .planning/debug/widget-thrash-on-type.md for full trace.
      this.registerEvent(
        this.app.workspace.on('active-leaf-change', () => {
          let currentPath: string | null = null;
          try {
            const av = this.app.workspace.getActiveViewOfType(MarkdownView);
            currentPath = av?.file?.path ?? null;
          } catch {
            currentPath = null;
          }
          if (this.lastActiveLeafFilePath === currentPath) {
            // Same file (including null === null transitions) — no flush needed.
            return;
          }
          this.lastActiveLeafFilePath = currentPath;
          void this.widgetRegistry?.flushAll();
        }),
      );

      // Hook 2: workspace 'quit' — primary graceful-shutdown path. The
      // tasks.add(promise) shape lets us delay Obsidian's quit until the
      // flush resolves. Verified obsidian.d.ts:7195 (since 1.4.4). RESEARCH
      // Open Question A8 — `Tasks` shape introspection: console.log once
      // on first invocation to confirm; if shape differs, fall back to
      // beforeunload only.
      let quitTasksLogged = false;
      this.registerEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workspace 'quit' Tasks shape unverified at type level
        this.app.workspace.on('quit' as never, ((tasks: { add?: (p: Promise<unknown>) => void }) => {
          if (!quitTasksLogged) {
            quitTasksLogged = true;
            try { logger.debug('LC widget: quit tasks shape', tasks); } catch { /* ignore */ }
          }
          if (typeof tasks?.add === 'function') {
            tasks.add(this.widgetRegistry?.flushAll() ?? Promise.resolve());
          }
        }) as never),
      );

      // Hook 3: file rename — flush widgets keyed under the OLD path before
      // the rename lands. Plan 19-04+ may also clearForPath the suppression
      // map; Plan 19-02 ships only the flush.
      this.registerEvent(
        this.app.vault.on('rename', (_file, oldPath) => {
          if (typeof oldPath === 'string') {
            void this.widgetRegistry?.flushFile(oldPath);
            this.selfWriteSuppression?.clearForPath(oldPath);
            // Plan 19-03 — drain any persisted state under the old path so
            // the renamed file's widget doesn't hydrate stale cursor/scroll.
            this.statePersistence?.clearForPath(oldPath);
          }
        }),
      );

      // Hook 4: beforeunload — synchronous-issue best-effort flush
      // (RESEARCH Pitfall 19-B). Belt-and-suspenders to workspace.on('quit').
      this.registerDomEvent(window, 'beforeunload', () => {
        this.widgetRegistry?.flushAllSync();
      });

      // Phase 20 Plan 20-04 (THEME-04) — live theme retheme dispatcher.
      // Single global `app.workspace.on('css-change')` listener (verified
      // at obsidian.d.ts:7137 in 1.12.3) iterates `widgetRegistry.values()`
      // and calls `ctl.cssRetheme()` per widget. cssRetheme calls only
      // `view.requestMeasure()` — no EditorView rebuild; cursor + scroll +
      // undo state preserved. The cascading CSS classes (lc-nested-editor +
      // HyperMD-codeblock + childEditorSemanticClasses) already inherit
      // Obsidian's CSS variables; this listener exists only to nudge CM6
      // to recompute layout-affected metrics after the new computed styles
      // apply. MutationObserver fallback documented in 20-RESEARCH §"Pattern
      // 7" but NOT shipped (event verified to exist).
      registerThemeListener(this);

      // Phase 20 Plan 20-04 (multi-pane "Take over" affordance) — single
      // global `app.workspace.on('active-leaf-change')` + `layout-change`
      // listener walks widgetRegistry.values() on every focus transition.
      // For widgets matching the focused note's file path: same-leaf →
      // setPaneState('active'), other-leaf → setPaneState('peer'). Peer
      // widgets get a `.lc-takeover-overlay` + "Click to take over" CTA per
      // UI-SPEC §3; clicking it calls app.workspace.setActiveLeaf which
      // synchronously fires active-leaf-change so the listener flips state
      // in the same animation frame (~16ms race window). Embed widgets
      // (Phase 19 EMBED-01..04) skip the affordance via the controller's
      // `isEmbed` flag (defense-in-depth: coordinator filter + setPaneState
      // gate). L10 single-active-per-file invariant preserved — peer panes
      // show CTA only, do NOT live-mirror typing (MULTI-01/02 v1.4+ deferred).
      registerMultiPaneCoordinator(this);

      // Phase 20 Plan 20-01 (VIM-02) — vim live-reconfigure dispatcher.
      // Obsidian fires no documented event for the Settings → Editor →
      // Vim key bindings toggle, but `workspace.on('layout-change')`
      // fires when settings save (verified existence at obsidian.d.ts:7119,
      // since 0.9.20). On every layout-change we re-read the current
      // `vimMode` value via the canonical `readVimModeFromVault` helper
      // and fan out to every registered widget; each controller's
      // `reconfigureVim` early-returns when the cached value matches
      // (so the dispatcher is cheap on every other layout change). When
      // the value flipped, the controller dispatches
      // `vimCompartment.reconfigure(vim() ↔ [])` which preserves cursor +
      // scroll + undo state (Phase 16 Pitfall C analog). The dev-vault
      // probe outcome (Plan 20-01 SUMMARY §"Probe Outcome") confirms or
      // pre-accepts the VIM-03 banner fallback at Phase 22 (CONTEXT L4).
      this.registerEvent(
        this.app.workspace.on('layout-change', () => {
          const newVim = readVimModeFromVault(this);
          if (this.widgetRegistry) {
            for (const ctl of this.widgetRegistry.values()) {
              ctl.reconfigureVim?.(newVim);
            }
          }
        }),
      );

      // Hook 5: MarkdownRenderChild.onunload (Reading mode) — owned by
      // LeetCodeWidgetRenderChild.onunload in src/widget/WidgetController.ts.
      // No registration needed here.

      // Hook 6: Plugin.onunload — extends below in onunload() with flushAll
      // followed by destroyAll + selfWriteSuppression.clear.

      // Plan 19-02 + Phase 20 Plan 20-03 — vault.on('modify') decision tree
      // (SYNC-04 / SYNC-05). RESEARCH Specific Findings §4 gated body —
      // useInlineWidget can be flipped mid-session; gate at fire time, not
      // registration time.
      //
      // Decision tree (Plan 20-03 — RELOCATES the Plan 20-02 Pitfall P2
      // early-return into step (b) of the full structure; selfWrite consume
      // moves to step (c); branches on hasPending() in step (d)):
      //   (a) gating: useInlineWidget on; file is TFile; matching widget
      //       found in registry. If no match → no-op.
      //   (b) Pitfall P2 early-return — fence body unchanged: if
      //       observedFenceHash === widget.currentDocHash, the modify event
      //       is a frontmatter-only echo (canonical case: chevron-switch's
      //       processFrontMatter via switchLanguageFromWidget). Return
      //       without invoking suppression. RELOCATED from Plan 20-02 (was
      //       a pre-suppression check; same logic — different anchor in
      //       the tree).
      //   (c) selfWriteSuppression.tryConsume(path, observedFenceHash):
      //       'consumed' → self-write echo, drop silently.
      //       'stale' | 'miss' → fall through to (d).
      //   (d) hasPending() branch:
      //       false → widget.reloadFromDisk('silent') (line/col cursor clamp
      //               per D-conflict-03; addToHistory.of(false) annotation).
      //       true  → if activeConflictModal?.isOpen, fire
      //               updateExternalContent(observedBody) (D-conflict-04 —
      //               in-place update, NEVER stack a second modal).
      //               Otherwise construct a new ConflictModal with the
      //               constructor-callback approach (WARNING #6 fix —
      //               cleanup via callback fired inside onClose).
      this.registerEvent(
        this.app.vault.on('modify', async (file) => {
          if (!this.settings.getUseInlineWidget()) return;
          if (!(file instanceof TFile)) return;
          if (!this.selfWriteSuppression) return;
          try {
            // (a) gate — find any widget matching this file's path. We walk
            // the registry rather than a getByFilePath accessor (single-
            // fence common case is fenceIndex 0; multi-fence tracking is
            // Plan 19-04+/v1.4 deferred). For multi-pane same-file
            // (CONTEXT L10 single-active baseline + Plan 20-04 "Take over"
            // CTA), only ONE widget actively types — others get silent
            // reload. We pick the FIRST matching widget here; multi-pane
            // fan-out is owned by Plan 20-04.
            let matchingWidget: WidgetController | null = null;
            if (this.widgetRegistry) {
              for (const ctl of this.widgetRegistry.values()) {
                const candidate = ctl as unknown as WidgetController & { file: { path: string } };
                if (candidate.file.path === file.path) {
                  matchingWidget = candidate;
                  break;
                }
              }
            }
            if (!matchingWidget) return;

            const disk = await this.app.vault.read(file);
            const observedBody = extractFenceBody(disk, matchingWidget.fenceIndex) ?? '';
            const observedHash = await sha1(observedBody);

            // (b) Pitfall P2 early-return — fence body unchanged. If the
            // widget's currentDocHash matches what we just observed on
            // disk, the file changed but the FENCE BODY did not
            // (frontmatter-only write — chevron-switch path). Return
            // without invoking suppression. The currentDocHash is empty
            // briefly at very-first-mount before any edit; we DO NOT
            // short-circuit in that case (falls through to suppression —
            // safe default).
            if (
              typeof matchingWidget.currentDocHash === 'string' &&
              matchingWidget.currentDocHash.length > 0 &&
              matchingWidget.currentDocHash === observedHash
            ) {
              return;
            }

            // (c) Suppression consume.
            const result = this.selfWriteSuppression.tryConsume(file.path, observedHash);
            if (result === 'consumed') return;

            // (d) Stale or miss → branch on hasPending().
            const hasPending = matchingWidget.writer?.hasPending() === true;
            if (!hasPending) {
              // Idle widget — silent reload with line/col cursor clamp.
              await matchingWidget.reloadFromDisk('silent');
              return;
            }

            // In-flight typing — open OR update the conflict modal.
            // D-conflict-04: a second modify while modal open updates
            // the External pane in place; NEVER stack a second modal.
            if (this.activeConflictModal && this.activeConflictModal.isOpen) {
              this.activeConflictModal.updateExternalContent(observedBody);
              return;
            }

            // Construct a fresh modal with the constructor-callback
            // approach (WARNING #6 — cleanup is a callback fired inside
            // onClose; the locked single shape so Modal Test 8 has one
            // behavior to assert). The callback resets activeConflictModal
            // exactly once across every close trigger.
            const modal = new ConflictModal(
              this.app,
              matchingWidget,
              matchingWidget.view.state.doc.toString(),
              observedBody,
              () => {
                this.activeConflictModal = null;
              },
            );
            this.activeConflictModal = modal;
            modal.open();
          } catch {
            /* swallow — modify is best-effort observability */
          }
        }),
      );
    }

    // Step 6f-bis — Section protection / lock for lc-slug notes.
    //
    // Phase 20 D-protect-03: mutually-exclusive registration based on the
    // useInlineWidget master toggle. Both extensions register the same CM6
    // EditorState.changeFilter shape; only ONE is ever active on the parent
    // CM6, so the `'leetcode.*'` userEvent bypass and atomicRanges contract
    // never run twice.
    //
    //   useInlineWidget=ON  → buildSectionProtectionExtension (v1.3 narrow:
    //                         ## Problem body + ## Code heading + blank-line
    //                         pocket + ## Techniques heading; fence body +
    //                         closer owned by the widget via atomicRanges).
    //   useInlineWidget=OFF → buildSectionLockExtension (v1.2 unchanged:
    //                         ## Code heading + opener + closer + body
    //                         locked; v1.2 nested-editor or codeAction path
    //                         operates on the locked range via the
    //                         `'leetcode.*'` userEvent bypass).
    //
    // Both honor the `'leetcode.*'` userEvent bypass verbatim per L6 /
    // D-protect-02. PROTECT-03 (Phase 22) deletes the bypass + the v1.2
    // path together. `useInlineWidget` is read once at onload (line ~876).
    if (useInlineWidget) {
      this.registerEditorExtension(buildSectionProtectionExtension(this));
    } else {
      this.registerEditorExtension(buildSectionLockExtension(this));
    }

    // Step 6g-pre — Phase 12 Plan 04 (D-12) — wikilink-to-preview interception.
    // When a user clicks a [[slug]] wikilink to a problem that has no local note,
    // Obsidian creates an empty file. This handler detects that (empty file in
    // problems folder matching a known slug from the index), deletes the blank
    // file, and opens the preview tab instead. Registered BEFORE the starter-code
    // file-open handler so the blank file is caught and removed before retrofit
    // attempts to write into it.
    //
    // Gates:
    //   (a) File is in the problems folder
    //   (b) File is empty (0 bytes — just-created from wikilink click)
    //   (c) Basename matches the {id}-{slug}.md pattern AND slug exists in index
    // All three must pass to trigger deletion + preview open.
    this.registerEvent(
      this.app.workspace.on('file-open', (file: TFile | null) => {
        if (!file) return;
        // Gate (a): file must be empty (just created from a wikilink click)
        if (file.stat.size !== 0) return;
        // Gate (b): extract slug from filename and verify it matches problem pattern
        const basename = file.basename;
        // Filename convention: {id}-{slug} (e.g., "1-two-sum", "42-trapping-rain-water")
        const dashIdx = basename.indexOf('-');
        if (dashIdx < 1) return;
        const idPart = basename.slice(0, dashIdx);
        if (!/^\d+$/.test(idPart)) return;
        const slug = basename.slice(dashIdx + 1);
        if (!slug) return;
        // Gate (c): verify slug exists in cached problem index OR detail cache
        const index = this.settings.getProblemIndex();
        const inIndex = index?.problems.some((p) => p.slug === slug) ?? false;
        const inDetail = this.settings.getProblemDetail(slug) !== null;
        if (!inIndex && !inDetail) return;
        // All gates pass — delete the blank file and open preview
        void (async () => {
          try {
            await this.app.vault.delete(file);
            await openOrReusePreview(this, slug);
          } catch (err) {
            logger.debug('wikilink-to-preview: intercept failed (non-fatal)', err);
          }
        })();
      }),
    );

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

    // Step 6g.5 — Phase 17 Plan 04 (D-13/D-14, Wave 2) — external `lc-language`
    // frontmatter reactivity. When a user (or another plugin) writes a
    // different `lc-language` value to the frontmatter of an open `lc-slug`
    // note, the child editor reconfigures its language Compartment to match —
    // reusing the Phase 16 chevron-switch plumbing (`languageCompartment` +
    // `buildLanguageExtensions`). The listener does NOT rewrite the fence
    // opener tag (D-14 — frontmatter is the source of truth in this passive-
    // listener scenario; users who want the fence opener to flip use the
    // chevron). Pitfall 3 (recursive metadataCache.changed during the plugin's
    // own processFrontMatter writes) is dedupe-prevented by Gate 3 (slug
    // equality check inside `handleFmChangeForLanguageReactivity`).
    //
    // Analog: src/main/codeActionsEditorExtension.ts:329-359 (parent-side
    // chevron metadataCache subscription). This block adds the CHILD-side
    // reactivity dispatching Compartment.reconfigure on the registered child.
    this.registerEvent(
      this.app.metadataCache.on('changed', (file, _data, cache) => {
        this.handleFmChangeForLanguageReactivity(file, cache);
        // Phase 18: when metadataCache populates lc-slug for the first time
        // (newly-created note, first open), the parent's nested-editor
        // StateField needs a transaction to rebuild decorations. Without
        // this, Gate 2 in buildNestedDecorations short-circuits because
        // frontmatter wasn't available at initial StateField.create time.
        if (cache?.frontmatter?.['lc-slug']) {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view?.file?.path === file.path) {
            const cm = (view.editor as unknown as { cm: import('@codemirror/view').EditorView }).cm;
            if (cm) {
              cm.dispatch({ effects: nestedEditorRebuildEffect.of(null) });
            }
          }
        }
      }),
    );

    // Phase 18 Plan 02 (D-33) — vault.on('modify') runtime repair trigger.
    // Closes the gap where vim's `dd` Normal-mode keystroke on the fence
    // closer line edits the doc via Obsidian's vault layer, bypassing the
    // CM6 transactions that `createParentRepairExtension` observes. Three
    // short-circuit gates (lc-slug, active-view, findCodeFence === null)
    // prevent firing during chevron mid-flight (the chevron-blank-on-python3-c
    // regression that the previous Phase 18 attempt produced). See
    // `src/main/childEditorSync.ts:registerVaultModifyRepairTrigger` and
    // `.planning/phases/18-vim-recovery-polish/18-02-PLAN.md`.
    if (useNestedEditor) {
      registerVaultModifyRepairTrigger(this);
    }

    // Phase 18: file-open repair — when switching to a broken-fence LC note,
    // the nested editor widget won't mount (findCodeFence returns null), so
    // createParentRepairExtension never gets installed. This file-open hook
    // catches that case: after a short delay (CM6 state needs to hydrate),
    // check if the active note has a damaged fence and repair it directly.
    if (useNestedEditor) {
      const FILE_OPEN_REPAIR_DELAY_MS = 100; // estimated Obsidian file→CM6 hydration time
      this.registerEvent(
        this.app.workspace.on('file-open', (file) => {
          if (!file) return;
          window.setTimeout(() => {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (typeof fm?.['lc-slug'] !== 'string') return;
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || view.file?.path !== file.path) return;
            const cm = (view.editor as unknown as { cm: import('@codemirror/view').EditorView }).cm;
            if (!cm) return;
            cm.dispatch({ effects: nestedEditorRebuildEffect.of(null) });
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { findCodeFence: findFence } = require('./main/codeActionsEditorExtension') as
              typeof import('./main/codeActionsEditorExtension');
            if (findFence(cm.state) !== null) return;
            const lcLang: unknown = fm['lc-language'];
            const slug = typeof lcLang === 'string' && lcLang.length > 0 ? lcLang : 'python3';
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { repairFenceStructure: repair } = require('./main/childEditorSync') as
              typeof import('./main/childEditorSync');
            repair(cm, slug);
          }, FILE_OPEN_REPAIR_DELAY_MS);
        }),
      );
    }

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

    // Phase 13 — destroy all child EditorViews (D-12 cleanup).
    this.childEditorRegistry?.destroyAll();

    // Phase 19 Plan 01+02 — drain in-flight widget writes via debouncedWriter
    // (Plan 19-02 makes flushAll await each writer.forceFlush). Plugin.onunload
    // is sync-shaped; fire-and-forget the Promise — beforeunload + workspace
    // 'quit' Tasks.add are the load-bearing graceful-shutdown paths
    // (RESEARCH Pitfall 19-B). The destroy below cancels any pending writer
    // timers regardless.
    const flushP = this.widgetRegistry?.flushAll();
    if (flushP && typeof flushP.catch === 'function') flushP.catch(() => undefined);
    this.widgetRegistry?.destroyAll();
    this.selfWriteSuppression?.clear();
    // Phase 19 Plan 03 — drain the state persistence map. The 60s sweep
    // interval registered in onload auto-cancels via registerInterval, but
    // we explicitly clear here so the in-memory map doesn't carry between
    // plugin reloads in the same Obsidian session.
    this.statePersistence?.clear();
    // Phase 20 Plan 20-05 — reset the Hook 1 file-path tracker so a fresh
    // onload populates from scratch.
    this.lastActiveLeafFilePath = undefined;
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
    const session = this.contestSessionManager.getSession();
    if (!session) return;
    const problem = session.problems[problemIdx];
    if (!problem) return;

    // Get problem HTML content from cache for the scratch file
    const detail = this.settings.getProblemDetail(problem.slug);
    const contentHtml = detail?.contentHtml;

    // Only create scratch file if it doesn't exist yet — preserve user edits
    const scratchPath = this.contestScratch.getScratchPath(problem.slug);
    const scratchAbstract = this.app.vault.getAbstractFileByPath(scratchPath);
    let file = scratchAbstract instanceof TFile ? scratchAbstract : null;
    if (!file) {
      file = await this.contestScratch.createOrUpdate(problem, contentHtml);
    }

    // D-07: Tab idempotency — reuse existing leaf if already open for this scratch file.
    // Check both view.file (populated after view loads) and leaf state (populated immediately on restore).
    const existingLeaf = this.app.workspace.getLeavesOfType('markdown')
      .find(l => {
        const viewFile = (l.view as { file?: { path: string } }).file?.path;
        if (viewFile === file.path) return true;
        const stateFile = (l.getViewState()?.state as { file?: string })?.file;
        return stateFile === file.path;
      });
    if (existingLeaf) {
      void this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    // Open in native MarkdownView (full Obsidian editor with highlighting)
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file);
  }

  // ── Phase 10 Plan 07 contest integration helpers ─────────────────────

  /**
   * Phase 10 Plan 07 — handle contest end (timer expired or user abort).
   * Calls ContestFinalizer to write problem notes + summary, then optionally
   * triggers AI analysis when the toggle is ON and a provider is configured.
   * Closes any open ContestSolveView leaves.
   */
  private async handleContestEnd(aborted: boolean): Promise<void> {
    // Sync code from scratch files back to session before finalizing
    const activeSession = this.contestSessionManager.getSession();
    if (activeSession) {
      for (const problem of activeSession.problems) {
        const code = await this.contestScratch.readCode(problem.slug);
        if (code !== null) problem.code = code;
      }
      await this.settings.setContestSession(activeSession);
    }

    const session = aborted
      ? this.contestSessionManager.abort()
      : this.contestSessionManager.finish();
    if (!session) return;

    let summaryPath: string;
    try {
      summaryPath = await finalizeContest({
        session,
        aborted,
        app: this.app,
        settings: this.settings,
      });
    } catch (err) {
      logger.debug('contest.finalize: failed', err);
      new Notice('Contest finalization failed. Check the console for details.', 6000);
      return;
    }

    // Notice per UI-SPEC: context-sensitive text.
    if (aborted) {
      new Notice(`Contest aborted. Summary written to ${summaryPath}.`, 4000);
    } else {
      new Notice(`Time’s up! Contest ended. Summary written to ${summaryPath}.`, 4000);
    }

    // Run knowledge graph on AC'd problems (pattern classification + variants)
    const folder = this.settings.getProblemsFolder().replace(/[\\/]+$/, '');
    for (const problem of session.problems) {
      if (problem.verdict !== 'accepted') continue;
      const detail = this.settings.getProblemDetail(problem.slug);
      if (!detail) continue;
      const notePath = `${folder}/${detail.id}-${problem.slug}.md`;
      const noteAbstract = this.app.vault.getAbstractFileByPath(notePath);
      const noteFile = noteAbstract instanceof TFile ? noteAbstract : null;
      if (!noteFile) continue;
      try {
        await this.knowledgeGraph.onAccepted(
          { file: noteFile, slug: problem.slug, title: detail.title },
          { status_code: 10, status_msg: 'Accepted' } as Parameters<typeof this.knowledgeGraph.onAccepted>[1],
        );
      } catch (err) {
        logger.debug('contest.onAccepted: non-fatal', err);
      }
    }

    // Close any open ContestSolveView leaves and scratch file tabs.
    const leaves = this.app.workspace.getLeavesOfType(CONTEST_SOLVE_VIEW_TYPE);
    for (const leaf of leaves) { leaf.detach(); }

    // Close scratch file tabs and delete scratch files
    for (const problem of session.problems) {
      const file = this.contestScratch.getFile(problem.slug);
      if (file) {
        // Close any leaves showing this file
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
          if ((leaf.view as { file?: { path: string } }).file?.path === file.path) {
            leaf.detach();
          }
        });
      }
    }
    await this.contestScratch.cleanupAll();

    // Auto AI contest analysis (D-20): gated on toggle + active provider.
    if (this.settings.getAutoAIContestAnalysis() && this.settings.getActiveAIProvider()) {
      void this.runContestAnalysis(summaryPath, session);
    }
  }

  /**
   * Phase 10 Plan 07 — run AI contest analysis (auto or manual).
   * Opens AIStreamModal with onStreamComplete callback writing the analysis
   * to the summary note via vault.process + mergeAIContestAnalysisSection.
   */
  private async runContestAnalysis(summaryPath: string, session: import('./contest/types').ContestSession): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(summaryPath);
    if (!(file instanceof TFile)) {
      new Notice('Summary note not found — cannot generate contest analysis.', 4000);
      return;
    }

    // Gate on active provider.
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      new Notice('No AI provider configured. Open settings → AI.', 4000);
      return;
    }
    const providerCfg = this.settings.getProviderConfig(provider);

    // Build prompt from session data.
    const DIFFICULTY_MAP: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
    const mappedProblems = session.problems.map((p) => {
      let timeToSolveMin: number | null = null;
      if (p.solvedAt !== null) {
        // Compute actual solving time: solvedAt - startedAt - pausedDuration at solve time
        // Simplified: use the overall session pausedDuration as an approximation.
        const solveElapsed = p.solvedAt - session.startedAt - session.pausedDuration;
        timeToSolveMin = Math.max(1, Math.round(solveElapsed / 60000));
      }
      return {
        slug: p.slug,
        difficulty: DIFFICULTY_MAP[p.difficulty] ?? 'Unknown',
        verdict: p.verdict,
        timeToSolveMin,
        code: p.code,
        language: p.language,
      };
    });

    const prompt = buildContestAnalysisPrompt({
      contestTitle: session.contestTitle,
      contestType: session.contestType,
      durationMin: Math.round(session.duration / 60),
      problems: mappedProblems,
    });

    // Open AIStreamModal with onStreamComplete writing via vault.process.
    new AIStreamModal(this.app, {
      provider,
      prompt,
      aiClient: this.aiClient,
      model: providerCfg.model,
      title: `Contest analysis — ${prettyName(provider)}`,
      disclosureCopy: withContestAnalysisBullet(DISCLOSURE_BASE_COPY),
      onStreamComplete: async (fullText: string) => {
        // Build attribution line.
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const attributionLine = `*Analyzed by ${prettyName(provider)} (${providerCfg.model ?? 'unknown'}) — ${yyyy}-${mm}-${dd}*`;
        const analysisContent = fullText + '\n\n' + attributionLine;

        await this.app.vault.process(file, (body) =>
          mergeAIContestAnalysisSection(body, analysisContent),
        );
        new Notice(`Contest analysis written to ${summaryPath}.`, 4000);
      },
    }).open();
  }

  /**
   * Phase 10 Plan 07 — palette command: Start random contest.
   * Calls ContestListService.surpriseMe() and opens ContestPreviewModal on success.
   */
  private async handleStartRandomContest(): Promise<void> {
    const contest = await this.contestListService.surpriseMe();
    if (!contest) {
      new Notice('No contests available. Check your connection or try again.', 4000);
      return;
    }
    new ContestPreviewModal(this.app, contest, this.client, async (questions) => {
      // Cache problem details + resolve starter code (same as PBV.startContest)
      const results = await Promise.allSettled(
        questions.map((q) => this.client.getProblemDetail(q.title_slug)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const entry = toDetailCacheEntry(r.value);
          await this.settings.setProblemDetail(r.value.titleSlug, entry);
        }
      }
      const defaultLang = this.settings.getDefaultLanguage() || 'python3';
      this.contestSessionManager.start({
        contestSlug: contest.slug,
        contestTitle: contest.title,
        contestType: contest.type,
        duration: contest.duration,
        problems: questions.map((q) => {
          const detail = this.settings.getProblemDetail(q.title_slug);
          const snippet = detail?.codeSnippets?.find((s: { langSlug: string }) => s.langSlug === defaultLang);
          return {
            slug: q.title_slug,
            title: q.title,
            credit: q.credit,
            difficulty: q.difficulty,
            code: snippet?.code ?? '',
            language: defaultLang,
          };
        }),
      });
      new Notice(`Contest started: ${contest.title}`, 3000);
    }).open();
  }

  /**
   * Phase 10 Plan 07 — manual contest analysis on a summary note.
   * Reads lc-contest-id from frontmatter, reconstructs session data from
   * the note's frontmatter fields, and runs AI analysis.
   */
  private async handleManualContestAnalysis(file: TFile): Promise<void> {
    // Read frontmatter to reconstruct a minimal session for prompt building.
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter as Record<string, unknown> | undefined;
    if (!fm) return;

    const contestTitle = (fm['lc-contest-id'] as string) ?? 'Unknown Contest';
    const contestType = (fm['lc-contest-type'] as 'weekly' | 'biweekly') ?? 'weekly';
    const durationMin = typeof fm['duration'] === 'number' ? fm['duration'] : 90;

    // Reconstruct problems from frontmatter 'problems' array if available.
    const problemSlugs = Array.isArray(fm['problems']) ? fm['problems'] as string[] : [];
    const problems = problemSlugs.map((slug) => ({
      slug: typeof slug === 'string' ? slug : String(slug),
      difficulty: 'Unknown',
      verdict: 'unknown',
      timeToSolveMin: null as number | null,
      code: '',
      language: '',
    }));

    // Gate on active provider.
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      new Notice('No AI provider configured. Open settings → AI.', 4000);
      return;
    }
    const providerCfg = this.settings.getProviderConfig(provider);

    const prompt = buildContestAnalysisPrompt({
      contestTitle,
      contestType,
      durationMin,
      problems,
    });

    new AIStreamModal(this.app, {
      provider,
      prompt,
      aiClient: this.aiClient,
      model: providerCfg.model,
      title: `Contest analysis — ${prettyName(provider)}`,
      disclosureCopy: withContestAnalysisBullet(DISCLOSURE_BASE_COPY),
      onStreamComplete: async (fullText: string) => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const attributionLine = `*Analyzed by ${prettyName(provider)} (${providerCfg.model ?? 'unknown'}) — ${yyyy}-${mm}-${dd}*`;
        const analysisContent = fullText + '\n\n' + attributionLine;

        await this.app.vault.process(file, (body) =>
          mergeAIContestAnalysisSection(body, analysisContent),
        );
        new Notice(`Contest analysis written to ${file.path}.`, 4000);
      },
    }).open();
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
    const lcLanguage = typeof fm?.['lc-language'] === 'string' ? fm['lc-language'] : null;
    if (!isValidSlug(slug)) return null;
    return {
      view,
      file,
      slug,
      title: typeof title === 'string' ? title : slug,
      lcLanguage,
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
          // eslint-disable-next-line no-undef -- AsyncIterable is a TS lib type
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

  async aiSolutionFromActive(): Promise<void> {
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
    await this.aiSolutionWithSlug(view.file, slug);
  }

  /**
   * Phase 20 Plan 20-02 (D-action-04) — shared helper extracted from
   * `aiSolutionFromActive`. The body delegates to `openAISolution` which
   * resolves problem detail + opens the AI stream modal. `file` is unused
   * by `openAISolution` today (the modal reads ctx via getActiveViewOfType
   * inside its body) — passed through so the seam shape matches the other
   * `*WithSlug` helpers and Phase 22's mechanical rename keeps the
   * signature stable.
   */
  private async aiSolutionWithSlug(_file: TFile, slug: string): Promise<void> {
    await this.openAISolution(slug);
  }

  async resetFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    await this.resetWithSlug(ctx.file, ctx.slug);
  }

  /**
   * Phase 20 Plan 20-02 (D-action-04 architectural seam) — shared helper
   * called by both `resetFromActive` (active-leaf path) and
   * `resetFromWidget` (widget-mount path). Body is the same `resetCode`
   * call as before; the seam exists so Phase 22 can mechanically delete
   * `*FromActive` and rename `*FromWidget → *FromActive` without touching
   * the LC API path.
   */
  private async resetWithSlug(file: TFile, slug: string): Promise<void> {
    await this.resetCode(file, slug);
  }

  async retrieveLastSubmissionFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    await this.retrieveLastSubmissionWithSlug(ctx.file, ctx.slug);
  }

  /**
   * Phase 20 Plan 20-02 (D-action-04) — shared helper extracted from
   * `retrieveLastSubmissionFromActive`. Both `*FromActive` and
   * `*FromWidget` route through this body so the LC API path is shared.
   */
  private async retrieveLastSubmissionWithSlug(file: TFile, slug: string): Promise<void> {
    try {
      const rows = await this.submissionHistory.get(slug);
      if (!rows || rows.length === 0) {
        new Notice('No past submissions found for this problem.', 4000);
        return;
      }
      const latest = rows[0]!;
      const cookies = this.settings.getAuthCookies();
      if (!cookies) {
        new Notice('Not logged in.', 4000);
        return;
      }
      const { detailForSubmission } = await import('./graph/submissionHistoryClient');
      const detail = await detailForSubmission(latest.id, cookies);
      if (!detail?.code) {
        new Notice('Could not retrieve submission code.', 4000);
        return;
      }
      const { copyToCode } = await import('./graph/copyToCode');
      await copyToCode(this.app, file, detail.code, detail.lang.name);
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- "## Code" is a verbatim section heading.
      new Notice('Last submission copied to ## Code.', 3000);
    } catch (err) {
      new Notice('Failed to retrieve submission.', 4000);
      console.error('[leetcode] retrieveLastSubmission:', err);
    }
  }

  // ============================================================================
  // Phase 20 Plan 20-02 — *FromWidget plugin methods (D-action-04 seam).
  // ============================================================================
  // These methods route action-row button clicks from inside the v1.3 widget
  // through to the same downstream LC API path that *FromActive uses today.
  // Each method:
  //   (a) calls widget.flushNow() so pending characters land on disk first
  //       (Pattern F single-flush-then-read seam);
  //   (b) reads code via widget.view.state.doc.toString() — NO disk round-trip
  //       per ACTION-04 / L2;
  //   (c) reads frontmatter via metadataCache.getFileCache(widget.file);
  //   (d) routes to the shared *WithCode / *WithSlug private helper.
  //
  // Phase 22 mechanically deletes *FromActive and renames *FromWidget →
  // *FromActive, so the LC API seam stays stable across the v1.2 → v1.3
  // cutover.

  /**
   * Phase 20 Plan 20-02 — Run the widget's current code without leaving the
   * widget. Reads code via widget.view.state.doc.toString() (no disk
   * round-trip per ACTION-04). Routes through the shared `runWithCode` helper.
   */
  async runFromWidget(widget: WidgetController): Promise<void> {
    await widget.flushNow();
    const code = widget.view.state.doc.toString();
    const file = widget.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlugRaw = fm?.['lc-slug'];
    if (typeof lcSlugRaw !== 'string' || lcSlugRaw.length === 0) {
      new Notice('This widget is not on a LeetCode note.', 4000);
      return;
    }
    const lcSlug = lcSlugRaw;
    const lcLanguage =
      typeof fm?.['lc-language'] === 'string' && (fm['lc-language'] as string).length > 0
        ? (fm['lc-language'] as string)
        : 'python3';
    const lcTitle =
      typeof fm?.['lc-title'] === 'string' ? (fm['lc-title'] as string) : lcSlug;
    // Synthesize a ProblemContext for the runInterpretedInput re-resolver.
    // The widget mount path NEVER returns to active-leaf — the modal's onRun
    // closure invokes this resolver, which produces a synthetic ctx based on
    // the widget's current state (code is re-read at run time so in-flight
    // edits are picked up).
    const widgetCtxResolver = (): ProblemContext | null => {
      // Re-read frontmatter at run-modal commit time; the user may have
      // toggled language via the chevron between modal open and Run click.
      const freshFm = this.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const freshSlug = freshFm?.['lc-slug'];
      if (typeof freshSlug !== 'string' || freshSlug.length === 0) return null;
      const freshLanguage =
        typeof freshFm?.['lc-language'] === 'string' &&
        (freshFm['lc-language'] as string).length > 0
          ? (freshFm['lc-language'] as string)
          : 'python3';
      const freshTitle =
        typeof freshFm?.['lc-title'] === 'string'
          ? (freshFm['lc-title'] as string)
          : freshSlug;
      // The synthesized ctx omits `view` (no MarkdownView for widget path);
      // runInterpretedInput only consults file/slug/title/lcLanguage/currentBody,
      // not view. The cast is structurally narrower than the full ProblemContext
      // shape and won't reach the unused `view` field at runtime.
      return {
        view: undefined as unknown as MarkdownView,
        file,
        slug: freshSlug,
        title: freshTitle,
        lcLanguage: freshLanguage,
        currentBody: () => widget.view.state.doc.toString(),
      };
    };
    await this.runWithCode(file, lcSlug, lcTitle, lcLanguage, () => code, widgetCtxResolver);
  }

  /**
   * Phase 20 Plan 20-02 — Submit the widget's current code via the
   * SubmissionOrchestrator. Code is read from widget state, NOT disk.
   */
  async submitFromWidget(widget: WidgetController): Promise<void> {
    await widget.flushNow();
    const code = widget.view.state.doc.toString();
    const file = widget.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlugRaw = fm?.['lc-slug'];
    if (typeof lcSlugRaw !== 'string' || lcSlugRaw.length === 0) {
      new Notice('This widget is not on a LeetCode note.', 4000);
      return;
    }
    const lcSlug = lcSlugRaw;
    const lcLanguage =
      typeof fm?.['lc-language'] === 'string' && (fm['lc-language'] as string).length > 0
        ? (fm['lc-language'] as string)
        : 'python3';
    const lcTitle =
      typeof fm?.['lc-title'] === 'string' ? (fm['lc-title'] as string) : lcSlug;
    // The submitWithCode body re-reads code via getCurrentBody() — close
    // over widget.view.state.doc so the orchestrator picks up any edits made
    // while the verdict modal is open.
    await this.submitWithCode(
      file,
      lcSlug,
      lcTitle,
      lcLanguage,
      () => widget.view.state.doc.toString(),
    );
    // `code` is captured for completeness; the actual LC API submission body
    // comes from getCurrentBody() at orchestrator-run time. Suppress unused
    // warning by referencing it (keeps the read-via-state contract obvious).
    void code;
  }

  /**
   * Phase 20 Plan 20-02 — Open the AI solution modal for the widget's
   * problem. No code is sent — the AI prompt fetches problem detail itself.
   */
  async aiSolutionFromWidget(widget: WidgetController): Promise<void> {
    const file = widget.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlug = fm?.['lc-slug'];
    if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
      new Notice('This widget is not on a LeetCode note.', 4000);
      return;
    }
    await this.aiSolutionWithSlug(file, lcSlug);
  }

  /**
   * Phase 20 Plan 20-02 — Reset the widget's code to LC starter via
   * shared `resetCode` (which routes through child editor when registered).
   */
  async resetFromWidget(widget: WidgetController): Promise<void> {
    const file = widget.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlug = fm?.['lc-slug'];
    if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
      new Notice('This widget is not on a LeetCode note.', 4000);
      return;
    }
    await this.resetWithSlug(file, lcSlug);
  }

  /**
   * Phase 20 Plan 20-02 — Retrieve the user's last submission and copy it
   * into the widget's fence. Routes through the shared
   * `retrieveLastSubmissionWithSlug` helper.
   */
  async retrieveLastSubmissionFromWidget(widget: WidgetController): Promise<void> {
    const file = widget.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlug = fm?.['lc-slug'];
    if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
      new Notice('This widget is not on a LeetCode note.', 4000);
      return;
    }
    await this.retrieveLastSubmissionWithSlug(file, lcSlug);
  }

  /**
   * Phase 20 Plan 20-02 — Chevron-driven language switch from the v1.3
   * widget. Frontmatter-only path (intermediate state — Plan 20-09 Task 6
   * replaces this with a parent CM6 dispatch + processFrontMatter pair so
   * the fence body also swaps to the new language's starter code).
   */
  async switchLanguageFromWidget(
    widget: WidgetController,
    file: TFile,
    newSlug: string,
  ): Promise<void> {
    // Step (a) — flush widget BEFORE frontmatter write.
    await widget.flushNow();

    // Step (b) — atomic frontmatter rewrite. Wrapped in try/catch so a
    // malformed frontmatter doesn't blow up the chevron click silently.
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (fm: Record<string, unknown>) => {
          fm['lc-language'] = newSlug;
        },
      );
    } catch (err) {
      new Notice("Failed to switch language. The note's frontmatter may be malformed.", 5000);
      logger.debug('switchLanguageFromWidget: processFrontMatter failed', err);
      return;
    }

    // Step (c) — NO parent CM6 dispatch here. v1.3 widget reacts via
    // per-widget metadataCache subscription (Compartment.reconfigure +
    // actionRowRefresh). Plan 20-09 Task 6 replaces this with a body-swap
    // dispatch so the chevron click also writes the new language's
    // starter code into the leetcode-solve fence body.
  }

  private async openAISolution(slug: string): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter as
      | Record<string, unknown>
      | undefined;

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
    const language = (fm?.['lc-language'] as string) ?? this.settings.getDefaultLanguage() ?? 'python3';
    const starterCode = cached?.codeSnippets?.find(s => s.langSlug === language)?.code ?? '';
    const starterSection = starterCode ? `\n\n## Starter Code\n\n\`\`\`${language}\n${starterCode}\n\`\`\`\n\nYour solution MUST use the exact same class/method signature as the starter code above.` : '';

    const prompt = `You are a LeetCode expert. Given the problem below, provide:\n\n1. **Approach** — Explain the optimal algorithm and data structures to use. Include time and space complexity.\n2. **Solution** — Write a clean, well-commented solution in ${language}.${starterSection}\n\n## Problem\n\n${problemMd}\n\nRespond with the approach explanation first, then the complete solution code in a fenced code block.`;

    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      new Notice('No AI provider configured. Open settings → AI.', 4000);
      return;
    }
    const providerCfg = this.settings.getProviderConfig(provider);

    const modal = new AIStreamModal(this.app, {
      provider,
      prompt,
      aiClient: this.aiClient,
      model: providerCfg.model,
      title: `AI Solution — ${prettyName(provider)}`,
      disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY),
    });
    if (modal.modalEl) {
      // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- dynamic viewport-relative width; cannot use a static CSS class
      modal.modalEl.style.setProperty('width', 'min(90vw, 780px)', 'important');
      // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- dynamic viewport-relative max-width; cannot use a static CSS class
      modal.modalEl.style.setProperty('max-width', 'min(90vw, 780px)', 'important');
    }
    modal.open();
  }

  /** Submit the active note via SubmissionOrchestrator (Plan 05). Opens a
   *  VerdictModal, drives it through pending → terminal / abort / timeout.
   *  Phase 20 Plan 20-02 (D-action-04): thin wrapper around `submitWithCode`
   *  — the seam Phase 22 renames mechanically. */
  async submitFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {

      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    await this.submitWithCode(ctx.file, ctx.slug, ctx.title, ctx.lcLanguage, ctx.currentBody);
  }

  /**
   * Phase 20 Plan 20-02 (D-action-04 architectural seam) — shared submit
   * helper called by both `submitFromActive` (active-leaf path) and
   * `submitFromWidget` (widget-mount path). Body matches the v1.2 path
   * verbatim except (a) `slug`/`title`/`lcLanguage` are passed in rather
   * than read from `getActiveProblemContext()`, and (b) `getCurrentBody`
   * is a thunk so the orchestrator can re-read at submission time
   * (matches the active-leaf semantics where the user may keep typing
   * while the modal is open).
   *
   * For widget callers, `getCurrentBody` is `() => widget.view.state.doc.toString()`
   * — closes over the live widget doc so re-reads stay current.
   */
  private async submitWithCode(
    file: TFile,
    slug: string,
    title: string,
    lcLanguage: string | null,
    getCurrentBody: () => string,
  ): Promise<void> {
    if (!this.guardSingleFlight()) return;

    // Phase 20 Plan 20-02 (D-action-04) — synthetic problem context for
    // the legacy startAutoReview shape; the structural type accepts the
    // same {file, slug, title, currentBody} shape that ProblemContext
    // exposes today.
    const reviewCtx = { file, slug, title, currentBody: getCurrentBody };

    const modal = new VerdictModal(this.app, {
      problemTitle: title,
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
      onOpenAIDebug: () => { void this.openAIDebug(slug); },
      // Phase 12 (D-08): suppress AI review + pattern chip during active contest
      // because the contest opens scratch files as native MarkdownViews whose
      // fence-row Submit button flows through this path.
      onStartReviewStream: this.contestSessionManager.getSession() ? undefined
        : this.settings.getAutoAIReviewOnAC() && this.settings.getActiveAIProvider()
          ? (reviewAreaEl, component) => this.startAutoReview(reviewCtx, reviewAreaEl, component)
          : undefined,
      // Phase 12 Plan 03 (D-03/D-04) — pattern chip on AC (suppress during contest).
      file: this.contestSessionManager.getSession() ? null : file,
      getPatternHubPath: (p) => `${this.settings.getProblemsFolder()}/Patterns/${normalizePatternName(p)}.md`,
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
      slug,
      lcLanguage,
      getCurrentBody,
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
        const verdictKind = classifyStatus(terminalTyped.status_code, terminalTyped.status_msg).kind;
        const activeContest = this.contestSessionManager.getSession();
        // Run knowledge graph BEFORE renderVerdict so lc-pattern is available for chip
        if (!activeContest && verdictKind === 'ac') {
          try {
            await this.knowledgeGraph.onAccepted(
              { file, slug, title },
              terminalTyped,
            );
          } catch (err) {
            logger.debug('graph.onAccepted: non-fatal (invisible-by-design)', err);
          }
          this.submissionHistory.invalidate(slug);
        }
        modal.renderVerdict(terminalTyped, title);
        // Contest verdict recording (badge update)
        if (activeContest) {
          const idx = activeContest.problems.findIndex(p => p.slug === slug);
          if (idx >= 0) {
            if (verdictKind === 'ac') {
              this.contestSessionManager.recordVerdict(idx, 'accepted');
            } else if (verdictKind !== 'unknown' && verdictKind !== 'unknown-lc') {
              if (activeContest.problems[idx]?.verdict === 'unsolved') {
                this.contestSessionManager.recordVerdict(idx, 'attempted');
              }
            }
          }
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
        modal.renderVerdict(err.payload as SubmitCheckResponse, title);
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
   *  terminal / abort / timeout state machine as submit.
   *  Phase 20 Plan 20-02 (D-action-04): thin wrapper around `runWithCode`. */
  async runFromActive(): Promise<void> {
    const ctx = this.getActiveProblemContext();
    if (!ctx) {

      new Notice('Open a LeetCode problem note first.', 4000);
      return;
    }
    await this.runWithCode(
      ctx.file,
      ctx.slug,
      ctx.title,
      ctx.lcLanguage,
      ctx.currentBody,
      /*resolveCtxOnRun=*/() => this.getActiveProblemContext(),
    );
  }

  /**
   * Phase 20 Plan 20-02 (D-action-04 architectural seam) — shared run helper
   * called by both `runFromActive` (active-leaf path) and `runFromWidget`
   * (widget-mount path). Body matches the v1.2 path verbatim except
   *   (a) `slug`/`title`/`lcLanguage` are passed in;
   *   (b) `getCurrentBody` thunk re-reads at invocation;
   *   (c) `resolveCtxOnRun` is the closure RunModal's onRun calls so the
   *       active-leaf path can re-resolve `getActiveProblemContext()` at
   *       run-modal commit (the user may have closed + reopened the note
   *       in between). For widget callers the closure synthesizes a ctx
   *       directly from the widget reference.
   */
  private async runWithCode(
    _file: TFile,
    slug: string,
    _title: string,
    _lcLanguage: string | null,
    _getCurrentBody: () => string,
    resolveCtxOnRun: () => ProblemContext | null,
  ): Promise<void> {
    const detail = this.settings.getProblemDetail(slug);
    const exampleTestcases = detail?.exampleTestcases ?? '';
    // Phase 5.4 UAT fix — derive lines-per-case so RunModal can split LC's
    // single-newline-formatted exampleTestcases (observed live for two-sum)
    // into per-case tabs. deriveArity falls back to 1 when both metaData
    // and sampleTestCase are absent.
    const linesPerCase = deriveArity(detail?.metaData, detail?.sampleTestCase);
    new RunModal(this.app, {
      slug,
      exampleTestcases,
      linesPerCase,
      store: this.ephemeralTabs,
      onRun: (input: string) => {
        // Re-resolve context at run time (the modal is asynchronous; the user
        // may have closed + reopened the note in between).
        const current = resolveCtxOnRun();
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
   *   Step B′ — Phase 16 Plan 04 (LANG-01, D-12). If a child EditorView is
   *            registered for `file.path`, dispatch
   *            `{ effects: languageCompartment.reconfigure(buildLanguageExtensions(
   *            newSlug, getIndentSizeOverride())), userEvent: 'leetcode.lang-switch' }`
   *            on the CHILD so its parser, indent unit, closeBrackets, and
   *            Cmd-/ keymap switch in lock-step with the parent fence-tag
   *            flip. Effects-only — `childEditorSync.ts:89` `docChanged`
   *            guard skips it for child→parent propagation; the parent's
   *            nestedEditor StateField never sees it (the dispatch goes to
   *            the child, not the parent). userEvent is the CLAUDE.md
   *            `'leetcode.*'` convention. Silent no-op when no child is
   *            registered. Wrapped in try/catch matching the project
   *            convention in `childEditorSync.ts` (child may be in teardown).
   *   Step C — `await app.fileManager.processFrontMatter(file, fm => { … })`.
   *            Lands on Obsidian's vault undo stack — separate from CM6's
   *            editor undo (Pitfall 1; accepted divergence).
   *
   * Order matters: doing C before B opens a 5–20 ms window where `lc-language`
   * says the new language but the fence still has the old one (Run during
   * that window dispatches mismatched language to LC). Step B′ between B and
   * C keeps the visible fence-tag flip first; the child reconfigure is
   * effects-only and idempotent w.r.t. ordering.
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

    // Step B′ — Phase 16 Plan 04 (LANG-01, D-12). Child editor language
    // Compartment reconfigure. Effects-only dispatch carries the CLAUDE.md
    // 'leetcode.lang-switch' userEvent so the child sync extension's
    // docChanged guard at childEditorSync.ts:89 short-circuits without
    // echoing back to the parent. The dispatch goes to the CHILD; the
    // parent's nestedEditor StateField never sees it, so no widget rebuild.
    // Silent no-op when no child is registered. Reads the live override at
    // dispatch time so a settings change is picked up on the next switch.
    this.dispatchChildLanguageReconfigure(file.path, newSlug);

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
   * Phase 16 Plan 04 (LANG-01, D-12) — child editor language Compartment
   * reconfigure helper extracted from `switchFenceLanguage` Step B′ for unit
   * testability (see tests/main/switchFenceLanguage.test.ts).
   *
   * Dispatch shape:
   *   `{ effects: languageCompartment.reconfigure(buildLanguageExtensions(
   *     newSlug, override)), userEvent: 'leetcode.lang-switch' }`
   *
   * Invariants:
   *   - Effects-only — no `changes`, no `selection`. The child sync
   *     extension's `if (!update.docChanged) return` guard at
   *     `childEditorSync.ts:89` skips this transaction, so it cannot echo
   *     back to the parent as a content edit (RESEARCH §6, VERIFIED).
   *   - userEvent `'leetcode.lang-switch'` matches the CLAUDE.md
   *     `'leetcode.*'` convention; identical to the parent-side annotation.
   *   - Silent no-op when `childEditorRegistry.get(filePath)` returns
   *     undefined (no open child for that file) — many notes can be
   *     switched via the chevron without ever opening a child editor.
   *   - try/catch matches `childEditorSync.ts:115` defensive convention —
   *     the child may be in teardown when the chevron handler runs.
   *   - `getIndentSizeOverride()` is read at dispatch time so the user's
   *     current preference (D-06, Phase 16 Plan 02) is picked up on every
   *     switch.
   */
  private dispatchChildLanguageReconfigure(filePath: string, newSlug: string): void {
    const childView = this.childEditorRegistry?.get(filePath);
    if (!childView) return; // silent no-op — no open child for this file
    const indentOverride = this.settings.getIndentSizeOverride();
    try {
      childView.dispatch({
        effects: languageCompartment.reconfigure(
          buildLanguageExtensions(newSlug, indentOverride),
        ),
        userEvent: 'leetcode.lang-switch',
      });
      // Phase 17 Plan 09 — record the slug now applied to this child's
      // languageCompartment. Gate 3 of the fm-reactivity listener consults
      // this tracker (NOT the parent fence opener tag) so round-trip fm
      // swaps (Java → Python3 → Java) dispatch symmetrically.
      this.childLanguageTracker.set(childView, newSlug);
    } catch {
      // Silently ignore — child may be in teardown (defensive per project
      // convention; mirrors childEditorSync.ts:115).
    }
  }

  /**
   * Phase 17 Plan 04 (D-13 / D-14, Wave 2) — external frontmatter reactivity
   * listener body. Extracted from the inline `metadataCache.on('changed')`
   * callback in `onload` for unit testability (see
   * tests/main/fmReactivity.test.ts).
   *
   * Gates (in order — short-circuit on first miss):
   *
   *   Gate 1 (lc-slug). The note must carry `lc-slug` in frontmatter.
   *           Non-LC notes never receive a dispatch.
   *   Gate 2 (child registered). A child EditorView must be present in
   *           `childEditorRegistry` for `file.path`. Notes that are not
   *           open in a MarkdownView have no child to reconfigure.
   *   Gate 3 (slug equality / Pitfall 3 dedupe). The new `lc-language`
   *           value must differ from the slug currently applied to the
   *           parent fence opener. This is the canonical dedupe — when
   *           the plugin's own `processFrontMatter` writes a slug that
   *           the fence opener already reflects (e.g., chevron switch
   *           Step C reaches metadataCache after Step B has already
   *           reconfigured the child), Gate 3 trips and the listener
   *           short-circuits.
   *
   * On all three gates passing, dispatches the same Compartment payload
   * the chevron switch path (D-12) uses on the child:
   *
   *   `{ effects: languageCompartment.reconfigure(buildLanguageExtensions(
   *     fmLang, getIndentSizeOverride())) }`
   *
   * The dispatch is INTENTIONALLY effect-only — no `changes:` payload, no
   * `userEvent` annotation. Effect-only dispatches are not subject to the
   * section-lock changeFilter (CLAUDE.md §Conventions), so the convention
   * `'leetcode.<verb>'` userEvent is not required here. See Plan 17-04
   * Task 1 Test 6 (the inline guard comment that codifies this).
   *
   * D-14 invariant: the listener does NOT rewrite the fence opener tag.
   * In passive-listener mode, frontmatter is the source of truth for the
   * child editor's language; the visible fence opener stays whatever it
   * currently says (users who want the fence opener flipped use the
   * chevron). The unit test asserts neither `vault.process` nor
   * `fileManager.processFrontMatter` is called from this code path.
   *
   * Defensive try/catch wraps the dispatch — the child may be in teardown
   * when the listener fires (mirrors the `dispatchChildLanguageReconfigure`
   * convention at lines ~2473-2476).
   */
  private handleFmChangeForLanguageReactivity(
    file: { path: string },
    cache: { frontmatter?: Record<string, unknown> } | null | undefined,
  ): void {
    // Gate 1 — lc-slug note only.
    const slugRaw = cache?.frontmatter?.['lc-slug'];
    if (typeof slugRaw !== 'string' || slugRaw.length === 0) return;

    // Gate 2 — child registered for this file path.
    const childView = this.childEditorRegistry?.get(file.path);
    if (!childView) return;

    // Gate 3 — Phase 17 Plan 09 (gap closure 17-UAT.md Issue 3 / Test 12):
    // read the child's currently-applied language from the per-child
    // `childLanguageTracker`, NOT from the parent fence opener tag. Per
    // D-14 the listener does not rewrite the opener, so reading from
    // `readActiveFenceSlug` makes round-trip swaps (Java → Python3 → Java)
    // silently asymmetric: after the first swap the opener still says
    // `java`, so the second swap reads `currentSlug = 'java'` from the
    // unchanged opener, matches the new fm `java`, and trips Gate 3 early
    // — no dispatch fires, child syntax stays Python3.
    //
    // The tracker is populated by both dispatch sites — chevron switch
    // (`dispatchChildLanguageReconfigure`) AND the fm-reactivity dispatch
    // below — so subsequent fm changes always see the freshest applied
    // slug. Pitfall 3 dedupe still holds: when the plugin's own
    // `processFrontMatter` writes lc-language during chevron switch /
    // Reset, the chevron path's tracker.set has already recorded the new
    // slug, and Gate 3 trips on tracker equality.
    //
    // Empty-tracker case (e.g., first metadataCache.changed event after
    // note open, before any chevron or fm dispatch has seeded it):
    // tracker.get returns undefined, undefined !== fmLangRaw, so the
    // listener proceeds to dispatch. This is safe because
    // Compartment.reconfigure with an equal LanguageSupport is idempotent
    // (visually a no-op) but updates the tracker — the next fm change
    // sees the correct current.
    const fmLangRaw = cache?.frontmatter?.['lc-language'];
    if (typeof fmLangRaw !== 'string' || fmLangRaw.length === 0) return;
    const currentSlug = this.childLanguageTracker.get(childView);
    if (currentSlug === fmLangRaw) return;

    // All gates passed — dispatch Compartment.reconfigure on the child.
    // Effect-only dispatches (no changes: payload) are not subject to the
    // section-lock changeFilter per CLAUDE.md §Conventions, so the dispatch
    // does NOT carry a 'leetcode.*' userEvent annotation.
    try {
      childView.dispatch({
        effects: languageCompartment.reconfigure(
          buildLanguageExtensions(
            fmLangRaw,
            this.settings.getIndentSizeOverride(),
          ),
        ),
        // Per D-14: NO `changes:` payload. Frontmatter is the source of
        // truth in passive-listener mode; the fence opener tag is not
        // rewritten.
      });
      // Phase 17 Plan 09 — record the slug now applied to this child's
      // languageCompartment. Placed inside the try block so a failed
      // dispatch leaves the tracker untouched (next fm change retries).
      this.childLanguageTracker.set(childView, fmLangRaw);
    } catch {
      // Silently ignore — child may be in teardown (defensive per project
      // convention; mirrors childEditorSync.ts:115 and
      // dispatchChildLanguageReconfigure above).
    }
  }

  /**
   * Phase 17 Plan 04 (D-13 helper) — read the language slug currently
   * applied to the parent fence opener for `file`.
   *
   * NOTE (Phase 17 Plan 09 / 17-UAT.md Issue 3): No longer consumed by
   * `handleFmChangeForLanguageReactivity` Gate 3 — the listener now reads
   * from the per-child `childLanguageTracker` because per D-14 the
   * listener does not rewrite the fence opener, so the opener tag is an
   * unsound proxy for "current applied child language" (it never changes
   * on the listener path, producing the asymmetric round-trip bug). The
   * helper is retained because (a) the production caller in 17-08's
   * `resetCode` resolver may still consult fence-opener slugs and (b)
   * future work may need a "what does the parent fence opener currently
   * say?" primitive. If a future refactor confirms zero callers, the
   * helper can be removed.
   *
   * Strategy:
   *   1. If the active MarkdownView is showing this file, parse its CM6
   *      state via `findCodeFence` and extract the slug from the opener
   *      line. This is the freshest source of truth — the chevron switch
   *      path updates the parent doc atomically via CM6 dispatch BEFORE
   *      `processFrontMatter` lands.
   *   2. Fallback to the metadataCache's `lc-language` value when no
   *      active CM6 view is available (e.g., note open in a background
   *      leaf). This is sufficient for Gate 3 because in non-active
   *      contexts the child editor cannot exist either (Gate 2 already
   *      tripped).
   *   3. Return undefined if neither source yields a slug — Gate 3 will
   *      then proceed to dispatch (treats unknown current as a forced
   *      reconfigure rather than a silent skip; safe given Gates 1-2
   *      already gated this path).
   */
  private readActiveFenceSlug(file: { path: string }): string | undefined {
    try {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file && view.file.path === file.path) {
        const cm = (view.editor as unknown as { cm: EditorView }).cm;
        const fence = findCodeFence(cm.state);
        if (fence) {
          const openerText = cm.state.doc.line(fence.openerLine).text;
          // Match the opener tag: ```python3 or ```python or ```\tjava etc.
          const m = /^\s*```\s*(\S+)\s*$/.exec(openerText);
          if (m && m[1]) return m[1];
        }
      }
    } catch {
      // defensive — fall through to metadataCache fallback.
    }
    // Fallback: read lc-language from the metadataCache directly. Mirrors
    // the source-of-truth used by Phase 16 D-12 when the chevron is
    // re-rendered for a non-active leaf.
    try {
      // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
      const fm = this.app.metadataCache.getFileCache(file as TFile)
        ?.frontmatter as Record<string, unknown> | undefined;
      const fmLang = fm?.['lc-language'];
      if (typeof fmLang === 'string' && fmLang.length > 0) return fmLang;
    } catch {
      // defensive — return undefined.
    }
    return undefined;
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

    const lang = ctx.lcLanguage ?? resolveLangSlug(extracted.lang, this.settings.getDefaultLanguage());
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
   *  "Code reset to starter." per UI-SPEC §Copywriting.
   *
   *  Phase 17 D-03 / D-05 — `getDispatchHandle` looks up the child editor
   *  via `this.childEditorRegistry?.get(file.path)`; when a child is
   *  registered, the helper routes the write through the child's CM6
   *  instance (userEvent `'leetcode.reset.child'`) so the undo entry
   *  lands on the child. The existing `createChildSyncExtension` mirror
   *  in `src/main/childEditorSync.ts:82-121` propagates the change to the
   *  parent with `addToHistory.of(false)`. When no child is registered
   *  (note not open in a MarkdownView), the helper falls back to
   *  `app.vault.process(...)` per D-04. This restores the Phase 15 D-05
   *  cm-z scope isolation invariant for Reset — Cmd-Z after Reset never
   *  inserts the prior solution body into adjacent sections. The chevron
   *  switch wiring at `dispatchChildLanguageReconfigure` is the
   *  structural template for this lookup pattern. */
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
      getDispatchHandle: (targetFile: TFile) => {
        // Phase 17 D-03 — child-first lookup. The chevron switch at
        // `dispatchChildLanguageReconfigure` (~line 2462) is the
        // structural template — same `childEditorRegistry?.get` pattern,
        // same `userEvent: 'leetcode.<verb>'` convention, same null-guard
        // semantics. When a child is registered, return a handle that
        // dispatches a full-body replace on the child; when not, return
        // null so the helper falls back to vault.process (D-04).
        const childView = this.childEditorRegistry?.get(targetFile.path);
        if (!childView) return null;
        return {
          replaceFullBody: (next: string) => {
            // The child's doc IS the fence body — slice the body-only
            // payload out of the full-note string produced by
            // forceInjectCodeSection. Defensive fallback in
            // extractFenceBodyFromFullNote keeps the dispatch a no-op-ish
            // identity when fence detection fails (should never happen
            // since forceInjectCodeSection just produced it).
            const bodyOnly = extractFenceBodyFromFullNote(next);
            try {
              childView.dispatch({
                changes: {
                  from: 0,
                  to: childView.state.doc.length,
                  insert: bodyOnly,
                },
                userEvent: 'leetcode.reset.child',
                // NOTE: NO Transaction.addToHistory.of(false) here. Reset
                // is a normal child edit and deserves a child undo entry;
                // the existing parent-side mirror in
                // childEditorSync.ts:108-114 carries
                // addToHistory.of(false) so the parent never picks up
                // the Reset entry — that's the Phase 15 D-05 invariant.
              });
            } catch {
              // Silent — child may be in teardown; vault on disk still
              // gets updated by the next sync mirror dispatch when the
              // child re-attaches. Mirrors the defensive try/catch in
              // dispatchChildLanguageReconfigure / childEditorSync.ts.
            }
          },
        };
      },
      resolveActiveLangSlug: (targetFile: TFile): string | undefined => {
        // Phase 17 gap-closure (17-08, 17-UAT.md Issue 2 / Test 10) — restore
        // Phase 16 D-06 canonical priority chain: lc-language frontmatter >
        // fence opener tag > settings.getDefaultLanguage(). The Phase 17 D-03
        // dispatch path swap (Plan 17-01) inadvertently dropped this chain
        // because the helper hardcoded settings.getDefaultLanguage() — see
        // .planning/debug/reset-code-language-regression.md for the original
        // fix. We do NOT call this.readActiveFenceSlug(file) here because
        // that helper's internal metadataCache fallback collapses the
        // priority distinction by treating fence-opener-fallback and
        // fm-fallback as the same source. The resolver's Priority 1 must be
        // EXPLICIT-fm-only so unset fm correctly drops to fence opener.
        try {
          // Priority 1 — lc-language frontmatter (canonical, chevron's SoT).
          const fm = this.app.metadataCache.getFileCache(targetFile)
            ?.frontmatter as Record<string, unknown> | undefined;
          const fmLang = fm?.['lc-language'];
          if (typeof fmLang === 'string' && fmLang.length > 0) return fmLang;

          // Priority 2 — active fence opener tag. Active MarkdownView only.
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view && view.file && view.file.path === targetFile.path) {
            const cm = (view.editor as unknown as { cm: EditorView }).cm;
            const fence = findCodeFence(cm.state);
            if (fence) {
              const openerText = cm.state.doc.line(fence.openerLine).text;
              const m = /^\s*```\s*(\S+)\s*$/.exec(openerText);
              if (m && m[1]) return m[1];
            }
          }
        } catch {
          // Defensive — fall through to undefined → helper uses default.
        }
        // Priority 3 — let the helper fall back to settings.getDefaultLanguage().
        return undefined;
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
