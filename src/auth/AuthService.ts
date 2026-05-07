// src/auth/AuthService.ts
// Orchestrates login/logout. Uses BrowserWindowLogin for the embedded flow and
// SettingsStore for persistence. Emits exactly one Notice per event class (D-04).
// All user-facing strings are LOCKED by UI-SPEC.md § Notice messages — do not paraphrase.
//
// Ownership boundary (AUTH-04): `isSessionExpired` is defined ONLY in
// src/api/LeetCodeClient.ts (Plan 02). This file does NOT redefine it; Plan 06
// wires the end-to-end expiry → logout → Notice flow.
import { Notice } from 'obsidian';
import type { SettingsStore } from '../settings/SettingsStore';
import type { LeetCodeClient } from '../api/LeetCodeClient';
import { openLogin } from './BrowserWindowLogin';
import type { AuthCookies } from './types';

export class AuthService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly client: LeetCodeClient,
  ) {}

  /**
   * Open embedded LC login; persist cookies on success.
   * Returns true if cookies were captured + persisted, false if cancelled.
   * AUTH-01, AUTH-02.
   */
  async login(): Promise<boolean> {
    const cookies = await openLogin();
    if (!cookies) {
      // D-04 silent cancel: exactly ONE Notice, no modal stacking, no auto-pivot to paste.
      // UI-SPEC.md Notice table — LOCKED copy; "LeetCode" is a proper-noun brand name.
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
      new Notice('LeetCode login cancelled.', 4000);
      return false;
    }
    await this.settings.setAuthCookies(cookies);
    await this.client.reauthenticate();
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
    new Notice('Logged in to LeetCode.', 4000);
    return true;
  }

  /** Persist manually-pasted cookies (AUTH-03 fallback). */
  async loginManual(cookies: AuthCookies): Promise<void> {
    await this.settings.setAuthCookies(cookies);
    await this.client.reauthenticate();
    new Notice('Cookies saved.', 3000);
  }

  /**
   * Clear cookies from data.json (AUTH-05). Does NOT clear the Electron
   * persist:leetcode partition — that cleanup is deferred to Phase 5 polish
   * (RESEARCH.md Open Question 2).
   */
  async logout(): Promise<void> {
    await this.settings.setAuthCookies(null);
    await this.settings.setUsername(null);
    await this.client.reauthenticate();
    // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
    new Notice('Logged out of LeetCode.', 4000);
  }

  isLoggedIn(): boolean {
    return this.settings.getAuthCookies() !== null;
  }
}
