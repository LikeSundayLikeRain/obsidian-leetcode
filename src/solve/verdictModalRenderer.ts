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
import { parseMetaData, splitInput, splitOutput } from './runArity';
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
  /** Phase 08 Plan 05 (AIDBG-01) — Called when the user clicks `AI: Debug`
   *  on a non-Accepted verdict. Visibility union LOCKED to
   *  `kind ∈ {wa, tle, mle, re, ce}` per RESEARCH §Pitfall 7. The Modal-
   *  layer caller (VerdictModal.renderVerdict) wraps this callback in a
   *  close-then-fire lambda so AIStreamModal does not stack on top of a
   *  closing verdict modal (T-08-05-T-stack mitigation). */
  onOpenAIDebug?: () => void;
  // ── Phase 5.4 (D-08) — Run-path-only optional inputs ─────────────────────
  // Backward-compatible: every existing call site (Submit / Pending / Timeout
  // / Unknown / Run path callers that haven't been updated) continues to
  // work; renderRunResult uses the raw-dump fallback when both are absent.
  /** Raw LC `questionData.metaData` JSON string. Used by renderRunResult to
   *  label per-case Input rows (`paramName = value`). Falls back to a raw
   *  `joinedDataInput` dump when undefined / malformed (D-08). Submit /
   *  Pending / Timeout / Unknown paths ignore this field. */
  metaData?: string;
  /** Exact `data_input` string sent to LC's `interpret_solution`. Same
   *  string `joinCasesForRun(this.cases, ...)` produced in Plan 02. Sliced
   *  per-case via `splitInput(joined, arity)` for the per-tab Input section
   *  (D-08). Submit / Pending / Timeout / Unknown paths ignore this field. */
  joinedDataInput?: string;
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
  // Phase 5.4 D-15 also routes compile/runtime errors with empty code_answer
  // through this branch — see hasRunErrorPayload sniff inside renderRunResult.
  if (isRunResponse(payload) || hasRunErrorPayload(payload)) {
    renderRunResult(
      titleEl,
      contentEl,
      payload as RunCheckResponse,
      problemTitle,
      args.metaData,
      args.joinedDataInput,
      args.onOpenAIDebug,
    );
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
    renderSubmitVerdict(
      titleEl,
      contentEl,
      payload as SubmitCheckResponse,
      info.kind,
      info.displayName,
      problemTitle,
      args.onCopyFailingInput,
      args.onOpenAIDebug,
    );
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
  // Phase 5.4 D-13: problemTitle is intentionally unused on the Run path
  // (parameter retained for backward compat with the renderVerdict dispatch
  // signature; chrome no longer carries the problem title).
  _problemTitle: string | undefined,
  metaData?: string,
  joinedDataInput?: string,
  onOpenAIDebug?: () => void,
): void {
  // ── Step 1: D-15 error sniff — single error block + zero tabs ──────────
  if (hasRunErrorPayload(res)) {
    renderRunErrorBlock(titleEl, contentEl, res, onOpenAIDebug);
    return;
  }

  // ── Step 2: arity (UAT-fixed 2026-05-13) ───────────────────────────────
  // Authoritative case count, in priority order:
  //   1. res.total_testcases (LC's count of submitted cases)
  //   2. res.compare_result.length (LC's per-case "0"/"1" mask string)
  //   3. max(code_answer.length, expected_code_answer.length) — fallback,
  //      noisy because LC may pad these arrays with trailing '' entries
  //      (observed live: a 3-case Run returned code_answer of length 4
  //      with the trailing entry being '').
  // Always returns ≥ 1 (D-05 keeps the tab strip visible even at N=1).
  let responseArity = 0;
  if (typeof res.total_testcases === 'number' && res.total_testcases > 0) {
    responseArity = Math.floor(res.total_testcases);
  } else if (typeof res.compare_result === 'string' && res.compare_result.length > 0) {
    responseArity = res.compare_result.length;
  } else {
    responseArity = Math.max(
      toLines(res.code_answer).length,
      toLines(res.expected_code_answer).length,
    );
  }
  const arity = Math.max(responseArity, 1);

  // ── Step 3: per-case pass mask (D-04 strict trim-compare) ──────────────
  // null = "no expected available" (custom-input run); no chip rendered.
  const outputs = splitOutput(res.code_answer, arity);
  const expected = splitOutput(res.expected_code_answer, arity);
  const passMask: Array<boolean | null> = [];
  for (let i = 0; i < arity; i++) {
    const exp = expected[i] ?? '';
    const out = outputs[i] ?? '';
    if (exp.length === 0) {
      passMask.push(null);
    } else {
      passMask.push(out.trim() === exp.trim());
    }
  }

  // ── Step 4: aggregate verdict ──────────────────────────────────────────
  const aggregatePass = passMask.every((m) => m !== false);
  const statusInfo = classifyStatus(
    typeof res.status_code === 'number' ? res.status_code : 10,
    typeof res.status_msg === 'string' ? res.status_msg : undefined,
  );
  const titleText = aggregatePass
    ? statusInfo.kind === 'ac'
      ? 'Accepted'
      : statusInfo.displayName
    : statusInfo.kind === 'ac' || statusInfo.kind === 'unknown'
      ? 'Wrong Answer'
      : statusInfo.displayName;
  const titleModifier = aggregatePass
    ? 'leetcode-verdict-title--success'
    : 'leetcode-verdict-title--error';

  // ── Step 5: D-13 chrome — verdict + Runtime line, NO problem title ─────
  setText(titleEl, titleText);
  addClass(titleEl, titleModifier);

  const runtimeText = typeof res.status_runtime === 'string' && res.status_runtime.length > 0
    ? `Runtime: ${res.status_runtime}`
    : 'Runtime: —';
  const runtimeRow = appendEl(contentEl, 'div', 'leetcode-verdict-runtime');
  setText(runtimeRow, runtimeText);

  const body = appendEl(contentEl, 'div', 'leetcode-verdict-body');
  body.setAttribute('aria-live', 'polite');

  // ── Step 6: D-05 always-on tab strip + D-04 PASS/FAIL chips ────────────
  const tabStrip = appendEl(body, 'div', 'leetcode-verdict-case-tabs');
  tabStrip.setAttribute('role', 'tablist');
  const caseBody = appendEl(body, 'div', 'leetcode-verdict-case-body');
  caseBody.setAttribute('role', 'tabpanel');

  // Per-case input chunks (D-08 — split joinedDataInput by lines-per-case).
  // splitInput's `arity` argument is LINES-PER-CASE, not case-count: LC's
  // wire format is one value per line, so for a 2-case Two Sum run with
  // metaData.params=[nums,target], joinedDataInput is 4 lines and we group
  // every 2 to recover per-case chunks. When metaData is absent, fall back
  // to splitting the input into one-chunk-per-case (lines / case-count) so
  // the raw-dump path still pairs the right input lines with the right
  // case body. Both paths defensively cap at ≥ 1 line-per-case.
  const md = parseMetaData(metaData);
  const linesPerCase = md && md.params.length >= 1
    ? md.params.length
    : (() => {
        const totalLines = (joinedDataInput ?? '').split('\n').filter((s) => s.length > 0).length;
        return arity > 0 ? Math.max(Math.ceil(totalLines / arity), 1) : 1;
      })();
  const inputChunks = splitInput(joinedDataInput, linesPerCase);

  const tabButtons: HTMLElement[] = [];

  const renderActiveCase = (activeIdx: number): void => {
    clear(caseBody);
    // Apply per-case state class for D-07 class-gated coloring.
    caseBody.className = 'leetcode-verdict-case-body';
    const passState = passMask[activeIdx];
    if (passState === true) addClass(caseBody, 'leetcode-verdict-case--pass');
    else if (passState === false) addClass(caseBody, 'leetcode-verdict-case--fail');

    // ── Step 7a: Input section (D-08) ─────────────────────────────────────
    renderInputSection(caseBody, inputChunks[activeIdx] ?? '', md);

    // ── Step 7b: Output section ──────────────────────────────────────────
    renderValueSection(
      caseBody,
      'Output',
      outputs[activeIdx] ?? '',
      'leetcode-verdict-output-value',
    );

    // ── Step 7c: Expected section (suppressed when no expected available) ─
    if (passState !== null) {
      renderValueSection(
        caseBody,
        'Expected',
        expected[activeIdx] ?? '',
        'leetcode-verdict-expected-value',
      );
    }

    // Update active-tab class on the strip.
    for (let i = 0; i < tabButtons.length; i++) {
      const btn = tabButtons[i];
      if (!btn) continue;
      if (i === activeIdx) addClass(btn, 'is-active');
      else btn.classList.remove('is-active');
    }
  };

  for (let i = 0; i < arity; i++) {
    const tab = appendEl(tabStrip, 'button', 'leetcode-verdict-case-tab');
    tab.setAttribute('type', 'button');
    tab.setAttribute('role', 'tab');
    const labelSpan = appendEl(tab, 'span', 'leetcode-verdict-case-tab-label');
    setText(labelSpan, `Case ${String(i + 1)}`);
    const passState = passMask[i];
    if (passState !== null) {
      const chip = appendEl(
        tab,
        'span',
        passState
          ? 'leetcode-verdict-case-chip leetcode-verdict-case-chip--pass'
          : 'leetcode-verdict-case-chip leetcode-verdict-case-chip--fail',
      );
      setText(chip, passState ? 'PASS' : 'FAIL');
    }
    const idx = i;
    tab.addEventListener('click', () => { renderActiveCase(idx); });
    tabButtons.push(tab);
  }

  // First tab active by default.
  renderActiveCase(0);

  // ── Step 8: Footer — single Close, NO Copy button (D-16 Run side) ──────
  const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
  // Phase 08 dogfood — Plan 08-05 originally only wired the AI Debug button
  // into renderSubmitVerdict + renderRunErrorBlock. Sample-test failures
  // (Wrong Answer with case tabs) route through this path and were missing
  // the button. Visibility: any per-case FAIL → button shows. ABSENT when
  // every case passes (treated as no-op success on Run; user can submit).
  if (!aggregatePass && onOpenAIDebug) {
    const aiBtn = appendEl(footer, 'button', 'leetcode-ai-debug-action');
    setText(aiBtn, 'AI: Debug');
    aiBtn.addEventListener('click', () => {
      onOpenAIDebug();
    });
  }
  const closeBtn = appendEl(footer, 'button', 'mod-cta');
  setText(closeBtn, 'Close');
  closeBtn.setAttribute('data-lc-role', 'close');
}

