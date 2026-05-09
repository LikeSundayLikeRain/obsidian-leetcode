// tests/graph/stubFilename.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-17 (stub filename normalization).
// Target: src/notes/NoteTemplate.ts (Wave 1 extension) — new export
// buildTechniqueFilename(name: string): string.
//
// Replaces vault-forbidden chars (`/\\:*?"<>|`) with `-`. Preserves `+`
// for `C++` (RESEARCH.md §A1 defensive case — filesystem-legal).

import { describe, it, expect } from 'vitest';
// Target — export does not exist until Wave 1 ships it.
import { buildTechniqueFilename } from '../../src/notes/NoteTemplate';

describe('buildTechniqueFilename (D-17)', () => {
  it('filename normalization', () => {
    // Clean names pass through untouched (.md suffix added).
    expect(buildTechniqueFilename('Two Pointers')).toBe('Two Pointers.md');
    expect(buildTechniqueFilename('Hash Table')).toBe('Hash Table.md');

    // Forbidden chars → '-'.
    expect(buildTechniqueFilename('A/B')).toBe('A-B.md');
    expect(buildTechniqueFilename('Design: Hashing')).toBe('Design- Hashing.md');
    expect(buildTechniqueFilename('System*Design')).toBe('System-Design.md');
    expect(buildTechniqueFilename('A\\B')).toBe('A-B.md');
    expect(buildTechniqueFilename('weird|pipe')).toBe('weird-pipe.md');
    expect(buildTechniqueFilename('maybe?')).toBe('maybe-.md');
    expect(buildTechniqueFilename('"quoted"')).toBe('-quoted-.md');
    expect(buildTechniqueFilename('<angle>')).toBe('-angle-.md');
  });

  it('preserves + for C++', () => {
    // RESEARCH §A1: `+` is filesystem-legal on all three target OSes; must
    // NOT be stripped. `C++` stays `C++.md`.
    expect(buildTechniqueFilename('C++')).toBe('C++.md');
  });
});
