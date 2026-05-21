// tests/contest/mergeAIContestAnalysisSection.test.ts
// Phase 10 Plan 02 Task 2 — Unit tests for mergeAIContestAnalysisSection.

import { describe, it, expect } from 'vitest';
import {
  mergeAIContestAnalysisSection,
  AI_ANALYSIS_HEADING_LINE,
} from '../../src/contest/mergeAIContestAnalysisSection';

describe('mergeAIContestAnalysisSection', () => {
  const sampleAnalysis = 'Good time management on Q1.\nNeeds work on graph algorithms.';

  describe('first write (no existing ## AI Analysis)', () => {
    it('inserts ## AI Analysis before ## Notes', () => {
      const body = [
        '## Results',
        '',
        '| Problem | Verdict |',
        '| --- | --- |',
        '| Q1 | AC |',
        '',
        '## Notes',
        '',
        'My personal reflections.',
      ].join('\n');

      const result = mergeAIContestAnalysisSection(body, sampleAnalysis);

      // Should have Results, then AI Analysis, then Notes
      const resultIdx = result.indexOf('## Results');
      const aiIdx = result.indexOf('## AI Analysis');
      const notesIdx = result.indexOf('## Notes');

      expect(resultIdx).toBeGreaterThan(-1);
      expect(aiIdx).toBeGreaterThan(resultIdx);
      expect(notesIdx).toBeGreaterThan(aiIdx);
      expect(result).toContain(sampleAnalysis);
    });

    it('body with no ## Notes appends at EOF', () => {
      const body = [
        '## Results',
        '',
        '| Problem | Verdict |',
        '| --- | --- |',
        '| Q1 | AC |',
      ].join('\n');

      const result = mergeAIContestAnalysisSection(body, sampleAnalysis);

      expect(result).toContain('## Results');
      expect(result).toContain('## AI Analysis');
      expect(result).toContain(sampleAnalysis);
      // AI Analysis should be at the end
      const aiIdx = result.indexOf('## AI Analysis');
      expect(result.indexOf('## Results')).toBeLessThan(aiIdx);
    });
  });

  describe('replacement path (existing ## AI Analysis)', () => {
    it('replaces existing ## AI Analysis content up to next H2', () => {
      const body = [
        '## Results',
        '',
        'Some results.',
        '',
        '## AI Analysis',
        '',
        'Old analysis content that should be replaced.',
        '',
        '## Notes',
        '',
        'My notes.',
      ].join('\n');

      const newAnalysis = 'Brand new analysis content.';
      const result = mergeAIContestAnalysisSection(body, newAnalysis);

      expect(result).toContain(newAnalysis);
      expect(result).not.toContain('Old analysis content');
      expect(result).toContain('## Notes');
      expect(result).toContain('My notes.');
    });

    it('replaces to EOF when ## AI Analysis is last section', () => {
      const body = [
        '## Results',
        '',
        'Some results.',
        '',
        '## AI Analysis',
        '',
        'Old content at the end.',
      ].join('\n');

      const newAnalysis = 'Replacement content.';
      const result = mergeAIContestAnalysisSection(body, newAnalysis);

      expect(result).toContain(newAnalysis);
      expect(result).not.toContain('Old content at the end');
      expect(result).toContain('## Results');
    });
  });

  describe('idempotency', () => {
    it('calling twice with different content yields only the second content', () => {
      const body = [
        '## Results',
        '',
        'Results here.',
        '',
        '## Notes',
        '',
        'User notes.',
      ].join('\n');

      const first = mergeAIContestAnalysisSection(body, 'First analysis.');
      const second = mergeAIContestAnalysisSection(first, 'Second analysis.');

      expect(second).toContain('Second analysis.');
      expect(second).not.toContain('First analysis.');
      // Structure preserved
      expect(second).toContain('## Results');
      expect(second).toContain('## AI Analysis');
      expect(second).toContain('## Notes');
    });

    it('calling with same content is stable', () => {
      const body = [
        '## Results',
        '',
        'Results.',
        '',
        '## Notes',
        '',
        'Notes.',
      ].join('\n');

      const first = mergeAIContestAnalysisSection(body, sampleAnalysis);
      const second = mergeAIContestAnalysisSection(first, sampleAnalysis);

      expect(first).toBe(second);
    });
  });

  describe('content preservation', () => {
    it('preserves all content before ## AI Analysis and all content after ## Notes', () => {
      const body = [
        '---',
        'lc-contest-id: weekly-contest-400',
        '---',
        '',
        '## Results',
        '',
        '| Problem | Verdict | Time |',
        '| --- | --- | --- |',
        '| Q1 | AC | 5m |',
        '| Q2 | AC | 22m |',
        '',
        '## Notes',
        '',
        'I need to practice DP.',
        'Also review segment trees.',
      ].join('\n');

      const result = mergeAIContestAnalysisSection(body, sampleAnalysis);

      // Frontmatter preserved
      expect(result).toContain('lc-contest-id: weekly-contest-400');
      // Results table preserved
      expect(result).toContain('| Q1 | AC | 5m |');
      expect(result).toContain('| Q2 | AC | 22m |');
      // Notes preserved
      expect(result).toContain('I need to practice DP.');
      expect(result).toContain('Also review segment trees.');
    });
  });

  describe('edge cases', () => {
    it('handles empty body', () => {
      const result = mergeAIContestAnalysisSection('', sampleAnalysis);
      expect(result).toContain('## AI Analysis');
      expect(result).toContain(sampleAnalysis);
    });

    it('handles empty analysis content', () => {
      const body = '## Results\n\nSome results.\n\n## Notes\n\nNotes.';
      const result = mergeAIContestAnalysisSection(body, '');
      expect(result).toContain('## AI Analysis');
      expect(result).toContain('## Notes');
    });

    it('does not match partial heading (e.g., "## AI Analysis Results")', () => {
      const body = [
        '## Results',
        '',
        '## AI Analysis Results',
        '',
        'This is not the real heading.',
        '',
        '## Notes',
        '',
        'Notes.',
      ].join('\n');

      const result = mergeAIContestAnalysisSection(body, sampleAnalysis);

      // Should insert before ## Notes (first write), not replace the partial match
      expect(result).toContain('## AI Analysis Results');
      expect(result).toContain(sampleAnalysis);
      // The exact heading should appear
      const exactMatches = result.match(/^## AI Analysis$/gm);
      expect(exactMatches).not.toBeNull();
      expect(exactMatches!.length).toBe(1);
    });

    it('output ends with exactly one trailing newline', () => {
      const body = '## Results\n\nContent.\n\n## Notes\n\nNotes.';
      const result = mergeAIContestAnalysisSection(body, sampleAnalysis);
      expect(result.endsWith('\n')).toBe(true);
      expect(result.endsWith('\n\n')).toBe(false);
    });
  });

  it('exports AI_ANALYSIS_HEADING_LINE constant', () => {
    expect(AI_ANALYSIS_HEADING_LINE).toBe('## AI Analysis');
  });
});