/** Phase 5.4 D-15 — Run-mode compile/runtime error renderer.
 *  Mirrors renderCeBody / renderReBody shape but is renderer-entry-point-
 *  scoped (takes titleEl + contentEl, not just body). Emits ZERO case-tabs
 *  per D-15. */
function renderRunErrorBlock(
  titleEl: HTMLElement,
  contentEl: HTMLElement,
  res: RunCheckResponse,
  onOpenAIDebug?: () => void,
): void {
  const statusInfo = classifyStatus(
    typeof res.status_code === 'number' ? res.status_code : 0,
    typeof res.status_msg === 'string' ? res.status_msg : undefined,
  );
  setText(titleEl, statusInfo.displayName);
  addClass(titleEl, 'leetcode-verdict-title--error');

  if (typeof res.status_runtime === 'string' && res.status_runtime.length > 0) {
    const runtimeRow = appendEl(contentEl, 'div', 'leetcode-verdict-runtime');
    setText(runtimeRow, `Runtime: ${res.status_runtime}`);
  }

  const body = appendEl(contentEl, 'div', 'leetcode-verdict-body');
  body.setAttribute('aria-live', 'polite');

  const errText = firstNonEmpty(
    res.full_compile_error,
    res.compile_error,
    res.full_runtime_error,
    res.runtime_error,
  );
  const pre = appendEl(body, 'pre', 'leetcode-verdict-error-pre');
  setText(pre, errText);

  const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
  // Phase 08 dogfood — Run-side compile/runtime errors are non-Accepted and
  // should expose AI Debug like Submit-side ce/re do.
  if (onOpenAIDebug) {
    const aiBtn = appendEl(footer, 'button', 'leetcode-ai-debug-action');
    setText(aiBtn, 'AI: Debug');
    aiBtn.addEventListener('click', () => {
      onOpenAIDebug();
    });
  }
  const closeBtn = appendEl(footer, 'button', 'mod-cta');
  setText(closeBtn, 'Close');
  closeBtn.setAttribute('data-lc-role', 'close');
}

