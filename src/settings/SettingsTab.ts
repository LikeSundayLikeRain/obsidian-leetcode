// src/settings/SettingsTab.ts
// Phase 1 settings UI — D-09 layout verbatim; UI-SPEC.md copy + color rules LOCKED.
// All user-visible strings are LOCKED — paraphrasing is forbidden.
//
// Accent color (`var(--interactive-accent)` via the call-to-action modifier) is
// RESERVED for the primary `Log in via embedded window` button only
// (UI-SPEC.md § Color). Logout, Save cookies, and every other button in this
// file MUST remain neutral. Grep gate: exactly one invocation of the accent
// modifier in this file.
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { AuthCookies } from '../auth/types';

// D-10: dropdown map. Key = LC language slug (used in submissions later). Value = UI label.
const LANGUAGE_OPTIONS: Record<string, string> = {
  python3: 'Python',
  java: 'Java',
  cpp: 'C++',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
};

export class LeetCodeSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LeetCodePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('leetcode-settings');

    // =============================
    //   Authentication section
    // =============================
    new Setting(containerEl).setName('Authentication').setHeading();

    const loggedIn = this.plugin.auth.isLoggedIn();
    const username = this.plugin.settings.getUsername();
    const statusText = loggedIn
      ? `Logged in as ${username ?? '…'}`
      : 'Not logged in';

    new Setting(containerEl)
      .setName('Status')
      .setDesc(statusText);

    // Primary auth button row.
    // Logged-out state: primary Log-in button uses the call-to-action accent modifier.
    // Logged-in state: neutral Logout button (no accent modifier — UI-SPEC.md § Color).
    if (loggedIn) {
      // AUTH-05: immediate logout, no confirmation modal (UI-SPEC.md § Destructive actions).
      new Setting(containerEl)
        .addButton((b) => b
          .setButtonText('Logout')
          // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages: "LeetCode" is a LOCKED proper-noun brand name
          .setTooltip('Log out of LeetCode')
          .onClick(async () => {
            await this.plugin.auth.logout();
            this.display();
          }),
        );
    } else {
      // Only button in this file that receives the call-to-action accent modifier.
      new Setting(containerEl)
        .addButton((b) => b
          .setButtonText('Log in via embedded window')
          .setCta()
          .onClick(async () => {
            await this.plugin.auth.login();
            this.display();
          }),
        );
    }

    // =============================
    //   Manual cookie (fallback) — D-05 first-class, inside Auth section per D-09
    // =============================
    new Setting(containerEl)
      .setName('Manual cookie (fallback)')
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Settings tab strings LOCKED: "LeetCode" is a proper-noun brand name
      .setDesc("Paste your LeetCode session cookies if the embedded login doesn't work on your system.")
      .setHeading();

    let sessionVal = '';
    let csrfVal = '';

    new Setting(containerEl)
      .setName('LEETCODE_SESSION')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('lc-cookie-input');
        t.onChange((v) => { sessionVal = v; });
      });

    new Setting(containerEl)
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Settings tab strings LOCKED: HTTP cookie field name, not user-facing copy
      .setName('csrftoken')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('lc-cookie-input');
        t.onChange((v) => { csrfVal = v; });
      });

    new Setting(containerEl)
      .addButton((b) => b
        .setButtonText('Save cookies')
        .onClick(async () => {
          // WR-06: trim BEFORE validating so a whitespace-only paste (trailing
          // newline or spaces from copy-paste) is rejected instead of being
          // persisted verbatim and silently failing every subsequent API call
          // while the user sees a misleading "Logged in." confirmation.
          const session = sessionVal.trim();
          const csrf = csrfVal.trim();
          if (!session || !csrf) {
            new Notice('Both fields are required.', 3000);
            return;
          }
          const cookies: AuthCookies = {
            LEETCODE_SESSION: session,
            csrftoken: csrf,
          };
          await this.plugin.auth.loginManual(cookies);
          this.display();
        }),
      );

    // =============================
    //   Notes section
    // =============================
    new Setting(containerEl).setName('Notes').setHeading();

    new Setting(containerEl)
      .setName('Problems folder')
      .setDesc('Vault folder where problem notes are created.')
      .addText((t) => t
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- D-10 default value LOCKED: "LeetCode" is a proper-noun brand name
        .setPlaceholder('LeetCode/')
        .setValue(this.plugin.settings.getProblemsFolder())
        .onChange(async (v) => {
          // D-10: strip trailing slash on persist (stored without trailing slash).
          await this.plugin.settings.setProblemsFolder(v.replace(/\/+$/, ''));
        }),
      );

    new Setting(containerEl)
      .setName('Default language')
      .setDesc('Starter code language for new problems.')
      .addDropdown((d) => d
        .addOptions(LANGUAGE_OPTIONS)
        .setValue(this.plugin.settings.getDefaultLanguage())
        .onChange(async (v) => {
          await this.plugin.settings.setDefaultLanguage(v);
        }),
      );
  }
}
