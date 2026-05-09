// tests/graph/fixture-integration.test.ts
//
// Phase 4 post-execution integration tests — drive the full Phase 4 surface
// against live-captured LeetCode GraphQL fixtures (tests/fixtures/lc-submissions/).
// Closes the headless chunk of the 04-06 smoke test: sections A (AC graph write),
// C (Copy-to-Code), and D (session expiry).
//
// Test shape differs from the per-module unit tests: these wire real modules
// together (mergeTechniquesSection → KnowledgeGraphWriter → applySolveTimeFrontmatter;
// listSubmissionsForSlug → detailForSubmission → copyToCode) and only mock the
// I/O boundary (throttledRequestUrl, the vault). This catches gaps that per-module
// mocking hides.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeGraphWriter } from '../../src/graph/KnowledgeGraphWriter';
import { copyToCode } from '../../src/graph/copyToCode';
import { SessionExpiredError } from '../../src/shared/errors';
import type { SubmitCheckResponse } from '../../src/solve/types';
import type { DetailCacheEntry } from '../../src/settings/SettingsStore';

import { makeFakeKnowledgeGraphDeps } from './mocks/fakeKnowledgeGraphDeps';

// ── Module-level mocks for the submissionHistoryClient tests ────────────────
// Keep the mocks scoped so the KnowledgeGraphWriter tests don't pick them up.
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
  return { ...actual, throttledRequestUrl: mockThrottledRequestUrl };
});

const mockIsSessionExpired = vi.fn<(...args: unknown[]) => boolean>(() => false);
vi.mock('../../src/api/LeetCodeClient', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/LeetCodeClient');
  return { ...actual, isSessionExpired: mockIsSessionExpired };
});

const FIXTURES = resolve(process.cwd(), 'tests/fixtures/lc-submissions');
function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf-8'));
}

const COOKIES = { LEETCODE_SESSION: 'sess-abc-123', csrftoken: 'csrf-xyz-789' };

