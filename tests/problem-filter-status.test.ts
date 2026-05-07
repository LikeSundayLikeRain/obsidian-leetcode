import { describe, it, expect, beforeEach } from 'vitest';
import { ProblemListService } from '../src/browse/ProblemListService';
import type { IndexedProblem } from '../src/browse/types';

// Fixture mixes all three status states PLUS one undefined-status row (Plan 01 types
// `status?` as optional — `undefined` MUST fall into the 'untouched' bucket).
const FIXTURE: IndexedProblem[] = [
  { id: 1,  slug: 'two-sum',             title: 'Two Sum',              diff: 'Easy',   paid: false, status: 'solved' },
  { id: 2,  slug: 'add-two-numbers',     title: 'Add Two Numbers',      diff: 'Medium', paid: false, status: 'attempted' },
  { id: 3,  slug: 'longest-substring',   title: 'Longest Substring',    diff: 'Medium', paid: false, status: 'untouched' },
  { id: 4,  slug: 'median-two-sorted',   title: 'Median of Two Sorted', diff: 'Hard',   paid: false, status: 'solved' },
  { id: 5,  slug: 'reverse-integer',     title: 'Reverse Integer',      diff: 'Easy',   paid: false /* status undefined */ },
];

describe('ProblemListService status filter (BROWSE-04 status dimension)', () => {
  let svc: ProblemListService;
  beforeEach(() => { svc = new ProblemListService(null as never, null as never); });

  it('filter by status solved returns only solved entries', () => {
    const r = svc.filter(FIXTURE, { status: ['solved'] });
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 4]);
  });

  it('filter by status attempted returns only attempted entries', () => {
    const r = svc.filter(FIXTURE, { status: ['attempted'] });
    expect(r.map((p) => p.id)).toEqual([2]);
  });

  it('filter by status untouched includes rows with status === undefined', () => {
    const r = svc.filter(FIXTURE, { status: ['untouched'] });
    // id=3 has status 'untouched'; id=5 has status undefined — both should appear.
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([3, 5]);
  });

  it('multi-select within status (solved + attempted)', () => {
    const r = svc.filter(FIXTURE, { status: ['solved', 'attempted'] });
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 2, 4]);
  });

  it('empty status array applies no status constraint', () => {
    expect(svc.filter(FIXTURE, { status: [] })).toEqual(FIXTURE);
  });

  it('difficulty AND status combine: Easy AND solved returns id=1 only', () => {
    const r = svc.filter(FIXTURE, { difficulty: ['Easy'], status: ['solved'] });
    expect(r.map((p) => p.id)).toEqual([1]);
  });
});
