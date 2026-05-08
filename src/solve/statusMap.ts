// src/solve/statusMap.ts
//
// LC status_code integer → verdict kind + display name.
// Reference: skygragon/leetcode-cli lib/helper.js statusToName (2019).
// Phase 3 adds the 'unknown' fallback per CONTEXT D-15 so we never crash
// when LC introduces a new status integer; the modal shows the raw msg
// with a `Copy payload` action for bug-report filing.
//
// Purity: no imports, no state, no I/O.

export type VerdictKind =
  | 'ac'
  | 'wa'
  | 'mle'
  | 'ole'
  | 'tle'
  | 're'
  | 'ie'
  | 'ce'
  | 'unknown-lc'
  | 'unknown';

export interface StatusInfo {
  kind: VerdictKind;
  displayName: string;
}

const KNOWN: Readonly<Record<number, StatusInfo>> = {
  10: { kind: 'ac',         displayName: 'Accepted' },
  11: { kind: 'wa',         displayName: 'Wrong Answer' },
  12: { kind: 'mle',        displayName: 'Memory Limit Exceeded' },
  13: { kind: 'ole',        displayName: 'Output Limit Exceeded' },
  14: { kind: 'tle',        displayName: 'Time Limit Exceeded' },
  15: { kind: 're',         displayName: 'Runtime Error' },
  16: { kind: 'ie',         displayName: 'Internal Error' },
  20: { kind: 'ce',         displayName: 'Compile Error' },
  21: { kind: 'unknown-lc', displayName: 'Unknown Error' },
};

export function classifyStatus(code: number, msg?: string): StatusInfo {
  const known = KNOWN[code];
  if (known) return known;
  return { kind: 'unknown', displayName: msg ?? `Unrecognized status ${code}` };
}
