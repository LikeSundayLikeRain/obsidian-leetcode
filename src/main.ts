// src/main.ts
// LeetCodePlugin entry — Obsidian lifecycle + wiring. Order is LOCKED by RESEARCH.md Pitfall 1
// AND by AuthService's two-arg constructor (BLOCKER 2 alignment):
//   1. Load settings (has cookies if stored)
//   2. Install requestUrl fetcher (BEFORE any LC client construction — Credential.init fires eagerly)
//   3. Construct LeetCodeClient (depends on SettingsStore)
//   4. Construct AuthService(settings, client) — TWO-ARG; LC client must exist by now
//   5. Construct ProblemListService (depends on client + settings)
//   5.5. Construct NoteWriter (Phase 2 — row-click orchestrator; depends on app + client + settings)
//   6. Register view, ribbon, command, settings tab
import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { ProblemBrowserView, BROWSER_VIEW_TYPE } from './browse/ProblemBrowserView';
import { NoteWriter } from './notes/NoteWriter';
import { isLegacyLeetcodeBaseV010 } from './notes/BaseFile';
import { LeetCodeSettingTab } from './settings/SettingsTab';

export default class LeetCodePlugin extends Plugin {
  settings!: SettingsStore;
  client!: LeetCodeClient;
  auth!: AuthService;
  list!: ProblemListService;
  notes!: NoteWriter;

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

    // Step 6a — register the browser view.
    this.registerView(BROWSER_VIEW_TYPE, (leaf: WorkspaceLeaf) =>
      new ProblemBrowserView(leaf, this));

    // Step 6b — ribbon icon (BROWSE-01). Lucide name from UI-SPEC.md § Icons.
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
    this.addRibbonIcon('code-2', 'Open LeetCode browser', () => {
      void this.activateBrowser();
    });

    // Step 6c — command palette entry (BROWSE-01). Shared Pattern 8 rules:
    //   - id does NOT contain the plugin id ('leetcode') or the word 'command'
    //   - name is sentence case and does NOT start with the plugin name
    //   - NO hotkeys field (commands/no-default-hotkeys)
    // Plan 06 acceptance criterion LOCKS the command id verbatim; Obsidian prefixes
    // it at runtime with the plugin id, so the resulting command is "leetcode:open-...".
    this.addCommand({
      // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id -- Plan 06 acceptance grep pins this id verbatim
      id: 'open-leetcode-browser',
      name: 'Open problem browser',
      callback: () => { void this.activateBrowser(); },
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
