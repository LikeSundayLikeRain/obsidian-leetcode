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

// Phase 5 Wave 2 (D-20) — raised by requestUrlFetcher when a non-polling
// requestUrl call exceeds the 10s Promise.race timeout (override via
// throttledRequestUrl(params, { timeoutMs })). Consumed by the command-palette
// error branches in main.ts to fire the locked "LeetCode is slow to respond.
// Try again." Notice (D-22 surface routing).
export class TimeoutError extends Error {
  constructor(msg = 'LeetCode request timed out') {
    super(msg);
    this.name = 'TimeoutError';
  }
}

// Phase 5 Wave 2 (D-19) — classify a caught error as a transport-layer
// Chromium network failure (DNS / routing / connection). Matching the token
// anywhere in err.message is deliberate: Electron surfaces these tokens with
// varying prefixes (`net::`, `Error: net::`, `Failed to load resource:`) and
// the downstream Notice decision is the same for all of them. Unknown tokens
// fall through to the generic error path (T-05-03-04 accept — whitelist is
// string-inclusion only, no regex parsing).
const NETWORK_ERROR_TOKENS = [
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_REFUSED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK_CHANGED',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_PROXY_CONNECTION_FAILED',
  'ERR_NAME_RESOLUTION_FAILED',
] as const;

export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  for (const token of NETWORK_ERROR_TOKENS) {
    if (msg.includes(token)) return true;
  }
  return false;
}
