import { describe, it, expect } from 'vitest';
import {
  LC_LANG_SLUGS,
  FENCE_TAG_ALIASES,
  resolveLangSlug,
  LC_LANG_FENCE_TAG,
  lcSlugToFenceTag,
  LC_LANG_DISPLAY_LABELS,
  LC_CHEVRON_LANG_ORDER,
} from '../../src/solve/languages';

describe('LC_LANG_SLUGS (SOLVE-08)', () => {
  it('contains the canonical LC language slugs', () => {
    const required = [
      'python3', 'java', 'cpp', 'c', 'csharp',
      'javascript', 'typescript', 'rust', 'golang',
      'kotlin', 'swift', 'ruby', 'scala', 'php',
      'dart', 'elixir', 'erlang', 'racket',
      'mysql', 'postgresql',
    ];
    for (const slug of required) {
      expect(LC_LANG_SLUGS.has(slug)).toBe(true);
    }
  });

  it('has at least 20 entries', () => {
    expect(LC_LANG_SLUGS.size).toBeGreaterThanOrEqual(20);
  });
});

describe('FENCE_TAG_ALIASES', () => {
  it('maps common aliases to canonical LC slugs', () => {
    expect(FENCE_TAG_ALIASES['py']).toBe('python3');
    expect(FENCE_TAG_ALIASES['ts']).toBe('typescript');
    expect(FENCE_TAG_ALIASES['js']).toBe('javascript');
    expect(FENCE_TAG_ALIASES['c++']).toBe('cpp');
    expect(FENCE_TAG_ALIASES['c#']).toBe('csharp');
    expect(FENCE_TAG_ALIASES['go']).toBe('golang');
    expect(FENCE_TAG_ALIASES['rs']).toBe('rust');
  });
});

