export class SessionExpiredError extends Error {
  constructor(msg = 'LeetCode session expired') {
    super(msg);
    this.name = 'SessionExpiredError';
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number, msg = 'LeetCode rate-limited') {
    super(msg);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  constructor(msg: string, public readonly cause?: unknown) {
    super(msg);
    this.name = 'NetworkError';
  }
}

// Phase 3 — Submission error hierarchy (CONTEXT code_context, D-15, D-22, D-23, D-24).
// These are thrown by Plan 05 SubmissionOrchestrator and consumed by Plan 06 VerdictModal.
// Each has a distinct .name so both `err instanceof XError` and `err.name === 'XError'`
// are reliable discriminators across bundle boundaries.

export class NoCodeBlockError extends Error {
  constructor() {
    super('No fenced code block found in the active note');
    this.name = 'NoCodeBlockError';
  }
}

export class InProgressError extends Error {
  constructor() {
    super('A submission is already in progress');
    this.name = 'InProgressError';
  }
}

export class JudgeTimeoutError extends Error {
  constructor() {
    super('LeetCode judge timed out');
    this.name = 'JudgeTimeoutError';
  }
}

export class AbortError extends Error {
  constructor() {
    super('Submission aborted by user');
    this.name = 'AbortError';
  }
}

// D-15 — Unknown verdict fallback: carries the raw LC payload so the modal's
// "Copy payload" action can dump it to the clipboard for issue filing. No
// redaction here — logger.redact is applied at emit sites (Phase 1 logger).
export class UnknownVerdictError extends Error {
  public readonly payload: unknown;
  constructor(payload: unknown) {
    super('Unrecognized verdict from LeetCode');
    this.name = 'UnknownVerdictError';
    this.payload = payload;
  }
}
