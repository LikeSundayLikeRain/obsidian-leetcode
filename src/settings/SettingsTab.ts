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
import type { AIProvider, BedrockProviderConfig } from '../ai/types';
// Phase 07 Plan 04 — single source of truth for provider display names; the
// local copy of `prettyName` was moved to src/ai/types.ts so main.ts (Notice
// copy) and SettingsTab.ts (sub-form) render identical brand strings without
// duplication. 07-UI-SPEC.md §"Copywriting Contract" remains the locked spec.
import { prettyName } from '../ai/types';

// Phase 07 Plan 03 — model placeholders per provider, locked by 07-UI-SPEC.md
// §"Copywriting Contract" (Model placeholders row).
//
// Phase 08.1 Plan 02 — Bedrock joins the exhaustive switch. The placeholder
// returns '' because Bedrock's per-provider sub-form replaces the generic
// "Model" row with a dedicated "Model ID" row inside renderAIProviderForm's
// `case 'bedrock'` branch (the generic Model row is hidden when active is
// 'bedrock'). The placeholder is referenced by the generic Model row only,
// so the empty string here never reaches a UI surface for Bedrock.
function modelPlaceholder(p: AIProvider): string {
  switch (p) {
    case 'anthropic': return 'claude-haiku-4-5';
    case 'openai': return 'gpt-5-mini';
    case 'openrouter': return 'anthropic/claude-haiku-4.5';
    case 'ollama': return 'llama3.2';
    case 'custom': return '';
    case 'bedrock': return '';
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
    // match the spec byte-for-byte. The Test connection button delegates to
    // the shared plugin-level probe path (shared with the palette
    // command); Plan 07-05 will wrap probe() with the disclosure gate.
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
        // Phase 08.1 Plan 02 — AWS Bedrock joins the locked dropdown order
        // after 'custom' (alphabetical-by-add-time precedent — Bedrock is
        // the 6th provider added to the union). 'AWS Bedrock' is in the
        // sentence-case allowlist (see eslint.config.mts AWS extension).
        .addOption('bedrock',    'AWS Bedrock')
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

    new Setting(containerEl)
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- "Accept" / "Accepted" is the LC verdict name (proper noun in this domain).
      .setName('Auto AI review on Accept')
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- "Accepted" is the LC verdict name (proper noun in this domain).
      .setDesc('When enabled, an AI review is generated automatically each time you get Accepted.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.getAutoAIReviewOnAC())
        .onChange(async (value) => {
          await this.plugin.settings.setAutoAIReviewOnAC(value);
        }),
      );

    // Phase 11 Plan 03 — AI Knowledge Graph toggles. Position: after
    // autoAIReviewOnAC, before Contest section. Sentence-case names per
    // eslint-plugin-obsidianmd ui/sentence-case rule.
    new Setting(containerEl)
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- "Accept" is the LC verdict name (proper noun in this domain).
      .setName('AI pattern classification on Accept')
      .setDesc('When enabled, AI classifies accepted solutions into algorithmic patterns and maintains hub notes.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.getAutoAIKnowledgeGraph())
        .onChange(async (value) => {
          await this.plugin.settings.setAutoAIKnowledgeGraph(value);
        }),
      );

    new Setting(containerEl)
      .setName('Look-ahead edges (experimental)')
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- "## Related Variants" is a verbatim section heading reference.
      .setDesc('When enabled, AI may suggest unsolved problems related to the pattern. Adds wikilinks to unsolved problems in ## Related Variants.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.getFeatureFlags().lookAheadEdges)
        .onChange(async (value) => {
          await this.plugin.settings.setFeatureFlag('lookAheadEdges', value);
        }),
      );

    // =============================
    //   Contest section (Phase 10 Plan 07 — UI-SPEC §Settings)
    // =============================
    // Position: after AI section, before Knowledge Graph (per 10-UI-SPEC).
    // Single toggle: Auto AI contest analysis (D-20, default OFF).
    new Setting(containerEl).setName('Contest').setHeading();

    new Setting(containerEl)
      .setName('Auto AI contest analysis')
      .setDesc('Automatically generate AI performance analysis when a virtual contest ends. Requires an active AI provider.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.getAutoAIContestAnalysis())
        .onChange(async (value) => {
          await this.plugin.settings.setAutoAIContestAnalysis(value);
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
   * Test connection delegates to the plugin-level probe entry point; the
   * button label flips to 'Testing...' and is disabled while a probe is in
   * flight per 07-UI-SPEC §"Test connection — debouncing".
   */
  private renderAIProviderForm(containerEl: HTMLElement, active: AIProvider): void {
    const cfg = this.plugin.settings.getProviderConfig(active);
    const providerName = prettyName(active);

    // ─── API key row (omitted for Ollama and Bedrock) ────────────────────
    // Phase 08.1 Plan 02 — Bedrock skips the standard API key row because
    // its 4-mode auth dropdown (default-chain / access-keys / sso-profile /
    // api-key) renders mode-specific secret rows below. Ollama remains
    // skip-listed (Phase 07 — local Ollama has no API key).
    if (active !== 'ollama' && active !== 'bedrock') {
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
      case 'bedrock': {
        // Phase 08.1 Plan 02 — Bedrock-specific sub-form per CONTEXT
        // decision B + 08.1-PATTERNS.md "Plan 08.1-02 #src/settings/SettingsTab.ts".
        // Renders Region + Model ID + Auth method dropdown + conditional
        // secret rows in place of Base URL/Model rows. The 4-mode dropdown
        // calls this.display() onChange so the conditional rows re-render
        // atomically — Pitfall 10 invariant: switching authMethod ONLY
        // changes which rows render, never which fields are stored.
        const bcfg = cfg as BedrockProviderConfig;

        // Region row (text input, default 'us-east-1').
        new Setting(containerEl)
          .setName('Region')
          .setDesc('AWS region for Bedrock runtime endpoint. Default: us-east-1.')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- 'us-east-1' is the verbatim AWS region identifier (lowercase per AWS convention); not a sentence.
            t.setPlaceholder('us-east-1');
            t.setValue(bcfg.region);
            t.onChange(async (v) => {
              const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.settings.setProviderConfig(active, { ...current, region: v });
            });
          });

        // Model ID row (replaces the generic Model row for Bedrock).
        new Setting(containerEl)
          .setName('Model ID')
          // eslint-disable-next-line obsidianmd/ui/sentence-case -- Bedrock model IDs are dotted-namespace lowercase identifiers (e.g. 'anthropic.claude-3-5-sonnet...'); the rule mistakes the model-name parts for sentence-start words.
          .setDesc('Bedrock model identifier (e.g. anthropic.claude-3-5-sonnet-20241022-v2:0).')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setValue(bcfg.modelId);
            t.onChange(async (v) => {
              const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.settings.setProviderConfig(active, { ...current, modelId: v });
            });
          });

        // Auth method dropdown — onChange triggers a re-render so the
        // conditional secret rows below swap atomically.
        new Setting(containerEl)
          .setName('Auth method')
          .setDesc('How the plugin obtains AWS credentials for Bedrock calls.')
          .addDropdown((d) => d
            .addOption('default-chain', 'Default credential chain (recommended)')
            .addOption('access-keys',   'Explicit access keys')
            .addOption('sso-profile',   'Profile name')
            .addOption('api-key',       'Bedrock API key')
            .setValue(bcfg.authMethod)
            .onChange(async (v) => {
              const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.settings.setProviderConfig(active, {
                ...current,
                authMethod: v as BedrockProviderConfig['authMethod'],
              });
              // Re-render so the conditional secret rows for the newly-active
              // mode appear atomically. Pitfall 10 invariant: this only
              // changes which rows RENDER — `current` (and the persisted
              // config) keeps every secret field byte-for-byte intact.
              this.display();
            }),
          );

        // Conditional secret rows — only the active mode's rows render, but
        // ALL secret fields stay PERSISTED in data.json (Pitfall 10).
        if (bcfg.authMethod === 'default-chain') {
          // Helper-text-only row — no input.
          new Setting(containerEl)
            .setName('Credentials source')
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- contains AWS env-var literals (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_PROFILE, AWS_DEFAULT_PROFILE, AWS_SHARED_CREDENTIALS_FILE, AWS_CONFIG_FILE) and lowercase paths; rule cannot distinguish technical literals from prose.
            .setDesc('Plugin reads AWS credentials from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars first, then falls back to AWS_PROFILE (or AWS_DEFAULT_PROFILE, or [default]) in ~/.aws/credentials and ~/.aws/config. Supports credential_process helpers and honors AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE overrides. Run aws sso login (or your usual helper) before launching Obsidian if your profile uses SSO.');
        } else if (bcfg.authMethod === 'access-keys') {
          new Setting(containerEl)
            .setName('Access key ID')
            .setDesc('AWS access key ID. Stored in plain text in data.json on this machine.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.accessKeyId ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.settings.setProviderConfig(active, { ...current, accessKeyId: v });
              });
            });
          new Setting(containerEl)
            .setName('Secret access key')
            .setDesc('AWS secret access key. Stored in plain text in data.json on this machine.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.secretAccessKey ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.settings.setProviderConfig(active, { ...current, secretAccessKey: v });
              });
            });
          new Setting(containerEl)
            .setName('Session token')
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- STS is an AWS acronym (Security Token Service); rule cannot distinguish technical acronyms from prose.
            .setDesc('Required only for temporary STS credentials.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.sessionToken ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.settings.setProviderConfig(active, { ...current, sessionToken: v });
              });
            });
        } else if (bcfg.authMethod === 'sso-profile') {
          new Setting(containerEl)
            .setName('Profile name')
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- contains AWS_PROFILE env var, lowercase paths ~/.aws/credentials and ~/.aws/config, and tool names (aws-vault, awsume); rule cannot distinguish technical literals from prose.
            .setDesc('Any profile name from ~/.aws/credentials or ~/.aws/config. Use this if you want a specific profile without exporting AWS_PROFILE. Supports credential_process helpers (e.g. aws-vault, awsume).')
            .addText((t) => {
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.ssoProfile ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.settings.setProviderConfig(active, { ...current, ssoProfile: v });
              });
            });
        } else if (bcfg.authMethod === 'api-key') {
          new Setting(containerEl)
            .setName('Bedrock API key')
            .setDesc('Long-term Bedrock API key from the AWS console (IAM > Users > Service-specific credentials). Stored in plain text in data.json on this machine.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.bedrockApiKey ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.settings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.settings.setProviderConfig(active, { ...current, bedrockApiKey: v });
              });
            });
        }
        break;
      }
    }

    // ─── Model row (all providers EXCEPT Bedrock — Bedrock uses Model ID) ─
    // Phase 08.1 Plan 02 — Bedrock's case branch above already rendered a
    // dedicated "Model ID" row, so we skip the generic Model row when
    // active === 'bedrock' to avoid duplicate input rows. The Model ID row
    // writes to cfg.modelId; the generic row writes to cfg.model (which is
    // unused for Bedrock).
    if (active !== 'bedrock') {
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
    }

    // ─── Test connection button (wired to AIClient.probe via plugin) ────
    // Stays NEUTRAL — NO setCta() per 07-UI-SPEC §"Color". The disclosure
    // modal's Continue button (Plan 07-05) is the only new accent invocation
    // in v1.1.
    //
    // The handler delegates to the plugin's shared probe entry point so
    // the palette command (`test-ai-connection`) and this button share the
    // same probe path + debounce map + Notice copy. Button-label flip and
    // disable-while-in-flight are local UX polish — only this surface needs
    // them; the palette command's feedback is the Notice itself.
    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Verify your provider credentials and model access.')
      .addButton((b) => b
        .setButtonText('Test connection')
        .onClick(async () => {
          b.setButtonText('Testing...');
          b.setDisabled(true);
          try {
            await this.plugin.testActiveAIConnection();
          } finally {
            b.setButtonText('Test connection');
            b.setDisabled(false);
          }
        }),
      );
  }
}
