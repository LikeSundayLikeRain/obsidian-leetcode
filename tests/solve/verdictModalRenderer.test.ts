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

  it('arity respects total_testcases when LC pads code_answer with trailing empty (live UAT 2026-05-13)', () => {
    // Live LC interpret_solution observed: 3-case Run returned code_answer of
    // length 4 with the trailing entry being '' (and total_testcases: 3,
    // compare_result: '111'). Arity must trust total_testcases over array
    // length so we don't render a phantom 4th tab.
    const padded = {
      ...runMultiCase,
      total_testcases: 3,
      compare_result: '111',
      code_answer: ['[0,1]', '[1,2]', '[0,1]', ''],
      expected_code_answer: ['[0,1]', '[1,2]', '[0,1]', ''],
    };
    const { contentEl } = renderFixtureRun(padded, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    const tabs = contentEl.querySelectorAll('.leetcode-verdict-case-tab');
    expect(tabs.length).toBe(3);
  });

  it('arity falls back to compare_result.length when total_testcases is absent', () => {
    const padded = {
      ...runMultiCase,
      compare_result: '11',
      code_answer: ['[0,1]', '[1,2]', ''],
      expected_code_answer: ['[0,1]', '[1,2]', ''],
    };
    delete (padded as { total_testcases?: number }).total_testcases;
    const { contentEl } = renderFixtureRun(padded, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    const tabs = contentEl.querySelectorAll('.leetcode-verdict-case-tab');
    expect(tabs.length).toBe(2);
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
    // compare_result: '10' is LC's per-case bitmask (case 0 pass, case 1 fail);
    // correct_answer: false is LC's aggregate verdict. Both must be set so the
    // LC-authoritative compare logic in Step 3 produces the expected chips.
    const mismatch = {
      ...runMultiCase,
      correct_answer: false,
      compare_result: '10',
      total_testcases: 2,
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

  it('regression: order-agnostic answer (Two Sum [1,0] vs [0,1]) shows PASS when LC says correct_answer=true', () => {
    // Two Sum: "you may return the answer in any order". LC's judge accepts
    // [1,0] when expected is [0,1]; correct_answer=true and compare_result='1'
    // are LC's authoritative signals. The renderer must trust them, not local
    // string-compare.
    const orderAgnostic = {
      ...runMultiCase,
      correct_answer: true,
      compare_result: '1',
      code_answer: ['[1,0]'],
      expected_code_answer: ['[0,1]'],
      total_testcases: 1,
      total_correct: 1,
    };
    const { titleEl, contentEl } = renderFixtureRun(orderAgnostic, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9',
    });
    // Aggregate verdict must be Accepted, not Wrong Answer.
    expect(titleEl.textContent ?? '').toContain('Accepted');
    expect(titleEl.textContent ?? '').not.toContain('Wrong Answer');
    // Per-case chip must show PASS, not FAIL.
    const passChips = contentEl.querySelectorAll('.leetcode-verdict-case-chip--pass');
    const failChips = contentEl.querySelectorAll('.leetcode-verdict-case-chip--fail');
    expect(passChips.length).toBe(1);
    expect(failChips.length).toBe(0);
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

// Phase 08 dogfood — Plan 08-05 only wired AI Debug into renderSubmitVerdict.
// renderRunResult (case-tabs path for sample-test failures) and
// renderRunErrorBlock (Run-side compile/runtime errors) didn't receive the
// onOpenAIDebug callback. These regression tests lock the gap so it can't reopen.
describe('Phase 08 — AI Debug button on Run-mode failure paths', () => {
  it('renderRunResult: WA sample-test failure shows AI: Debug button when onOpenAIDebug wired', () => {
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const onOpenAIDebug = vi.fn();
    const failing = JSON.parse(JSON.stringify(runMultiCase)) as Record<string, unknown>;
    // Must set LC's authoritative signals to false/fail so the renderer
    // correctly identifies this as a WA and shows the AI Debug button.
    failing.expected_code_answer = ['DIFFERENT', 'DIFFERENT'];
    failing.correct_answer = false;
    failing.compare_result = '00';
    renderVerdict({ titleEl, contentEl, payload: failing, onOpenAIDebug });
    const aiBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'AI: Debug',
    );
    expect(aiBtn).toBeDefined();
  });

  it('renderRunResult: AI: Debug button click invokes onOpenAIDebug exactly once', () => {
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const onOpenAIDebug = vi.fn();
    const failing = JSON.parse(JSON.stringify(runMultiCase)) as Record<string, unknown>;
    // Must set LC's authoritative signals to false/fail so the renderer
    // correctly identifies this as a WA and shows the AI Debug button.
    failing.expected_code_answer = ['DIFFERENT', 'DIFFERENT'];
    failing.correct_answer = false;
    failing.compare_result = '00';
    renderVerdict({ titleEl, contentEl, payload: failing, onOpenAIDebug });
    const aiBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'AI: Debug',
    );
    expect(aiBtn).toBeDefined();
    (aiBtn as HTMLButtonElement).click();
    expect(onOpenAIDebug).toHaveBeenCalledTimes(1);
  });

  it('renderRunResult: all-pass sample run does NOT show AI: Debug button', () => {
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const onOpenAIDebug = vi.fn();
    renderVerdict({ titleEl, contentEl, payload: runMultiCase, onOpenAIDebug });
    const aiBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'AI: Debug',
    );
    expect(aiBtn).toBeUndefined();
  });

  it('renderRunResult: WA without onOpenAIDebug callback does NOT render the button (defensive gate)', () => {
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const failing = JSON.parse(JSON.stringify(runMultiCase)) as Record<string, unknown>;
    // Set LC's authoritative signals to failure so aggregatePass=false;
    // the button must still be absent because no onOpenAIDebug is wired.
    failing.expected_code_answer = ['DIFFERENT', 'DIFFERENT'];
    failing.correct_answer = false;
    failing.compare_result = '00';
    renderVerdict({ titleEl, contentEl, payload: failing });
    const aiBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'AI: Debug',
    );
    expect(aiBtn).toBeUndefined();
  });

  it('renderRunErrorBlock: Run-side compile error shows AI: Debug button + click invokes callback', () => {
    const titleEl = document.createElement('div');
    const contentEl = document.createElement('div');
    const onOpenAIDebug = vi.fn();
    const runCompileError = {
      status_code: 20,
      status_msg: 'Compile Error',
      compile_error: 'syntax error at line 1',
      full_compile_error: 'syntax error at line 1\n  Solution.cpp:1:1',
    };
    renderVerdict({ titleEl, contentEl, payload: runCompileError, onOpenAIDebug });
    const aiBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'AI: Debug',
    );
    expect(aiBtn).toBeDefined();
    (aiBtn as HTMLButtonElement).click();
    expect(onOpenAIDebug).toHaveBeenCalledTimes(1);
  });
});


// ── Per-case Stdout wire-shape (2026-06-11) ──────────────────────────────
//
// Live probe against leetcode.com (3-case Two Sum, Python3, distinct
// `print()` per case) returned:
//   total_testcases: 3
//   code_output:     ["CASE-MARKER ...=9",
//                     "CASE-MARKER ...=6",
//                     "CASE-MARKER ...=6"]              ← element-per-CASE
//   std_output_list: ["CASE-MARKER ...=9\n",
//                     "CASE-MARKER ...=6\n",
//                     "CASE-MARKER ...=6\n",
//                     ""]                                 ← padded + \n suffix
//
// The earlier BRAT #2 hypothesis (array == per-LINE) was an artifact of the
// leetnotion library's `formatTestOutput` joining on '\n' before exposing
// the field. The wire itself is per-case. These tests pin the corrected
// behavior: each tab shows ONLY its own case's stdout.

describe('per-case Stdout (wire shape verified 2026-06-11)', () => {
  it('multi-case run: each tab shows its own case stdout, not combined', () => {
    // Replicates the live probe payload exactly (Two Sum, 3 cases).
    const fixture = {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      run_success: true,
      correct_answer: true,
      code_answer: ['[0,1]', '[1,2]', '[0,1]', ''],
      code_output: [
        'CASE-MARKER nums=[2, 7, 11, 15] target=9',
        'CASE-MARKER nums=[3, 2, 4] target=6',
        'CASE-MARKER nums=[3, 3] target=6',
      ],
      std_output_list: [
        'CASE-MARKER nums=[2, 7, 11, 15] target=9\n',
        'CASE-MARKER nums=[3, 2, 4] target=6\n',
        'CASE-MARKER nums=[3, 3] target=6\n',
        '',
      ],
      expected_code_answer: ['[0,1]', '[1,2]', '[0,1]', ''],
      expected_std_output_list: ['', '', '', ''],
      total_testcases: 3,
      compare_result: '111',
      status_runtime: '0 ms',
    };
    const { contentEl } = renderFixtureRun(fixture, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });

    // Default-active tab is Case 1 — only its CASE-MARKER must be visible.
    const tab1Text = contentEl.textContent ?? '';
    expect(tab1Text).toContain('CASE-MARKER nums=[2, 7, 11, 15] target=9');
    expect(tab1Text).not.toContain('CASE-MARKER nums=[3, 2, 4]');
    expect(tab1Text).not.toContain('CASE-MARKER nums=[3, 3]');

    // Click Case 2 → only case 2's marker.
    const tabs = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-tab'),
    ) as HTMLButtonElement[];
    expect(tabs.length).toBe(3);
    tabs[1]!.click();
    const tab2Text = contentEl.textContent ?? '';
    expect(tab2Text).toContain('CASE-MARKER nums=[3, 2, 4] target=6');
    expect(tab2Text).not.toContain('target=9');
    expect(tab2Text).not.toContain('nums=[3, 3]');

    // Click Case 3 → only case 3's marker.
    tabs[2]!.click();
    const tab3Text = contentEl.textContent ?? '';
    expect(tab3Text).toContain('CASE-MARKER nums=[3, 3] target=6');
    expect(tab3Text).not.toContain('nums=[2, 7, 11, 15]');
    expect(tab3Text).not.toContain('nums=[3, 2, 4]');
  });

  it('std_output_list trailing newline is stripped for display', () => {
    const fixture = {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      run_success: true,
      correct_answer: true,
      code_answer: ['[0,1]'],
      std_output_list: ['hello\n'],
      expected_code_answer: ['[0,1]'],
      total_testcases: 1,
      compare_result: '1',
      status_runtime: '1 ms',
    };
    const { contentEl } = renderFixtureRun(fixture, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9',
    });
    const pres = Array.from(contentEl.querySelectorAll('pre')).map(
      (p) => p.textContent ?? '',
    );
    const stdoutPre = pres.find((t) => t.startsWith('hello'));
    expect(stdoutPre).toBeDefined();
    // No trailing whitespace (rstrip applied to avoid extra blank line in <pre>).
    expect(stdoutPre).toBe('hello');
  });

  it('falls back to code_output when std_output_list is absent', () => {
    // Older / partial response shape: only code_output present, no
    // std_output_list. Treat code_output as element-per-case (its true
    // wire shape per live probe + leetcode-runner Java model).
    const fixture = {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      run_success: true,
      correct_answer: true,
      code_answer: ['[0,1]', '[1,2]'],
      code_output: ['only-case-1-stdout', 'only-case-2-stdout'],
      expected_code_answer: ['[0,1]', '[1,2]'],
      total_testcases: 2,
      compare_result: '11',
      status_runtime: '2 ms',
    };
    const { contentEl } = renderFixtureRun(fixture, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    // Default tab = case 1.
    const tab1Text = contentEl.textContent ?? '';
    expect(tab1Text).toContain('only-case-1-stdout');
    expect(tab1Text).not.toContain('only-case-2-stdout');

    // Switch to case 2.
    const tabs = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-tab'),
    ) as HTMLButtonElement[];
    tabs[1]!.click();
    const tab2Text = contentEl.textContent ?? '';
    expect(tab2Text).toContain('only-case-2-stdout');
    expect(tab2Text).not.toContain('only-case-1-stdout');
  });

  it('empty std_output_list elements render no Stdout section on that tab', () => {
    // LC pads std_output_list — case 2 has no print(), should show no Stdout.
    const fixture = {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      run_success: true,
      correct_answer: true,
      code_answer: ['[0,1]', '[1,2]'],
      std_output_list: ['only-case-1\n', ''],
      expected_code_answer: ['[0,1]', '[1,2]'],
      total_testcases: 2,
      compare_result: '11',
      status_runtime: '2 ms',
    };
    const { contentEl } = renderFixtureRun(fixture, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });
    // Tab 2: no Stdout label should appear in the case body when stdout is ''.
    const tabs = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-tab'),
    ) as HTMLButtonElement[];
    tabs[1]!.click();
    const labels = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-body .leetcode-verdict-section-label'),
    ).map((el) => el.textContent ?? '');
    expect(labels).not.toContain('Stdout');
  });
});

