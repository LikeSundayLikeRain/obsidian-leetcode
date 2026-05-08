// tests/solve/languages.test.ts
// RED baseline (Wave 0) — will fail to import until Plan 02 ships
// src/solve/languages.ts with LC_LANG_SLUGS + resolveLangSlug.
//
// Contracts under test:
//   D-05: unknown fence tag → falls back to settings defaultLanguage
//   SOLVE-08: every LC-supported langSlug round-trips to itself
//   aliases: py→python3, ts→typescript, c++→cpp, go→golang, rs→rust
//
// Pure function; no Obsidian dependencies.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 02
import { LC_LANG_SLUGS, resolveLangSlug } from '../../src/solve/languages';

describe('languages.LC_LANG_SLUGS + resolveLangSlug (SOLVE-08, D-05)', () => {
  it('LC_LANG_SLUGS contains python3 and resolveLangSlug(python3, *) returns python3 (self-round-trip)', () => {
    expect(LC_LANG_SLUGS.has('python3')).toBe(true);
    expect(resolveLangSlug('python3', 'python3')).toBe('python3');
  });

  it('aliases normalize to canonical LC langSlugs (py/ts/c++/go/rs)', () => {
    expect(resolveLangSlug('py', 'python3')).toBe('python3');
    expect(resolveLangSlug('ts', 'python3')).toBe('typescript');
    expect(resolveLangSlug('c++', 'python3')).toBe('cpp');
    expect(resolveLangSlug('go', 'python3')).toBe('golang');
    expect(resolveLangSlug('rs', 'python3')).toBe('rust');
  });

  it('D-05: unknown tag falls back to the provided defaultLanguage', () => {
    expect(resolveLangSlug('klingon', 'python3')).toBe('python3');
    expect(resolveLangSlug('unknown-lang', 'java')).toBe('java');
  });

  it('null / empty / undefined tag falls back to defaultLanguage', () => {
    expect(resolveLangSlug(null, 'python3')).toBe('python3');
    expect(resolveLangSlug('', 'java')).toBe('java');
    expect(resolveLangSlug(undefined, 'cpp')).toBe('cpp');
  });

  it('LC_LANG_SLUGS includes the Phase-3 core languages (SOLVE-08 coverage)', () => {
    for (const slug of ['python3', 'java', 'cpp', 'javascript', 'typescript', 'golang', 'rust', 'csharp']) {
      expect(LC_LANG_SLUGS.has(slug)).toBe(true);
    }
  });
});
