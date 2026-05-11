// src/solve/verdictModalRenderer.ts
//
// Phase 3 — pure DOM renderer for the verdict modal (8 state machine per
// UI-SPEC). The VerdictModal class in VerdictModal.ts is a thin Obsidian
// Modal adapter around this renderer; the renderer itself is environment-
// agnostic so it can be fixture-tested under happy-dom (tests/solve/
// verdictModalRenderer.test.ts) without booting a real Modal.
//
// Render states (selected via payload inspection):
//   pending                       — not rendered here (owned by the Modal
//                                    class's renderPending; this renderer
//                                    always paints a terminal or synthetic
//                                    state).
//   AC / WA / TLE / MLE / CE / RE — classifyStatus(payload.status_code).kind
//   Interpret (run sample/custom) — code_answer/expected_code_answer shape
//   Timeout (synthetic)           — { _phase3_timeout: true }
//   Unrecognized verdict          — status_code not in KNOWN map (D-15)
//
// CF-07 compliance: every DOM node is built via `document.createElement`
// + `textContent`. NO HTML-string sinks. NO user-content interpolation
// into markup strings.
//
// Environment-agnostic: never imports from `obsidian` at module load time.
// The VerdictModal class wires in Obsidian chrome (setIcon, mod-cta class,
// focus management) around this renderer's output.

import { classifyStatus, type VerdictKind } from './statusMap';
import type { RunCheckResponse, SubmitCheckResponse } from './types';

/** Payload hand-shaped by the orchestrator (Plan 05) into the 3 "synthetic"
 *  states the modal handles beyond the plain LC check response:
 *    - { _phase3_timeout: true }                       — 60s cap hit
 *    - { _phase3_unknown: true, payload: unknown }     — Copy-payload path
 *    - bare TerminalResponse (AC/WA/TLE/MLE/CE/RE/IE)  — classifyStatus path
 *    - run-mode response with code_answer[] (sample/custom)
 *  Any other object shape is treated as an unrecognized LC verdict and falls
 *  through to the Unknown path per D-15. */
export interface RenderVerdictArgs {
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  payload: unknown;
  /** Optional problem title for the chrome `"{verdict} — {problem}"` format. */
  problemTitle?: string;
  /** Called when the user clicks `Copy failing testcase to custom input`. */
  onCopyFailingInput?: (input: string) => void;
}

const PAYLOAD_DISPLAY_MAX = 2048;

// ── Public entry point ───────────────────────────────────────────────────

export function renderVerdict(args: RenderVerdictArgs): void {
  const { titleEl, contentEl, payload, problemTitle } = args;
  // Reset containers so re-invocation produces a clean DOM tree.
  clear(titleEl);
  clear(contentEl);

  // Synthetic timeout (Plan 05 hands this in when the 60s cap fires).
  if (isTimeoutPayload(payload)) {
    renderTimeout(titleEl, contentEl);
    return;
  }

  // Run-mode response (interpret_solution): has code_answer array, no
  // submission verdict; show the user's computed output next to expected.
  if (isRunResponse(payload)) {
    renderRunResult(titleEl, contentEl, payload as RunCheckResponse, problemTitle);
    return;
  }

  // Submit-mode response: classify on status_code.
  if (isTerminalCheck(payload)) {
    const info = classifyStatus(
      (payload as { status_code: number }).status_code,
      (payload as { status_msg?: string }).status_msg,
    );
    if (info.kind === 'unknown') {
      renderUnknownVerdict(titleEl, contentEl, payload, problemTitle);
      return;
    }
    renderSubmitVerdict(titleEl, contentEl, payload as SubmitCheckResponse, info.kind, info.displayName, problemTitle, args.onCopyFailingInput);
    return;
  }

  // Fallback: treat anything else as unknown.
  renderUnknownVerdict(titleEl, contentEl, payload, problemTitle);
}