describe('resolveLangSlug (SOLVE-08, D-02/D-03/D-05)', () => {
  const FALLBACK = 'python3';

  it('returns fallback for null / undefined / empty fence tag (D-03)', () => {
    expect(resolveLangSlug(null, FALLBACK)).toBe('python3');
    expect(resolveLangSlug(undefined, FALLBACK)).toBe('python3');
    expect(resolveLangSlug('', FALLBACK)).toBe('python3');
  });

  it('returns canonical slug when fence tag matches exactly (D-02)', () => {
    expect(resolveLangSlug('python3', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('java', FALLBACK)).toBe('java');
    expect(resolveLangSlug('cpp', FALLBACK)).toBe('cpp');
  });

  it('resolves common aliases to canonical slugs (D-02)', () => {
    expect(resolveLangSlug('py', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('ts', FALLBACK)).toBe('typescript');
    expect(resolveLangSlug('c++', FALLBACK)).toBe('cpp');
    expect(resolveLangSlug('c#', FALLBACK)).toBe('csharp');
    expect(resolveLangSlug('go', FALLBACK)).toBe('golang');
    expect(resolveLangSlug('rs', FALLBACK)).toBe('rust');
  });

  it('is case-insensitive for fence tags', () => {
    expect(resolveLangSlug('Python3', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('JAVA', FALLBACK)).toBe('java');
    expect(resolveLangSlug('C++', FALLBACK)).toBe('cpp');
  });

  it('returns fallback when fence tag is unknown (D-05)', () => {
    expect(resolveLangSlug('foobarlang', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('assembly', 'java')).toBe('java');
  });

  it('resolves "python" fence tag to python3 (D-04 round-trip)', () => {
    expect(resolveLangSlug('python', FALLBACK)).toBe('python3');
    expect(resolveLangSlug('Python', FALLBACK)).toBe('python3');
  });

  it('preserves python2 alias for explicit Python 2 usage', () => {
    expect(resolveLangSlug('python2', FALLBACK)).toBe('python');
  });

  it('is pure — same input returns same output', () => {
    expect(resolveLangSlug('py', FALLBACK)).toBe(resolveLangSlug('py', FALLBACK));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 5.3 Wave 1 — D-04 fence-tag remap + D-10 chevron labels/order
// ─────────────────────────────────────────────────────────────────────────

describe('lcSlugToFenceTag (Phase 5.3 D-04)', () => {
  it('remaps python3 → python', () => {
    expect(lcSlugToFenceTag('python3')).toBe('python');
  });

  it('remaps golang → go', () => {
    expect(lcSlugToFenceTag('golang')).toBe('go');
  });

  it('remaps c → cpp (shared parser)', () => {
    expect(lcSlugToFenceTag('c')).toBe('cpp');
  });

  it('returns identity for python, java, cpp, javascript, typescript, rust', () => {
    expect(lcSlugToFenceTag('python')).toBe('python');
    expect(lcSlugToFenceTag('java')).toBe('java');
    expect(lcSlugToFenceTag('cpp')).toBe('cpp');
    expect(lcSlugToFenceTag('javascript')).toBe('javascript');
    expect(lcSlugToFenceTag('typescript')).toBe('typescript');
    expect(lcSlugToFenceTag('rust')).toBe('rust');
  });

  it('passes through unsupported LC slugs verbatim (csharp, kotlin, ruby, swift)', () => {
    expect(lcSlugToFenceTag('csharp')).toBe('csharp');
    expect(lcSlugToFenceTag('kotlin')).toBe('kotlin');
    expect(lcSlugToFenceTag('ruby')).toBe('ruby');
    expect(lcSlugToFenceTag('swift')).toBe('swift');
  });

  it('LC_LANG_FENCE_TAG covers all 9 D-04 entries', () => {
    expect(Object.keys(LC_LANG_FENCE_TAG).sort()).toEqual(
      ['c', 'cpp', 'golang', 'java', 'javascript', 'python', 'python3', 'rust', 'typescript'],
    );
  });

  it('is pure — same input returns same output', () => {
    expect(lcSlugToFenceTag('python3')).toBe(lcSlugToFenceTag('python3'));
    expect(lcSlugToFenceTag('csharp')).toBe(lcSlugToFenceTag('csharp'));
  });
});

describe('LC_LANG_DISPLAY_LABELS (Phase 5.3 D-10)', () => {
  // G-PYTHON-LABEL (Phase 5.3 Plan 05): python3 disambiguated to 'Python 3';
  // python (Python 2 — deprecated by LC but harmless here) stays 'Python'.
  it('renders python3 as "Python 3" (disambiguated from python)', () => {
    expect(LC_LANG_DISPLAY_LABELS['python3']).toBe('Python 3');
    expect(LC_LANG_DISPLAY_LABELS['python']).toBe('Python');
  });

  it('renders cpp as "C++"', () => {
    expect(LC_LANG_DISPLAY_LABELS['cpp']).toBe('C++');
  });

  it('renders golang as "Go"', () => {
    expect(LC_LANG_DISPLAY_LABELS['golang']).toBe('Go');
  });

  it('renders c as "C"', () => {
    expect(LC_LANG_DISPLAY_LABELS['c']).toBe('C');
  });

  it('renders javascript as "JavaScript" and typescript as "TypeScript"', () => {
    expect(LC_LANG_DISPLAY_LABELS['javascript']).toBe('JavaScript');
    expect(LC_LANG_DISPLAY_LABELS['typescript']).toBe('TypeScript');
  });

  it('renders java as "Java" and rust as "Rust"', () => {
    expect(LC_LANG_DISPLAY_LABELS['java']).toBe('Java');
    expect(LC_LANG_DISPLAY_LABELS['rust']).toBe('Rust');
  });

  it('covers all 9 LC slugs in the D-04 table', () => {
    expect(Object.keys(LC_LANG_DISPLAY_LABELS).sort()).toEqual(
      ['c', 'cpp', 'golang', 'java', 'javascript', 'python', 'python3', 'rust', 'typescript'],
    );
  });
});

describe('LC_CHEVRON_LANG_ORDER (Phase 5.3 D-04 + D-10)', () => {
  it('has length 8 (Python first, Rust last per UI-SPEC)', () => {
    expect(LC_CHEVRON_LANG_ORDER.length).toBe(8);
  });

  it('lists python3 first', () => {
    expect(LC_CHEVRON_LANG_ORDER[0]).toBe('python3');
  });

  it('lists rust last', () => {
    expect(LC_CHEVRON_LANG_ORDER[LC_CHEVRON_LANG_ORDER.length - 1]).toBe('rust');
  });

  it('contains the 8 supported LC languages in dropdown order', () => {
    expect([...LC_CHEVRON_LANG_ORDER]).toEqual([
      'python3', 'java', 'cpp', 'c', 'javascript', 'typescript', 'golang', 'rust',
    ]);
  });

  it('every entry has a corresponding LC_LANG_DISPLAY_LABELS entry', () => {
    for (const slug of LC_CHEVRON_LANG_ORDER) {
      expect(LC_LANG_DISPLAY_LABELS[slug]).toBeDefined();
      expect(typeof LC_LANG_DISPLAY_LABELS[slug]).toBe('string');
      expect((LC_LANG_DISPLAY_LABELS[slug] as string).length).toBeGreaterThan(0);
    }
  });

  it('every entry has a corresponding LC_LANG_FENCE_TAG entry', () => {
    for (const slug of LC_CHEVRON_LANG_ORDER) {
      expect(LC_LANG_FENCE_TAG[slug]).toBeDefined();
    }
  });
});
