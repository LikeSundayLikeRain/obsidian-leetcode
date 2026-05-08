import { describe, it, expect } from 'vitest';
import {
  LC_LANG_SLUGS,
  FENCE_TAG_ALIASES,
  resolveLangSlug,
} from '../../src/solve/languages';

describe('LC_LANG_SLUGS (SOLVE-08)', () => {
  it('contains the canonical LC language slugs', () => {
    const required = [
      'python3', 'java', 'cpp', 'c', 'csharp',
      'javascript', 'typescript', 'rust', 'golang',
      'kotlin', 'swift', 'ruby', 'scala', 'php',
      'dart', 'elixir', 'erlang', 'racket',
      'mysql', 'postgresql',
    ];
    for (const slug of required) {
      expect(LC_LANG_SLUGS.has(slug)).toBe(true);
    }
  });

  it('has at least 20 entries', () => {
    expect(LC_LANG_SLUGS.size).toBeGreaterThanOrEqual(20);
  });
});

describe('FENCE_TAG_ALIASES', () => {
  it('maps common aliases to canonical LC slugs', () => {
    expect(FENCE_TAG_ALIASES['py']).toBe('python3');
    expect(FENCE_TAG_ALIASES['ts']).toBe('typescript');
    expect(FENCE_TAG_ALIASES['js']).toBe('javascript');
    expect(FENCE_TAG_ALIASES['c++']).toBe('cpp');
    expect(FENCE_TAG_ALIASES['c#']).toBe('csharp');
    expect(FENCE_TAG_ALIASES['go']).toBe('golang');
    expect(FENCE_TAG_ALIASES['rs']).toBe('rust');
  });
});

describe('resolveLangSlug (SOLVE-08, D-02/D-03/D-05)', () => {
  const FALLBACK = 'python3';

  it('returns fallback for null / undefined / empty fence tag (D-03)', () => {
    expect(resolveLangSlug(null, FALLBACK)).toBe('python3');
    expect(resolveLangSlug(undefined, FALLBACK)).toBe('python3');
    expect(resolveLangSlug('', FALLBACK)).toBe('python3');
  });

  it('returns canonical slug when fence tag matches exactly (D-02)', () => {
    expect(resolveLangSlug('python3', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('java', FALLBACK)).toBe('java');
    expect(resolveLangSlug('cpp', FALLBACK)).toBe('cpp');
  });

  it('resolves common aliases to canonical slugs (D-02)', () => {
    expect(resolveLangSlug('py', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('ts', FALLBACK)).toBe('typescript');
    expect(resolveLangSlug('c++', FALLBACK)).toBe('cpp');
    expect(resolveLangSlug('c#', FALLBACK)).toBe('csharp');
    expect(resolveLangSlug('go', FALLBACK)).toBe('golang');
    expect(resolveLangSlug('rs', FALLBACK)).toBe('rust');
  });

  it('is case-insensitive for fence tags', () => {
    expect(resolveLangSlug('Python3', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('JAVA', FALLBACK)).toBe('java');
    expect(resolveLangSlug('C++', FALLBACK)).toBe('cpp');
  });

  it('returns fallback when fence tag is unknown (D-05)', () => {
    expect(resolveLangSlug('foobarlang', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('assembly', 'java')).toBe('java');
  });

  it('is pure — same input returns same output', () => {
    expect(resolveLangSlug('py', FALLBACK)).toBe(resolveLangSlug('py', FALLBACK));
  });
});
