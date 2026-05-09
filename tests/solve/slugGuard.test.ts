// tests/solve/slugGuard.test.ts
//
// GAP 1 — T-03-05-01: isValidSlug() / SLUG_RE guard rejecting malformed slugs.
//
// Security contract: any string from frontmatter `lc-slug` must pass
// isValidSlug() before being interpolated into REST URL paths. A slug that
// passes the guard can ONLY contain [a-z0-9-], so it can never inject path
// traversal segments, query params, protocol prefixes, or percent-encoded
// slashes into the URL.
//
// Behavioral test name convention: `<guard>_<input-class>_<expected-outcome>`

import { describe, it, expect } from 'vitest';
import { SLUG_RE, isValidSlug } from '../../src/solve/slugGuard';

// ── SLUG_RE shape ─────────────────────────────────────────────────────────

describe('SLUG_RE character class', () => {
  it('SLUG_RE accepts canonical two-sum slug', () => {
    expect(SLUG_RE.test('two-sum')).toBe(true);
  });

  it('SLUG_RE accepts slug with digits at the start (3sum)', () => {
    expect(SLUG_RE.test('3sum')).toBe(true);
  });

  it('SLUG_RE accepts longest real LC slug with internal hyphens', () => {
    expect(SLUG_RE.test('longest-substring-without-repeating-characters')).toBe(true);
  });

  it('SLUG_RE rejects uppercase letters (Two-Sum)', () => {
    expect(SLUG_RE.test('Two-Sum')).toBe(false);
  });

  it('SLUG_RE rejects underscore (two_sum)', () => {
    expect(SLUG_RE.test('two_sum')).toBe(false);
  });

  it('SLUG_RE rejects space (two sum)', () => {
    expect(SLUG_RE.test('two sum')).toBe(false);
  });

  it('SLUG_RE rejects forward slash (foo/bar — path traversal attempt)', () => {
    expect(SLUG_RE.test('foo/bar')).toBe(false);
  });

  it('SLUG_RE rejects dot-dot-slash (../foo — directory traversal attempt)', () => {
    expect(SLUG_RE.test('../foo')).toBe(false);
  });

  it('SLUG_RE rejects percent-encoding (foo%2Fbar)', () => {
    expect(SLUG_RE.test('foo%2Fbar')).toBe(false);
  });

  it('SLUG_RE rejects question mark (two?sum=1 — query param injection)', () => {
    expect(SLUG_RE.test('two?sum=1')).toBe(false);
  });

  it('SLUG_RE rejects full URL (https://leetcode.com/problems/two-sum)', () => {
    expect(SLUG_RE.test('https://leetcode.com/problems/two-sum')).toBe(false);
  });

  it('SLUG_RE rejects empty string', () => {
    expect(SLUG_RE.test('')).toBe(false);
  });
});

// ── isValidSlug type guard — valid inputs ─────────────────────────────────

describe('isValidSlug — valid LC slugs accepted', () => {
  it('accepts two-sum', () => {
    expect(isValidSlug('two-sum')).toBe(true);
  });

  it('accepts 3sum (digit-leading)', () => {
    expect(isValidSlug('3sum')).toBe(true);
  });

  it('accepts longest-substring-without-repeating-characters', () => {
    expect(isValidSlug('longest-substring-without-repeating-characters')).toBe(true);
  });

  it('accepts all-digit slug (e.g. problem-42 style: "42")', () => {
    expect(isValidSlug('42')).toBe(true);
  });

  it('accepts single lowercase letter', () => {
    expect(isValidSlug('a')).toBe(true);
  });
});

// ── isValidSlug — string rejections ──────────────────────────────────────

describe('isValidSlug — malformed strings rejected (T-03-05-01)', () => {
  it('rejects empty string', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('rejects uppercase slug (Two-Sum)', () => {
    expect(isValidSlug('Two-Sum')).toBe(false);
  });

  it('rejects underscore slug (two_sum)', () => {
    expect(isValidSlug('two_sum')).toBe(false);
  });

  it('rejects slug with space (two sum)', () => {
    expect(isValidSlug('two sum')).toBe(false);
  });

  it('rejects path traversal (../foo)', () => {
    expect(isValidSlug('../foo')).toBe(false);
  });

  it('rejects path segment injection (foo/bar)', () => {
    expect(isValidSlug('foo/bar')).toBe(false);
  });

  it('rejects percent-encoded slash (foo%2Fbar)', () => {
    expect(isValidSlug('foo%2Fbar')).toBe(false);
  });

  it('rejects query param injection (two?sum=1)', () => {
    expect(isValidSlug('two?sum=1')).toBe(false);
  });

  it('rejects full URL string (https://leetcode.com/problems/two-sum)', () => {
    expect(isValidSlug('https://leetcode.com/problems/two-sum')).toBe(false);
  });
});

// ── isValidSlug — non-string type rejections ─────────────────────────────

describe('isValidSlug — non-string types rejected', () => {
  it('rejects undefined', () => {
    expect(isValidSlug(undefined)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidSlug(null)).toBe(false);
  });

  it('rejects number 0', () => {
    expect(isValidSlug(0)).toBe(false);
  });

  it('rejects number 42', () => {
    expect(isValidSlug(42)).toBe(false);
  });

  it('rejects boolean true', () => {
    expect(isValidSlug(true)).toBe(false);
  });

  it('rejects boolean false', () => {
    expect(isValidSlug(false)).toBe(false);
  });

  it('rejects empty array', () => {
    expect(isValidSlug([])).toBe(false);
  });

  it('rejects array containing a valid-looking string', () => {
    expect(isValidSlug(['two-sum'])).toBe(false);
  });

  it('rejects plain object', () => {
    expect(isValidSlug({ slug: 'two-sum' })).toBe(false);
  });
});

// ── isValidSlug narrows the type to string ───────────────────────────────

describe('isValidSlug type narrowing', () => {
  it('narrows unknown to string inside if-branch (compile-time + runtime check)', () => {
    const val: unknown = 'two-sum';
    if (isValidSlug(val)) {
      // TypeScript would error here if isValidSlug did not narrow to `string`.
      const upper: string = val.toUpperCase();
      expect(upper).toBe('TWO-SUM');
    } else {
      throw new Error('Expected isValidSlug to return true for "two-sum"');
    }
  });
});
