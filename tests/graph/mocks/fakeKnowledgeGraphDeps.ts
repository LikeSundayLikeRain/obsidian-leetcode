// tests/graph/mocks/fakeKnowledgeGraphDeps.ts
//
// Phase 4 Wave 0 — Vault + Settings DI fake for KnowledgeGraphWriter tests.
// Returns `{ app, settings }` matching the KnowledgeGraphWriterDeps shape
// sketched in 04-PATTERNS.md §KnowledgeGraphWriter (and expected by Wave 1's
// src/graph/KnowledgeGraphWriter.ts). The settings facade covers every getter
// the writer + stub creator + submission picker touches:
//   - getProblemDetail(slug) → cached entry or null
//   - getAutoBacklinksEnabled() → opt-out flag (GRAPH-05, D-21)
//   - getProblemsFolder() → derived from user setting (Phase 1 D-10)
//   - getTechniquesFolder() → derived — {problemsFolder}/Techniques (D-15)
//   - getDefaultLanguage() → user-configured LC langSlug (Phase 1)
//
// Vault composition delegates to makeMockVaultApp() (tests/helpers/mock-vault),
// which already implements vault.create/createFolder/process/read +
// fileManager.processFrontMatter with spies.

import { makeMockVaultApp, type MockVaultApp } from '../../helpers/mock-vault';
import type { DetailCacheEntry } from '../../../src/settings/SettingsStore';

/** Settings facade the KnowledgeGraphWriter (and friends) consume. Structural
 *  DI — any class satisfying this shape works as a test double. */
export interface FakeKnowledgeGraphSettings {
  getProblemDetail(slug: string): DetailCacheEntry | null;
  getAutoBacklinksEnabled(): boolean;
  getProblemsFolder(): string;
  getTechniquesFolder(): string;
  getDefaultLanguage(): string;
}

export interface FakeKnowledgeGraphDepsOverrides {
  /** Seed files → content. Passed straight to makeMockVaultApp. */
  files?: Record<string, string>;
  /** Cached problem details keyed by slug. Supply entries WITH the Phase 4
   *  `topicTags: [{name, slug}, ...]` field to exercise the full pipeline. */
  problemDetails?: Record<string, DetailCacheEntry>;
  /** Opt-out flag (GRAPH-05). Default true — headline plugin value is on. */
  autoBacklinksEnabled?: boolean;
  /** Problems folder root. Default 'LeetCode' (matches Phase 1 D-10 default). */
  problemsFolder?: string;
  /** Techniques folder override. Default derived: `${problemsFolder}/Techniques`. */
  techniquesFolder?: string;
  /** Default LC langSlug for submissions. Default 'python3' (Phase 1 default). */
  defaultLanguage?: string;
}

export interface FakeKnowledgeGraphDeps {
  app: MockVaultApp['app'];
  settings: FakeKnowledgeGraphSettings;
  /** The underlying mock-vault harness so tests can inspect spies, seed
   *  frontmatter, and read final content state. */
  vault: MockVaultApp;
}

const DEFAULT_FOLDER = 'LeetCode';
const DEFAULT_LANGUAGE = 'python3';

export function makeFakeKnowledgeGraphDeps(
  overrides: FakeKnowledgeGraphDepsOverrides = {},
): FakeKnowledgeGraphDeps {
  const vault = makeMockVaultApp(overrides.files ?? {});
  const details = new Map<string, DetailCacheEntry>(
    Object.entries(overrides.problemDetails ?? {}),
  );
  const problemsFolder = overrides.problemsFolder ?? DEFAULT_FOLDER;
  const techniquesFolder = overrides.techniquesFolder ?? `${problemsFolder}/Techniques`;
  const autoBacklinksEnabled = overrides.autoBacklinksEnabled ?? true;
  const defaultLanguage = overrides.defaultLanguage ?? DEFAULT_LANGUAGE;

  const settings: FakeKnowledgeGraphSettings = {
    getProblemDetail(slug) {
      return details.get(slug) ?? null;
    },
    getAutoBacklinksEnabled() {
      return autoBacklinksEnabled;
    },
    getProblemsFolder() {
      return problemsFolder;
    },
    getTechniquesFolder() {
      return techniquesFolder;
    },
    getDefaultLanguage() {
      return defaultLanguage;
    },
  };

  return {
    app: vault.app,
    settings,
    vault,
  };
}