// ── Mid-run runtime error (wire shape verified 2026-06-11) ────────────────
//
// Live probe against leetcode.com with a 3-case Two Sum that solved case 1
// then raised on call #2 returned:
//   status_code: 15 (Runtime Error)
//   code_answer: ["[0,1]", ""]    ← truncated at throwing case
//   compare_result: "100"
//   total_testcases: 3
//   full_runtime_error: <stack trace>
//   expected_code_answer: ["[0,1]", "[1,2]", "[0,1]", ""]
//
// Pre-fix the renderer routed this to renderRunResult and showed Case 1 PASS
// / Case 2 FAIL / Case 3 FAIL with empty Output boxes — no stack trace
// surfaced anywhere. Post-fix:
//   • Throwing case (idx = code_answer.length - 1) shows THREW chip + the
//     stack trace in place of Output.
//   • Cases past the throw show SKIP chip + a "Not executed" placeholder.
//   • Modal default-activates the throwing tab so the user lands on the
//     stack trace without clicking.

const MID_RUN_RE_PAYLOAD = {
  state: 'SUCCESS',
  status_code: 15,
  status_msg: 'Runtime Error',
  run_success: false,
  runtime_error: 'Line 12: ValueError: PROBE_MID_RUN_FAIL call=2 nums=[3, 2, 4]',
  full_runtime_error:
    'ValueError: PROBE_MID_RUN_FAIL call=2 nums=[3, 2, 4]\n' +
    '    raise ValueError(...)\n' +
    'Line 12 in twoSum (Solution.py)\n' +
    '    ret = Solution().twoSum(param_1, param_2)\n' +
    'Line 43 in _driver (Solution.py)\n' +
    '    _driver()\n' +
    'Line 58 in <module> (Solution.py)',
  status_runtime: 'N/A',
  status_memory: 'N/A',
  code_answer: ['[0,1]', ''],
  expected_code_answer: ['[0,1]', '[1,2]', '[0,1]', ''],
  correct_answer: false,
  compare_result: '100',
  total_correct: 1,
  total_testcases: 3,
  submission_id: 'runcode_1781204057.2188203_bimUnxfYW7',
};

