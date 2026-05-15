// tests/solve/submissionOrchestrator.test.ts
// RED baseline (Wave 0) — will fail until Plan 05 ships
// src/solve/submissionOrchestrator.ts.
//
// Contracts under test:
//   D-24: single-flight (second submit while first in flight → Notice + abort)
//   SOLVE-09: current-content-at-submit invariant — orchestrator re-reads
//     the note body at submit() invocation, not cached at construction
//   D-04: no fenced code block → Notice + abort, no network call
//   D-27: session expiry → close modal + fire Phase 1 Notice
//   Exact Notice copy enforced here so Plan 05 can't drift.
import { describe, it, expect, vi } from 'vitest';
import { makeFakeFetcher } from './mocks/fakeFetcher';
import { makeFakeSettingsStore, makeDetailCacheEntry } from './mocks/fakeSettingsStore';

const noticeSpy = vi.fn();
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Notice: class { constructor(msg: string, ms?: number) { noticeSpy(msg, ms); } },
  };
});

 
import { SubmissionOrchestrator } from '../../src/solve/submissionOrchestrator';

describe('submissionOrchestrator (D-24, D-04, D-27, SOLVE-09)', () => {
  it('D-24: single-flight — second submit while first in flight fires exact Notice and does NOT call fetcher again', async () => {
    noticeSpy.mockClear();
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    // Queue a slow response so the first submit is "in flight" during the second call.
    ff.queue(/\/submit\/$/, [{ status: 200, json: { submission_id: 42 } }]);
    ff.queue(/check\/$/, [{ status: 200, json: { state: 'STARTED' } }]);
    const getBody = () => '## Code\n\n```python3\nclass Solution: pass\n```\n';
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      getCurrentBody: getBody,
    });
    void orch.submit();
    await orch.submit();
    // Exact Notice copy for D-24 single-flight:
    const matched = noticeSpy.mock.calls.find(([msg]) =>
      String(msg).includes('A submission is already in progress. Cancel it first or wait for the verdict.')
    );
    expect(matched).toBeDefined();
    // Fetcher called exactly ONCE for submit (second submit blocked).
    const submitCalls = ff.spy.mock.calls.filter(([p]) =>
      typeof p.url === 'string' && p.url.endsWith('/submit/')
    );
    expect(submitCalls.length).toBe(1);
  });

  it('D-04: no fenced code block → exact Notice "No code block found. Add a fenced block with your solution." and no fetcher call', async () => {
    noticeSpy.mockClear();
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    const getBody = () => '## Problem\njust text, no code\n\n## Notes\n\n';
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      getCurrentBody: getBody,
    });
    await orch.submit();
    const matched = noticeSpy.mock.calls.find(([msg]) =>
      String(msg).includes('No code block found. Add a fenced block with your solution.')
    );
    expect(matched).toBeDefined();
    expect(ff.spy).not.toHaveBeenCalled();
  });

  it('no active problem note → exact Notice "Open a LeetCode problem note first."', async () => {
    noticeSpy.mockClear();
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore();
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: null, // no active problem note
      getCurrentBody: () => '',
    });
    await orch.submit();
    const matched = noticeSpy.mock.calls.find(([msg]) =>
      String(msg).includes('Open a LeetCode problem note first.')
    );
    expect(matched).toBeDefined();
    expect(ff.spy).not.toHaveBeenCalled();
  });

  it('SOLVE-09: submit() re-reads note body at invocation time (current-content-at-submit)', async () => {
    noticeSpy.mockClear();
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    ff.queue(/\/submit\/$/, [{ status: 200, json: { submission_id: 42 } }]);
    ff.queue(/check\/$/, [{ status: 200, json: { state: 'STARTED' } }]);
    let currentBody = '## Code\n\n```python3\nold\n```\n';
    const getBody = () => currentBody;
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      getCurrentBody: getBody,
    });
    // Modify body between orchestrator construction and submit().
    currentBody = '## Code\n\n```python3\nnew\n```\n';
    void orch.submit();
    // Allow the submit call to land.
    await new Promise((r) => window.setTimeout(r, 0));
    const submitCall = ff.spy.mock.calls.find(([p]) =>
      typeof p.url === 'string' && p.url.endsWith('/submit/')
    );
    expect(submitCall).toBeDefined();
    const sentBody = JSON.parse(submitCall![0].body as string) as Record<string, unknown>;
    expect(sentBody.typed_code).toBe('new');
  });

  it('D-27: session-expiry (401) → Notice "LeetCode session expired. Log in again."', async () => {
    // Phase 5 Plan 03 D-21 migrated session-expired Notices to a
    // DocumentFragment-based helper (showSessionExpiredNotice). The CF-04
    // LOCKED copy still appears verbatim inside the fragment — this test
    // accepts either the legacy string form or the new DocumentFragment form
    // and asserts the copy appears in either.
    noticeSpy.mockClear();
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    ff.queue(/\/submit\/$/, [{ status: 401, json: { error: 'unauth' } }]);
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      getCurrentBody: () => '## Code\n\n```python3\npass\n```\n',
    });
    await orch.submit();
    const matched = noticeSpy.mock.calls.find(([msg]) => {
      if (typeof msg === 'string') {
        return msg.includes('LeetCode session expired. Log in again.');
      }
      if (msg instanceof DocumentFragment) {
        const host = document.createElement('div');
        host.appendChild(msg.cloneNode(true));
        return host.textContent?.includes('LeetCode session expired. Log in again.') === true;
      }
      return false;
    });
    expect(matched).toBeDefined();
  });

  it('cancel() during pending poll rejects the submit promise with AbortError', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    ff.queue(/\/submit\/$/, [{ status: 200, json: { submission_id: 42 } }]);
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: { state: 'STARTED' } },
    ]);
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      getCurrentBody: () => '## Code\n\n```python3\npass\n```\n',
    });
    const p = orch.submit();
    orch.cancel();
    await expect(p).rejects.toThrow(/abort/i);
  });
});
