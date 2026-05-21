// src/graph/parseKgResponse.ts
//
// Phase 11 Plan 01 Task 1 — Defensive JSON parser for AI classification response.
//
// Purity contract:
//   - Only import is normalizePatternName from patternTaxonomy (SSoT).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same input -> same output.
//   - Safe inside `vault.process` retry semantics.
//
// Parsing strategy (per RESEARCH.md Pitfall 1):
//   1. Try direct JSON.parse
//   2. Strip markdown code fences then parse
//   3. Regex extract first {...} then parse
//   4. Fallback to { pattern: 'OTHER', variants: [], lookAhead: [] }
//
// Threat mitigation (T-11-01, T-11-03):
//   - Strict JSON schema validation; cap arrays at 2
//   - Normalize pattern names
//   - Fallback to safe default on parse failure
//   - Bounded parse attempts (4 strategies, then fallback); no unbounded regex; no eval

import { normalizePatternName } from './patternTaxonomy';

export interface KgClassification {
  pattern: string;
  patterns: string[];
  variants: Array<{ slug: string; reason: string }>;
  lookAhead: Array<{ slug: string; reason: string }>;
}

const FALLBACK: KgClassification = {
  pattern: 'OTHER',
  patterns: ['OTHER'],
  variants: [],
  lookAhead: [],
};

/**
 * Defensive JSON parser for AI classification response.
 * Handles valid JSON, fenced JSON, regex extraction, and graceful fallback.
 */
export function parseKgResponse(text: string): KgClassification {
  // Strategy 1: Direct JSON.parse
  const direct = tryParse(text);
  if (direct) return validate(direct);

  // Strategy 2: Strip markdown code fences then parse
  const stripped = stripCodeFences(text);
  if (stripped !== text) {
    const fenced = tryParse(stripped);
    if (fenced) return validate(fenced);
  }

  // Strategy 3: Regex extract first {...} then parse
  const extracted = extractJsonObject(text);
  if (extracted) {
    const regex = tryParse(extracted);
    if (regex) return validate(regex);
  }

  // Strategy 4: Fallback
  return { ...FALLBACK };
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripCodeFences(text: string): string {
  // Match ```json or ``` at start/end (with optional language tag)
  const fenceRe = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/;
  const m = fenceRe.exec(text.trim());
  return m ? m[1]! : text;
}

function extractJsonObject(text: string): string | null {
  // Find the first balanced { ... } in the text
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function isValidEntry(entry: unknown): entry is { slug: string; reason: string } {
  if (entry === null || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return typeof e.slug === 'string' && typeof e.reason === 'string';
}

function validate(raw: unknown): KgClassification {
  if (raw === null || typeof raw !== 'object') return { ...FALLBACK, patterns: [...FALLBACK.patterns] };

  const obj = raw as Record<string, unknown>;

  // Pattern: must be string, normalize it
  const pattern = typeof obj.pattern === 'string' && obj.pattern.trim().length > 0
    ? normalizePatternName(obj.pattern)
    : 'OTHER';

  // Patterns array: 1-2 entries, normalized. Falls back to [pattern] if absent.
  let patterns: string[];
  if (Array.isArray(obj.patterns) && obj.patterns.length > 0) {
    patterns = obj.patterns
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map(normalizePatternName)
      .slice(0, 2);
  } else {
    patterns = [pattern];
  }
  if (patterns.length === 0) patterns = [pattern];

  // Variants: filter valid entries, cap at 2
  const rawVariants = Array.isArray(obj.variants) ? obj.variants : [];
  const variants = rawVariants
    .filter(isValidEntry)
    .slice(0, 2);

  // LookAhead: filter valid entries, cap at 2
  const rawLookAhead = Array.isArray(obj.lookAhead) ? obj.lookAhead : [];
  const lookAhead = rawLookAhead
    .filter(isValidEntry)
    .slice(0, 2);

  return { pattern: patterns[0]!, patterns, variants, lookAhead };
}