/** Phase 5.4 D-08 — Input section renderer for the active case. When
 *  metaData parses, label rows by `paramName = value` (one row per param);
 *  otherwise fall back to a single `<pre>` block with the raw per-case
 *  input dump (D-08 fallback mandate).
 *
 *  Rationale for the per-line param mapping: LC's interpret_solution wire
 *  format is one value per line, in the order metaData.params declares.
 *  splitInput already groups by arity = params.length, so the active
 *  case's chunk has exactly `arity` lines (one per param). When that
 *  alignment doesn't hold (chunk has fewer lines than params, or no
 *  metaData), the renderer falls back to the raw chunk in a single pre. */
function renderInputSection(
  parent: HTMLElement,
  chunk: string,
  md: ReturnType<typeof parseMetaData>,
): void {
  // Phase 5.4 UAT-G5 (2026-05-13) — match the Output/Expected DOM shape:
  // outer wrapper carries `.leetcode-verdict-section` (no surface) so the
  // "Input" label sits ABOVE the gray fenced block, exactly like Output and
  // Expected. The inner pre (or rows wrapper) carries `.leetcode-verdict-
  // input-section` which DOES paint the gray surface, keeping the visual
  // weight consistent with Output/Expected's surfaced `<pre>`.
  const section = appendEl(parent, 'div', 'leetcode-verdict-section');
  const label = appendEl(section, 'div', 'leetcode-verdict-section-label');
  setText(label, 'Input');
  label.setAttribute('aria-label', 'Input');

  const lines = chunk.length === 0 ? [] : chunk.split('\n');
  if (md && md.params.length >= 1 && lines.length === md.params.length) {
    const body = appendEl(section, 'div', 'leetcode-verdict-input-section');
    for (let i = 0; i < md.params.length; i++) {
      const param = md.params[i];
      if (!param) continue;
      const row = appendEl(body, 'div', 'leetcode-verdict-input-param');
      const name = appendEl(row, 'span', 'leetcode-verdict-input-param-name');
      setText(name, `${param.name} =`);
      const value = appendEl(row, 'pre', 'leetcode-verdict-input-param-value');
      setText(value, lines[i] ?? '');
    }
    return;
  }

  // Fallback: raw dump in a single <pre> with the surface class so it
  // visually matches the labeled-rows path.
  const pre = appendEl(section, 'pre', 'leetcode-verdict-input-section leetcode-verdict-input-param-value');
  setText(pre, chunk);
}