// ── Render state: Timeout ────────────────────────────────────────────────

function renderTimeout(titleEl: HTMLElement, contentEl: HTMLElement): void {
  setText(titleEl, 'Judge timeout');
  const p = appendEl(contentEl, 'p');
  setText(p, 'LeetCode judge timed out. Try again or check leetcode.com.');
  const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
  const closeBtn = appendEl(footer, 'button', 'mod-cta');
  setText(closeBtn, 'Close');
  closeBtn.setAttribute('data-lc-role', 'close');
}

// ── Render state: Run (sample / custom) ──────────────────────────────────

function renderRunResult(
  titleEl: HTMLElement,
  contentEl: HTMLElement,
  res: RunCheckResponse,
  problemTitle: string | undefined,
): void {
  // Title: derive from correct_answer + status_msg when available.
  const correct = res.correct_answer === true;
  const label = correct ? 'Run — all samples passed' : 'Run — output differs';
  setText(titleEl, problemTitle ? `${label} — ${problemTitle}` : label);

  const body = appendEl(contentEl, 'div', 'leetcode-verdict-body');
  body.setAttribute('aria-live', 'polite');

  // Render the user's code_answer array as the "Output" section.
  const outputLines = toLines(res.code_answer);
  if (outputLines.length > 0) {
    makeSection(body, 'Output', outputLines.join('\n'), 'leetcode-verdict-diff-actual',
      correct ? undefined : 'leetcode-verdict-section-label--output');
  }
  const expectedLines = toLines(res.expected_code_answer);
  if (expectedLines.length > 0) {
    makeSection(body, 'Expected', expectedLines.join('\n'), 'leetcode-verdict-diff-expected', 'leetcode-verdict-section-label--expected');
  }
  if (typeof res.status_runtime === 'string' && res.status_runtime.length > 0) {
    const runtime = appendEl(body, 'div', 'leetcode-verdict-runtime');
    setText(runtime, `Runtime: ${res.status_runtime}${typeof res.status_memory === 'string' ? ' · Memory: ' + res.status_memory : ''}`);
  }

  const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
  const closeBtn = appendEl(footer, 'button', 'mod-cta');
  setText(closeBtn, 'Close');
  closeBtn.setAttribute('data-lc-role', 'close');
}

// ── Render state: Submit verdicts ────────────────────────────────────────

function renderSubmitVerdict(
  titleEl: HTMLElement,
  contentEl: HTMLElement,
  res: SubmitCheckResponse,
  kind: VerdictKind,
  displayName: string,
  problemTitle: string | undefined,
  onCopyFailingInput: ((input: string) => void) | undefined,
): void {
  setText(titleEl, problemTitle ? `${displayName} — ${problemTitle}` : displayName);
  const body = appendEl(contentEl, 'div', 'leetcode-verdict-body');
  body.setAttribute('aria-live', 'polite');

  // Runtime/memory chrome row (omitted for CE — no runtime on compile fail).
  const runtime = typeof res.status_runtime === 'string' ? res.status_runtime : '';
  const memory = typeof res.status_memory === 'string' ? res.status_memory : '';
  if ((runtime.length > 0 || memory.length > 0) && kind !== 'ce') {
    const row = appendEl(contentEl, 'div', 'leetcode-verdict-runtime');
    setText(row, `Runtime: ${runtime || '—'} · Memory: ${memory || '—'}`);
    // Put runtime row just before the body.
    contentEl.insertBefore(row, body);
  }

  switch (kind) {
    case 'ac':
      renderAcBody(body, res);
      break;
    case 'wa':
      renderWaBody(body, res);
      break;
    case 'tle':
      renderTleBody(body, res);
      break;
    case 'mle':
      renderMleBody(body, res);
      break;
    case 'ce':
      renderCeBody(body, res);
      break;
    case 're':
      renderReBody(body, res);
      break;
    case 'ie':
    case 'ole':
    case 'unknown-lc': {
      // Minimal chrome — label only; no failing-input action.
      const p = appendEl(body, 'p');
      setText(p, displayName);
      break;
    }
    default:
      // Already handled in renderVerdict — defensive no-op.
      break;
  }

  // Footer: action button (per UI-SPEC §Action Buttons table) + Close.
  const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
  const failingInput = firstNonEmpty(res.input, res.last_testcase);
  if (kind === 'wa' || kind === 'tle' || kind === 're') {
    if (onCopyFailingInput && failingInput.length > 0) {
      const copyBtn = appendEl(footer, 'button');
      setText(copyBtn, 'Copy failing testcase to custom input');
      copyBtn.addEventListener('click', () => {
        onCopyFailingInput(failingInput);
      });
    }
  } else if (kind === 'ce') {
    const errText = firstNonEmpty(res.full_compile_error, res.compile_error);
    if (errText.length > 0) {
      const copyBtn = appendEl(footer, 'button');
      setText(copyBtn, 'Copy error');
      copyBtn.addEventListener('click', () => {
        void writeClipboard(errText);
      });
    }
  }
  const closeBtn = appendEl(footer, 'button', 'mod-cta');
  setText(closeBtn, 'Close');
  closeBtn.setAttribute('data-lc-role', 'close');
}

