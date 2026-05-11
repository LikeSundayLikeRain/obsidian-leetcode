// Phase 5.3 (POLISH-09 / D-07 / D-08) — lazy `@codemirror/lang-*` cache.
// RED-state unit tests pinning Wave 1's `src/main/languagePackRegistry.ts`
// behavioral contract: module-level Promise cache that dedupes in-flight
// `import('@codemirror/lang-XXX')` calls per PackId, drops failed promises so
// retries work, and routes the typescript PackId through
// `javascript({ typescript: true })`.
//
// Strategy: each test `vi.doMock('@codemirror/lang-XXX', factory)` BEFORE
// `await import('../../src/main/languagePackRegistry')` (vitest's hoisting +
// dynamic-import ordering rule). `vi.resetModules()` in `beforeEach` wipes
// the module-level cache between tests so each test starts cold.
//
// WAVE 0 LINT NOTE: same as the codeFenceLanguageExtension RED tests — the
// `no-unsafe-*` cascade fires solely because the SUT module does not yet
// exist; Wave 1 (Plan 02) adds typed exports and these disables can be
// removed.
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion -- Wave 0 RED-state scaffolding; removed when Wave 1 ships the implementation module */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module cache before each test so the registry's module-level
// `Map<PackId, Promise<LanguageSupport>>` starts empty per RESEARCH lines
// 939–941.
beforeEach(() => {
  vi.resetModules();
});

// =========================================================================
// Group 1 — getLanguagePack — cache-hit per PackId
// =========================================================================
// One cache-hit assertion per pack (7 PackIds: python, java, cpp, javascript,
// typescript, go, rust). The typescript PackId is special-cased to verify
// the `{ typescript: true }` pass-through to `javascript()` per RESEARCH
// line 800.

describe('getLanguagePack — cache', () => {
  it('python — second call returns same Promise; factory invoked once', async () => {
    const mockSupport = { isLanguageSupport: 'python' };
    const pythonSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-python', () => ({ python: pythonSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('python');
    const b = await getLanguagePack('python');

    expect(a).toBe(b);
    expect(pythonSpy).toHaveBeenCalledTimes(1);
  });

  it('java — cache hits per PackId', async () => {
    const mockSupport = { isLanguageSupport: 'java' };
    const javaSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-java', () => ({ java: javaSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('java');
    const b = await getLanguagePack('java');

    expect(a).toBe(b);
    expect(javaSpy).toHaveBeenCalledTimes(1);
  });

  it('cpp — cache hits per PackId', async () => {
    const mockSupport = { isLanguageSupport: 'cpp' };
    const cppSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-cpp', () => ({ cpp: cppSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('cpp');
    const b = await getLanguagePack('cpp');

    expect(a).toBe(b);
    expect(cppSpy).toHaveBeenCalledTimes(1);
  });

  it('javascript — cache hits per PackId', async () => {
    const mockSupport = { isLanguageSupport: 'js' };
    const jsSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-javascript', () => ({ javascript: jsSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('javascript');
    const b = await getLanguagePack('javascript');

    expect(a).toBe(b);
    expect(jsSpy).toHaveBeenCalledTimes(1);
  });

  it('typescript — calls javascript({ typescript: true }) (D-05 + RESEARCH line 800)', async () => {
    const mockSupport = { isLanguageSupport: 'ts' };
    const jsSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-javascript', () => ({ javascript: jsSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('typescript');
    const b = await getLanguagePack('typescript');

    expect(a).toBe(b);
    expect(jsSpy).toHaveBeenCalledTimes(1);
    expect(jsSpy).toHaveBeenCalledWith({ typescript: true });
  });

  it('go — cache hits per PackId (golang slug → go pack)', async () => {
    const mockSupport = { isLanguageSupport: 'go' };
    const goSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-go', () => ({ go: goSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('go');
    const b = await getLanguagePack('go');

    expect(a).toBe(b);
    expect(goSpy).toHaveBeenCalledTimes(1);
  });

  it('rust — cache hits per PackId', async () => {
    const mockSupport = { isLanguageSupport: 'rust' };
    const rustSpy = vi.fn().mockReturnValue(mockSupport);
    vi.doMock('@codemirror/lang-rust', () => ({ rust: rustSpy }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    const a = await getLanguagePack('rust');
    const b = await getLanguagePack('rust');

    expect(a).toBe(b);
    expect(rustSpy).toHaveBeenCalledTimes(1);
  });
});

// =========================================================================
// Group 2 — getLanguagePack — error recovery
// =========================================================================
// First import throws → getLanguagePack rejects. Second call retries the
// underlying factory and succeeds. Pins RESEARCH lines 957–971: failed
// Promises must be removed from the cache (cache.delete on .catch) so retry
// works. Without this, the first failure poisons the cache permanently.

describe('getLanguagePack — error recovery', () => {
  it('drops failed Promises from cache so a retry works', async () => {
    let attempt = 0;
    vi.doMock('@codemirror/lang-python', () => ({
      python: () => {
        attempt += 1;
        if (attempt === 1) throw new Error('simulated load failure');
        return { isLanguageSupport: 'python-retry' };
      },
    }));

    const { getLanguagePack } = await import('../../src/main/languagePackRegistry');
    await expect(getLanguagePack('python')).rejects.toThrow('simulated load failure');
    const success = await getLanguagePack('python');

    expect(success).toEqual({ isLanguageSupport: 'python-retry' });
    expect(attempt).toBe(2);
  });
});

// =========================================================================
// Group 3 — slugToPackId
// =========================================================================
// Pure function: LC langSlug → PackId | null. Mirror Group 1 of the
// codeFenceLanguageExtension RED file but for the lower-level slug→PackId
// lookup that the registry exposes (used by computeFenceState's routing
// stage). Returns null for unknown / empty / unsupported slugs.

describe('slugToPackId', () => {
  it('python → python', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('python')).toBe('python');
  });

  it('python3 → python (alias)', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('python3')).toBe('python');
  });

  it('java → java', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('java')).toBe('java');
  });

  it('cpp → cpp', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('cpp')).toBe('cpp');
  });

  it('c → cpp (D-05 shared parser)', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('c')).toBe('cpp');
  });

  it('javascript → javascript', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('javascript')).toBe('javascript');
  });

  it('typescript → typescript', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('typescript')).toBe('typescript');
  });

  it('golang → go', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('golang')).toBe('go');
  });

  it('rust → rust', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('rust')).toBe('rust');
  });

  it('csharp → null (D-04 unsupported)', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('csharp')).toBeNull();
  });

  it('ruby → null (unsupported)', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('ruby')).toBeNull();
  });

  it('empty string → null', async () => {
    const { slugToPackId } = await import('../../src/main/languagePackRegistry');
    expect(slugToPackId('')).toBeNull();
  });
});
