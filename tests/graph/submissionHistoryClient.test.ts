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

describe('submissionHistoryClient (D-27, D-28, D-29)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
    mockIsSessionExpired.mockReturnValue(false);
  });

  it('list maps wire shape', async () => {
    // Drive listSubmissionsForSlug against the live-captured list-many fixture.
    // The mapper must normalise LC's submissions_dump rows → SubmissionRow[].
    const fixtureJson = loadListFixture('list-many');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: {},
      text: JSON.stringify(fixtureJson),
      json: fixtureJson,
    });

    const { listSubmissionsForSlug } = await import('../../src/graph/submissionHistoryClient');
    const rows = await listSubmissionsForSlug('two-sum', COOKIES);

    // Request shape — /api/submissions/{slug}, GET, auth headers.
    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      throw: boolean;
    };
    expect(call.url).toBe('https://leetcode.com/api/submissions/two-sum');
    expect(call.method).toBe('GET');
    expect(call.throw).toBe(false);
    expect(call.headers['cookie']).toContain('LEETCODE_SESSION=sess-abc-123');
    expect(call.headers['referer']).toBe('https://leetcode.com/problems/two-sum/description/');

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

  it('detail scrapes pageData', async () => {
    // Drive detailForSubmission against the live-captured detail-ac HTML; the
    // scraper must locate the `var pageData = {...}` block and JSON-parse it.
    const html = loadDetailFixture('detail-ac');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      text: html,
      json: {},
    });

    const { detailForSubmission } = await import('../../src/graph/submissionHistoryClient');
    const detail = await detailForSubmission('123456789', 'two-sum', COOKIES);

    const call = mockThrottledRequestUrl.mock.calls[0]?.[0] as { url: string; method: string };
    expect(call.url).toBe('https://leetcode.com/submissions/detail/123456789/');
    expect(call.method).toBe('GET');

    // pageData shape (normalised to JSON) should include submission identifiers.
    expect(detail).toBeDefined();
    expect(detail).toEqual(expect.any(Object));
  });

  it('list fires SessionExpiredError on 302/401/403/login-HTML', async () => {
    const { listSubmissionsForSlug } = await import('../../src/graph/submissionHistoryClient');

    // 302 redirect → session expired
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 302,
      headers: { location: '/accounts/login/' },
      text: '',
      json: null,
    });
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );

    // 401 Unauthorized
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 401,
      headers: {},
      text: '',
      json: null,
    });
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );

    // 403 Forbidden
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 403,
      headers: {},
      text: '',
      json: null,
    });
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );

    // 200 with login-redirect HTML body
    const loginHtml = loadDetailFixture('list-session-expired');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      text: loginHtml,
      json: {},
    });
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('detail fires SessionExpiredError on login-redirect', async () => {
    const { detailForSubmission } = await import('../../src/graph/submissionHistoryClient');
    const loginHtml = loadDetailFixture('list-session-expired');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      text: loginHtml,
      json: {},
    });
    await expect(detailForSubmission('123', 'two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });
});
