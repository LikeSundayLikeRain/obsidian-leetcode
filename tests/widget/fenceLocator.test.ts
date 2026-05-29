// Phase 19 Plan 01 — fenceLocator unit tests.
//
// Verifies findCodeFence (lifted from codeActionsEditorExtension.ts:177-212 with
// FENCE_RE widened to match leetcode-solve), extractFenceBody (lifted from
// nestedEditorExtension.ts:168-176), and computeFenceIndex (greenfield, per
// RESEARCH §"Specific Findings §2").

import { describe, it, expect, vi } from 'vitest';
import { makeStateForLockTests } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  findCodeFence,
  extractFenceBody,
  computeFenceIndex,
} from '../../src/widget/fenceLocator';

const NOTE_WITH_LC_FENCE = [
  '## Code',
  '',
  '```leetcode-solve',
  'class Solution:',
  '    pass',
  '```',
  '',
].join('\n');

const NOTE_WITH_LEGACY_FENCE = [
  '## Code',
  '',
  '```python',
  'class Solution:',
  '    pass',
  '```',
  '',
].join('\n');

const NOTE_NO_FENCE = [
  '## Problem',
  '',
  'Some prose.',
].join('\n');

const MULTI_FENCE_FILE = [
  '## Code',
  '',
  '```leetcode-solve',
  'A',
  '```',
  '',
  '## Other',
  '',
  '```leetcode-solve',
  'B',
  '```',
].join('\n');

describe('findCodeFence', () => {
  it('locates a leetcode-solve opener inside ## Code (kind=leetcode-solve)', () => {
    const state = makeStateForLockTests({ body: NOTE_WITH_LC_FENCE });
    const fence = findCodeFence(state);
    expect(fence).not.toBeNull();
    expect(fence!.kind).toBe('leetcode-solve');
    expect(fence!.openerLine).toBeGreaterThan(0);
    expect(fence!.closerLine).toBeGreaterThan(fence!.openerLine);
  });

  it('locates a legacy fence inside ## Code (kind=legacy)', () => {
    const state = makeStateForLockTests({ body: NOTE_WITH_LEGACY_FENCE });
    const fence = findCodeFence(state);
    expect(fence).not.toBeNull();
    expect(fence!.kind).toBe('legacy');
  });

  it('returns null when no fence exists', () => {
    const state = makeStateForLockTests({ body: NOTE_NO_FENCE });
    expect(findCodeFence(state)).toBeNull();
  });
});

describe('extractFenceBody', () => {
  it('returns body lines between opener and closer (exclusive)', () => {
    const state = makeStateForLockTests({ body: NOTE_WITH_LC_FENCE });
    const fence = findCodeFence(state);
    expect(fence).not.toBeNull();
    const body = extractFenceBody(state, fence!);
    expect(body).toContain('class Solution:');
    expect(body).toContain('pass');
  });

  it('returns empty string when fence has no body', () => {
    const empty = ['## Code', '', '```leetcode-solve', '```', ''].join('\n');
    const state = makeStateForLockTests({ body: empty });
    const fence = findCodeFence(state);
    expect(fence).not.toBeNull();
    const body = extractFenceBody(state, fence!);
    expect(body).toBe('');
  });
});

describe('computeFenceIndex', () => {
  it('returns 0 for the first leetcode-solve opener in the file', () => {
    const lines = MULTI_FENCE_FILE.split(/\r?\n/);
    const firstOpenerIdx = lines.indexOf('```leetcode-solve');
    expect(firstOpenerIdx).toBeGreaterThanOrEqual(0);
    expect(computeFenceIndex(MULTI_FENCE_FILE, firstOpenerIdx)).toBe(0);
  });

  it('returns 1 for the second leetcode-solve opener in the file', () => {
    const lines = MULTI_FENCE_FILE.split(/\r?\n/);
    const firstOpenerIdx = lines.indexOf('```leetcode-solve');
    const secondOpenerIdx = lines.indexOf('```leetcode-solve', firstOpenerIdx + 1);
    expect(secondOpenerIdx).toBeGreaterThan(firstOpenerIdx);
    expect(computeFenceIndex(MULTI_FENCE_FILE, secondOpenerIdx)).toBe(1);
  });

  it('returns 0 for a position before any opener', () => {
    expect(computeFenceIndex(MULTI_FENCE_FILE, 0)).toBe(0);
  });

  it('handles CRLF line endings', () => {
    const crlf = MULTI_FENCE_FILE.replace(/\n/g, '\r\n');
    const lines = crlf.split(/\r?\n/);
    const firstOpenerIdx = lines.indexOf('```leetcode-solve');
    const secondOpenerIdx = lines.indexOf('```leetcode-solve', firstOpenerIdx + 1);
    expect(computeFenceIndex(crlf, secondOpenerIdx)).toBe(1);
  });

  it('counts only leetcode-solve openers, not legacy fences', () => {
    const mixed = [
      '## Code',
      '```python',
      'A',
      '```',
      '## More',
      '```leetcode-solve',
      'B',
      '```',
    ].join('\n');
    const lines = mixed.split(/\r?\n/);
    const targetIdx = lines.indexOf('```leetcode-solve');
    expect(computeFenceIndex(mixed, targetIdx)).toBe(0);
  });
});
