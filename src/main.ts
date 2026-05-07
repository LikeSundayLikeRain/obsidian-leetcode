import { Plugin } from 'obsidian';
// NOTE: The four imports below reference modules created in Plans 02/03/05.
// Plan 01 ships minimal brand-stub classes at those paths so this file
// type-checks in Wave 1; Plans 02/03/05 replace the stubs with real classes
// (same export names) and Plan 06 rewrites onload() to use value imports.
import type { SettingsStore } from './settings/SettingsStore';
import type { AuthService } from './auth/AuthService';
import type { LeetCodeClient } from './api/LeetCodeClient';
import type { ProblemListService } from './browse/ProblemListService';

export default class LeetCodePlugin extends Plugin {
  // Field-stub declarations (wired in Plan 06). Plan 04 SettingsTab does
  // `plugin.settings.*` and `plugin.auth.*`; those lookups compile cleanly
  // today because of these definite-assignment assertions. Plan 06 is the
  // ONLY plan allowed to modify this file after Wave 1.
  settings!: SettingsStore;
  auth!: AuthService;
  client!: LeetCodeClient;
  list!: ProblemListService;

  async onload(): Promise<void> {
    // Intentionally empty — behavior wired in Plan 06. Do not add logic here in Wave 1.
  }
}
