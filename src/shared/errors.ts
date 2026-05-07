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
