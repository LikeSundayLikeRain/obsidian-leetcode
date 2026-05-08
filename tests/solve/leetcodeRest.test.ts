// tests/solve/leetcodeRest.test.ts
// RED baseline (Wave 0) — will fail until Plan 04 ships
// src/solve/leetcodeRest.ts with interpretSolution / submitSolution / checkSubmission.
//
// Contracts under test:
//   D-21: exact REST URL shape for interpret/submit/check
//   D-22: exact request body fields + judge_type='large' on submit only
//   D-26: 3 consecutive non-2xx → JudgeTimeoutError (surfaced to polling)
//   D-27: 302/401/403 → SessionExpiredError (session-expiry dispatch)
//   Pitfall 4 / RESEARCH §Pattern 1: headers include cookie + x-csrftoken + referer
//   D-14: 429 → RateLimitError
//
// Uses makeFakeFetcher (Task 4) and makeFakeSettingsStore (Task 5).
import { describe, it, expect } from 'vitest';
import { makeFakeFetcher } from './mocks/fakeFetcher';
import { makeFakeSettingsStore } from './mocks/fakeSettingsStore';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 04
import {
  interpretSolution,
  submitSolution,
  checkSubmission,
} from '../../src/solve/leetcodeRest';
import { SessionExpiredError, RateLimitError } from '../../src/shared/errors';

describe('leetcodeRest.interpretSolution (D-21, D-22, Pitfall 4)', () => {
  it('POSTs to https://leetcode.com/problems/{slug}/interpret_solution/ with exact body shape', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/interpret_solution/, [{ status: 200, json: { interpret_id: 'runcode_1' } }]);
    await interpretSolution({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      questionId: '1',
      lang: 'python3',
      typedCode: 'class Solution: pass',
      dataInput: '[2,7,11,15]\n9',
    });
    expect(ff.spy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://leetcode.com/problems/two-sum/interpret_solution/',
        method: 'POST',
      })
    );
    const sent = ff.spy.mock.calls[0]![0];
    const body = JSON.parse(sent.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      lang: 'python3',
      question_id: '1',
      test_mode: false,
      typed_code: 'class Solution: pass',
      data_input: '[2,7,11,15]\n9',
    });
    // interpret_solution does NOT carry judge_type
    expect(body.judge_type).toBeUndefined();
  });

  it('sends cookie + x-csrftoken + referer headers (Pattern 1 + Pitfall 4)', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/interpret_solution/, [{ status: 200, json: { interpret_id: 'x' } }]);
    await interpretSolution({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      questionId: '1',
      lang: 'python3',
      typedCode: '',
      dataInput: '',
    });
    const sent = ff.spy.mock.calls[0]![0];
    const headers = sent.headers as Record<string, string>;
    expect(headers['cookie']).toBe('csrftoken=test-csrf; LEETCODE_SESSION=test-session;');
    expect(headers['x-csrftoken']).toBe('test-csrf');
    expect(headers['referer']).toBe('https://leetcode.com/problems/two-sum/description/');
  });

  it('D-27: 302 redirect throws SessionExpiredError', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/interpret_solution/, [
      { status: 302, headers: { location: '/accounts/login/' }, text: '' },
    ]);
    await expect(
      interpretSolution({
        fetcher: ff.fetcher,
        settings,
        slug: 'two-sum',
        questionId: '1',
        lang: 'python3',
        typedCode: '',
        dataInput: '',
      })
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('D-27: 401 throws SessionExpiredError', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/interpret_solution/, [{ status: 401, json: { error: 'unauthorized' } }]);
    await expect(
      interpretSolution({
        fetcher: ff.fetcher,
        settings,
        slug: 'two-sum',
        questionId: '1',
        lang: 'python3',
        typedCode: '',
        dataInput: '',
      })
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('D-14: 429 throws RateLimitError', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/interpret_solution/, [
      { status: 429, headers: { 'retry-after': '5' }, text: '' },
    ]);
    await expect(
      interpretSolution({
        fetcher: ff.fetcher,
        settings,
        slug: 'two-sum',
        questionId: '1',
        lang: 'python3',
        typedCode: '',
        dataInput: '',
      })
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('missing interpret_id in 200 response throws a clear Error', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/interpret_solution/, [{ status: 200, json: {} }]);
    await expect(
      interpretSolution({
        fetcher: ff.fetcher,
        settings,
        slug: 'two-sum',
        questionId: '1',
        lang: 'python3',
        typedCode: '',
        dataInput: '',
      })
    ).rejects.toThrow();
  });
});

describe('leetcodeRest.submitSolution (D-21, D-22)', () => {
  it('POSTs to https://leetcode.com/problems/{slug}/submit/ with judge_type="large"', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/\/submit\/$/, [{ status: 200, json: { submission_id: 42 } }]);
    await submitSolution({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      questionId: '1',
      lang: 'python3',
      typedCode: 'class Solution: pass',
    });
    const sent = ff.spy.mock.calls[0]![0];
    expect(sent.url).toBe('https://leetcode.com/problems/two-sum/submit/');
    const body = JSON.parse(sent.body as string) as Record<string, unknown>;
    expect(body.judge_type).toBe('large');
    expect(body.lang).toBe('python3');
    expect(body.question_id).toBe('1');
    expect(body.typed_code).toBe('class Solution: pass');
    // submit does NOT carry data_input
    expect(body.data_input).toBeUndefined();
  });
});

describe('leetcodeRest.checkSubmission (D-21)', () => {
  it('GETs https://leetcode.com/submissions/detail/{id}/check/', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    ff.queue(/check\/$/, [{ status: 200, json: { state: 'STARTED' } }]);
    await checkSubmission({ fetcher: ff.fetcher, settings, submissionId: '42', slug: 'two-sum' });
    const sent = ff.spy.mock.calls[0]![0];
    expect(sent.url).toBe('https://leetcode.com/submissions/detail/42/check/');
    expect(sent.method ?? 'GET').toBe('GET');
  });
});
