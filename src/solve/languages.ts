// src/solve/languages.ts
//
// LC langSlug canonical set + fence-tag alias table.
// Single source of truth for Phase 3 language normalization
// (SOLVE-08, CONTEXT D-02 / D-03 / D-05).
//
// Purity: no runtime imports, no captured state, no I/O.
// Safe to call from pure transforms (codeExtractor consumers, vault.process
// callbacks).

/** Canonical LC langSlug set. Derived from LC's `codeSnippets[].langSlug`
 *  values observed across 2024–2026 problem payloads. */
export const LC_LANG_SLUGS: ReadonlySet<string> = new Set([
  'python3',
  'python',
  'java',
  'cpp',
  'c',
  'csharp',
  'javascript',
  'typescript',
  'rust',
  'golang',
  'kotlin',
  'swift',
  'ruby',
  'scala',
  'php',
  'dart',
  'elixir',
  'erlang',
  'racket',
  'mysql',
  'postgresql',
  'mssql',
  'oraclesql',
]);

/** Common fence-tag aliases → canonical LC slug.
 *  Keys are lowercase; resolveLangSlug lowercases input before lookup. */
export const FENCE_TAG_ALIASES: Readonly<Record<string, string>> = {
  'py': 'python3',
  'py3': 'python3',
  'python2': 'python',
  'ts': 'typescript',
  'js': 'javascript',
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'go': 'golang',
  'kt': 'kotlin',
  'rb': 'ruby',
  'rs': 'rust',
  'pg': 'postgresql',
  'sql': 'mysql',
};

/**
 * Resolve a fence-tag (possibly null for untagged) to an LC langSlug.
 *
 * Contract (D-02 / D-03 / D-05):
 *   - null / undefined / empty string → fallback (D-03: global default from SettingsStore)
 *   - exact LC slug (case-insensitive) → canonical slug
 *   - alias hit → canonical slug
 *   - unknown tag → fallback (D-05: same treatment as untagged)
 */
export function resolveLangSlug(
  fenceTag: string | null | undefined,
  fallback: string,
): string {
  if (!fenceTag) return fallback;
  const lower = fenceTag.toLowerCase();
  if (LC_LANG_SLUGS.has(lower)) return lower;
  const alias = FENCE_TAG_ALIASES[lower];
  if (alias) return alias;
  return fallback;
}
