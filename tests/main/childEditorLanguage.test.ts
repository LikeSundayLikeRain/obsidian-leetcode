// Phase 16 — Unit tests for buildLanguageExtensions, effectiveIndent,
// languageCompartment.
//
// Test strategy (per RESEARCH §10):
//   - Mock every @codemirror/* import the SUT uses; each mock returns a unique
//     sentinel so assertions can verify both invocation and resulting array
//     element identity.
//   - Pure-function tests (effectiveIndent) need no mocks (they're imported
//     directly and assert the returned string).
//   - Builder tests assert mock invocations + array element identities.
//   - Table-driven tests (it.each) for cases that share shape across slugs.
//
// Coverage targets:
//   - effectiveIndent: D-05 per-language map, D-06 Go-tab override-ignored,
//     numeric override interaction, unknown-slug fallback (8 it() / it.each)
//   - buildLanguageExtensions: shape + per-slug LanguageSupport selection +
//     shared cpp/c (D-03), typescript variant (D-03), Go (StreamLanguage),
//     closeBrackets, Cmd-/ keymap (>=11 it())
//   - languageCompartment: exports a Compartment-like instance (1 it())

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Mocks (must be declared before SUT import per vitest hoisting model).
// Each factory returns sentinel values so assertions can chain through.
//
// vi.mock factories are hoisted to top of file. Top-level const references
// inside a factory throw ReferenceError. Inline literals are safe; for the
// shared go-mode sentinel we re-derive it via vi.hoisted.
// ─────────────────────────────────────────────────────────────────────────

const { goModeSentinel } = vi.hoisted(() => ({
  goModeSentinel: { name: 'go-mode-sentinel' },
}));

vi.mock('@codemirror/state', () => {
  class MockCompartment {
    of = vi.fn().mockReturnValue('mock-compartment-of');
    reconfigure = vi.fn().mockReturnValue('mock-compartment-reconfigure');
  }
  return { Compartment: MockCompartment };
});

vi.mock('@codemirror/language', () => ({
  indentUnit: { of: vi.fn().mockReturnValue('mock-indent-unit-extension') },
  StreamLanguage: { define: vi.fn().mockReturnValue('mock-stream-language-go') },
}));

vi.mock('@codemirror/view', () => ({
  keymap: { of: vi.fn().mockReturnValue('mock-keymap-extension') },
}));

vi.mock('@codemirror/commands', () => ({
  toggleLineComment: vi.fn().mockReturnValue(true),
}));

vi.mock('@codemirror/autocomplete', () => ({
  closeBrackets: vi.fn().mockReturnValue('mock-close-brackets-extension'),
}));

vi.mock('@codemirror/lang-python', () => ({
  python: vi.fn().mockReturnValue('mock-python-language-support'),
}));

vi.mock('@codemirror/lang-java', () => ({
  java: vi.fn().mockReturnValue('mock-java-language-support'),
}));

vi.mock('@codemirror/lang-cpp', () => ({
  cpp: vi.fn().mockReturnValue('mock-cpp-language-support'),
}));

vi.mock('@codemirror/lang-javascript', () => ({
  javascript: vi.fn().mockReturnValue('mock-javascript-language-support'),
}));

vi.mock('@codemirror/lang-rust', () => ({
  rust: vi.fn().mockReturnValue('mock-rust-language-support'),
}));

vi.mock('@codemirror/legacy-modes/mode/go', () => ({
  go: goModeSentinel,
}));

// Import SUT and mocked modules AFTER vi.mock declarations.
import {
  buildLanguageExtensions,
  effectiveIndent,
  languageCompartment,
} from '../../src/main/childEditorLanguage';
import { indentUnit, StreamLanguage } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { toggleLineComment } from '@codemirror/commands';
import { closeBrackets } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';

// ─────────────────────────────────────────────────────────────────────────
// effectiveIndent — pure function, no mock interaction needed.
// ─────────────────────────────────────────────────────────────────────────

