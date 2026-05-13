// tests/solve/verdictModalRenderer.test.ts
// RED baseline (Wave 0) — will fail until Plan 06 ships
// src/solve/verdictModalRenderer.ts with renderVerdict.
//
// Contracts under test (D-29, D-30):
//   Each of the 6 verdict types + 2 run responses + 2 synthetic cases
//   (unknown verdict, timeout) produces a specific DOM shape. The fixtures
//   (Task 2) are the authoritative contract — these assertions encode what
//   the shipped modal MUST show.
//
// Uses the fixture JSONs from tests/solve/fixtures/. Modal is stubbed via
// vi.mock('obsidian', ...) — contentEl / titleEl / onOpen / onClose / open /
// close.
import { describe, it, expect, vi } from 'vitest';
import accepted from './fixtures/accepted.json';
import wrongAnswer from './fixtures/wrong-answer.json';
import tle from './fixtures/tle.json';
import mle from './fixtures/mle.json';
import compileError from './fixtures/compile-error.json';
import runtimeError from './fixtures/runtime-error.json';
import runSample from './fixtures/run-sample.json';
import runCustom from './fixtures/run-custom.json';
import runMultiCase from './fixtures/run-multi-case.json';

// Phase 5.4 Plan 01 Task 3 — RED scaffolding for D-01..D-16. The two-sum
// metaData JSON is the canonical D-08 oracle (params: [nums, target]).
const TWO_SUM_META_DATA =
  '{"name":"twoSum","params":[{"name":"nums","type":"integer[]"},{"name":"target","type":"integer"}],"return":{"type":"integer[]"}}';

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  class MockModal {
    titleEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(public app: unknown) {
      this.titleEl = document.createElement('div');
      this.contentEl = document.createElement('div');
    }
    open() { /* no-op */ }
    close() { /* no-op */ }
    onOpen() { /* no-op */ }
    onClose() { /* no-op */ }
  }
  return {
    ...actual,
    Modal: MockModal,
    setIcon: (_el: HTMLElement, _name: string) => undefined,
  };
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 06
import { renderVerdict } from '../../src/solve/verdictModalRenderer';

function renderFixture(fixture: unknown): { titleEl: HTMLElement; contentEl: HTMLElement } {
  const titleEl = document.createElement('div');
  const contentEl = document.createElement('div');
  renderVerdict({ titleEl, contentEl, payload: fixture });
  return { titleEl, contentEl };
}

describe('verdictModalRenderer.renderVerdict (D-29, D-30) — 8 fixtures + 2 synthetic', () => {
  it('accepted.json: title contains "Accepted" and body mentions Accepted', () => {
    const { titleEl, contentEl } = renderFixture(accepted);
    expect(titleEl.textContent).toMatch(/Accepted/i);
    expect(contentEl.textContent).toMatch(/Accepted/i);
  });

  it('wrong-answer.json: body contains Input + Output + Expected sections', () => {
    const { contentEl } = renderFixture(wrongAnswer);
    const text = contentEl.textContent ?? '';
    expect(text).toMatch(/Input/);
    expect(text).toMatch(/Output/);
    expect(text).toMatch(/Expected/);
  });

  it('tle.json: body contains Input section (last_testcase surfaced)', () => {
    const { titleEl, contentEl } = renderFixture(tle);
    expect(titleEl.textContent).toMatch(/Time Limit/i);
    expect(contentEl.textContent).toMatch(/Input/);
  });

  it('mle.json: body contains Input section; title contains Memory Limit', () => {
    const { titleEl, contentEl } = renderFixture(mle);
    expect(titleEl.textContent).toMatch(/Memory Limit/i);
    expect(contentEl.textContent).toMatch(/Input/);
  });

  it('compile-error.json: body contains compile_error text inside a <pre>', () => {
    const { contentEl } = renderFixture(compileError);
    const pre = contentEl.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent ?? '').toMatch(/SyntaxError/);
  });

  it('runtime-error.json: body contains Error + Input sections', () => {
    const { contentEl } = renderFixture(runtimeError);
    const text = contentEl.textContent ?? '';
    expect(text).toMatch(/Error/);
    expect(text).toMatch(/Input/);
  });

  it('run-sample.json: renders code_answer output array', () => {
    const { contentEl } = renderFixture(runSample);
    const text = contentEl.textContent ?? '';
    // Contains at least one of the code_answer entries.
    expect(text).toContain('[0,1]');
  });

  it('run-custom.json: renders code_answer output for user test', () => {
    const { contentEl } = renderFixture(runCustom);
    const text = contentEl.textContent ?? '';
    expect(text).toContain('[0,1]');
  });

  it('synthetic unknown verdict (status_code 99): title "Unrecognized verdict"; body has <details> + Copy payload button', () => {
    const unknown = { status_code: 99, status_msg: 'Future Status', state: 'SUCCESS' };
    const { titleEl, contentEl } = renderFixture(unknown);
    expect(titleEl.textContent).toMatch(/Unrecognized verdict/i);
    expect(contentEl.querySelector('details')).not.toBeNull();
    const buttons = Array.from(contentEl.querySelectorAll('button'));
    const copyBtn = buttons.find((b) => /copy payload/i.test(b.textContent ?? ''));
    expect(copyBtn).toBeDefined();
  });

  it('timeout synthetic: title "Judge timeout"; body contains prescribed copy', () => {
    const payload = { _phase3_timeout: true };
    const { titleEl, contentEl } = renderFixture(payload);
    expect(titleEl.textContent).toMatch(/Judge timeout/i);
    expect(contentEl.textContent ?? '').toContain('LeetCode judge timed out. Try again or check leetcode.com.');
  });
});

