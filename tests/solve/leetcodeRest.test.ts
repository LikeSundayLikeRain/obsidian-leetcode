// tests/solve/leetcodeRest.test.ts
//
// Phase 3 Plan 04 — verifies the three hand-rolled REST wrappers in
// src/solve/leetcodeRest.ts: interpretSolution, submitSolution, checkSubmission.
//
// Contract pins:
//   - All three POST/GET the exact endpoints documented in RESEARCH.md Pattern 1
//   - All three build headers identical to LeetCodeCLI.authHeaders() verbatim
//   - All three route through Plan 03's throttledRequestUrl (NOT direct requestUrl)
//   - Session-expiry detection is defense-in-depth (status code + HTML body sniff
//     + isSessionExpired fallback — Pitfall 3 + A2)
//   - submit adds judge_type: 'large'; interpret adds test_mode: false + data_input
//   - Missing interpret_id / submission_id → throws Error
//
// This test mocks Plan 03 primitives (throttledRequestUrl, isSessionExpired) at
// vi.mock boundaries; it never loads the real throttle. Integration happens
// after Plan 03 + Plan 04 both merge into the phase branch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionExpiredError } from '../../src/shared/errors';

// --- Mocks for Plan 03 primitives (running in parallel worktree; imports resolve post-merge) ---

interface MockRequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
  arrayBuffer?: ArrayBuffer;
}

const mockThrottledRequestUrl = vi.fn<(arg: unknown) => Promise<MockRequestUrlResponse>>(
  async () => ({ status: 200, headers: {}, text: '{}', json: {} })
);
vi.mock('../../src/api/throttle', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/throttle');
  return {
    ...actual,
    throttledRequestUrl: mockThrottledRequestUrl,
  };
});

const mockIsSessionExpired = vi.fn<(resp: unknown) => boolean>(() => false);
vi.mock('../../src/api/LeetCodeClient', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/LeetCodeClient');
  return {
    ...actual,
    isSessionExpired: mockIsSessionExpired,
  };
});

// Authenticated cookie pair used across tests.
const COOKIES = {
  LEETCODE_SESSION: 'sess-abc-123',
  csrftoken: 'csrf-xyz-789',
};

// Shape matches InterpretArgs / SubmitArgs / CheckArgs from Plan 03's types.ts.
const INTERPRET_ARGS = {
  slug: 'two-sum',
  lang: 'python3',
  questionId: '1',
  typedCode: 'class Solution:\n    def twoSum(self, nums, target): return [0,1]\n',
  dataInput: '[2,7,11,15]\n9',
  cookies: COOKIES,
};

const SUBMIT_ARGS = {
  slug: 'two-sum',
  lang: 'python3',
  questionId: '1',
  typedCode: 'class Solution:\n    def twoSum(self, nums, target): return [0,1]\n',
  cookies: COOKIES,
};

const CHECK_ARGS = {
  id: '123456789',
  slug: 'two-sum',
  cookies: COOKIES,
};

// ──────────────────────────────────────────────────────────────────────────────
//  interpretSolution
// ──────────────────────────────────────────────────────────────────────────────