/** Phase 5.4 D-07 — Value-section renderer for Output / Expected. The
 *  value-text class (`leetcode-verdict-output-value` /
 *  `leetcode-verdict-expected-value`) is the target of the Plan-04 CSS
 *  rule that gates color on the parent `.leetcode-verdict-case--{pass,fail}`
 *  class set in renderRunResult Step 7. */
function renderValueSection(
  parent: HTMLElement,
  labelText: string,
  value: string,
  valueClass: string,
): void {
  const section = appendEl(parent, 'div', 'leetcode-verdict-section');
  const label = appendEl(section, 'div', 'leetcode-verdict-section-label');
  setText(label, labelText);
  label.setAttribute('aria-label', labelText);
  const pre = appendEl(section, 'pre', valueClass);
  setText(pre, value);
}

/** Mirror of VerdictModal's addClass helper — pure-DOM, falls back to
 *  classList when the Obsidian-only `addClass()` method is absent (test
 *  env). Keeps renderer environment-agnostic per file-header purity rule. */
function addClass(el: HTMLElement | null | undefined, cls: string): void {
  if (!el) return;
  const maybe = el as unknown as { addClass?: (c: string) => void };
  if (typeof maybe.addClass === 'function') {
    maybe.addClass(cls);
  } else {
    el.classList.add(cls);
  }
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
  onOpenAIDebug: (() => void) | undefined,
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
  // Phase 08 Plan 05 (AIDBG-01) — Conditional `AI: Debug` button. Locked
  // visibility union (RESEARCH §Pitfall 7): kind ∈ {wa, tle, mle, re, ce}.
  // ABSENT for ac (Phase 09 territory), ole/ie/unknown/unknown-lc (no
  // actionable failing case). Neutral class — NO .mod-cta (UI-SPEC §Color).
  // Defensive gate on `onOpenAIDebug` truthiness so the button never paints
  // without a wired callback (T-08-05-D-callback-undef mitigation).
  const showAIDebugButton =
    kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce';
  if (showAIDebugButton && onOpenAIDebug) {
    const aiBtn = appendEl(footer, 'button', 'leetcode-ai-debug-action');
    setText(aiBtn, 'AI: Debug');
    aiBtn.addEventListener('click', () => {
      onOpenAIDebug();
    });
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

/** Phase 5.4 D-15 — Run-mode compile/runtime error sniff. LC's Run path
 *  fills `compile_error` / `runtime_error` while leaving `code_answer` empty
 *  (so isRunResponse returns false). This helper surfaces that case so the
 *  renderer's Run branch (renderRunResult → renderRunErrorBlock) handles
 *  the error layout instead of falling through to the Submit branch.
 *
 *  Heuristic: status_code is one of LC's run-side error codes (15 RE, 20 CE)
 *  AND code_answer is absent OR empty AND a compile_error/runtime_error
 *  string is present. The narrow status_code gate prevents WA / TLE / MLE
 *  Submit responses from being misrouted (those carry input + last_testcase
 *  + status_code 11/12/14 — handled by the Submit branch). */
function hasRunErrorPayload(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  // Submit responses carry submission_id (or last_testcase + total_testcases);
  // Run responses do not. If submission_id is present, route to Submit.
  if (typeof r.submission_id === 'string' || typeof r.submission_id === 'number') return false;
  if (typeof r.total_testcases === 'number' && r.total_testcases > 0) return false;
  const codeAnswerEmpty =
    !Array.isArray(r.code_answer) || (r.code_answer as unknown[]).length === 0;
  if (!codeAnswerEmpty) return false;
  const hasCompileErr =
    (typeof r.compile_error === 'string' && r.compile_error.length > 0) ||
    (typeof r.full_compile_error === 'string' && r.full_compile_error.length > 0);
  const hasRuntimeErr =
    (typeof r.runtime_error === 'string' && r.runtime_error.length > 0) ||
    (typeof r.full_runtime_error === 'string' && r.full_runtime_error.length > 0);
  return hasCompileErr || hasRuntimeErr;
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
