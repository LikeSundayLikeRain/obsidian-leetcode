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
import type { AIProvider } from '../ai/types';

// Phase 07 Plan 03 — provider display names. Locked verbatim by 07-UI-SPEC.md
// §"Copywriting Contract"; paraphrasing is forbidden. Module-private helper
// keeps the table colocated with its single consumer (renderAIProviderForm)
// without expanding the LeetCodeSettingTab class API surface.
function prettyName(p: AIProvider): string {
  switch (p) {
    case 'anthropic': return 'Anthropic';
    case 'openai': return 'OpenAI';
    case 'openrouter': return 'OpenRouter';
    case 'ollama': return 'Ollama';
    case 'custom': return 'Custom (OpenAI-compatible)';
  }
}

// Phase 07 Plan 03 — model placeholders per provider, locked by 07-UI-SPEC.md
// §"Copywriting Contract" (Model placeholders row).
function modelPlaceholder(p: AIProvider): string {
  switch (p) {
    case 'anthropic': return 'claude-haiku-4-5';
    case 'openai': return 'gpt-5-mini';
    case 'openrouter': return 'anthropic/claude-haiku-4.5';
    case 'ollama': return 'llama3.2';
    case 'custom': return '';
  }
}

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
    //   AI section (Phase 07 Plan 03 — AIPROV-01 / AIPROV-02)
    // =============================
    // Active-provider dropdown swaps the visible sub-form. When activeAIProvider
    // is null only the dropdown row renders (07-UI-SPEC §"Layout Contract").
    // All copy LOCKED VERBATIM from 07-UI-SPEC §"Copywriting Contract" — every
    // provider name, description, placeholder string, and Notice text must
    // match the spec byte-for-byte. Plan 07-04 will replace the placeholder
    // Test connection onClick with a real `aiClient.probe(active)` call;
    // Plan 07-05 will wrap it with the disclosure gate.
    //
    // Color/CTA invariant (07-UI-SPEC §"Color"): exactly ONE setCta() in this
    // file (the pre-existing Login button at line ~86). The AI section adds
    // ZERO setCta() calls — the Test connection button stays neutral. The
    // disclosure modal's Continue button (Plan 07-05) will be the only new
    // setCta() invocation in v1.1, in src/ai/disclosure.ts.
    new Setting(containerEl).setName('AI').setHeading();

    const active = this.plugin.settings.getActiveAIProvider();

    new Setting(containerEl)
      .setName('Active AI provider')
      .setDesc("Pick the provider for AI features. Switching providers preserves keys you've already entered for other providers.")
      .addDropdown((d) => d
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- 07-UI-SPEC locks "— Not configured —" verbatim as the null-state dropdown label.
        .addOption('',           '— Not configured —')
        .addOption('anthropic',  'Anthropic')
        .addOption('openai',     'OpenAI')
        .addOption('openrouter', 'OpenRouter')
        .addOption('ollama',     'Ollama')
        .addOption('custom',     'Custom (OpenAI-compatible)')
        .setValue(active ?? '')
        .onChange(async (v) => {
          const next = v === '' ? null : (v as AIProvider);
          await this.plugin.settings.setActiveAIProvider(next);
          this.display();
        }),
      );

    if (active !== null) {
      this.renderAIProviderForm(containerEl, active);
    }

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

  /**
   * Phase 07 Plan 03 — render the per-provider sub-form for the active
   * AIProvider. Provider-conditional rendering matrix (07-UI-SPEC §Layout):
   *
   *   anthropic | openai | openrouter   API key + Base URL (read-only desc)
   *                                       + Model + Test connection
   *   ollama                            Base URL (editable) + Model
   *                                       + Test connection (NO API key row)
   *   custom                            API key + Base URL (editable, empty
   *                                       w/ placeholder) + Model
   *                                       + Test connection
   *
   * Test connection ships a placeholder onClick that emits a Notice with text
   * containing 'Plan 07-04' — locked so the next plan can grep-replace the
   * handler body without disturbing the rest of the row.
   */
  private renderAIProviderForm(containerEl: HTMLElement, active: AIProvider): void {
    const cfg = this.plugin.settings.getProviderConfig(active);
    const providerName = prettyName(active);

    // ─── API key row (omitted for Ollama) ────────────────────────────────
    if (active !== 'ollama') {
      new Setting(containerEl)
        .setName('API key')
        .setDesc(`Stored in plain text in data.json on this machine. Never transmitted anywhere except ${providerName}.`)
        .addText((t) => {
          t.inputEl.type = 'password';
          t.inputEl.addClass('lc-ai-input');
          t.setPlaceholder('sk-…');
          t.setValue(cfg.apiKey);
          t.onChange(async (v) => {
            // Re-read the latest cfg so concurrent edits to other fields in
            // the same render frame don't get clobbered (defensive — the
            // re-render on dropdown change drops the closure anyway).
            const current = this.plugin.settings.getProviderConfig(active);
            await this.plugin.settings.setProviderConfig(active, { ...current, apiKey: v });
          });
        });
    }

    // ─── Base URL row ────────────────────────────────────────────────────
    switch (active) {
      case 'anthropic':
      case 'openai':
      case 'openrouter': {
        // Read-only: render the canonical URL inline in the desc text. No
        // input field — UI-SPEC §Layout Contract specifies the URL displays
        // as descriptive text.
        new Setting(containerEl)
          .setName('Base URL')
          .setDesc(`Provider endpoint. Read-only; the plugin uses the canonical URL: ${cfg.baseUrl}`);
        break;
      }
      case 'ollama': {
        new Setting(containerEl)
          .setName('Base URL')
          .setDesc('Ollama host and port. Default is localhost:11434 — change if you run Ollama on another host.')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setValue(cfg.baseUrl);
            t.onChange(async (v) => {
              const current = this.plugin.settings.getProviderConfig(active);
              await this.plugin.settings.setProviderConfig(active, { ...current, baseUrl: v });
            });
          });
        break;
      }
      case 'custom': {
        new Setting(containerEl)
          .setName('Base URL')
          .setDesc('OpenAI-compatible endpoint URL. Must include /v1 suffix if the server expects it.')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- 07-UI-SPEC locks the URL placeholder verbatim; lowercase 'https' is correct.
            t.setPlaceholder('https://your-host.example.com/v1');
            t.setValue(cfg.baseUrl);
            t.onChange(async (v) => {
              const current = this.plugin.settings.getProviderConfig(active);
              await this.plugin.settings.setProviderConfig(active, { ...current, baseUrl: v });
            });
          });
        break;
      }
    }

    // ─── Model row (all providers) ───────────────────────────────────────
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model identifier the provider expects. Defaults may rot — when "Test connection" reports "model not found", update this field.')
      .addText((t) => {
        t.inputEl.addClass('lc-ai-input');
        t.setPlaceholder(modelPlaceholder(active));
        t.setValue(cfg.model);
        t.onChange(async (v) => {
          const current = this.plugin.settings.getProviderConfig(active);
          await this.plugin.settings.setProviderConfig(active, { ...current, model: v });
        });
      });

    // ─── Test connection button (PLACEHOLDER — Plan 07-04 wires probe) ───
    // Stays NEUTRAL — NO setCta() per 07-UI-SPEC §"Color". The disclosure
    // modal's Continue button (Plan 07-05) is the only new accent invocation
    // in v1.1.
    new Setting(containerEl)
      .addButton((b) => b
        .setButtonText('Test connection')
        .onClick(async () => {
          // Belt-and-suspenders empty-state guard (07-UI-SPEC §"Empty /
          // unconfigured states"): the row is not rendered when active is
          // null, but if a future regression changes that, this guard fires
          // first.
          const provider = this.plugin.settings.getActiveAIProvider();
          if (!provider) {
            new Notice('Pick an AI provider first.', 3000);
            return;
          }
          new Notice('Test connection: wiring lands in Plan 07-04', 3000);
        }),
      );
  }
}
