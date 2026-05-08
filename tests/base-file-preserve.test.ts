import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { ensureLeetcodeBase } from '../src/notes/BaseFile';

describe('ensureLeetcodeBase (D-18 never-overwrite)', () => {
  it('does not call create/write when LeetCode.base already exists', async () => {
    const m = makeMockVaultApp({ 'LeetCode/LeetCode.base': '# user-customised' });
    await ensureLeetcodeBase(m.app as never, 'LeetCode');
    expect(m.spies.create).not.toHaveBeenCalled();
    // Existing content untouched.
    expect(m.getContent('LeetCode/LeetCode.base')).toBe('# user-customised');
  });
});