describe('interpretSolution (SOLVE-03)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
    mockIsSessionExpired.mockReturnValue(false);
  });

  it('POSTs to /problems/{slug}/interpret_solution/ with exact body shape', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"interpret_id":"run-xyz","interpret_expected_id":"run-xyz-expected"}',
      json: { interpret_id: 'run-xyz', interpret_expected_id: 'run-xyz-expected' },
    });

    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    const result = await interpretSolution(INTERPRET_ARGS);

    expect(mockThrottledRequestUrl).toHaveBeenCalledTimes(1);
    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
      throw: boolean;
    };

    expect(call.url).toBe('https://leetcode.com/problems/two-sum/interpret_solution/');
    expect(call.method).toBe('POST');
    expect(call.throw).toBe(false);

    // Body — exact shape per RESEARCH.md Pattern 1:
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).toEqual({
      lang: 'python3',
      question_id: '1',
      test_mode: false,
      typed_code: INTERPRET_ARGS.typedCode,
      data_input: INTERPRET_ARGS.dataInput,
    });

    // Return shape:
    expect(result).toEqual({
      interpret_id: 'run-xyz',
      interpret_expected_id: 'run-xyz-expected',
    });
  });

  it('sends the full header set (cookie + x-csrftoken + referer + content-type)', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"interpret_id":"a"}',
      json: { interpret_id: 'a' },
    });

    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await interpretSolution(INTERPRET_ARGS);

    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      headers: Record<string, string>;
    };
    const headers = call.headers;

    expect(headers['cookie']).toBe('csrftoken=csrf-xyz-789; LEETCODE_SESSION=sess-abc-123;');
    expect(headers['x-csrftoken']).toBe('csrf-xyz-789');
    expect(headers['referer']).toBe('https://leetcode.com/problems/two-sum/description/');
    expect(headers['content-type']).toBe('application/json');
    expect(headers['origin']).toBe('https://leetcode.com');
    expect(headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(typeof headers['user-agent']).toBe('string');
  });

  it('throws SessionExpiredError on HTTP 302', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'https://leetcode.com/accounts/login/' },
      text: '',
      json: null,
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError on HTTP 401', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 401,
      headers: {},
      text: '',
      json: null,
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError on HTTP 403', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 403,
      headers: {},
      text: '',
      json: null,
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError on 200 HTML body with <title>Log In', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      text: '<!doctype html><html><head><title>Log In - LeetCode</title></head><body>...</body></html>',
      // LC returned HTML — json parsing would have thrown, but requestUrl never
      // surfaces that; json ends up {} or the raw string. Simulate with {}.
      json: {},
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError on 200 HTML body with <form action="/accounts/login"', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      text: '<html><body><form action="/accounts/login/" method="post">...</form></body></html>',
      json: {},
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('delegates to isSessionExpired for GraphQL-shaped session errors in body', async () => {
    mockIsSessionExpired.mockReturnValueOnce(true);
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"data":null}',
      json: { data: null },
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
    expect(mockIsSessionExpired).toHaveBeenCalledWith({ data: null });
  });

  it('throws Error with status code on non-2xx (non-auth) response', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 500,
      headers: {},
      text: 'Internal Server Error',
      json: null,
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toThrow(/500/);
  });

  it('throws Error when response missing interpret_id', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"error":"no code"}',
      json: { error: 'no code' },
    });
    const { interpretSolution } = await import('../../src/solve/leetcodeRest');
    await expect(interpretSolution(INTERPRET_ARGS)).rejects.toThrow(/interpret_id/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  submitSolution
// ──────────────────────────────────────────────────────────────────────────────

describe('submitSolution (SOLVE-05)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
    mockIsSessionExpired.mockReturnValue(false);
  });

  it('POSTs to /problems/{slug}/submit/ with judge_type=large and no data_input/test_mode', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"submission_id":987654}',
      json: { submission_id: 987654 },
    });

    const { submitSolution } = await import('../../src/solve/leetcodeRest');
    const result = await submitSolution(SUBMIT_ARGS);

    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      url: string;
      method: string;
      body: string;
      throw: boolean;
    };

    expect(call.url).toBe('https://leetcode.com/problems/two-sum/submit/');
    expect(call.method).toBe('POST');
    expect(call.throw).toBe(false);

    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).toEqual({
      lang: 'python3',
      question_id: '1',
      typed_code: SUBMIT_ARGS.typedCode,
      judge_type: 'large',
    });
    // Negative assertions — these fields are INTERPRET-only:
    expect(body).not.toHaveProperty('data_input');
    expect(body).not.toHaveProperty('test_mode');

    // Return shape — submission_id stringified for uniformity across string|number:
    expect(result).toEqual({ submission_id: '987654' });
  });

  it('accepts submission_id as a string when LC returns one', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"submission_id":"abc-def"}',
      json: { submission_id: 'abc-def' },
    });
    const { submitSolution } = await import('../../src/solve/leetcodeRest');
    const result = await submitSolution(SUBMIT_ARGS);
    expect(result).toEqual({ submission_id: 'abc-def' });
  });

  it('throws SessionExpiredError on HTTP 403', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 403,
      headers: {},
      text: '',
      json: null,
    });
    const { submitSolution } = await import('../../src/solve/leetcodeRest');
    await expect(submitSolution(SUBMIT_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws Error when response missing submission_id', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{}',
      json: {},
    });
    const { submitSolution } = await import('../../src/solve/leetcodeRest');
    await expect(submitSolution(SUBMIT_ARGS)).rejects.toThrow(/submission_id/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
//  checkSubmission
// ──────────────────────────────────────────────────────────────────────────────

describe('checkSubmission (SOLVE-06)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
    mockIsSessionExpired.mockReturnValue(false);
  });

  it('GETs /submissions/detail/{id}/check/ with auth headers', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: '{"state":"PENDING"}',
      json: { state: 'PENDING' },
    });

    const { checkSubmission } = await import('../../src/solve/leetcodeRest');
    const result = await checkSubmission(CHECK_ARGS);

    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      throw: boolean;
    };
    expect(call.url).toBe('https://leetcode.com/submissions/detail/123456789/check/');
    expect(call.method).toBe('GET');
    expect(call.throw).toBe(false);
    // Referer is built from the slug, even though the URL is under /submissions/:
    expect(call.headers['referer']).toBe('https://leetcode.com/problems/two-sum/description/');
    expect(call.headers['x-csrftoken']).toBe('csrf-xyz-789');

    expect(result).toEqual({ state: 'PENDING' });
  });

  it('returns terminal SUCCESS payload verbatim for verdict modal', async () => {
    const verdict = {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      status_runtime: '12 ms',
      status_memory: '14.2 MB',
      runtime_percentile: 85.4,
      memory_percentile: 78.1,
      total_correct: 58,
      total_testcases: 58,
      lang: 'python3',
      submission_id: 987654,
    };
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: JSON.stringify(verdict),
      json: verdict,
    });

    const { checkSubmission } = await import('../../src/solve/leetcodeRest');
    const result = await checkSubmission(CHECK_ARGS);
    expect(result).toEqual(verdict);
  });

  it('throws SessionExpiredError on 302 redirect', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 302,
      headers: { location: '/accounts/login/' },
      text: '',
      json: null,
    });
    const { checkSubmission } = await import('../../src/solve/leetcodeRest');
    await expect(checkSubmission(CHECK_ARGS)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws Error with status code on 500', async () => {
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 500,
      headers: {},
      text: 'server busted',
      json: null,
    });
    const { checkSubmission } = await import('../../src/solve/leetcodeRest');
    await expect(checkSubmission(CHECK_ARGS)).rejects.toThrow(/500/);
  });
});
