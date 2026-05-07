export interface IndexedProblem {
  id: number;                       // questionFrontendId parsed to number
  slug: string;                     // titleSlug
  title: string;
  diff: 'Easy' | 'Medium' | 'Hard';
  paid: boolean;
  /**
   * User progress from LC's problemsetQuestionList response (Plan 05 populates).
   * 'solved'    → q.status === 'ac'
   * 'attempted' → q.status === 'notac'
   * 'untouched' → q.status is null / missing
   * Optional so Plan 02's tests that construct fixtures without status continue to type-check.
   */
  status?: 'solved' | 'attempted' | 'untouched';
}

export interface ProblemIndex {
  fetchedAt: number;
  problems: IndexedProblem[];
}
