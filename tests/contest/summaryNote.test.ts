// tests/contest/summaryNote.test.ts
// Phase 10 Plan 06 — Unit tests for summary note body/frontmatter shape.

import { describe, it, expect } from 'vitest';
import { buildSummaryBody, type BuildSummaryBodyArgs } from '../../src/contest/ContestFinalizer';
import type { ContestSession } from '../../src/contest/types';

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

function createSession(overrides?: Partial<ContestSession>): ContestSession {
  return {
    contestSlug: 'weekly-contest-400',
    contestTitle: 'Weekly Contest 400',
    contestType: 'weekly',
    duration: 5400,
    startedAt: 1700000000000,
    pausedDuration: 0,
    isPaused: false,
    pausedAt: null,
    problems: [
      {
        slug: 'problem-a',
        title: 'Problem A',
        credit: 3,
        difficulty: 1,
        verdict: 'accepted',
        code: 'function solve() {}',
        language: 'javascript',
        solvedAt: 1700000300000, // 5 min
      },
      {
        slug: 'problem-b',
        title: 'Problem B',
        credit: 5,
        difficulty: 2,
        verdict: 'attempted',
        code: 'function solve() {}',
        language: 'javascript',
        solvedAt: null,
      },
      {
        slug: 'problem-c',
        title: 'Problem C',
        credit: 5,
        difficulty: 2,
        verdict: 'unsolved',
        code: '',
        language: 'javascript',
        solvedAt: null,
      },
      {
        slug: 'problem-d',
        title: 'Problem D',
        credit: 7,
        difficulty: 3,
        verdict: 'accepted',
        code: 'function solve() {}',
        language: 'javascript',
        solvedAt: 1700002400000, // ~40 min
      },
    ],
    ...overrides,
  };
}

function buildArgs(overrides?: Partial<BuildSummaryBodyArgs>): BuildSummaryBodyArgs {
  return {
    session: createSession(),
    aborted: false,
    totalElapsedMs: 3600000, // 60 min
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSummaryBody', () => {
  it('produces correct H1 with contest title', () => {
    const body = buildSummaryBody(buildArgs());
    expect(body).toMatch(/^# Weekly Contest 400\n/);
  });

  it('Results table has correct headers', () => {
    const body = buildSummaryBody(buildArgs());
    expect(body).toContain('| Problem | Difficulty | Verdict | Time | Points |');
    expect(body).toContain('| ------- | ---------- | ------- | ---- | ------ |');
  });

  it('Score line sums only accepted problem credits', () => {
    const body = buildSummaryBody(buildArgs());
    // accepted: problem-a (3) + problem-d (7) = 10
    // total: 3 + 5 + 5 + 7 = 20
    expect(body).toContain('**Score:** 10/20 (2/4 solved)');
  });

  it('Duration line formats correctly', () => {
    const body = buildSummaryBody(buildArgs({ totalElapsedMs: 330000 })); // 5m 30s
    expect(body).toContain('**Duration:** 5m 30s');
  });

  it('Aborted marker included when aborted=true', () => {
    // totalElapsed = 3600000ms (60 min), duration = 5400s (90 min)
    // remaining = 5400*1000 - 3600000 = 1800000ms = 30:00
    const body = buildSummaryBody(buildArgs({ aborted: true }));
    expect(body).toContain('**(aborted at 30:00 remaining)**');
  });

  it('Aborted marker absent when aborted=false', () => {
    const body = buildSummaryBody(buildArgs({ aborted: false }));
    expect(body).not.toContain('aborted at');
  });

  it('Each problem row has wikilink to slug', () => {
    const body = buildSummaryBody(buildArgs());
    expect(body).toContain('[[problem-a]]');
    expect(body).toContain('[[problem-b]]');
    expect(body).toContain('[[problem-c]]');
    expect(body).toContain('[[problem-d]]');
  });

  it('Problem rows have correct difficulty words', () => {
    const body = buildSummaryBody(buildArgs());
    const lines = body.split('\n');
    const problemARow = lines.find((l) => l.includes('[[problem-a]]'))!;
    expect(problemARow).toContain('Easy');
    const problemDRow = lines.find((l) => l.includes('[[problem-d]]'))!;
    expect(problemDRow).toContain('Hard');
  });

  it('Problem rows have correct verdict words', () => {
    const body = buildSummaryBody(buildArgs());
    const lines = body.split('\n');
    const problemARow = lines.find((l) => l.includes('[[problem-a]]'))!;
    expect(problemARow).toContain('Accepted');
    const problemBRow = lines.find((l) => l.includes('[[problem-b]]'))!;
    expect(problemBRow).toContain('Attempted');
    const problemCRow = lines.find((l) => l.includes('[[problem-c]]'))!;
    expect(problemCRow).toContain('Unsolved');
  });

  it('Accepted problems show solve time, others show dash', () => {
    const body = buildSummaryBody(buildArgs());
    const lines = body.split('\n');
    const problemARow = lines.find((l) => l.includes('[[problem-a]]'))!;
    // 5 min after start → "5m 0s"
    expect(problemARow).toContain('5m 0s');
    const problemBRow = lines.find((l) => l.includes('[[problem-b]]'))!;
    expect(problemBRow).toMatch(/—/); // em-dash
  });

  it('Accepted problems show credit points, others show 0', () => {
    const body = buildSummaryBody(buildArgs());
    const lines = body.split('\n');
    const problemARow = lines.find((l) => l.includes('[[problem-a]]'))!;
    expect(problemARow).toMatch(/\| 3 \|$/);
    const problemBRow = lines.find((l) => l.includes('[[problem-b]]'))!;
    expect(problemBRow).toMatch(/\| 0 \|$/);
  });

  it('Contains ## Notes heading for user reflection', () => {
    const body = buildSummaryBody(buildArgs());
    expect(body).toContain('## Notes');
  });

  it('Contains ## Results heading', () => {
    const body = buildSummaryBody(buildArgs());
    expect(body).toContain('## Results');
  });
});