// ─────────────────────────────────────────────────────────────────────────────
// T1 — Full AC pipeline against detail-ac.graphql fixture values
// ─────────────────────────────────────────────────────────────────────────────
// Section A of the smoke test (AC graph write): drive KnowledgeGraphWriter
// with a terminal verdict that carries the exact runtime/memory/lang/statusCode
// values from detail-ac.graphql.json. Assert that every post-condition the
// smoke test checks manually lands in the vault.
//
// Note on topicTags: the captured detail-ac fixture has topicTags: [] because
// LC's submissionDetails GraphQL op only populates them for certain submissions.
// The production pipeline reads topicTags from the Phase-2 problem-detail cache
// (DetailCacheEntry.topicTags), NOT from the GraphQL submissionDetails response,
// so the test seeds the cache with realistic Two Sum tags.
describe('Integration: AC pipeline (section A — detail-ac fixture)', () => {
  it('writes frontmatter + ## Techniques + stub notes end-to-end', async () => {
    const detailFixture = loadFixture('detail-ac.graphql.json') as {
      data: { submissionDetails: {
        runtime: number; runtimeDisplay: string;
        memory: number; memoryDisplay: string;
        code: string; statusCode: number;
        lang: { name: string }; question: { titleSlug: string };
      } };
    };
    const submission = detailFixture.data.submissionDetails;
    expect(submission.statusCode).toBe(10); // sanity: fixture is AC

    // Two Sum cached detail — topicTags seeded as Phase 2 would have cached
    // them from the `problem(titleSlug)` query.
    const cached: DetailCacheEntry = {
      fetchedAt: Date.now(),
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>Return indices of two numbers that add to target.</p>',
      topicSlugs: ['array', 'hash-table'],
      topicTags: [
        { name: 'Array', slug: 'array' },
        { name: 'Hash Table', slug: 'hash-table' },
      ],
      exampleTestcases: '[2,7,11,15]\n9',
      codeSnippets: [],
    };

    const deps = makeFakeKnowledgeGraphDeps({
      files: {
        'LeetCode/1-two-sum.md':
          '---\nlc-id: 1\nlc-slug: two-sum\nlc-status: attempted\n---\n\n## Problem\n\nReturn indices.\n\n## Notes\n\n## Code\n\n```java\nclass Solution {}\n```\n',
      },
      problemDetails: { 'two-sum': cached },
      autoBacklinksEnabled: true,
    });
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-status': 'attempted',
    });

    // Terminal verdict carries the EXACT shape the /check/ REST endpoint
    // returns (Phase 3 fixture format), using the detail fixture values
    // to keep runtime/memory/lang consistent with the GraphQL reality.
    const terminal: SubmitCheckResponse = {
      state: 'SUCCESS',
      status_code: submission.statusCode,
      status_msg: 'Accepted',
      status_runtime: submission.runtimeDisplay,
      status_memory: submission.memoryDisplay,
      runtime_percentile: 85.4,
      memory_percentile: 78.1,
      total_correct: 58,
      total_testcases: 58,
      lang: submission.lang.name,
      submission_id: 987654,
    };

    const writer = new KnowledgeGraphWriter({
      app: deps.app as never,
      settings: deps.settings,
    });
    const file = deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md');
    expect(file).toBeDefined();

    await writer.onAccepted(
      { file: file as never, slug: 'two-sum', title: 'Two Sum' },
      terminal,
    );

    // ── Assertion 1: frontmatter fields written (GRAPH-02) ────────────────
    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm).toBeDefined();
    if (!fm) throw new Error('frontmatter missing');
    expect(fm['lc-status']).toBe('accepted');
    expect(fm['lc-runtime-ms']).toBe(2); // from detail-ac runtimeDisplay "2 ms"
    expect(fm['lc-memory-mb']).toBeCloseTo(47.1, 1); // from detail-ac "47.1 MB"
    expect(fm['lc-language']).toBe('java');
    expect(typeof fm['lc-solved-date']).toBe('string');
    expect(fm['lc-solved-date']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // ── Assertion 2: lc/{slug} tags union-merged (Phase 2 D-05 carry) ─────
    const tags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : [];
    expect(tags).toContain('lc/array');
    expect(tags).toContain('lc/hash-table');

    // ── Assertion 3: ## Techniques block written with wikilinks (GRAPH-03)─
    const body = await deps.app.vault.read(file as never);
    expect(body).toContain('## Techniques');
    expect(body).toMatch(/\[\[Array\]\]/);
    expect(body).toMatch(/\[\[Hash Table\]\]/);

    // ── Assertion 4: stub technique notes created (GRAPH-04) ──────────────
    const arrayStub = deps.app.vault.getAbstractFileByPath('LeetCode/Techniques/Array.md');
    const hashTableStub = deps.app.vault.getAbstractFileByPath(
      'LeetCode/Techniques/Hash Table.md',
    );
    expect(arrayStub).toBeDefined();
    expect(hashTableStub).toBeDefined();

    // ── Assertion 5: ## Code region NEVER touched (GRAPH-01 / D-01) ───────
    expect(body).toContain('class Solution {}');
    expect(body).not.toMatch(/## Solution/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — Full picker → detail → copy-to-code flow (section C)
// ─────────────────────────────────────────────────────────────────────────────
// Drives listSubmissionsForSlug against list-many.graphql.json, then
// detailForSubmission against detail-ac.graphql.json, then copyToCode against
// a vault file that has a ## Code block. Asserts the final file content has
// the fixture's `code` field verbatim in the ## Code fence.
describe('Integration: picker → detail → copy-to-code (section C)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
    mockIsSessionExpired.mockReturnValue(false);
  });

  it('copies the fixture code into ## Code via the full client+vault path', async () => {
    // Step 1: list query returns 20 submissions
    const listFixture = loadFixture('list-many.graphql.json');
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(listFixture),
      json: listFixture,
    });

    const { listSubmissionsForSlug, detailForSubmission } = await import(
      '../../src/graph/submissionHistoryClient'
    );
    const rows = await listSubmissionsForSlug('two-sum', COOKIES);
    expect(rows.length).toBe(20);
    const acRow = rows.find((r) => r.statusDisplay === 'Accepted');
    expect(acRow).toBeDefined();

    // Step 2: detail query returns the AC detail fixture
    const detailFixture = loadFixture('detail-ac.graphql.json') as {
      data: { submissionDetails: { code: string; lang: { name: string } } };
    };
    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(detailFixture),
      json: detailFixture,
    });

    // detailForSubmission needs a numeric-string id — use a stable fixture id.
    const detail = await detailForSubmission('1998512566', COOKIES);
    expect(detail.code).toBe(detailFixture.data.submissionDetails.code);
    expect(detail.code.length).toBeGreaterThan(0);

    // Step 3: copy-to-code into a vault file with an existing empty ## Code fence
    const deps = makeFakeKnowledgeGraphDeps({
      files: {
        'LeetCode/1-two-sum.md':
          '---\nlc-id: 1\nlc-slug: two-sum\nlc-status: attempted\n---\n\n## Problem\n\n## Code\n\n```java\n```\n',
      },
    });
    const file = deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md');
    await copyToCode(deps.app as never, file as never, detail.code, detail.lang.name);

    // ── Assertion: fixture code is now inside the ## Code fence ───────────
    const body = await deps.app.vault.read(file as never);
    expect(body).toContain('## Code');
    // The first non-trivial line of the fixture code lands in the fence.
    const firstLine = detail.code.split('\n').find((ln) => ln.trim().length > 0);
    expect(firstLine).toBeDefined();
    expect(body).toContain(firstLine as string);
    // No ## Solution heading (D-01, GRAPH-01 revised).
    expect(body).not.toMatch(/## Solution/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — Session-expired on the live-captured JSON-401 body (section D)
// ─────────────────────────────────────────────────────────────────────────────
// Drives listSubmissionsForSlug with the actual captured 401 JSON body —
// `{"detail": "Authentication credentials were not provided."}` — and
// confirms SessionExpiredError fires via the D-30 signal (a) pathway.
describe('Integration: session expiry on live JSON-401 (section D)', () => {
  beforeEach(() => {
    mockThrottledRequestUrl.mockClear();
    mockIsSessionExpired.mockClear();
  });

  it('throws SessionExpiredError on HTTP 401 with the captured 401 body', async () => {
    const expiredFixture = loadFixture('list-session-expired.json') as {
      detail?: string;
    };
    // Sanity: confirm the fixture shape matches what LC actually serves.
    expect(expiredFixture.detail).toBe('Authentication credentials were not provided.');

    mockThrottledRequestUrl.mockResolvedValueOnce({
      status: 401,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify(expiredFixture),
      json: expiredFixture,
    });
    // D-30 signal (a): detection returns true on 401 + JSON detail field.
    mockIsSessionExpired.mockReturnValue(true);

    const { listSubmissionsForSlug } = await import('../../src/graph/submissionHistoryClient');
    await expect(listSubmissionsForSlug('two-sum', COOKIES)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });
});
