// src/graph/dateFormat.ts
//
// Phase 4 Plan 02 — pure date helper for the on-AC `lc-solved-date` frontmatter
// field (GRAPH-02, D-10). Format: ISO-8601 local-timezone,
//   `YYYY-MM-DDTHH:MM:SS±HH:MM`
// DST-aware via native `Date.getTimezoneOffset` (MDN-documented; returns the
// minute offset FROM UTC for the Date instance, which reflects DST for the
// absolute instant the Date represents).
//
// Purity contract (Plan 04-02 L294):
//   - Zero imports
//   - Zero I/O
//   - Same Date input → same string output
//   - Safe inside `vault.process` retry (CF-06) and inside `processFrontMatter`
//     callbacks; callers ALWAYS pass a single captured `new Date()` rather than
//     calling `toIsoLocalTz(new Date())` inside a retryable callback.
//
// Consumed by KnowledgeGraphWriter (Plan 03) for the `lc-solved-date`
// frontmatter field on every Accepted submission (D-10, GRAPH-02).

/**
 * Format a Date as ISO-8601 local-timezone: `YYYY-MM-DDTHH:MM:SS±HH:MM`.
 *
 * Example (America/Los_Angeles, Feb 1 2026 12:00 local):
 *   `2026-02-01T12:00:00-08:00`
 *
 * Example (same host, Mar 9 2026 12:00 local — DST has kicked in):
 *   `2026-03-09T12:00:00-07:00`
 *
 * Example (UTC host):
 *   `2026-05-09T14:32:01+00:00`
 */
export function toIsoLocalTz(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  // getTimezoneOffset returns minutes WEST of UTC (positive for negative
  // real-world offsets). Flip the sign so `+` means ahead-of-UTC, matching
  // the ISO-8601 convention users expect.
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = Math.floor(abs / 60);
  const om = abs % 60;
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    sign + pad(oh) + ':' + pad(om)
  );
}
