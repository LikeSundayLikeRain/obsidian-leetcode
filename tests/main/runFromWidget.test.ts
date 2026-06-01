// tests/main/runFromWidget.test.ts
//
// Phase 20 Plan 20-10 Task 5 (gap-closure T7 — Run/Submit "No code block found").
//
// Per .planning/debug/widget-plugin-handoff-cluster.md, Run/Submit from the
// v1.3 widget action row currently feeds widget.view.state.doc.toString()
// (raw code, no fences) into orchestrator helpers that require markdown-
// wrapped fences (extractFirstFencedBlock at codeExtractor.ts:46). The
// extractor returns null → the "No code block found." Notice fires →
// LC API never called.
//
// Plan 20-10 Task 5 refactors `runInterpretedInput` to accept an optional
// `ctx.currentCode` field and `submissionOrchestrator` to accept an optional
// `getCurrentCode` dep. When supplied, both skip extractFirstFencedBlock and
// use the raw code directly. The legacy *FromActive path (no currentCode)
// continues to use extractFirstFencedBlock byte-for-byte.
//
// Phase 22 dead-code TODO markers point at the deletion sites for the
// mechanical sweep that retires *FromActive.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  const noticeCalls: Array<{ message: string; timeout?: number }> = [];
  class Notice {
    message: string;
    timeout?: number;
    constructor(message: string, timeout?: number) {
      this.message = message;
      this.timeout = timeout;
      noticeCalls.push({ message, timeout });
    }
  }
  return { ...actual, Notice, __noticeCalls: noticeCalls };
});

async function getNoticeCalls(): Promise<Array<{ message: string; timeout?: number }>> {
  const obsidian = (await import('obsidian')) as unknown as {
    __noticeCalls: Array<{ message: string; timeout?: number }>;
  };
  return obsidian.__noticeCalls;
}

describe('Phase 22 dead-code TODO markers (Plan 20-10 Task 5)', () => {
  it('src/main.ts has a TODO Phase 22 marker near runInterpretedInput extractFirstFencedBlock fall-through', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/main.ts'),
      'utf-8',
    );
    // Find runInterpretedInput body and check for the TODO Phase 22 marker.
    const start = src.indexOf('private async runInterpretedInput(');
    expect(start).toBeGreaterThan(0);
    // Look for the marker within a window of 4000 chars after the fn start.
    const window = src.slice(start, start + 4000);
    expect(window).toMatch(/TODO Phase 22/);
    expect(window).toMatch(/extractFirstFencedBlock|currentBody/);
  });

  it('src/solve/submissionOrchestrator.ts has a TODO Phase 22 marker near submit()'+
    ' extractFirstFencedBlock fall-through', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/solve/submissionOrchestrator.ts'),
      'utf-8',
    );
    expect(src).toMatch(/TODO Phase 22/);
    // The marker must reference the legacy fall-through site.
    const todoIdx = src.indexOf('TODO Phase 22');
    const window = src.slice(todoIdx, todoIdx + 600);
    expect(window).toMatch(/extractFirstFencedBlock|getCurrentBody|getCurrentCode/);
  });
});

