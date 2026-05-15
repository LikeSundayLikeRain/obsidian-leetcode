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

// Phase 5.2 D-12 — mirrors LC's submission-language dropdown as of 2026-05-11.
// Keys = LC langSlug (the value LC accepts in /interpret_solution/ + /submit/ bodies);
// values = UI display labels. SQL dialects excluded — v1 scope is algorithm problems.
// Insertion order matches LC's own dropdown order and drives the rendered order
// because `Object.entries` preserves insertion order for string keys.
// Exported so tests/settings/SettingsTab.test.ts can pin the exact key set.
export const LANGUAGE_OPTIONS: Record<string, string> = {
  python3:    'Python3',
  python:     'Python',
  java:       'Java',
  cpp:        'C++',
  c:          'C',
  csharp:     'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php:        'PHP',
  swift:      'Swift',
  kotlin:     'Kotlin',
  dart:       'Dart',
  golang:     'Go',
  ruby:       'Ruby',
  scala:      'Scala',
  rust:       'Rust',
  racket:     'Racket',
  erlang:     'Erlang',
  elixir:     'Elixir',
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

    // Phase 5.2 D-01 — Status row and primary auth button merged into a single
    // Setting. Name+Desc render on the left via Obsidian's built-in
    // `.setting-item-info` flex cell; the button renders on the right via
    // `.setting-item-control`. No custom CSS required.
    //
    // Accent-modifier grep gate preserved: exactly one invocation of the
    // call-to-action modifier in this file, on the logged-out Log-in branch.
    new Setting(containerEl)
      .setName('Status')
      .setDesc(statusText)
      .addButton((b) => {
        if (loggedIn) {
          // AUTH-05: immediate logout, no confirmation modal (UI-SPEC.md § Destructive actions).
          b.setButtonText('Logout')
             
            .setTooltip('Log out of LeetCode')
            .onClick(async () => {
              await this.plugin.auth.logout();
              this.display();
            });
        } else {
          // Only button in this file that receives the call-to-action accent modifier.
          b.setButtonText('Log in via embedded window')
            .setCta()
            .onClick(async () => {
              await this.plugin.auth.login();
              this.display();
            });
        }
      });

    // =============================
    //   Manual cookie (fallback) — D-05 first-class, inside Auth section per D-09
    // =============================
    new Setting(containerEl)
      .setName('Manual cookie (fallback)')
       
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

    // =============================
    //   Preview section (Phase 06 PREVIEW-02)
    // =============================
    // Click-behavior toggle for ProblemBrowserView rows. CONTEXT.md decision A:
    // 'preview' is the single default for fresh installs and v1.1 upgraders;
    // shift-click always opens the note directly regardless of this setting.
    // Copy is locked verbatim by 06-UI-SPEC §Copywriting Contract — paraphrasing
    // is forbidden. Two-option `addOption(value, label)` chain (NOT `addOptions`
    // with a Record literal) per the locked precedent in 06-UI-SPEC §Layout.
    new Setting(containerEl).setName('Preview').setHeading();

    new Setting(containerEl)
      .setName('Click behavior')
      .setDesc('What happens when you click a problem in the LeetCode browser. Shift-click always opens the note directly.')
      .addDropdown((d) => d
        .addOption('preview', 'Preview first')
        .addOption('open', 'Open note directly')
        .setValue(this.plugin.settings.getPreviewClickBehavior())
        .onChange(async (v) => {
          await this.plugin.settings.setPreviewClickBehavior(v as 'preview' | 'open');
        }),
      );

    // =============================
    //   Knowledge Graph section (Phase 5 POLISH-01 D-14)
    // =============================
    // D-17: no Advanced / collapsible section — always visible.
    // Accent-modifier grep-gate preserved: no call-to-action modifier in
    // this block (the single accent invocation is the Authentication login
    // button above — see the top-of-file grep gate).
    new Setting(containerEl).setName('Knowledge graph').setHeading();

    // D-15: technique folder visible override with derived default. Placeholder
    // is computed LIVE from the current `problemsFolder` setting so users see
    // e.g. `LeetCode/Techniques` when no override is set, their typed value
    // otherwise. Empty value preserves Phase 4 derived-default behavior.
    new Setting(containerEl)
      .setName('Technique folder override')
      .setDesc('Vault folder for technique stub notes. Leave empty to use {Problems folder}/Techniques.')
      .addText((t) => t
        .setPlaceholder(`${this.plugin.settings.getProblemsFolder()}/Techniques`)
        .setValue(this.plugin.settings.getTechniquesFolderOverride())
        .onChange(async (v) => {
          // Phase 4 convention — UI layer owns trailing-slash sanitization.
          await this.plugin.settings.setTechniquesFolderOverride(
            v.trim().replace(/[\\/]+$/, ''),
          );
        }),
      );

    // D-16 / D-32: auto-backlink toggle (behavior-first copy LOCKED).
    // Bound to the Phase 4 D-21 persistence field.
    new Setting(containerEl)
      .setName('Auto-create technique backlinks on accepted')
       
      .setDesc('When enabled, an Accepted submission writes a ## Techniques section and creates stub notes for each LC topic tag. When disabled, only frontmatter tags (lc/{slug}) are written; no ## Techniques heading, no stubs.')
      .addToggle((t) => t
        .setValue(this.plugin.settings.getAutoBacklinksEnabled())
        .onChange(async (v) => {
          await this.plugin.settings.setAutoBacklinksEnabled(v);
        }),
      );
  }
}