// ── Phase 5.4 — Run-mode redesign (RED scaffolding) ───────────────────────
//
// Plan 01 Task 3 lays down RED-state assertions for every D-01..D-16
// decision affecting the Run path. These tests will go GREEN incrementally
// as Plans 02/03 land:
//   - Plan 02 (RunModal D-01 join, threading metaData/joinedDataInput) →
//     covers the D-08 + D-13 + D-15 + D-16 Run-side branches below.
//   - Plan 03 (verdictModalRenderer rewrite of renderRunResult) → covers
//     D-04, D-05, D-07 per-case rendering.
//   - The two D-16 Submit-side it-blocks are GREEN-on-arrival because
//     renderSubmitVerdict stays bytes-identical per D-14 — they double
//     as the D-14 regression guard.
//
// Helper: renderFixture is reused; renderFixtureRun wraps the same call
// shape but threads the new optional `metaData` + `joinedDataInput` props
// that Plan 03 will add to RenderVerdictArgs.

interface RenderRunOptions {
  metaData?: string;
  joinedDataInput?: string;
  onCopyFailingInput?: (input: string) => void;
}

function renderFixtureRun(
  fixture: unknown,
  opts: RenderRunOptions = {},
): { titleEl: HTMLElement; contentEl: HTMLElement } {
  const titleEl = document.createElement('div');
  const contentEl = document.createElement('div');
  // Cast is safe because Plan 03 will widen RenderVerdictArgs with these
  // optional fields. The cast keeps this test compiling under the current
  // (narrower) interface without a `// @ts-expect-error` that would flip
  // when the interface widens. Plan 03 may drop the cast.
  renderVerdict({
    titleEl,
    contentEl,
    payload: fixture,
    ...opts,
  } as Parameters<typeof renderVerdict>[0]);
  return { titleEl, contentEl };
}

