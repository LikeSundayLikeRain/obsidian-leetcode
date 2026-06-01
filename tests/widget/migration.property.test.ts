// Phase 21 Plan 21-01 — migration property-test corpus.
//
// Mirrors the shape of tests/widget/fenceSerialization.property.test.ts.
// Generates synthetic v1.2 notes with random LC langSlug × random body
// content × CRLF mix, runs migrateLegacyFenceIfNeeded against an in-memory
// mock App, and verifies four invariants per D-fixtures-02:
//   1. body-preservation: extractFenceBody(migrated, 0) === pre-migration body
//   2. frontmatter preservation: every lc-* key (other than lc-language when
//      missing) survives byte-identical
//   3. idempotency: second migrate returns false; file content unchanged
//   4. backup-correctness: adapter.write spy received pre-migration text
//      byte-exact
//
// 100+ cases via cartesian product (langSlugs × bodies × CRLF flag).
// Pure mocks — no real I/O.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { migrateLegacyFenceIfNeeded } from '../../src/widget/fenceMigrator';
import { extractFenceBody } from '../../src/widget/fenceSerialization';

// ───────────────────────────────────────────────────────────────────────────
// Corpus generators — mirror SHELLS × HOSTILE_BODIES from
// tests/widget/fenceSerialization.property.test.ts.
// ───────────────────────────────────────────────────────────────────────────

const HOSTILE_BODIES: string[] = [
  '',
  'x',
  'a\nb\nc',
  'a\r\nb\r\nc',
  '```\nnested\n```',
  '---\nframtmatter-like\n---',
  '\t\tindent\n    spaces',
  'trailing space   \nnext',
  'no-newline-at-end',
  'ending-mid-byte\n\n\n',
  '🎉unicode',
];

// Recognized LC langSlugs + aliases (subset for property-test diversity).
const LANG_SLUGS = [
  'python3', 'python', 'java', 'cpp', 'c++', 'golang', 'go',
  'rust', 'rs', 'javascript', 'js', 'typescript', 'ts',
];

function buildShell(langSlug: string, body: string, useCrlf: boolean): string {
  const eol = useCrlf ? '\r\n' : '\n';
  return [
    `## Code`,
    ``,
    `\`\`\`${langSlug}`,
    body,
    `\`\`\``,
    ``,
  ].join(eol);
}

interface MockState {
  fileText: string;
  frontmatter: Record<string, unknown>;
  vaultProcessSpy: ReturnType<typeof vi.fn>;
  adapterWriteSpy: ReturnType<typeof vi.fn>;
  adapterMkdirSpy: ReturnType<typeof vi.fn>;
  processFrontMatterSpy: ReturnType<typeof vi.fn>;
  vaultReadSpy: ReturnType<typeof vi.fn>;
}

function makeMockApp(initialText: string, initialFm: Record<string, unknown>) {
  let currentText = initialText;
  const fm = { ...initialFm };
  const state: MockState = {
    fileText: initialText,
    frontmatter: fm,
    vaultReadSpy: vi.fn(async () => currentText),
    vaultProcessSpy: vi.fn(async (_f: unknown, fn: (text: string) => string) => {
      currentText = fn(currentText);
      state.fileText = currentText;
    }),
    adapterWriteSpy: vi.fn(async () => {}),
    adapterMkdirSpy: vi.fn(async () => {}),
    processFrontMatterSpy: vi.fn(
      async (_f: unknown, fn: (fmObj: Record<string, unknown>) => void) => {
        fn(fm);
        state.frontmatter = { ...fm };
      },
    ),
  };
  const file = { path: 'LeetCode/test.md', name: 'test.md', extension: 'md' };
  const app = {
    vault: {
      read: state.vaultReadSpy,
      process: state.vaultProcessSpy,
      adapter: {
        write: state.adapterWriteSpy,
        mkdir: state.adapterMkdirSpy,
      },
    },
    metadataCache: {
      getFileCache: (_f: unknown) => ({ frontmatter: state.frontmatter }),
    },
    fileManager: {
      processFrontMatter: state.processFrontMatterSpy,
    },
  };
  return { app, file, state };
}

// ───────────────────────────────────────────────────────────────────────────
// Generated cartesian-product corpus.
// ───────────────────────────────────────────────────────────────────────────

interface Case {
  label: string;
  langSlug: string;
  body: string;
  useCrlf: boolean;
  lcLangValue: 'set' | 'missing' | 'empty';
}

const cases: Case[] = [];
LANG_SLUGS.forEach((langSlug) => {
  HOSTILE_BODIES.forEach((body, bodyIdx) => {
    [false, true].forEach((useCrlf) => {
      // For diversity, vary the lc-language frontmatter shape across the matrix.
      const lcLangVariants: Array<'set' | 'missing' | 'empty'> = ['set'];
      // Add 'missing' / 'empty' variants for every 5th case to reach the
      // 100+ count while keeping the matrix tractable.
      if (bodyIdx % 5 === 0) lcLangVariants.push('missing');
      if (bodyIdx % 5 === 1) lcLangVariants.push('empty');
      lcLangVariants.forEach((lcLangValue) => {
        cases.push({
          label: `${langSlug} body${bodyIdx} ${useCrlf ? 'CRLF' : 'LF'} lcLang=${lcLangValue}`,
          langSlug,
          body,
          useCrlf,
          lcLangValue,
        });
      });
    });
  });
});

