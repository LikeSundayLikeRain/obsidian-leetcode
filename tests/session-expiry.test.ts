import { describe, it, expect } from 'vitest';
import { isSessionExpired } from '../src/api/LeetCodeClient';

describe('isSessionExpired (AUTH-04)', () => {
  it('returns true when data is null', () => {
    expect(isSessionExpired({ data: null })).toBe(true);
  });
  it('returns true when errors include "logged in" message', () => {
    expect(isSessionExpired({ data: null, errors: [{ message: 'You must be logged in.' }] })).toBe(true);
  });
  it('returns false for successful response', () => {
    expect(isSessionExpired({ data: { questions: [] } })).toBe(false);
  });
  it('returns false for empty object', () => {
    expect(isSessionExpired({})).toBe(false);
  });
});
