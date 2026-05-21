// tests/contest/aiContestAnalysis.test.ts
// Phase 10 Plan 07 — Integration tests for contest AI analysis wiring.
// Tests: buildContestAnalysisPrompt, mergeAIContestAnalysisSection, withContestAnalysisBullet.

import { describe, it, expect } from 'vitest';
import { buildContestAnalysisPrompt } from '../../src/contest/buildContestAnalysisPrompt';
import { mergeAIContestAnalysisSection } from '../../src/contest/mergeAIContestAnalysisSection';
import { DISCLOSURE_BASE_COPY, withContestAnalysisBullet } from '../../src/ai/disclosure';

describe('buildContestAnalysisPrompt integration', () => {
  it('includes all problem slugs from a sample session', () => {
    const prompt = buildContestAnalysisPrompt({
      contestTitle: 'Weekly Contest 400',
      contestType: 'weekly',
      durationMin: 90,
      problems: [
        { slug: 'two-sum', difficulty: 'Easy', verdict: 'accepted', timeToSolveMin: 5, code: 'def solve(): pass', language: 'python3' },
        { slug: 'reverse-linked-list', difficulty: 'Medium', verdict: 'accepted', timeToSolveMin: 15, code: 'class Solution {}', language: 'java' },
        { slug: 'lru-cache', difficulty: 'Hard', verdict: 'attempted', timeToSolveMin: null, code: '// partial attempt', language: 'cpp' },
        { slug: 'median-of-two-sorted-arrays', difficulty: 'Hard', verdict: 'unsolved', timeToSolveMin: null, code: '', language: 'python3' },
      ],
    });

    expect(prompt).toContain('two-sum');
    expect(prompt).toContain('reverse-linked-list');
    expect(prompt).toContain('lru-cache');
    expect(prompt).toContain('median-of-two-sorted-arrays');
    expect(prompt).toContain('Weekly Contest 400');
    expect(prompt).toContain('weekly');
    expect(prompt).toContain('90 min');
  });

  it('includes code blocks for problems with code', () => {
    const prompt = buildContestAnalysisPrompt({
      contestTitle: 'Biweekly Contest 130',
      contestType: 'biweekly',
      durationMin: 90,
      problems: [
        { slug: 'problem-a', difficulty: 'Easy', verdict: 'accepted', timeToSolveMin: 3, code: 'function solve() { return 42; }', language: 'javascript' },
      ],
    });

    expect(prompt).toContain('```javascript');
    expect(prompt).toContain('function solve() { return 42; }');
    expect(prompt).toContain('```');
  });

  it('handles empty problems array gracefully', () => {
    const prompt = buildContestAnalysisPrompt({
      contestTitle: 'Weekly Contest 401',
      contestType: 'weekly',
      durationMin: 90,
      problems: [],
    });

    expect(prompt).toContain('No problems attempted');
    expect(prompt).toContain('Weekly Contest 401');
  });

  it('shows "Did not solve" for null timeToSolveMin', () => {
    const prompt = buildContestAnalysisPrompt({
      contestTitle: 'Weekly Contest 402',
      contestType: 'weekly',
      durationMin: 90,
      problems: [
        { slug: 'hard-problem', difficulty: 'Hard', verdict: 'attempted', timeToSolveMin: null, code: '// tried', language: 'python3' },
      ],
    });

    expect(prompt).toContain('Did not solve');
  });
});

describe('mergeAIContestAnalysisSection integration', () => {
  it('full cycle: inserts AI Analysis between Results and Notes', () => {
    const body = [
      '---',
      'lc-contest-id: weekly-contest-400',
      '---',
      '',
      '## Results',
      '',
      '| Problem | Verdict |',
      '| --- | --- |',
      '| two-sum | Accepted |',
      '',
      '## Notes',
      '',
      'Some user notes here.',
    ].join('\n');

    const merged = mergeAIContestAnalysisSection(body, 'Great performance overall!');

    // AI Analysis heading should appear
    expect(merged).toContain('## AI Analysis');
    // AI Analysis content should appear
    expect(merged).toContain('Great performance overall!');
    // Order: Results before AI Analysis before Notes
    const resultsIdx = merged.indexOf('## Results');
    const analysisIdx = merged.indexOf('## AI Analysis');
    const notesIdx = merged.indexOf('## Notes');
    expect(resultsIdx).toBeLessThan(analysisIdx);
    expect(analysisIdx).toBeLessThan(notesIdx);
    // Notes content preserved
    expect(merged).toContain('Some user notes here.');
  });

  it('replaces existing AI Analysis on re-run (idempotent)', () => {
    const body = [
      '## Results',
      '',
      '| Problem | Verdict |',
      '',
      '## AI Analysis',
      '',
      'Old analysis content that should be replaced.',
      '',
      '## Notes',
      '',
      'User notes.',
    ].join('\n');

    const merged = mergeAIContestAnalysisSection(body, 'New analysis content.');

    expect(merged).toContain('New analysis content.');
    expect(merged).not.toContain('Old analysis content');
    // Still only one ## AI Analysis heading
    const matches = merged.match(/## AI Analysis/g);
    expect(matches).toHaveLength(1);
  });

  it('appends at EOF when no ## Notes heading exists', () => {
    const body = [
      '## Results',
      '',
      '| Problem | Verdict |',
      '| two-sum | Accepted |',
    ].join('\n');

    const merged = mergeAIContestAnalysisSection(body, 'Analysis at end.');

    expect(merged).toContain('## AI Analysis');
    expect(merged).toContain('Analysis at end.');
    // AI Analysis comes after Results
    const resultsIdx = merged.indexOf('## Results');
    const analysisIdx = merged.indexOf('## AI Analysis');
    expect(resultsIdx).toBeLessThan(analysisIdx);
  });
});

describe('withContestAnalysisBullet', () => {
  it('adds the correct bullet to DISCLOSURE_BASE_COPY.willSend', () => {
    const extended = withContestAnalysisBullet(DISCLOSURE_BASE_COPY);

    // Should be a new object (composition, not mutation)
    expect(extended).not.toBe(DISCLOSURE_BASE_COPY);
    expect(extended.willSend).not.toBe(DISCLOSURE_BASE_COPY.willSend);

    // Should contain all base bullets plus the contest analysis bullet
    expect(extended.willSend.length).toBe(DISCLOSURE_BASE_COPY.willSend.length + 1);
    expect(extended.willSend[extended.willSend.length - 1]).toBe(
      'Contest analysis sends contest metadata, per-problem summary (slug, difficulty, verdict, time, your code)',
    );

    // neverSends should pass through by reference equality
    expect(extended.neverSends).toBe(DISCLOSURE_BASE_COPY.neverSends);
  });

  it('does not mutate the frozen base copy', () => {
    const originalLength = DISCLOSURE_BASE_COPY.willSend.length;
    withContestAnalysisBullet(DISCLOSURE_BASE_COPY);
    expect(DISCLOSURE_BASE_COPY.willSend.length).toBe(originalLength);
  });
});