// Confirm corpus size for the acceptance criterion (>= 100 cases).
describe('migration property tests — corpus sanity', () => {
  it('generates >= 100 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Invariant 1 — body-preservation.
// ───────────────────────────────────────────────────────────────────────────

describe('migration property tests — body-preservation', () => {
  it.each(cases)(
    '$label — body byte-exact post-migration',
    async ({ langSlug, body, useCrlf, lcLangValue }) => {
      const fileText = buildShell(langSlug, body, useCrlf);
      const baseFm: Record<string, unknown> = { 'lc-slug': 'test-problem-1' };
      if (lcLangValue === 'set') baseFm['lc-language'] = 'python3';
      else if (lcLangValue === 'empty') baseFm['lc-language'] = '';
      // 'missing' — leave key out.

      const { app, file, state } = makeMockApp(fileText, baseFm);

      const result = await migrateLegacyFenceIfNeeded(app, file, {
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      expect(result).toBe(true);

      // Body byte-exact: extract from post-migration text at fence index 0.
      const postBody = extractFenceBody(state.fileText, 0);
      expect(postBody).toBe(body);
    },
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Invariant 2 — frontmatter preservation.
// ───────────────────────────────────────────────────────────────────────────

describe('migration property tests — frontmatter preservation', () => {
  it.each(cases.slice(0, 50))(
    '$label — non-lc-language lc-* keys preserved byte-exact',
    async ({ langSlug, body, useCrlf, lcLangValue }) => {
      const fileText = buildShell(langSlug, body, useCrlf);
      const baseFm: Record<string, unknown> = {
        'lc-slug': 'test-problem-1',
        'lc-status': 'AC',
        'lc-id': '1',
        'lc-title': 'Two Sum',
        'lc-difficulty': 'Easy',
        'lc-url': 'https://leetcode.com/problems/two-sum/',
      };
      if (lcLangValue === 'set') baseFm['lc-language'] = 'python3';
      else if (lcLangValue === 'empty') baseFm['lc-language'] = '';

      const { app, file, state } = makeMockApp(fileText, baseFm);

      await migrateLegacyFenceIfNeeded(app, file, {
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });

      // All non-lc-language lc-* keys should be byte-identical.
      expect(state.frontmatter['lc-slug']).toBe('test-problem-1');
      expect(state.frontmatter['lc-status']).toBe('AC');
      expect(state.frontmatter['lc-id']).toBe('1');
      expect(state.frontmatter['lc-title']).toBe('Two Sum');
      expect(state.frontmatter['lc-difficulty']).toBe('Easy');
      expect(state.frontmatter['lc-url']).toBe(
        'https://leetcode.com/problems/two-sum/',
      );

      // lc-language: when pre-migration was 'set', value must NOT have changed.
      if (lcLangValue === 'set') {
        expect(state.frontmatter['lc-language']).toBe('python3');
      } else {
        // 'missing' or 'empty' — migration filled with defaultLanguage.
        expect(state.frontmatter['lc-language']).toBe('python3');
      }
    },
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Invariant 3 — idempotency.
// ───────────────────────────────────────────────────────────────────────────

describe('migration property tests — idempotency', () => {
  it.each(cases.slice(0, 50))(
    '$label — second migrate() returns false; file unchanged',
    async ({ langSlug, body, useCrlf, lcLangValue }) => {
      const fileText = buildShell(langSlug, body, useCrlf);
      const baseFm: Record<string, unknown> = { 'lc-slug': 'test-problem-1' };
      if (lcLangValue === 'set') baseFm['lc-language'] = 'python3';
      else if (lcLangValue === 'empty') baseFm['lc-language'] = '';

      const { app, file, state } = makeMockApp(fileText, baseFm);

      const r1 = await migrateLegacyFenceIfNeeded(app, file, {
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      expect(r1).toBe(true);
      const textAfterFirst = state.fileText;

      const r2 = await migrateLegacyFenceIfNeeded(app, file, {
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });
      expect(r2).toBe(false);
      expect(state.fileText).toBe(textAfterFirst);

      // Spy-call counts: vault.process and adapter.write each called exactly
      // once across the two invocations (D-backup-02 / MIGRATE-04).
      expect(state.vaultProcessSpy).toHaveBeenCalledTimes(1);
      expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
    },
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Invariant 4 — backup-correctness.
// ───────────────────────────────────────────────────────────────────────────

describe('migration property tests — backup-correctness', () => {
  it.each(cases.slice(0, 50))(
    '$label — backup contents equals pre-migration noteText byte-exact',
    async ({ langSlug, body, useCrlf, lcLangValue }) => {
      const fileText = buildShell(langSlug, body, useCrlf);
      const baseFm: Record<string, unknown> = { 'lc-slug': 'test-problem-1' };
      if (lcLangValue === 'set') baseFm['lc-language'] = 'python3';
      else if (lcLangValue === 'empty') baseFm['lc-language'] = '';

      const { app, file, state } = makeMockApp(fileText, baseFm);

      await migrateLegacyFenceIfNeeded(app, file, {
        autoMigrateOnOpen: true,
        defaultLanguage: 'python3',
      });

      // First (only) call to adapter.write — second positional arg is the
      // file contents byte-buffer.
      expect(state.adapterWriteSpy).toHaveBeenCalledTimes(1);
      const writtenText = state.adapterWriteSpy.mock.calls[0]?.[1];
      expect(writtenText).toBe(fileText);
    },
  );
});
