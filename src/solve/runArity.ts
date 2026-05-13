// src/solve/runArity.ts
//
// Phase 5.4 Plan 01 — Wave 0 scaffolding for the Run-mode multi-case
// pipeline. Pure helpers shared by RunModal (D-01 join-all-tabs on Run)
// and verdictModalRenderer (D-02 arity, D-08 metaData parse, per-case
// split for the new tab strip).
//
// References:
//   - .planning/phases/05.4-run-verdict-ux-button-polish/05.4-CONTEXT.md
//     §D-01 (batched interpret_solution call), §D-02 (sampleTestCase
//     arity = lines per case), §D-08 (metaData.params drives input
//     section; raw fallback when malformed/absent).
//   - .planning/phases/05.4-run-verdict-ux-button-polish/05.4-RESEARCH.md
//     §Q3 (metaData JSON shape), §Pitfall 2 (toLines defensiveness),
//     §Pitfall 4 (metaData is a JSON string).
//
// Purity: no imports beyond types, no DOM, no I/O. Mirrors the posture
// of src/solve/statusMap.ts (CONTEXT D-15 fallback) — every malformed
// or missing input branch returns a sentinel value (null / [] / 1 /
// padded array), never throws. The renderer reuses these helpers
// without try/catch wrappers because the helpers themselves are
// total functions.

/** A single LC metaData parameter — `name` is the user-facing label
 *  for the D-08 input section, `type` is informational (we don't
 *  type-validate user input client-side). */
export interface MetaDataParam {
  name: string;
  type: string;
}

/** The subset of LC's metaData JSON shape we consume. LC includes
 *  more fields (e.g., return.type, languages-specific overrides);
 *  we ignore everything except params. */
export interface MetaData {
  name: string;
  params: MetaDataParam[];
  return?: { type: string };
}

/** Parse LC's `metaData` GraphQL field — a JSON-serialized string —
 *  into a typed object. Returns null on:
 *   - undefined / empty / whitespace-only input
 *   - malformed JSON (try/catch)
 *   - parsed object that lacks an array `params` field
 *  Per D-08 fallback mandate: caller renders the raw `joinedDataInput`
 *  string when this returns null. NEVER throws — the renderer code
 *  path must remain pure-DOM and not have to wrap this in try/catch.
 */
export function parseMetaData(raw: string | undefined | null): MetaData | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.params)) return null;
  // Defensive: every entry must look like { name: string, type: string }.
  // If any entry is malformed, treat the whole metaData as unusable
  // (renderer falls back to raw dump per D-08).
  const params: MetaDataParam[] = [];
  for (const p of obj.params) {
    if (!p || typeof p !== 'object') return null;
    const pp = p as Record<string, unknown>;
    if (typeof pp.name !== 'string' || typeof pp.type !== 'string') return null;
    params.push({ name: pp.name, type: pp.type });
  }
  const name = typeof obj.name === 'string' ? obj.name : '';
  const ret =
    obj.return && typeof obj.return === 'object'
      ? (() => {
          const r = obj.return as Record<string, unknown>;
          return typeof r.type === 'string' ? { type: r.type } : undefined;
        })()
      : undefined;
  return { name, params, return: ret };
}

/** Derive per-case arity (lines per case) for the multi-case Run wire
 *  format. Priority (per D-02 + D-08):
 *    1. Parse metaData; use params.length when ≥ 1.
 *    2. Otherwise, count non-empty lines in sampleTestCase.
 *    3. Otherwise, return 1 (single-case minimum — D-05 keeps the tab
 *       strip visible even at N=1).
 *  Always returns a positive integer. NEVER throws. */
export function deriveArity(
  metaData: string | undefined | null,
  sampleTestCase: string | undefined | null,
): number {
  const md = parseMetaData(metaData);
  if (md && md.params.length >= 1) return md.params.length;
  if (typeof sampleTestCase === 'string' && sampleTestCase.length > 0) {
    const lines = sampleTestCase.split('\n').filter((s) => s.length > 0);
    if (lines.length >= 1) return lines.length;
  }
  return 1;
}

/** Slice the joined `data_input` string back into per-case chunks.
 *  Each chunk is `arity` consecutive non-empty lines joined by `\n`,
 *  matching the wire format produced by joinCasesForRun (D-01 + D-02).
 *
 *  Behavior:
 *   - empty / whitespace-only joined → []
 *   - arity ≤ 0 (defensive) → [trimmed-joined] (single chunk)
 *   - normal: split on `\n`, drop empty lines, group every `arity`
 *     lines into one case.
 *  NEVER throws.
 */
export function splitInput(joined: string | undefined | null, arity: number): string[] {
  if (typeof joined !== 'string') return [];
  if (joined.trim().length === 0) return [];
  if (!Number.isFinite(arity) || arity <= 0) return [joined.trim()];
  const lines = joined.split('\n').filter((s) => s.length > 0);
  if (lines.length === 0) return [];
  const cases: string[] = [];
  for (let i = 0; i < lines.length; i += arity) {
    const chunk = lines.slice(i, i + arity);
    if (chunk.length === 0) continue;
    cases.push(chunk.join('\n'));
  }
  return cases;
}

/** Inverse of splitInput — join per-case strings into a single
 *  newline-separated wire-format string. Each case is trimmed; empty
 *  cases are filtered out (matches RunModal production usage when the
 *  user adds a custom tab and leaves it blank). The `arity` parameter
 *  is informational and not currently used by the join (LC just wants
 *  a flat newline list); reserved for future arity-aware shaping if
 *  needed. NEVER throws. */
export function joinCasesForRun(
  cases: string[] | undefined | null,
  _arity: number,
): string {
  if (!Array.isArray(cases)) return '';
  return cases
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .join('\n');
}

/** Normalize LC's `code_answer` / `expected_code_answer` (typed
 *  `string | string[] | undefined` per types.ts:78-79) into a
 *  fixed-length `string[]` of length `arity`. Pads short arrays with
 *  empty strings (Pitfall 1 protection — partial-failure responses
 *  may have fewer outputs than the input arity). Returns
 *  Array(arity).fill('') when input is undefined.
 *  NEVER throws. */
export function splitOutput(
  arr: string | string[] | undefined | null,
  arity: number,
): string[] {
  const safeArity = Number.isFinite(arity) && arity > 0 ? Math.floor(arity) : 0;
  if (safeArity === 0) {
    if (Array.isArray(arr)) {
      return arr.filter((s): s is string => typeof s === 'string');
    }
    if (typeof arr === 'string') return [arr];
    return [];
  }
  let source: string[];
  if (Array.isArray(arr)) {
    source = arr.filter((s): s is string => typeof s === 'string');
  } else if (typeof arr === 'string') {
    source = [arr];
  } else {
    source = [];
  }
  const out: string[] = Array.from({ length: safeArity }, (_v, i) =>
    i < source.length ? (source[i] ?? '') : '',
  );
  return out;
}
