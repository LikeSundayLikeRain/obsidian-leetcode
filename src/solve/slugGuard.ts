// src/solve/slugGuard.ts
//
// T-03-05-01 mitigation — slug shape guard extracted for independent testability.
//
// LC problem slugs are lowercase kebab-case: [a-z0-9-]+. Frontmatter is user-
// editable, so an attacker with vault-write access could place arbitrary strings
// in `lc-slug`; we enforce the LC shape before any slug reaches URL paths or
// fetcher calls.
//
// Exported by this module; imported by src/main.ts at every editorCheckCallback
// site and getActiveProblemContext().
//
// Purity: no imports, no state, no I/O.

/** The canonical LC slug pattern: lowercase letters, digits, and hyphens only.
 *  Empty string is rejected (length > 0 check in isValidSlug). */
export const SLUG_RE = /^[a-z0-9-]+$/;

/** Type-narrowing guard: returns true iff `v` is a non-empty string that
 *  matches SLUG_RE. Rejects non-string types, empty strings, uppercase letters,
 *  underscores, slashes, percent-encoding, query params, and whitespace. */
export function isValidSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && SLUG_RE.test(v);
}