describe('effectiveIndent', () => {
  it('returns 4 spaces for python3 with auto', () => {
    expect(effectiveIndent('python3', 'auto')).toBe('    ');
  });

  it.each([
    ['java', '    '],
    ['cpp', '    '],
    ['c', '    '],
    ['rust', '    '],
  ])('returns 4 spaces for %s with auto', (slug, expected) => {
    expect(effectiveIndent(slug, 'auto')).toBe(expected);
  });

  it('returns 2 spaces for javascript with auto', () => {
    expect(effectiveIndent('javascript', 'auto')).toBe('  ');
  });

  it('returns 2 spaces for typescript with auto', () => {
    expect(effectiveIndent('typescript', 'auto')).toBe('  ');
  });

  it('returns tab for golang with auto', () => {
    expect(effectiveIndent('golang', 'auto')).toBe('\t');
  });

  it.each([2, 4, 8] as const)(
    'returns tab for golang regardless of numeric override (D-06): override=%i',
    (override) => {
      expect(effectiveIndent('golang', override)).toBe('\t');
    },
  );

  it('respects numeric override 2 for python3', () => {
    expect(effectiveIndent('python3', 2)).toBe('  ');
  });

  it('respects numeric override 8 for java', () => {
    expect(effectiveIndent('java', 8)).toBe('        ');
  });

  it('respects numeric override 4 for typescript', () => {
    expect(effectiveIndent('typescript', 4)).toBe('    ');
  });

  it('falls back to 4 spaces for unknown slug with auto', () => {
    expect(effectiveIndent('csharp', 'auto')).toBe('    ');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// buildLanguageExtensions — assert mock invocations + array shape.
// ─────────────────────────────────────────────────────────────────────────

describe('buildLanguageExtensions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 4-element array for python3 with auto', () => {
    const result = buildLanguageExtensions('python3', 'auto');
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('mock-python-language-support');
    expect(result[1]).toBe('mock-indent-unit-extension');
    expect(result[2]).toBe('mock-close-brackets-extension');
    expect(result[3]).toBe('mock-keymap-extension');
  });

  it('invokes python() for python3 slug', () => {
    buildLanguageExtensions('python3', 'auto');
    expect(python).toHaveBeenCalledTimes(1);
  });

  it('invokes java() for java slug', () => {
    buildLanguageExtensions('java', 'auto');
    expect(java).toHaveBeenCalledTimes(1);
  });

  it('invokes cpp() for both cpp and c slugs (D-03 shared pack)', () => {
    buildLanguageExtensions('cpp', 'auto');
    buildLanguageExtensions('c', 'auto');
    expect(cpp).toHaveBeenCalledTimes(2);
  });

  it('invokes javascript() with no args for javascript slug', () => {
    buildLanguageExtensions('javascript', 'auto');
    expect(javascript).toHaveBeenCalledTimes(1);
    expect(javascript).toHaveBeenCalledWith();
  });

  it('invokes javascript({ typescript: true }) for typescript slug (D-03)', () => {
    buildLanguageExtensions('typescript', 'auto');
    expect(javascript).toHaveBeenCalledTimes(1);
    expect(javascript).toHaveBeenCalledWith({ typescript: true });
  });

  it('invokes rust() for rust slug', () => {
    buildLanguageExtensions('rust', 'auto');
    expect(rust).toHaveBeenCalledTimes(1);
  });

  it('invokes StreamLanguage.define(go) for golang slug (Pitfall A)', () => {
    buildLanguageExtensions('golang', 'auto');
    expect(StreamLanguage.define).toHaveBeenCalledTimes(1);
    expect(StreamLanguage.define).toHaveBeenCalledWith(goModeSentinel);
  });

  it('passes effectiveIndent("    ") to indentUnit.of for python3-auto', () => {
    buildLanguageExtensions('python3', 'auto');
    expect(indentUnit.of).toHaveBeenCalledWith('    ');
  });

  it('passes effectiveIndent("\\t") to indentUnit.of for golang-auto', () => {
    buildLanguageExtensions('golang', 'auto');
    expect(indentUnit.of).toHaveBeenCalledWith('\t');
  });

  it('passes effectiveIndent("\\t") to indentUnit.of for golang with numeric override (D-06)', () => {
    buildLanguageExtensions('golang', 4);
    expect(indentUnit.of).toHaveBeenCalledWith('\t');
  });

  it('passes effectiveIndent("  ") to indentUnit.of for javascript with override=2', () => {
    buildLanguageExtensions('javascript', 2);
    expect(indentUnit.of).toHaveBeenCalledWith('  ');
  });

  it('includes closeBrackets() in the array', () => {
    buildLanguageExtensions('python3', 'auto');
    expect(closeBrackets).toHaveBeenCalledTimes(1);
  });

  it('includes a keymap entry binding Mod-/ to toggleLineComment (COMMENT-01)', () => {
    buildLanguageExtensions('python3', 'auto');
    expect(keymap.of).toHaveBeenCalledTimes(1);
    const keymapArg = (keymap.of as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(Array.isArray(keymapArg)).toBe(true);
    expect(keymapArg).toHaveLength(1);
    expect(keymapArg[0]).toEqual(
      expect.objectContaining({ key: 'Mod-/', run: toggleLineComment }),
    );
  });

  it('falls back to python() for unknown slug (D-04 defensive)', () => {
    buildLanguageExtensions('unknown-slug', 'auto');
    expect(python).toHaveBeenCalledTimes(1);
    expect(indentUnit.of).toHaveBeenCalledWith('    ');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// languageCompartment — singleton shape check.
// ─────────────────────────────────────────────────────────────────────────

describe('languageCompartment', () => {
  it('exports a Compartment-shaped instance with .of and .reconfigure methods', () => {
    expect(languageCompartment).toBeDefined();
    expect(typeof languageCompartment.of).toBe('function');
    expect(typeof languageCompartment.reconfigure).toBe('function');
  });
});
