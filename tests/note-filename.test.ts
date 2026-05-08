import { describe, it, expect } from 'vitest';
import { buildNoteFilename, buildNotePath } from '../src/notes/NoteTemplate';

describe('buildNoteFilename / buildNotePath (D-16 NOTE-01)', () => {
  it('produces unpadded filenames like 1-two-sum.md, 10-..., 100-...', () => {
    expect(buildNoteFilename(1, 'two-sum')).toBe('1-two-sum.md');
    expect(buildNoteFilename(10, 'regular-expression-matching')).toBe('10-regular-expression-matching.md');
    expect(buildNoteFilename(100, 'same-tree')).toBe('100-same-tree.md');
  });

  it('strips trailing slashes from folder and joins with /', () => {
    expect(buildNotePath('LeetCode', 1, 'two-sum')).toBe('LeetCode/1-two-sum.md');
    expect(buildNotePath('LeetCode/', 1, 'two-sum')).toBe('LeetCode/1-two-sum.md');
    expect(buildNotePath('LeetCode//', 1, 'two-sum')).toBe('LeetCode/1-two-sum.md');
  });

  it('handles nested folders', () => {
    expect(buildNotePath('Study/LeetCode', 42, 'trapping-rain-water')).toBe('Study/LeetCode/42-trapping-rain-water.md');
  });
});
