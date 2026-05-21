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
 *  Keys are lowercase; resolveLangSlug lowercases input before lookup.
 *
 *  NOTE: `python` maps to `python3` because LC deprecated Python 2 in 2020
 *  and `lcSlugToFenceTag` remaps `python3` → `python` for Prism/Lezer
 *  highlighting (D-04). Without this alias the round-trip breaks: notes
 *  written with a `python` fence would submit as Python 2. */
export const FENCE_TAG_ALIASES: Readonly<Record<string, string>> = {
  'py': 'python3',
  'py3': 'python3',
  'python': 'python3',
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
 *   - alias hit → canonical slug (checked FIRST so D-04 round-trip works:
 *     `python3` is written as `python` fence, `python` fence resolves back to `python3`)
 *   - exact LC slug (case-insensitive) → canonical slug
 *   - unknown tag → fallback (D-05: same treatment as untagged)
 */
export function resolveLangSlug(
  fenceTag: string | null | undefined,
  fallback: string,
): string {
  if (!fenceTag) return fallback;
  const lower = fenceTag.toLowerCase();
  const alias = FENCE_TAG_ALIASES[lower];
  if (alias) return alias;
  if (LC_LANG_SLUGS.has(lower)) return lower;
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 5.3 Wave 1 — write-time fence-tag remap (D-04) + chevron labels (D-10)
// ─────────────────────────────────────────────────────────────────────────
//
// CONTEXT D-04 mapping table (LC slug → markdown-recognized fence tag):
//   python3 → python   (REMAPPED — Prism/Lezer don't recognize 'python3')
//   golang  → go       (REMAPPED — markdown/Prism/Lezer expect 'go')
//   c       → cpp      (REMAPPED — shared parser; LC's 'c' slug rendered via cpp)
//   python, java, cpp, javascript, typescript, rust → identity
//
// Unsupported LC slugs (csharp, kotlin, ruby, swift, scala, php, dart, elixir,
// erlang, racket, mysql, postgresql, mssql, oraclesql) pass through verbatim —
// fence renders plain monospace, same UX as today's "no Edit-Mode highlight".
//
// Purity preserved (file header contract): all four additions below are pure
// data + one pure function; zero runtime imports, zero captured state, zero I/O.

/** D-04: LC langSlug → markdown-recognized fence-tag. Covers the 9 LC slugs
 *  for which markdown's nested parser has a recognized language; entries that
 *  remap (`python3`, `golang`, `c`) plus identity entries that pin the contract. */
export const LC_LANG_FENCE_TAG: Readonly<Record<string, string>> = {
  python3: 'python',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'cpp',
  javascript: 'javascript',
  typescript: 'typescript',
  golang: 'go',
  rust: 'rust',
};

/**
 * D-04: Map an LC langSlug to the markdown-recognized fence-tag. Unsupported
 * LC slugs pass through verbatim (e.g., 'csharp' → 'csharp') — those render
 * plain monospace, matching today's no-Edit-Mode-highlight baseline.
 *
 * Pure: returns table lookup or input.
 */
export function lcSlugToFenceTag(slug: string): string {
  return LC_LANG_FENCE_TAG[slug] ?? slug;
}

/** D-10: LC langSlug → user-friendly display label for the chevron widget.
 *  Phase 5.3 Plan 05 (gap-closure): `python3` is disambiguated from LC's
 *  deprecated `python` (Python 2) slug. Both slugs may appear in user
 *  vaults — the chevron's label must signal which Python the LC API call
 *  will dispatch. */
export const LC_LANG_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  // G-PYTHON-LABEL: disambiguate Python 3 from deprecated Python 2
  python3: 'Python 3',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  golang: 'Go',
  rust: 'Rust',
};

/** D-04 + D-10: Chevron dropdown order for the 8 supported LC languages.
 *  Python first as most common, Rust last as least common. `python3` is the
 *  canonical LC API slug (chevron writes `python3` to `lc-language` even though
 *  the fence-tag is remapped to `python`). */
export const LC_CHEVRON_LANG_ORDER: ReadonlyArray<string> = [
  'python3',
  'java',
  'cpp',
  'c',
  'javascript',
  'typescript',
  'golang',
  'rust',
];