function renderAcBody(body: HTMLElement, res: SubmitCheckResponse): void {
  const display = appendEl(body, 'div', 'leetcode-verdict-ac-display');
  setText(display, 'Accepted');
  const hasPercentile = typeof res.runtime_percentile === 'number' || typeof res.memory_percentile === 'number';
  if (hasPercentile) {
    const pct = appendEl(body, 'div', 'leetcode-verdict-percentile');
    const rt = typeof res.runtime_percentile === 'number' ? res.runtime_percentile.toFixed(1) : '—';
    const mem = typeof res.memory_percentile === 'number' ? res.memory_percentile.toFixed(1) : '—';
    setText(pct, `Beats ${rt}% (runtime) · ${mem}% (memory)`);
  }
}

function renderWaBody(body: HTMLElement, res: SubmitCheckResponse): void {
  const input = firstNonEmpty(res.input, res.last_testcase);
  const output = firstNonEmpty(res.std_output, asString(res.code_output));
  const expected = firstNonEmpty(res.expected_output, asString(res.expected_code_answer));
  makeSection(body, 'Input', input, 'leetcode-verdict-diff-input');
  makeSection(body, 'Output', output, 'leetcode-verdict-diff-actual', 'leetcode-verdict-section-label--output');
  makeSection(body, 'Expected', expected, 'leetcode-verdict-diff-expected', 'leetcode-verdict-section-label--expected');
}

function renderTleBody(body: HTMLElement, res: SubmitCheckResponse): void {
  const input = firstNonEmpty(res.input, res.last_testcase);
  makeSection(body, 'Input', input, 'leetcode-verdict-diff-input');
  const lastOutput = asString(res.code_output);
  if (lastOutput.length > 0) {
    makeSection(body, 'Last output', lastOutput, 'leetcode-verdict-diff-input');
  }
}

function renderMleBody(body: HTMLElement, res: SubmitCheckResponse): void {
  // MLE shows failing input only; no action button per UI-SPEC.
  const input = firstNonEmpty(res.input, res.last_testcase);
  makeSection(body, 'Input', input, 'leetcode-verdict-diff-input');
}

function renderCeBody(body: HTMLElement, res: SubmitCheckResponse): void {
  const label = appendEl(body, 'div', 'leetcode-verdict-section-label');
  setText(label, 'Compile error');
  const errText = firstNonEmpty(res.full_compile_error, res.compile_error);
  const pre = appendEl(body, 'pre', 'leetcode-verdict-error-pre');
  setText(pre, errText);
}

