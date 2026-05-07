// src/settings/SettingsStore.ts
// Async wrapper over plugin.loadData() / plugin.saveData().
// All feature code reads/writes data.json through this class.
// Cookies NEVER leave data.json (CF-03, AUTH-06).
import type { Plugin } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { ProblemIndex } from '../browse/types';

export interface PluginData {
  version: 1;
  auth: AuthCookies | null;
  username: string | null;
  problemsFolder: string;  // D-10: default 'LeetCode' (stored without trailing slash)
  defaultLanguage: string; // D-10: default 'python3' (LC's Python slug)
  problemIndex: ProblemIndex | null;
}

const DEFAULT_DATA: PluginData = {
  version: 1,
  auth: null,
  username: null,
  problemsFolder: 'LeetCode',
  defaultLanguage: 'python3',
  problemIndex: null,
};

export class SettingsStore {
  private constructor(private plugin: Plugin, private data: PluginData) {}

  static async load(plugin: Plugin): Promise<SettingsStore> {
    const raw = (await plugin.loadData()) as Partial<PluginData> | null;
    const data: PluginData = { ...DEFAULT_DATA, ...(raw ?? {}), version: 1 };
    return new SettingsStore(plugin, data);
  }

  getAuthCookies(): AuthCookies | null { return this.data.auth; }
  async setAuthCookies(c: AuthCookies | null): Promise<void> {
    this.data.auth = c;
    await this.persist();
  }

  getProblemsFolder(): string { return this.data.problemsFolder; }
  async setProblemsFolder(v: string): Promise<void> {
    this.data.problemsFolder = v;
    await this.persist();
  }

  getDefaultLanguage(): string { return this.data.defaultLanguage; }
  async setDefaultLanguage(v: string): Promise<void> {
    this.data.defaultLanguage = v;
    await this.persist();
  }

  getProblemIndex(): ProblemIndex | null { return this.data.problemIndex; }
  async setProblemIndex(i: ProblemIndex): Promise<void> {
    this.data.problemIndex = i;
    await this.persist();
  }

  getUsername(): string | null { return this.data.username; }
  async setUsername(u: string | null): Promise<void> {
    this.data.username = u;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.plugin.saveData(this.data);
  }
}
