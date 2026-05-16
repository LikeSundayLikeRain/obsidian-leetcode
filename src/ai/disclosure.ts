// src/ai/disclosure.ts
//
// Phase 07 Plan 05 AIPROV-04 — once-per-provider-switch disclosure modal +
// shared willSend/neverSends copy constant. CONTEXT.md decision D + 07-UI-SPEC
// §"Disclosure modal — verbatim copy".
//
// The gate that wraps AIClient.probe() / AIClient.invoke() lives on
// LeetCodePlugin (`requireAIDisclosure`) — see Task 2. This file is UI-only:
// the Modal class + the shared base copy that downstream phases extend.
//
// Phase 08/09/11 each append a feature-specific bullet to
// DISCLOSURE_BASE_COPY.willSend before any AIClient call site reads it
// (07-RESEARCH §"Open Question 8" + 07-PATTERNS Pattern 4). The constant is
// intentionally NOT frozen so future plans can mutate it; the per-test
// invariant in tests/ai/disclosure.test.ts asserts the Phase-07 baseline
// shape.
//
// Strict no-HTML-string-injection discipline (eslint-plugin-obsidianmd
// anti-pattern + CLAUDE.md project rule): every DOM node is built via
// `createEl` / `Setting.addButton`. No HTML strings, no script-parsing
// sinks. Bundle delta target: < 1 KB per 07-UI-SPEC §"Bundle constraint".
//
// Color contract (07-UI-SPEC §"Color"): Continue button gets `setCta()` —
// the ONLY new accent invocation across the entire src/ tree in v1.1.
// Cancel button stays neutral; Esc / X / overlay-click all converge through
// `onClose()` which fires `onCancel()` if `acknowledged === false`.

import { App, Modal, Setting } from 'obsidian';
import type { AIProvider, ProviderConfig } from './types';
import { prettyName } from './types';

/**
 * Shared disclosure copy. Locked verbatim from 07-UI-SPEC §"Disclosure modal
 * — verbatim copy". Phase 08/09/11 each append a feature-specific bullet to
 * `willSend` BEFORE any AIClient call site reads the constant; Phase 07
 * itself ships only the base 4-entry list.
 *
 * NOT `Object.freeze`d intentionally — the downstream phases mutate
 * `willSend` to add their own line. The shape and verbatim base entries are
 * asserted by tests/ai/disclosure.test.ts so a typo in any phase that
 * changes the values is caught at CI time.
 */
export const DISCLOSURE_BASE_COPY: { willSend: string[]; neverSends: string[] } = {
  willSend: [
    'Problem text (statement, examples, constraints)',
    'Your `## Code` content',
    'The last run/submit verdict and failing test (if any)',
    'Optionally your `## Notes` (only if you opt in per feature)',
  ],
  neverSends: [
    'Vault file paths outside the active note',
    'Frontmatter that does not begin with `lc-`',
    'Any other vault content',
    'Telemetry of any kind',
  ],
};

/**
 * Once-per-provider-switch disclosure modal. Fired by
 * `LeetCodePlugin.requireAIDisclosure` (see src/main.ts) when the active
 * provider's `disclosureAcknowledged` flag is false. Continue persists the
 * flag via SettingsStore.setProviderConfig (handled by the caller); Cancel
 * leaves the flag false so the modal re-fires on the next call.
 *
 * Lifecycle:
 *   - `onOpen()` builds the DOM via createEl + Setting.addButton.
 *   - Continue click sets `acknowledged = true`, fires `onContinue`, closes.
 *   - Cancel click fires `onCancel`, closes.
 *   - `onClose()` (Esc / X / overlay-click) fires `onCancel` if and only if
 *     `acknowledged === false` — this is what makes Esc-as-cancel safe
 *     against double-fire after a Continue+close sequence.
 */
export class AIDisclosureModal extends Modal {
  /**
   * `acknowledged === true` means the user clicked Continue — the disclosure
   * gate may persist `disclosureAcknowledged: true` and let the AI call
   * proceed.
   *
   * `decided === true` means the user made ANY explicit choice (Continue OR
   * Cancel button click). The Esc/X/overlay-click fallback in onClose() fires
   * `onCancel` only when `decided === false`, preventing double-fire when
   * Cancel's click handler already invoked `onCancel` and then triggered
   * close() → onClose().
   */
  private acknowledged = false;
  private decided = false;

  constructor(
    app: App,
    private provider: AIProvider,
    private cfg: ProviderConfig,
    private onContinue: () => void,
    private onCancel: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-ai-disclosure');
    // Locked verbatim — 07-UI-SPEC §"Disclosure modal — verbatim copy".

    titleEl.setText(`Heads up: this will send data to ${prettyName(this.provider)}`);

    const baseUrlText = this.cfg.baseUrl || '(no base URL configured yet)';
    contentEl.createEl('p', {

      text: `Active provider: ${prettyName(this.provider)} — ${baseUrlText}`,
    });


    contentEl.createEl('p', { text: 'Future AI features will send:' });
    const willList = contentEl.createEl('ul');
    for (const line of DISCLOSURE_BASE_COPY.willSend) {
      willList.createEl('li', { text: line });
    }


    contentEl.createEl('p', { text: 'The plugin never sends:' });
    const neverList = contentEl.createEl('ul');
    for (const line of DISCLOSURE_BASE_COPY.neverSends) {
      neverList.createEl('li', { text: line });
    }

    // Action buttons: Cancel first (deliberate friction — Enter on a freshly
    // opened modal must NOT auto-acknowledge per UI-SPEC §"Layout Contract").
    new Setting(contentEl)
      .addButton((b) =>
        b

          .setButtonText('Cancel')
          .onClick(() => {
            this.decided = true;
            this.onCancel();
            this.close();
          }),
      )
      .addButton((b) =>
        b
          // Locked verbatim — 07-UI-SPEC §"Color" + §"Disclosure modal — verbatim copy".
          // The ONLY new setCta() invocation across the src/ tree in v1.1.

          .setButtonText('I understand — continue')
          .setCta()
          .onClick(() => {
            this.acknowledged = true;
            this.decided = true;
            this.onContinue();
            this.close();
          }),
      );
  }

  onClose(): void {
    // Esc / X / overlay-click semantics: if the user closed without making
    // an explicit choice (no button click), fire onCancel. The `decided`
    // guard prevents double-fire when Cancel's own click handler already
    // invoked onCancel and then called close() → onClose(). The
    // `acknowledged` flag is checked first because Continue+close MUST never
    // route through the cancel path (defence in depth — `decided` already
    // covers it, but the explicit acknowledged check is the load-bearing
    // T-07-04 mitigation).
    if (!this.acknowledged && !this.decided) {
      try {
        this.onCancel();
      } catch {
        /* swallow — onCancel must never bubble out of onClose */
      }
    }
    this.contentEl.empty();
  }
}