describe('mid-run runtime error (wire shape verified 2026-06-11)', () => {
  it('default-activates the throwing tab on open', () => {
    const { contentEl } = renderFixtureRun(MID_RUN_RE_PAYLOAD, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    const tabs = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-tab'),
    ) as HTMLButtonElement[];
    expect(tabs.length).toBe(3);
    // Throwing case = code_answer.length - 1 = 1 → Case 2 active by default.
    expect(tabs[1]!.classList.contains('is-active')).toBe(true);
    expect(tabs[0]!.classList.contains('is-active')).toBe(false);
    expect(tabs[2]!.classList.contains('is-active')).toBe(false);
  });

  it('renders PASS / ERROR / SKIP chips on the three tabs', () => {
    const { contentEl } = renderFixtureRun(MID_RUN_RE_PAYLOAD, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    const chips = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-chip'),
    ).map((el) => ({
      text: el.textContent ?? '',
      cls: el.className,
    }));
    expect(chips).toHaveLength(3);
    expect(chips[0]!.text).toBe('PASS');
    expect(chips[0]!.cls).toContain('leetcode-verdict-case-chip--pass');
    expect(chips[1]!.text).toBe('ERROR');
    expect(chips[1]!.cls).toContain('leetcode-verdict-case-chip--threw');
    expect(chips[2]!.text).toBe('SKIP');
    expect(chips[2]!.cls).toContain('leetcode-verdict-case-chip--skipped');
  });

  it('throwing tab shows the stack trace in place of Output', () => {
    const { contentEl } = renderFixtureRun(MID_RUN_RE_PAYLOAD, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    // Default tab is throwing tab — body should hold the stack trace.
    const errorPre = contentEl.querySelector(
      '.leetcode-verdict-case-body .leetcode-verdict-error-pre',
    );
    expect(errorPre).not.toBeNull();
    const errText = errorPre?.textContent ?? '';
    expect(errText).toContain('ValueError: PROBE_MID_RUN_FAIL');
    expect(errText).toContain('Line 12 in twoSum');
    expect(errText).toContain('Line 58 in <module>');
    // No Output section on the throwing tab — the error replaces it.
    const labels = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-body .leetcode-verdict-section-label'),
    ).map((el) => el.textContent ?? '');
    expect(labels).toContain('Input');
    expect(labels).toContain('Error');
    expect(labels).toContain('Expected');
    expect(labels).not.toContain('Output');
  });

  it('PASS tab keeps its normal Output rendering', () => {
    const { contentEl } = renderFixtureRun(MID_RUN_RE_PAYLOAD, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    const tabs = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-tab'),
    ) as HTMLButtonElement[];
    tabs[0]!.click();
    const text = contentEl.textContent ?? '';
    expect(text).toContain('[0,1]'); // case 1 output
    // No stack trace pre on this tab.
    const errPres = contentEl.querySelectorAll(
      '.leetcode-verdict-case-body .leetcode-verdict-error-pre',
    );
    expect(errPres.length).toBe(0);
    const labels = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-body .leetcode-verdict-section-label'),
    ).map((el) => el.textContent ?? '');
    expect(labels).toContain('Output');
    expect(labels).not.toContain('Error');
  });

  it('SKIP tab shows a "Not executed" placeholder, no stack trace', () => {
    const { contentEl } = renderFixtureRun(MID_RUN_RE_PAYLOAD, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    const tabs = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-tab'),
    ) as HTMLButtonElement[];
    tabs[2]!.click();
    const note = contentEl.querySelector(
      '.leetcode-verdict-case-body .leetcode-verdict-skipped-note',
    );
    expect(note).not.toBeNull();
    expect(note?.textContent ?? '').toMatch(/not executed/i);
    // Stack trace not duplicated onto skipped tab.
    const errPres = contentEl.querySelectorAll(
      '.leetcode-verdict-case-body .leetcode-verdict-error-pre',
    );
    expect(errPres.length).toBe(0);
    // Expected still rendered (LC pre-computed it on its reference solution).
    const labels = Array.from(
      contentEl.querySelectorAll('.leetcode-verdict-case-body .leetcode-verdict-section-label'),
    ).map((el) => el.textContent ?? '');
    expect(labels).toContain('Expected');
  });

  it('title is "Runtime Error", AI Debug button is wired', () => {
    const onOpenAIDebug = vi.fn();
    const { titleEl, contentEl } = renderFixtureRun(MID_RUN_RE_PAYLOAD, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
      ...({ onOpenAIDebug } as Record<string, unknown>),
    } as RenderRunOptions);
    expect(titleEl.textContent).toMatch(/Runtime Error/);
    const aiBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => /AI: Debug/i.test(b.textContent ?? ''),
    );
    expect(aiBtn).toBeDefined();
    aiBtn!.click();
    expect(onOpenAIDebug).toHaveBeenCalledTimes(1);
  });

  it('does not affect clean RE responses (full all-fail path)', () => {
    // When EVERY case throws (code_answer is empty), the existing D-15
    // hasRunErrorPayload path renders a single error block with no tabs.
    // Verify we didn't regress that route.
    const allFail = {
      ...MID_RUN_RE_PAYLOAD,
      code_answer: [],
      // submission_id removed so hasRunErrorPayload's gate passes.
      submission_id: undefined,
    };
    const { contentEl } = renderFixtureRun(allFail, {
      metaData: TWO_SUM_META_DATA,
      joinedDataInput: '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
    });
    const tabs = contentEl.querySelectorAll('.leetcode-verdict-case-tab');
    expect(tabs.length).toBe(0);
    const errPre = contentEl.querySelector('.leetcode-verdict-error-pre');
    expect(errPre).not.toBeNull();
  });
});
