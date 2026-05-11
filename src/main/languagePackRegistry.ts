// src/main/languagePackRegistry.ts
//
// Phase 5.3 D-07/D-08 — lazy-loading language-pack cache.
// Module-level Map<PackId, Promise<LanguageSupport>> dedupes in-flight imports
// so first `getLanguagePack('python')` triggers import('@codemirror/lang-python')
// and subsequent calls reuse the cached promise.
//
// Purity: no runtime imports of Obsidian, no plugin-instance captured state.
// Side effect: dynamic `import()` which esbuild inline-bundles (D-08 splitting: false).
//
// Pack set covers the pragmatic 8 LC languages via 7 first-party packs (D-04):
//   python (covers python + python3 via slugToPackId alias),
//   java, cpp (covers c + cpp), javascript, typescript (via lang-javascript),
//   go (LC slug 'golang'), rust.
//
// Failure handling (CF-19 silent posture): if `loadPack(id)` rejects, the
// failed promise is removed from the cache so a future call can retry. The
// rejection propagates to the caller (codeFenceLanguageExtension.swap()),
// which silently falls back to whitespace-copy without surfacing a Notice.

// `@codemirror/language` is a transitive peer of obsidian@1.12.3; we only use
// it as a type here, so a plain `import type` keeps the runtime clean and the
// import/no-extraneous-dependencies lint rule is satisfied automatically (no
// runtime dependency emitted).
import type { LanguageSupport } from '@codemirror/language';

/** First-party CM6 language pack identifiers covered by Phase 5.3.
 *  7 members — `python3` and `c` map INTO `python` / `cpp` at the slugToPackId
 *  layer, they are not separate PackIds (D-05). */
export type PackId =
  | 'python'
  | 'java'
  | 'cpp'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'rust';

const cache = new Map<PackId, Promise<LanguageSupport>>();

/**
 * Get the LanguageSupport for a PackId, lazily importing the pack on first
 * call and caching the resulting promise for subsequent calls.
 *
 * On rejection the failed promise is removed from the cache so a retry can
 * re-trigger the underlying dynamic import (RESEARCH lines 783–790).
 */
export function getLanguagePack(id: PackId): Promise<LanguageSupport> {
  const existing = cache.get(id);
  if (existing) return existing;
  const promise = loadPack(id).catch((err: unknown) => {
    // Drop the failed promise from the cache so a retry is possible.
    cache.delete(id);
    throw err;
  });
  cache.set(id, promise);
  return promise;
}

/**
 * Lazy `import()` switch keyed on PackId. esbuild inline-bundles each
 * `await import(...)` per D-08 (`splitting: false`); the dynamic import
 * defers MODULE INITIALISATION until first call, but the bundled module
 * still ends up inside `main.js`.
 */
async function loadPack(id: PackId): Promise<LanguageSupport> {
  switch (id) {
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'java':
      return (await import('@codemirror/lang-java')).java();
    case 'cpp':
      return (await import('@codemirror/lang-cpp')).cpp();
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'go':
      return (await import('@codemirror/lang-go')).go();
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust();
  }
}

/**
 * Map an LC langSlug (or fence-tag canonical alias) to a PackId, or null when
 * the language has no first-party pack and should fall back to whitespace-copy.
 *
 * Mirrors mapSlugToPack (in codeFenceLanguageExtension.ts) but returns null
 * for unsupported slugs instead of the 'fallback' sentinel — this layer is
 * the lower-level pack lookup used by `warmDefaultPack`.
 */
export function slugToPackId(slug: string): PackId | null {
  switch (slug) {
    case 'python':
      return 'python';
    case 'python3':
      return 'python';
    case 'java':
      return 'java';
    case 'cpp':
      return 'cpp';
    case 'c':
      return 'cpp';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'golang':
      return 'go';
    case 'rust':
      return 'rust';
    default:
      return null;
  }
}

/**
 * Fire-and-forget warm of the user's default language pack, called from
 * `main.ts::onload()` so the first fence-enter for the most-common language
 * doesn't pay the 50–100 ms pack-init latency. Silent: any rejection is
 * swallowed because subsequent codeFenceLanguageExtension.swap() calls
 * already handle failure via whitespace-copy fallback (CF-19).
 */
export function warmDefaultPack(defaultLangSlug: string): void {
  const id = slugToPackId(defaultLangSlug);
  if (id) {
    void getLanguagePack(id).catch(() => {
      // Silent swallow — pack-load failure surfaces the next time
      // codeFenceLanguageExtension.swap() asks for the pack.
    });
  }
}
