// tests/ai/readme-network-use.test.ts
//
// Phase 07 Plan 06 Task 2 — README ## Network usage CI grep gate (AIPROV-07).
//
// Plugin-store reviewers grep README claims against source. This test enforces
// parity at every commit: every host the plugin can contact MUST appear in the
// README's `## Network usage` section, alongside the Authentication and Cost
// expectations subsections. Drift between README and source becomes
// immediately visible in CI.
//
// The test reads README.md from disk (resolved relative to project root via
// __dirname) and asserts every required substring is present.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('README network-use enumeration (AIPROV-07)', () => {
  const README = readFileSync(path.resolve(__dirname, '../../README.md'), 'utf8');

  test('contains ## Network usage section', () => {
    expect(README).toContain('## Network usage');
  });

  test('mentions leetcode.com', () => {
    expect(README).toContain('leetcode.com');
  });

  test('mentions api.anthropic.com', () => {
    expect(README).toContain('api.anthropic.com');
  });

  test('mentions api.openai.com', () => {
    expect(README).toContain('api.openai.com');
  });

  test('mentions openrouter.ai', () => {
    expect(README).toContain('openrouter.ai');
  });

  test('mentions Ollama default localhost:11434', () => {
    expect(README).toContain('localhost:11434');
  });

  test('mentions Custom OpenAI-compatible endpoint', () => {
    expect(README).toContain('Custom');
    expect(README).toMatch(/[Cc]ustom OpenAI-compatible/);
  });

  // Phase 08.1 Plan 02 — Bedrock joins the README enumeration as the 5th AI
  // provider. Plugin-store reviewer parity: every host the plugin can contact
  // must appear in the README ## Network usage section.
  test('mentions AWS Bedrock regional endpoint format', () => {
    expect(README).toContain('AWS Bedrock');
    expect(README).toContain('bedrock-runtime');
    expect(README).toMatch(/bedrock-runtime\.\{region\}\.amazonaws\.com/);
  });

  test('contains ### Authentication subsection', () => {
    expect(README).toContain('### Authentication');
  });

  test('AI keys disclosure mentions plain text in data.json', () => {
    expect(README).toMatch(/plain text.*data\.json/);
  });

  test('AI keys disclosure mentions logger redaction', () => {
    expect(README).toContain('logger.ts');
  });

  test('contains ### Cost expectations subsection', () => {
    expect(README).toContain('### Cost expectations');
  });

  test('Cost expectations mentions Phase 09 cost-cap UI', () => {
    expect(README).toContain('Phase 09');
  });

  test('Cost expectations mentions defaults may rot', () => {
    expect(README).toContain('rot');
  });

  test('preserves v1.0 LC cookie disclosure under Authentication', () => {
    // The v1.0 cookie disclosure mentions BrowserWindow + LEETCODE_SESSION cookie.
    // We assert the substring is present, NOT that it's identical char-for-char,
    // because the v1.0 wording may shift slightly across releases.
    expect(README).toMatch(/cookie/i);
    expect(README).toMatch(/never transmitted anywhere except.*leetcode\.com/i);
  });

  test('explicitly disclaims telemetry', () => {
    expect(README).toContain('No telemetry');
  });

  test('does NOT mention deprecated/wrong base URLs', () => {
    // Regression: ensure no Phase-12 placeholder we forgot to fill.
    // The base-URL list MUST NOT contain TODO / FIXME / TBD / PLACEHOLDER tokens.
    expect(README).not.toContain('TODO');
    expect(README).not.toContain('FIXME');
    expect(README).not.toContain('TBD');
    expect(README).not.toContain('PLACEHOLDER');
  });
});
