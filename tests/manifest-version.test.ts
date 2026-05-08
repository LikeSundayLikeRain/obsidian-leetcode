import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('manifest.json minAppVersion (D-19 / NOTE-07)', () => {
  it('declares minAppVersion >= 1.10.0 so Bases is available', () => {
    const raw = readFileSync(join(__dirname, '..', 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw) as { minAppVersion?: string; isDesktopOnly?: boolean };
    expect(manifest.minAppVersion).toBeDefined();
    const [major, minor] = (manifest.minAppVersion ?? '').split('.').map(Number);
    // 1.10.0 or higher.
    expect(major).toBe(1);
    expect(minor).toBeGreaterThanOrEqual(10);
  });

  it('still declares isDesktopOnly: true (CF-02 / FND-02)', () => {
    const raw = readFileSync(join(__dirname, '..', 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw) as { isDesktopOnly?: boolean };
    expect(manifest.isDesktopOnly).toBe(true);
  });
});
