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
  /** LC acceptance rate as a 0-100 percentage. Optional so legacy cached indexes
   *  (pre-acceptance-rate population) and test fixtures still type-check. */
  acRate?: number;
  /** LC topic tag slugs (e.g. ['array', 'hash-table']). Populated from
   *  q.topicTags[].slug in the problemsetQuestionList response. Optional so
   *  pre-topics cached indexes continue to type-check — filter treats `undefined`
   *  as "no topics known" (row never matches a topic filter). */
  topics?: string[];
}

export interface ProblemIndex {
  fetchedAt: number;
  problems: IndexedProblem[];
}
