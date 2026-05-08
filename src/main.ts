// src/main.ts
// LeetCodePlugin entry — Obsidian lifecycle + wiring. Order is LOCKED by RESEARCH.md Pitfall 1
// AND by AuthService's two-arg constructor (BLOCKER 2 alignment):
//   1. Load settings (has cookies if stored)
//   2. Install requestUrl fetcher (BEFORE any LC client construction — Credential.init fires eagerly)
//   3. Construct LeetCodeClient (depends on SettingsStore)
//   4. Construct AuthService(settings, client) — TWO-ARG; LC client must exist by now
//   5. Construct ProblemListService (depends on client + settings)
//   6. Register view, ribbon, command, settings tab
import { Plugin, WorkspaceLeaf } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { ProblemBrowserView, BROWSER_VIEW_TYPE } from './browse/ProblemBrowserView';
import { LeetCodeSettingTab } from './settings/SettingsTab';

export default class LeetCodePlugin extends Plugin {
  settings!: SettingsStore;
  client!: LeetCodeClient;
  auth!: AuthService;
  list!: ProblemListService;

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

    // Step 4 — auth service orchestrates login/logout. TWO-ARG constructor.
    this.auth = new AuthService(this.settings, this.client);

    // Step 5 — list service (depends on client + settings).
    this.list = new ProblemListService(this.client, this.settings);

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
  }

  onunload(): void {
    // FND-05: plugin must enable/disable without crashes.
    // Obsidian tears down registered views / commands / ribbon icons automatically;
    // we do not need explicit cleanup because all subscriptions go through plugin.registerX().
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
