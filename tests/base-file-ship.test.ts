import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { ensureLeetcodeBase, leetcodeBaseYaml } from '../src/notes/BaseFile';

describe('ensureLeetcodeBase (D-17, D-18 ship-if-missing)', () => {
  it('creates LeetCode.base in the problems folder when it does not exist', async () => {
    const m = makeMockVaultApp({});
    await ensureLeetcodeBase(m.app as never, 'LeetCode');
    // createFolder runs first (folder did not exist) — optional depending on impl.
    expect(m.spies.create).toHaveBeenCalledWith('LeetCode/LeetCode.base', expect.any(String));
  });

  it('writes YAML that includes sort: by lc-id DESC (D-17)', () => {
    const yaml = leetcodeBaseYaml('LeetCode');
    expect(yaml).toContain('lc-id');
    expect(yaml).toMatch(/direction:\s*DESC/);
  });

  it('strips trailing slash from folder in path construction', async () => {
    const m = makeMockVaultApp({});
    await ensureLeetcodeBase(m.app as never, 'LeetCode/');
    expect(m.spies.create).toHaveBeenCalledWith('LeetCode/LeetCode.base', expect.any(String));
  });
});