describe('Phase 5.4 — Run-mode redesign (RED)', () => {
  it('D-05: tab strip rendered even when arity===1 (single-case Run)', () => {
    // run-custom is a single-case run (code_answer.length === 1, no expected).
    // D-05 says the tab strip is ALWAYS visible, even for N=1, matching LC.com.
    const { contentEl } = renderFixtureRun(runCustom, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[1,2,3]\n4',
    });
    const tabs = contentEl.querySelectorAll('.leetcode-verdict-case-tab');
    expect(tabs.length).toBe(1);
  });

  it('D-04: per-case PASS chip when code_answer[i].trim() === expected_code_answer[i].trim()', () => {
    const { contentEl } = renderFixtureRun(runMultiCase, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    // run-multi-case is all-pass — every per-case chip should signal pass.
    const passChips = contentEl.querySelectorAll('.leetcode-verdict-case-chip--pass');
    expect(passChips.length).toBeGreaterThanOrEqual(2);
    const failChips = contentEl.querySelectorAll('.leetcode-verdict-case-chip--fail');
    expect(failChips.length).toBe(0);
  });

  it('D-04: per-case FAIL chip when outputs differ', () => {
    // Synthesize a 2-case mismatch: case 0 passes, case 1 fails.
    const mismatch = {
      ...runMultiCase,
      correct_answer: false,
      code_answer: ['[0,1]', '[1,0]'], // case 1 differs from expected '[1,2]'
      expected_code_answer: ['[0,1]', '[1,2]'],
    };
    const { contentEl } = renderFixtureRun(mismatch, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    const passChips = contentEl.querySelectorAll('.leetcode-verdict-case-chip--pass');
    const failChips = contentEl.querySelectorAll('.leetcode-verdict-case-chip--fail');
    expect(passChips.length).toBeGreaterThanOrEqual(1);
    expect(failChips.length).toBeGreaterThanOrEqual(1);
  });

  it('D-13: header chrome contains verdict + "Runtime: " but NOT the problem title', () => {
    // Pass a problemTitle and assert it does NOT bleed into the chrome on Run path.
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    renderVerdict({
      titleEl,
      contentEl,
      payload: runMultiCase,
      problemTitle: 'Two Sum',
      // metaData / joinedDataInput as Plan 03 widening
      ...({ metaData: TWO_SUM_META_DATA, joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6' } as Record<string, unknown>),
    } as Parameters<typeof renderVerdict>[0]);
    const headerText = `${titleEl.textContent ?? ''} ${contentEl.textContent ?? ''}`;
    expect(headerText).toMatch(/Runtime:/i);
    expect(titleEl.textContent ?? '').not.toContain('Two Sum');
  });

  it('D-15: compile_error payload renders single .leetcode-verdict-error-pre block and zero case tabs', () => {
    const ceRun = {
      state: 'SUCCESS',
      status_code: 20,
      status_msg: 'Compile Error',
      lang: 'python3',
      run_success: false,
      compile_error: 'SyntaxError: invalid syntax',
      full_compile_error: 'SyntaxError: invalid syntax\n  File "Solution.py", line 3',
      // Run-mode shape: code_answer present even on error (LC fills it lazily) —
      // but D-15 says tabs are SUPPRESSED in error path.
      code_answer: [],
      expected_code_answer: [],
    };
    const { contentEl } = renderFixtureRun(ceRun, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9',
    });
    const errorPres = contentEl.querySelectorAll('.leetcode-verdict-error-pre');
    expect(errorPres.length).toBe(1);
    const tabs = contentEl.querySelectorAll('.leetcode-verdict-case-tab');
    expect(tabs.length).toBe(0);
  });

  it('D-16 (Run side): Run path renders ZERO buttons whose textContent matches /Copy.*test.*case/i', () => {
    const { contentEl } = renderFixtureRun(runMultiCase, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    const copyButtons = Array.from(contentEl.querySelectorAll('button')).filter((b) =>
      /Copy.*test.*case/i.test(b.textContent ?? ''),
    );
    expect(copyButtons.length).toBe(0);
  });

  it('D-08: input section renders `paramName = value` lines when metaData is present', () => {
    const { contentEl } = renderFixtureRun(runMultiCase, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    const text = contentEl.textContent ?? '';
    // First case: nums = [2,7,11,15], target = 9.
    expect(text).toMatch(/nums\s*=/);
    expect(text).toMatch(/target\s*=/);
    expect(text).toContain('[2,7,11,15]');
    expect(text).toContain('9');
  });

  it('D-08: input section falls back to raw joinedDataInput dump when metaData is absent or malformed', () => {
    const { contentEl } = renderFixtureRun(runMultiCase, {
      metaData: undefined,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    const text = contentEl.textContent ?? '';
    // Without metaData, the input section should still surface the raw
    // joined data_input string verbatim — no `paramName =` formatting.
    expect(text).toContain('[2,7,11,15]');
    expect(text).toContain('9');
    // Defensive: `nums =` must NOT appear when metaData is absent (raw fallback).
    expect(text).not.toMatch(/nums\s*=/);
  });

  it('D-16 (Submit side, D-14 regression guard): Submit-mode WA payload renders exactly one button matching /Copy.*test.*case/i', () => {
    // Submit-side keeps the Copy-failing button — D-14 says renderSubmitVerdict
    // stays bytes-identical, so this assertion should be GREEN on arrival
    // and serves as the D-14 regression oracle.
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    renderVerdict({
      titleEl,
      contentEl,
      payload: wrongAnswer,
      onCopyFailingInput: () => undefined,
    });
    const copyButtons = Array.from(contentEl.querySelectorAll('button')).filter((b) =>
      /Copy.*test.*case/i.test(b.textContent ?? ''),
    );
    expect(copyButtons.length).toBe(1);
  });

  it('D-16 (Submit side): clicking the Submit-mode Copy-failing button calls onCopyFailingInput once with last_testcase / input', () => {
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const onCopyFailingInput = vi.fn();
    renderVerdict({
      titleEl,
      contentEl,
      payload: wrongAnswer,
      onCopyFailingInput,
    });
    const copyBtn = Array.from(contentEl.querySelectorAll('button')).find((b) =>
      /Copy.*test.*case/i.test(b.textContent ?? ''),
    );
    expect(copyBtn).toBeDefined();
    (copyBtn as HTMLButtonElement).click();
    expect(onCopyFailingInput).toHaveBeenCalledTimes(1);
    const passed = onCopyFailingInput.mock.calls[0]![0] as string;
    expect(typeof passed).toBe('string');
    expect(passed.length).toBeGreaterThan(0);
  });
});