describe('SubmissionOrchestrator — getCurrentCode seam (Plan 20-10 Task 5 / T7 fix)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (await getNoticeCalls()).length = 0;
  });

  it('Test 3: when getCurrentCode is supplied, submit() reaches LC /submit/ with raw code (no extractFirstFencedBlock gate)', async () => {
    const { SubmissionOrchestrator } = await import(
      '../../src/solve/submissionOrchestrator'
    );
    const { makeFakeFetcher } = await import('../solve/mocks/fakeFetcher');
    const { makeFakeSettingsStore, makeDetailCacheEntry } = await import(
      '../solve/mocks/fakeSettingsStore'
    );

    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    ff.queue(/\/submit\/$/, [
      { status: 200, json: { submission_id: 42 } },
    ]);
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'SUCCESS', status_code: 10 } },
    ]);

    // Raw code — no fences. The legacy path would Notice + abort.
    const RAW_CODE = 'class Solution: pass';
    const orch = new (SubmissionOrchestrator as unknown as new (deps: unknown) => {
      submit(): Promise<void>;
    })({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      lcLanguage: 'python3',
      // Legacy path — body without fences would fail extractFirstFencedBlock
      // but the new getCurrentCode seam bypasses that.
      getCurrentBody: () => RAW_CODE,
      getCurrentCode: () => RAW_CODE,
    });

    await orch.submit();

    const submitCall = ff.spy.mock.calls.find(([p]) =>
      typeof p.url === 'string' && p.url.endsWith('/submit/'),
    );
    expect(submitCall).toBeDefined();
    const sentBody = JSON.parse(submitCall![0].body as string) as Record<string, unknown>;
    // typed_code === raw widget body (no fences).
    expect(sentBody.typed_code).toBe(RAW_CODE);
    expect(sentBody.lang).toBe('python3');
  });

  it('Test 4: legacy path (no getCurrentCode) still runs extractFirstFencedBlock — markdown body required', async () => {
    const { SubmissionOrchestrator } = await import(
      '../../src/solve/submissionOrchestrator'
    );
    const { makeFakeFetcher } = await import('../solve/mocks/fakeFetcher');
    const { makeFakeSettingsStore, makeDetailCacheEntry } = await import(
      '../solve/mocks/fakeSettingsStore'
    );

    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    ff.queue(/\/submit\/$/, [
      { status: 200, json: { submission_id: 42 } },
    ]);
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'SUCCESS', status_code: 10 } },
    ]);

    const FENCED = '## Code\n\n```python3\nLEGACY_CODE\n```\n';
    const orch = new (SubmissionOrchestrator as unknown as new (deps: unknown) => {
      submit(): Promise<void>;
    })({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      // NO getCurrentCode — legacy path runs.
      getCurrentBody: () => FENCED,
    });

    await orch.submit();

    const submitCall = ff.spy.mock.calls.find(([p]) =>
      typeof p.url === 'string' && p.url.endsWith('/submit/'),
    );
    expect(submitCall).toBeDefined();
    const sentBody = JSON.parse(submitCall![0].body as string) as Record<string, unknown>;
    // Legacy path extracts code from inside the fence.
    expect(sentBody.typed_code).toBe('LEGACY_CODE');
  });

  it('Test 6: empty widget body via getCurrentCode → Notice + no LC API call', async () => {
    const { SubmissionOrchestrator } = await import(
      '../../src/solve/submissionOrchestrator'
    );
    const { makeFakeFetcher } = await import('../solve/mocks/fakeFetcher');
    const { makeFakeSettingsStore, makeDetailCacheEntry } = await import(
      '../solve/mocks/fakeSettingsStore'
    );

    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });

    const orch = new (SubmissionOrchestrator as unknown as new (deps: unknown) => {
      submit(): Promise<void>;
    })({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      lcLanguage: 'python3',
      getCurrentBody: () => '',
      getCurrentCode: () => '   \n   ',  // whitespace only
    });

    await orch.submit();

    const submitCalls = ff.spy.mock.calls.filter(([p]) =>
      typeof p.url === 'string' && p.url.endsWith('/submit/'),
    );
    expect(submitCalls.length).toBe(0);

    // Some Notice fires informing the user.
    const calls = await getNoticeCalls();
    expect(calls.length).toBeGreaterThan(0);
    // Match either the legacy "No code block found" copy OR the new
    // "Add code to your solution" copy — both gates produce a Notice.
    const matched = calls.some((c) =>
      c.message.includes('No code block') ||
      c.message.toLowerCase().includes('add code'),
    );
    expect(matched).toBe(true);
  });
});

describe('runInterpretedInput — ctx.currentCode seam (Plan 20-10 Task 5 / T7 fix)', () => {
  it('Source-level invariant: ProblemContext shape has been extended with optional currentCode field', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/main.ts'),
      'utf-8',
    );
    // The interface declaration must include the new currentCode field.
    const interfaceIdx = src.indexOf('interface ProblemContext');
    expect(interfaceIdx).toBeGreaterThan(0);
    // Find the closing brace of the interface.
    const closeIdx = src.indexOf('}', interfaceIdx);
    expect(closeIdx).toBeGreaterThan(interfaceIdx);
    const block = src.slice(interfaceIdx, closeIdx);
    expect(block).toMatch(/currentCode\s*\??\s*:/);
  });

  it('Source-level invariant: runInterpretedInput body uses ctx.currentCode when present', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/main.ts'),
      'utf-8',
    );
    const fnIdx = src.indexOf('private async runInterpretedInput(');
    expect(fnIdx).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n  }\n', fnIdx);
    expect(fnEnd).toBeGreaterThan(fnIdx);
    const body = src.slice(fnIdx, fnEnd);
    // The function body references ctx.currentCode (the new short-circuit).
    expect(body).toMatch(/ctx\.currentCode/);
  });

  it('Source-level invariant: runFromWidget supplies currentCode to the synthesized ctx', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/main.ts'),
      'utf-8',
    );
    const fnIdx = src.indexOf('async runFromWidget(');
    expect(fnIdx).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n  }\n', fnIdx);
    expect(fnEnd).toBeGreaterThan(fnIdx);
    const body = src.slice(fnIdx, fnEnd);
    // The synthesized ctx must include `currentCode:` so runInterpretedInput
    // takes the short-circuit instead of the legacy extractFirstFencedBlock
    // path on raw widget code.
    expect(body).toMatch(/currentCode\s*:/);
  });

  it('Source-level invariant: submitFromWidget supplies getCurrentCode to submitWithCode', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/main.ts'),
      'utf-8',
    );
    const fnIdx = src.indexOf('async submitFromWidget(');
    expect(fnIdx).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n  }\n', fnIdx);
    expect(fnEnd).toBeGreaterThan(fnIdx);
    const body = src.slice(fnIdx, fnEnd);
    expect(body).toMatch(/getCurrentCode\s*[:=]/);
  });
});
