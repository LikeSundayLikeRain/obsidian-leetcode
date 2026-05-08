// src/settings/SettingsStore.ts
// Async wrapper over plugin.loadData() / plugin.saveData().
// All feature code reads/writes data.json through this class.
// Cookies NEVER leave data.json (CF-03, AUTH-06).
import type { Plugin } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { IndexedProblem, ProblemIndex } from '../browse/types';
import { logger } from '../shared/logger';

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

const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const VALID_STATUSES = new Set(['solved', 'attempted', 'untouched']);

/** Shape-guard for AuthCookies; rejects non-string fields that would flow into
 *  Credential.init() as non-strings and silently fail all subsequent API calls. */
function isValidAuthCookies(v: unknown): v is AuthCookies {
  if (v === null || typeof v !== 'object') return false;
  const a = v as Partial<AuthCookies>;
  return typeof a.LEETCODE_SESSION === 'string' && typeof a.csrftoken === 'string';
}

/** Strip trailing slashes; reject path-traversal segments and absolute paths so a
 *  corrupt/malicious data.json can't steer vault writes outside the configured folder.
 *  Returns the default value if input is unsafe. */
function sanitizeFolder(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DATA.problemsFolder;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_DATA.problemsFolder;
  // Reject absolute paths (Unix + Windows).
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return DEFAULT_DATA.problemsFolder;
  // Reject any `..` segment anywhere in the path.
  const segments = trimmed.split(/[\\/]+/);
  if (segments.some((s) => s === '..')) return DEFAULT_DATA.problemsFolder;
  return trimmed.replace(/[\\/]+$/, '');
}

/** Shape-guard for a single IndexedProblem row. WR-04: if any row is missing a
 *  required field (especially `diff`), ProblemBrowserView.renderRow crashes on
 *  p.diff.toLowerCase() — so we force a clean re-fetch rather than load partial data. */
function isValidIndexedProblem(v: unknown): v is IndexedProblem {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<IndexedProblem>;
  return (
    typeof p.id === 'number' &&
    typeof p.slug === 'string' &&
    typeof p.title === 'string' &&
    typeof p.diff === 'string' && VALID_DIFFICULTIES.has(p.diff) &&
    typeof p.paid === 'boolean' &&
    (p.status === undefined || (typeof p.status === 'string' && VALID_STATUSES.has(p.status)))
  );
}

function isValidProblemIndex(v: unknown): v is ProblemIndex {
  if (!v || typeof v !== 'object') return false;
  const idx = v as Partial<ProblemIndex>;
  if (typeof idx.fetchedAt !== 'number' || !Array.isArray(idx.problems)) return false;
  return idx.problems.every(isValidIndexedProblem);
}

export class SettingsStore {
  private constructor(private plugin: Plugin, private data: PluginData) {}

  static async load(plugin: Plugin): Promise<SettingsStore> {
    // Treat data.json as untrusted — anyone (or a broken prior version) could
    // have written it. Validate every field before accepting it into PluginData
    // (CR-02). Falls back to DEFAULT_DATA per-field on validation failure.
    const rawUnknown: unknown = (await plugin.loadData()) ?? {};
    const raw = (rawUnknown && typeof rawUnknown === 'object')
      ? (rawUnknown as Record<string, unknown>)
      : {};
    const data: PluginData = {
      version: 1,
      auth: isValidAuthCookies(raw.auth) ? raw.auth : DEFAULT_DATA.auth,
      username: typeof raw.username === 'string' ? raw.username : DEFAULT_DATA.username,
      problemsFolder: sanitizeFolder(raw.problemsFolder),
      defaultLanguage: (typeof raw.defaultLanguage === 'string' && raw.defaultLanguage.trim())
        ? raw.defaultLanguage
        : DEFAULT_DATA.defaultLanguage,
      problemIndex: isValidProblemIndex(raw.problemIndex) ? raw.problemIndex : DEFAULT_DATA.problemIndex,
    };
    // Warn without leaking values so a user whose disk file is corrupt knows
    // why they unexpectedly see a logged-out state or a fresh index refetch.
    if (raw.auth !== undefined && raw.auth !== null && !isValidAuthCookies(raw.auth)) {
      logger.warn('settings.load: ignoring malformed auth; reverting to logged-out state');
    }
    if (raw.problemIndex !== undefined && raw.problemIndex !== null && !isValidProblemIndex(raw.problemIndex)) {
      logger.warn('settings.load: ignoring malformed problemIndex; will re-fetch');
    }
    if (typeof raw.problemsFolder === 'string' && raw.problemsFolder.trim() &&
        sanitizeFolder(raw.problemsFolder) === DEFAULT_DATA.problemsFolder &&
        raw.problemsFolder.trim().replace(/[\\/]+$/, '') !== DEFAULT_DATA.problemsFolder) {
      logger.warn('settings.load: rejected unsafe problemsFolder; reverted to default');
    }
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
