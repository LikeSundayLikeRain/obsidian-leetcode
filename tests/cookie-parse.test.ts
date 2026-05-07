import { describe, it, expect } from 'vitest';
import { extractAuthCookies } from '../src/auth/BrowserWindowLogin';

describe('extractAuthCookies (AUTH-02)', () => {
  it('extracts both cookies when present', () => {
    const result = extractAuthCookies([
      { name: 'LEETCODE_SESSION', value: 'SessionValue', domain: '.leetcode.com' },
      { name: 'csrftoken', value: 'CsrfValue', domain: '.leetcode.com' },
      { name: 'foo', value: 'bar', domain: '.leetcode.com' },
    ]);
    expect(result).toEqual({ LEETCODE_SESSION: 'SessionValue', csrftoken: 'CsrfValue' });
  });

  it('returns null when LEETCODE_SESSION missing', () => {
    expect(
      extractAuthCookies([
        { name: 'csrftoken', value: 'Y', domain: '.leetcode.com' },
      ]),
    ).toBeNull();
  });

  it('returns null when csrftoken missing', () => {
    expect(
      extractAuthCookies([
        { name: 'LEETCODE_SESSION', value: 'X', domain: '.leetcode.com' },
      ]),
    ).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(extractAuthCookies([])).toBeNull();
  });

  it('ignores unrelated cookies', () => {
    const result = extractAuthCookies([
      { name: 'theme', value: 'dark', domain: '.leetcode.com' },
      { name: 'LEETCODE_SESSION', value: 'S', domain: '.leetcode.com' },
      { name: '_ga', value: 'GA1', domain: '.leetcode.com' },
      { name: 'csrftoken', value: 'C', domain: '.leetcode.com' },
    ]);
    expect(result).toEqual({ LEETCODE_SESSION: 'S', csrftoken: 'C' });
  });
});
