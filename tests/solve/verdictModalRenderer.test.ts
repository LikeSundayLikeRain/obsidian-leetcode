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
