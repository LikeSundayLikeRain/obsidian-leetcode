// src/solve/verdictGuard.ts
//
// T-03-04-05 mitigation — classify-and-throw helper extracted for independent testability.
//
// When LC returns a status_code outside the KNOWN map, submitFromActive must
// surface an explicit UnknownVerdictError carrying the raw payload so the modal's
// D-15 "Copy payload" affordance is available for bug-report filing.
//
// Extracted from src/main.ts submitFromActive so the security contract is
// independently testable without requiring a live Obsidian Plugin or VerdictModal.
//
// Purity: no DOM interaction, no Obsidian imports, no I/O.

import { classifyStatus } from './statusMap';
import { UnknownVerdictError } from '../shared/errors';
import type { SubmitCheckResponse } from './types';

/** Classifies the terminal status_code. If it maps to 'unknown' (i.e., a code
 *  not present in the KNOWN map in statusMap.ts), throws UnknownVerdictError
 *  with the full terminal payload attached. For all known codes (10–21), returns
 *  void without throwing.
 *
 *  Callers: src/main.ts submitFromActive, after orch.submit() resolves with a
 *  terminal payload. The catch branch routes UnknownVerdictError to
 *  modal.renderVerdict(err.payload, ctx.title) which invokes renderUnknownVerdict.
 */
export function assertKnownVerdictOrThrow(terminal: SubmitCheckResponse): void {
  const info = classifyStatus(terminal.status_code, terminal.status_msg);
  if (info.kind === 'unknown') {
    throw new UnknownVerdictError(terminal);
  }
}
