// tests/graph/submissionHistoryClient.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-27 / D-28 / D-29 + D-06 (session-expiry).
// Target: src/graph/submissionHistoryClient.ts (created in Wave 1) —
// exports listSubmissionsForSlug + detailForSubmission.
//
// Mirrors the vi.mock boundary pattern in tests/solve/leetcodeRest.test.ts —
// throttledRequestUrl and isSessionExpired are mocked at the module boundary
// so these tests exercise the mapper + session-expiry guard without spinning
// up the real fetcher pipe.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionExpiredError } from '../../src/shared/errors';
import { loadListFixture, loadDetailFixture } from './mocks/fakeSubmissionHistoryFetcher';

interface MockRequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
  arrayBuffer?: ArrayBuffer;
}

const mockThrottledRequestUrl = vi.fn<(arg: unknown) => Promise<MockRequestUrlResponse>>(
  async () => ({ status: 200, headers: {}, text: '{}', json: {} }),
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

const COOKIES = {
  LEETCODE_SESSION: 'sess-abc-123',
  csrftoken: 'csrf-xyz-789',
};

describe('submissionHistoryClient (D-27, D-28, D-29, D-30)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
    mockIsSessionExpired.mockReturnValue(false);
  });

  it('list calls questionSubmissionList GraphQL', async () => {
    // Drive listSubmissionsForSlug against the live-captured GraphQL list
    // fixture. The mapper must normalise `questionSubmissionList.submissions`
    // into SubmissionRow[]. Transport: POST /graphql/ with JSON body containing
    // operationName='submissionList', query (questionSubmissionList), and
    // variables {offset, limit, lastKey, questionSlug}.
    const fixtureJson = loadListFixture('list-many.graphql');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(fixtureJson),
      json: fixtureJson,
    });

    const { listSubmissionsForSlug } = await import('../../src/graph/submissionHistoryClient');
    const rows = await listSubmissionsForSlug('two-sum', COOKIES);

    // Request shape — POST /graphql/, JSON body, D-29 revised headers.
    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
      throw: boolean;
    };
    expect(call.url).toBe('https://leetcode.com/graphql/');
    expect(call.method).toBe('POST');
    expect(call.throw).toBe(false);
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers['x-csrftoken']).toBe('csrf-xyz-789');
    expect(call.headers['cookie']).toContain('LEETCODE_SESSION=sess-abc-123');

    const body = JSON.parse(call.body) as {
      operationName: string;
      query: string;
      variables: { questionSlug: string };
    };
    expect(body.operationName).toBe('submissionList');
    expect(body.query).toContain('questionSubmissionList');
    expect(body.variables.questionSlug).toBe('two-sum');

    // Response shape — at least one row, each with the normalised mapper fields.
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.id).toBe('string');
      expect(typeof row.statusDisplay).toBe('string');
      expect(typeof row.lang).toBe('string');
      expect(typeof row.timestamp).toBe('number');
    }
  });

  it('detail calls submissionDetails GraphQL', async () => {
    // Drive detailForSubmission against the live-captured GraphQL detail
    // fixture. Transport: POST /graphql/ with operationName='submissionDetails',
    // query submissionDetails($submissionId: Int!). The submissionId variable
    // MUST be an Int (LC enforces) — client parses the id string and passes
    // a number. Referer MUST be /submissions/detail/{id}/ per D-29 revised.
    const fixtureJson = loadDetailFixture('detail-ac.graphql');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(fixtureJson),
      json: fixtureJson,
    });

    const { detailForSubmission } = await import('../../src/graph/submissionHistoryClient');
    const detail = await detailForSubmission('123456789', COOKIES);

    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(call.url).toBe('https://leetcode.com/graphql/');
    expect(call.method).toBe('POST');
    expect(call.headers['referer']).toBe('https://leetcode.com/submissions/detail/123456789/');

    const body = JSON.parse(call.body) as {
      operationName: string;
      query: string;
      variables: { submissionId: number };
    };
    expect(body.operationName).toBe('submissionDetails');
    expect(body.query).toContain('submissionDetails($submissionId: Int!)');
    expect(body.variables.submissionId).toBe(123456789);
    expect(typeof body.variables.submissionId).toBe('number');

    // Response shape — parsed submissionDetails object with expected keys.
    expect(detail).toBeDefined();
    expect(detail).toEqual(expect.any(Object));
  });

  it('detail rejects non-numeric submission id', async () => {
    // T-04-03-02 — the client MUST guard against non-numeric ids before any
    // network call. `submissionId` is typed Int! on LC's schema, but the
    // guard also blocks path-injection attempts like '../../admin' from
    // reaching requestUrl.
    const { detailForSubmission } = await import('../../src/graph/submissionHistoryClient');
    await expect(detailForSubmission('not-a-number', COOKIES)).rejects.toBeInstanceOf(Error);
    await expect(detailForSubmission('../../admin', COOKIES)).rejects.toBeInstanceOf(Error);
    await expect(detailForSubmission('', COOKIES)).rejects.toBeInstanceOf(Error);
    // No network call should have been attempted.
    expect(mockThrottledRequestUrl).not.toHaveBeenCalled();
  });

  it('list fires SessionExpiredError on JSON 401', async () => {
    // D-30 signal (a) — HTTP 401 with JSON body
    // `{detail: 'Authentication credentials were not provided.'}`.
    const expiredJson = loadListFixture('list-session-expired');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 401,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(expiredJson),
      json: expiredJson,
    });
    mockIsSessionExpired.mockReturnValue(true);

    const { listSubmissionsForSlug } = await import('../../src/graph/submissionHistoryClient');
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('list fires SessionExpiredError on 403 bare', async () => {
    // D-30 signal (b) — HTTP 403 with no body (LC's GraphQL auth-failure
    // status-only shape, seen on expired csrftoken).
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 403,
      headers: {},
      text: '',
      json: null,
    });
    mockIsSessionExpired.mockReturnValue(true);

    const { listSubmissionsForSlug } = await import('../../src/graph/submissionHistoryClient');
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('detail fires SessionExpiredError on 200 with errors[] auth message', async () => {
    // D-30 signal (c) — HTTP 200 with GraphQL `errors[]` containing an
    // auth-ish message. GraphQL returns 200 on most auth failures with the
    // error reported in the body, so status-only detection misses it.
    const authErrorBody = {
      data: null,
      errors: [
        { message: 'Authentication credentials were not provided.', path: ['submissionDetails'] },
      ],
    };
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(authErrorBody),
      json: authErrorBody,
    });
    mockIsSessionExpired.mockReturnValue(true);

    const { detailForSubmission } = await import('../../src/graph/submissionHistoryClient');
    await expect(detailForSubmission('123456789', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });
});
