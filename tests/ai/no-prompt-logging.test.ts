// tests/ai/no-prompt-logging.test.ts
//
// Phase 08 Plan 02 Task 1 — RESEARCH §Pitfall 10 mitigation. Asserts that no
// source file under src/ai/ passes a `prompt` or `responseText` field to a
// logger call. Logger redaction (Phase 07 T-07-05) covers headers but NOT
// generic body fields like `prompt`. The grep here is the layer-2 regression
// (mirrors tests/ai/lc-isolation.test.ts shape — fs walk + per-file content
// scan). Allow comment lines + tests by walking only src/ai/ non-test files.
//
// Match shape: `logger.{debug,info,warn,error}(...prompt...)` or
//              `logger.{debug,info,warn,error}(...responseText...)`
// inside a single function-call expression. Comments (`//`) and string
// literals not inside logger args are tolerated by checking only physical
// `logger.X(` substrings followed by the field name within a small window.

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

async function walkTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkTs(rel)));
    } else if (
      e.isFile() &&
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.d.ts') &&
      !e.name.endsWith('.test.ts')
    ) {
      out.push(rel);
    }
  }
  return out;
}

async function readFileSafe(rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Strip line comments (// ...) and block comments so the regex below does
 * not flag commented-out logger calls or JSDoc that mentions `prompt`.
 * Crude but adequate for the grep guard — no string-literal accounting
 * needed because logger calls passing `prompt`/`responseText` as fields
 * are the exact pattern we want to prevent.
 */
function stripComments(src: string): string {
  // Block comments first
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Then line comments
  out = out.replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
  return out;
}

/**
 * Returns offending file/match list for any logger call that passes a
 * `prompt` or `responseText` field. Pattern: `logger.<level>(`...`prompt`
 * or `responseText` within ~400 chars (single call expression bound).
 */
function findOffenders(content: string): string[] {
  const stripped = stripComments(content);
  const offenders: string[] = [];
  // Match logger.{level}( ... prompt|responseText ... ) with non-greedy
  // capture across newlines but bounded by the closing paren.
  const re =
    /logger\.(debug|info|warn|error)\s*\(([\s\S]{0,500}?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const args = m[2] ?? '';
    // Look for object-property mention of prompt/responseText. Word-boundary
    // delimiter avoids false positives like "noPromptLogging" or "promptId".
    if (/\bprompt\b/.test(args) || /\bresponseText\b/.test(args)) {
      offenders.push(m[0].slice(0, 120));
    }
  }
  return offenders;
}

describe('Phase 08 AIDBG-T-08-02-IL-prompt — no full-prompt/response logging in src/ai/', () => {
  it('No logger call site in src/ai/ passes a `prompt` or `responseText` field', async () => {
    const files = await walkTs('src/ai');
    const offenders: { file: string; matches: string[] }[] = [];
    for (const f of files) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const matches = findOffenders(content);
      if (matches.length > 0) {
        offenders.push({ file: f, matches });
      }
    }
    if (offenders.length > 0) {
      // Format an actionable error so a maintainer immediately sees which
      // files / matches tripped the gate.
      const formatted = offenders
        .map((o) => `  ${o.file}:\n    ${o.matches.join('\n    ')}`)
        .join('\n');
      throw new Error(
        `Logger calls in src/ai/ must not pass prompt/responseText fields:\n${formatted}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
