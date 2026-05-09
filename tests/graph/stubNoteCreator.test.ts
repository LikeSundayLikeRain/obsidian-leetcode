// tests/graph/stubNoteCreator.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-04 / D-15 / D-18.
// Target: src/graph/StubNoteCreator.ts (Wave 1) — exports
// ensureTechniquesFolder, createStubIfMissing.

import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
// Target — does not exist until Wave 1 ships it.
import { ensureTechniquesFolder, createStubIfMissing } from '../../src/graph/StubNoteCreator';

describe('StubNoteCreator (GRAPH-04, D-15, D-18)', () => {
  it('creates stub on missing', async () => {
    const m = makeMockVaultApp({});
    const body = '---\nlc-technique: two-pointers\naliases:\n  - Two Pointers\ntags:\n  - lc/technique/two-pointers\n---\n\n';
    await createStubIfMissing(m.app as never, 'LeetCode/Techniques/Two Pointers.md', body);
    expect(m.spies.create).toHaveBeenCalledWith(
      'LeetCode/Techniques/Two Pointers.md',
      expect.stringContaining('lc-technique: two-pointers'),
    );
  });

  it('never overwrites existing stub', async () => {
    // D-18 ironclad: a pre-existing stub (user may have written notes into it)
    // must not be touched by subsequent on-AC writes.
    const existing = '---\nlc-technique: two-pointers\n---\n\nUser notes from 6 months ago.\n';
    const m = makeMockVaultApp({ 'LeetCode/Techniques/Two Pointers.md': existing });
    await createStubIfMissing(
      m.app as never,
      'LeetCode/Techniques/Two Pointers.md',
      '---\nlc-technique: NEW\n---\n',
    );
    // No vault.create call (pre-check short-circuits).
    expect(m.spies.create).not.toHaveBeenCalled();
    // Content intact.
    expect(m.getContent('LeetCode/Techniques/Two Pointers.md')).toBe(existing);
  });

  it('creates folder once', async () => {
    // Concurrent-safe: repeated ensureTechniquesFolder calls collapse to one
    // createFolder (or a try/catch-swallowed second call).
    const m = makeMockVaultApp({});
    await ensureTechniquesFolder(m.app as never, 'LeetCode/Techniques');
    await ensureTechniquesFolder(m.app as never, 'LeetCode/Techniques');
    // Only the first call triggered createFolder; second found the folder
    // via getAbstractFileByPath.
    expect(m.spies.createFolder).toHaveBeenCalledTimes(1);
    expect(m.spies.createFolder).toHaveBeenCalledWith('LeetCode/Techniques');
  });

  it('recreates after delete', async () => {
    // D-18 Phase 4 divergence from Phase 2 BaseFile: if the user deletes a
    // stub and the next AC re-references that technique, the stub is
    // re-created (a dangling [[Two Pointers]] wikilink is worse UX than an
    // empty stub reappearing).
    const m = makeMockVaultApp({});
    const body =
      '---\nlc-technique: two-pointers\naliases:\n  - Two Pointers\ntags:\n  - lc/technique/two-pointers\n---\n\n';
    // First AC — stub created.
    await createStubIfMissing(m.app as never, 'LeetCode/Techniques/Two Pointers.md', body);
    expect(m.spies.create).toHaveBeenCalledTimes(1);

    // User deletes the stub: evict from both the files map AND the contents map
    // so downstream getAbstractFileByPath returns null (simulating a fresh delete).
    m.state.files.delete('LeetCode/Techniques/Two Pointers.md');
    m.state.contents.delete('LeetCode/Techniques/Two Pointers.md');

    // Next AC — must re-create.
    await createStubIfMissing(m.app as never, 'LeetCode/Techniques/Two Pointers.md', body);
    expect(m.spies.create).toHaveBeenCalledTimes(2);
  });
});