function renderReBody(body: HTMLElement, res: SubmitCheckResponse): void {
  const label = appendEl(body, 'div', 'leetcode-verdict-section-label');
  setText(label, 'Error');
  const errText = firstNonEmpty(res.full_runtime_error, res.runtime_error);
  const pre = appendEl(body, 'pre', 'leetcode-verdict-error-pre');
  setText(pre, errText);
  const input = firstNonEmpty(res.input, res.last_testcase);
  if (input.length > 0) {
    makeSection(body, 'Input', input, 'leetcode-verdict-diff-input');
  }
}

// ── Render state: Unknown verdict (D-15) ─────────────────────────────────

function renderUnknownVerdict(
  titleEl: HTMLElement,
  contentEl: HTMLElement,
  payload: unknown,
  problemTitle: string | undefined,
): void {
  setText(titleEl, problemTitle
    ? `Unrecognized verdict — ${problemTitle}`
    : 'Unrecognized verdict');

  const body = appendEl(contentEl, 'div', 'leetcode-verdict-body');
  body.setAttribute('aria-live', 'polite');
  const intro = appendEl(body, 'p');
  setText(intro, 'LeetCode returned an unrecognized status. Copy the payload to file a bug report.');

  const details = appendEl(body, 'details', 'leetcode-verdict-unknown-details');
  const summary = appendEl(details, 'summary');
  setText(summary, 'Raw response');
  const pre = appendEl(details, 'pre');
  setText(pre, safeStringify(payload).slice(0, PAYLOAD_DISPLAY_MAX));

  const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
  const copyBtn = appendEl(footer, 'button');
  setText(copyBtn, 'Copy payload');
  copyBtn.addEventListener('click', () => {
    void writeClipboard(safeStringify(payload));
  });
  const closeBtn = appendEl(footer, 'button', 'mod-cta');
  setText(closeBtn, 'Close');
  closeBtn.setAttribute('data-lc-role', 'close');
}

// ── Helpers ──────────────────────────────────────────────────────────────

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  const el = (parent.ownerDocument ?? activeDocument).createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

function setText(el: HTMLElement, text: string): void {
  // textContent is the safe equivalent of setText — string-as-text, never
  // parsed as HTML. Matches Obsidian's setText under the hood.
  el.textContent = text;
}

function makeSection(
  parent: HTMLElement,
  labelText: string,
  value: string,
  preCls: string,
  labelModifier?: string,
): void {
  const section = appendEl(parent, 'div', 'leetcode-verdict-section');
  const label = appendEl(section, 'div',
    labelModifier
      ? `leetcode-verdict-section-label ${labelModifier}`
      : 'leetcode-verdict-section-label',
  );
  setText(label, labelText);
  label.setAttribute('aria-label', labelText);
  const pre = appendEl(section, 'pre', preCls);
  setText(pre, value);
}

function isTimeoutPayload(v: unknown): v is { _phase3_timeout: true } {
  return !!v && typeof v === 'object' && (v as Record<string, unknown>)._phase3_timeout === true;
}

function isTerminalCheck(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.state === 'SUCCESS' || typeof r.status_code === 'number';
}

function isRunResponse(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  // Run responses carry a code_answer array (whereas submit responses typically
  // have `submission_id` and no `code_answer`). Guard on code_answer being
  // present AND non-empty so we route WA submits with null code_answer into
  // the submit path.
  return Array.isArray(r.code_answer) && (r.code_answer as unknown[]).length > 0;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function toLines(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string');
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
}

function asString(v: unknown): string {
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string').join('\n');
  if (typeof v === 'string') return v;
  return '';
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function writeClipboard(text: string): Promise<void> {
  // Best-effort — renderer is environment-agnostic; the clipboard API may
  // be absent under test. The Modal class does the real wiring + Notice.
  const clip = activeWindow.navigator?.clipboard;
  if (clip?.writeText) return clip.writeText(text);
  return Promise.resolve();
}
