// src/auth/CookiePasteModal.ts
// Reusable Modal wrapper for the manual-cookie form (AUTH-03, D-05, D-09).
// The same fields are inlined into the Settings tab in Plan 04; this file is kept
// for future command-palette triggers and for independent testability.
// All strings LOCKED by UI-SPEC.md § Copywriting Contract.
//
// Color rule (W1, UI-SPEC.md § Color): the Save button is NEUTRAL — the call-to-action
// styling (Obsidian's accent modifier) is NOT applied here. Accent color is reserved for
// the primary Log-in button in the Settings tab ONLY.
import { App, Modal, Setting } from 'obsidian';
import type { AuthCookies } from './types';

export class CookiePasteModal extends Modal {
  private sessionValue = '';
  private csrfValue = '';

  constructor(
    app: App,
    private readonly onSave: (cookies: AuthCookies) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-settings');

    contentEl.createEl('h2', { text: 'Manual cookie (fallback)' });
    contentEl.createEl('p', {
      // UI-SPEC.md § Settings tab — LOCKED copy; "LeetCode" is a proper-noun brand name.
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Settings tab LOCKED
      text: "Paste your LeetCode session cookies if the embedded login doesn't work on your system.",
      cls: 'setting-item-description',
    });

    new Setting(contentEl).setName('LEETCODE_SESSION').addText((t) => {
      t.inputEl.type = 'password';
      t.inputEl.addClass('lc-cookie-input');
      t.onChange((v) => {
        this.sessionValue = v;
      });
    });

    // Literal HTTP cookie field name, not user-facing title — matches LC's own header casing.
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- HTTP cookie field name (LC protocol)
    new Setting(contentEl).setName('csrftoken').addText((t) => {
      t.inputEl.type = 'password';
      t.inputEl.addClass('lc-cookie-input');
      t.onChange((v) => {
        this.csrfValue = v;
      });
    });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText('Save cookies')
        // INTENTIONALLY no call-to-action modifier applied — accent color is reserved
        // for the primary Log-in button (UI-SPEC.md § Color; W1). Save-cookies is
        // a neutral action. Do NOT add .set-Cta here.
        .onClick(async () => {
          if (!this.sessionValue || !this.csrfValue) return;
          await this.onSave({
            LEETCODE_SESSION: this.sessionValue,
            csrftoken: this.csrfValue,
          });
          this.close();
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
