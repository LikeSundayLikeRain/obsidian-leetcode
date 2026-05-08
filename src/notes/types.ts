// src/notes/types.ts
// Phase 2 notes-module local types + re-exports.
//
// DetailCacheEntry will ultimately live in SettingsStore (added by Plan 04) because
// data.json ownership belongs to SettingsStore. For Wave 1, the interface is inlined
// here so downstream modules (NoteTemplate, NoteWriter, orchestrator) can compile
// before Plan 04 lands its SettingsStore extension. Plan 04 will replace this
// inline declaration with a re-export from `../settings/SettingsStore`.
//
// Schema is locked by CONTEXT.md D-14 and RESEARCH.md "SettingsStore extension".

export interface DetailCacheEntry {
  /** Epoch ms of the last successful fetch — 7-day TTL gate (D-11). */
  fetchedAt: number;
  /** Problem id from questionFrontendId parsed to number. */
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  /** Canonical LC URL: https://leetcode.com/problems/{slug}/ */
  url: string;
  /** Raw LC HTML content — turndown re-runs are cheap, so cache the source. */
  contentHtml: string;
  /** LC topic tag slugs (e.g. ['array', 'hash-table']). Phase 4 reads these. */
  topicSlugs: string[];
  /** LC 'exampleTestcases' string — Phase 3 uses this for run/submit. */
  exampleTestcases?: string;
  /** LC starter-code snippets keyed by language — Phase 3 (SOLVE-02) uses these. */
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
}
