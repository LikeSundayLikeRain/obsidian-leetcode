// tests/widget/applyAuthoritativeBodyAndFrontmatter.test.ts
//
// Failure B (Phase 22 follow-up) — unit tests for the combined body-swap +
// frontmatter mutation primitive used by the chevron language-switch path.
//
// Covers:
//   (1) arm-before-dispatch ordering: suppression.arm runs strictly BEFORE
//       any dispatchAuthoritativeBodySwap on originator or peers.
//   (2) suppression.arm receives the originator's registryKey + sha1(newBody).
//   (3) every peer in the widgetList receives dispatchAuthoritativeBodySwap
//       with the same body + slug.
//   (4) After flushNow + processFrontMatter, acknowledgeAuthoritativeBody is
//       called on every widget (originator + peers) with the same hash.
//   (5) Error path — processFrontMatter throws → suppression.clearForPath is
//       invoked for cleanup and the error rethrows.
//   (6) Error path — peer dispatch throws → originator dispatch already
//       landed; peer error propagates and the catch path clears suppression
//       (best-effort, documented).
//
// Uses a real `SelfWriteSuppression` instance and a fake `WidgetController`
// shape with vi.fn() spies for every method the helper invokes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyAuthoritativeBodyAndFrontmatter } from '../../src/widget/applyAuthoritativeBody';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';
import { sha1 } from '../../src/widget/debouncedWriter';
import type { WidgetController } from '../../src/widget/WidgetController';

type AnyMockFn = ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown);

interface FakeWidget {
  registryKey: string;
  file: { path: string };
  fenceIndex: number;
  currentDocHash: string;
  dispatchAuthoritativeBodySwap: AnyMockFn;
  acknowledgeAuthoritativeBody: AnyMockFn;
}

function makeFakeWidget(overrides: Partial<FakeWidget> = {}): FakeWidget {
  const base: FakeWidget = {
    registryKey: 'LeetCode/two-sum.md::0::leaf-A',
    file: { path: 'LeetCode/two-sum.md' },
    fenceIndex: 0,
    currentDocHash: '',
    dispatchAuthoritativeBodySwap: vi.fn() as unknown as AnyMockFn,
    acknowledgeAuthoritativeBody: vi.fn() as unknown as AnyMockFn,
  };
  return { ...base, ...overrides };
}

// Disk content with a v1.3 leetcode-solve fence at index 0. The helper reads
// this via app.vault.read and rewrites the body via rewriteFenceBody, so the
// fence opener / closer must be present.
const DEFAULT_DISK = '---\nlc-slug: two-sum\nlc-language: python3\n---\n\n```leetcode-solve\nORIGINAL_BODY\n```\n';

interface FakeApp {
  fileManager: { processFrontMatter: AnyMockFn };
  vault: { read: AnyMockFn; process: AnyMockFn };
}

function makeFakeApp(opts: {
  processFrontMatterImpl?: (file: unknown, fn: (fm: Record<string, unknown>) => void) => Promise<void>;
  diskContent?: string;
} = {}): FakeApp {
  const disk = opts.diskContent ?? DEFAULT_DISK;
  return {
    fileManager: {
      processFrontMatter:
        (vi.fn(opts.processFrontMatterImpl ?? (async (_f, fn) => {
          fn({});
        })) as unknown) as AnyMockFn,
    },
    vault: {
      read: (vi.fn(async () => disk) as unknown) as AnyMockFn,
      process: (vi.fn(async (_f, transform: (s: string) => string) => transform(disk)) as unknown) as AnyMockFn,
    },
  };
}

const FILE = { path: 'LeetCode/two-sum.md' } as { path: string };

describe('applyAuthoritativeBodyAndFrontmatter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(1+2) arms suppression BEFORE dispatch with originator registryKey + sha1(newBody)', async () => {
    const widget = makeFakeWidget();
    const peer = makeFakeWidget({ registryKey: 'LeetCode/two-sum.md::0::leaf-B' });
    const app = makeFakeApp();
    const suppression = new SelfWriteSuppression();

    // Capture call order across suppression.arm and the dispatch sites.
    const callOrder: string[] = [];
    const armSpy = vi.fn((path: string, hash: string, key?: string) => {
      callOrder.push(`arm(${path},${hash.slice(0, 6)},${key ?? 'none'})`);
    });
    const origArm = suppression.arm.bind(suppression);
    suppression.arm = ((path: string, hash: string, key?: string) => {
      armSpy(path, hash, key);
      origArm(path, hash, key);
    }) as typeof suppression.arm;

    widget.dispatchAuthoritativeBodySwap = vi.fn((body: string, slug: string) => {
      callOrder.push(`originator.dispatch(${body},${slug})`);
    }) as unknown as AnyMockFn;
    peer.dispatchAuthoritativeBodySwap = vi.fn((body: string, slug: string) => {
      callOrder.push(`peer.dispatch(${body},${slug})`);
    }) as unknown as AnyMockFn;

    const newBody = 'class Solution {}';
    const newSlug = 'java';

    await applyAuthoritativeBodyAndFrontmatter(
      {
        app: app as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['app'],
        file: FILE as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['file'],
        suppression,
        widget: widget as unknown as WidgetController,
        peers: [peer as unknown as WidgetController],
      },
      newBody,
      newSlug,
      (fm) => {
        fm['lc-language'] = newSlug;
      },
    );

    // arm fires FIRST, then dispatches.
    const armIdx = callOrder.findIndex((s) => s.startsWith('arm('));
    const origIdx = callOrder.findIndex((s) => s.startsWith('originator.dispatch'));
    const peerIdx = callOrder.findIndex((s) => s.startsWith('peer.dispatch'));
    expect(armIdx).toBe(0);
    expect(origIdx).toBeGreaterThan(armIdx);
    expect(peerIdx).toBeGreaterThan(armIdx);

    // First arm carries originator's registryKey + sha1(newBody). The
    // helper arms a SECOND time before processFrontMatter (Pitfall 37);
    // test (7) pins that re-arm contract.
    const expectedHash = await sha1(newBody);
    expect(armSpy).toHaveBeenCalledWith(FILE.path, expectedHash, widget.registryKey);
    expect(armSpy.mock.calls[0]).toEqual([FILE.path, expectedHash, widget.registryKey]);
  });

  it('(3) every peer receives the same body + slug as the originator', async () => {
    const widget = makeFakeWidget();
    const peerA = makeFakeWidget({ registryKey: 'LeetCode/two-sum.md::0::leaf-B' });
    const peerB = makeFakeWidget({ registryKey: 'LeetCode/two-sum.md::0::leaf-C' });
    const app = makeFakeApp();
    const suppression = new SelfWriteSuppression();

    const newBody = 'fn main() {}';
    const newSlug = 'rust';

    await applyAuthoritativeBodyAndFrontmatter(
      {
        app: app as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['app'],
        file: FILE as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['file'],
        suppression,
        widget: widget as unknown as WidgetController,
        peers: [peerA, peerB] as unknown as WidgetController[],
      },
      newBody,
      newSlug,
      (fm) => {
        fm['lc-language'] = newSlug;
      },
    );

    expect(widget.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith(newBody, newSlug);
    expect(peerA.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith(newBody, newSlug);
    expect(peerB.dispatchAuthoritativeBodySwap).toHaveBeenCalledWith(newBody, newSlug);
  });

  it('(4) acknowledgeAuthoritativeBody is called on originator + every peer after vault.process + processFrontMatter', async () => {
    const widget = makeFakeWidget();
    const peer = makeFakeWidget({ registryKey: 'LeetCode/two-sum.md::0::leaf-B' });
    const app = makeFakeApp();
    const suppression = new SelfWriteSuppression();

    const callOrder: string[] = [];
    app.vault.process = vi.fn(async (_f, transform: (s: string) => string) => {
      callOrder.push('vault.process');
      return transform(DEFAULT_DISK);
    }) as unknown as AnyMockFn;
    app.fileManager.processFrontMatter = vi.fn(async (_f, fn: (fm: Record<string, unknown>) => void) => {
      callOrder.push('processFrontMatter');
      fn({});
    }) as unknown as AnyMockFn;
    widget.acknowledgeAuthoritativeBody = vi.fn(() => {
      callOrder.push('originator.acknowledge');
    }) as unknown as AnyMockFn;
    peer.acknowledgeAuthoritativeBody = vi.fn(() => {
      callOrder.push('peer.acknowledge');
    }) as unknown as AnyMockFn;

    const newBody = 'NEW_BODY';
    const newSlug = 'java';

    await applyAuthoritativeBodyAndFrontmatter(
      {
        app: app as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['app'],
        file: FILE as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['file'],
        suppression,
        widget: widget as unknown as WidgetController,
        peers: [peer as unknown as WidgetController],
      },
      newBody,
      newSlug,
      (fm) => {
        fm['lc-language'] = newSlug;
      },
    );

    // Order: vault.process → processFrontMatter → both acknowledges.
    expect(callOrder).toEqual([
      'vault.process',
      'processFrontMatter',
      'originator.acknowledge',
      'peer.acknowledge',
    ]);
    const expectedHash = await sha1(newBody);
    expect(widget.acknowledgeAuthoritativeBody).toHaveBeenCalledWith(expectedHash);
    expect(peer.acknowledgeAuthoritativeBody).toHaveBeenCalledWith(expectedHash);
  });

  it('(5) processFrontMatter throws → suppression.clearForPath fires and the error rethrows', async () => {
    const widget = makeFakeWidget();
    const app = makeFakeApp({
      processFrontMatterImpl: async () => {
        throw new Error('YAML parse error');
      },
    });
    const suppression = new SelfWriteSuppression();

    const clearSpy = vi.fn();
    const origClear = suppression.clearForPath.bind(suppression);
    suppression.clearForPath = ((path: string) => {
      clearSpy(path);
      origClear(path);
    }) as typeof suppression.clearForPath;

    const newBody = 'NEW';
    const newSlug = 'java';

    await expect(
      applyAuthoritativeBodyAndFrontmatter(
        {
          app: app as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['app'],
          file: FILE as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['file'],
          suppression,
          widget: widget as unknown as WidgetController,
          peers: [],
        },
        newBody,
        newSlug,
        (fm) => {
          fm['lc-language'] = newSlug;
        },
      ),
    ).rejects.toThrow('YAML parse error');

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith(FILE.path);
    // Suppression entry was cleared — confirm via size.
    expect(suppression.size).toBe(0);
    // acknowledgeAuthoritativeBody was NOT reached (processFrontMatter threw
    // before the acknowledge step).
    expect(widget.acknowledgeAuthoritativeBody).not.toHaveBeenCalled();
  });

  it('(6) peer dispatch throws → originator dispatch already landed; error propagates and suppression is cleared', async () => {
    // Documented contract: peer dispatch errors propagate from the helper —
    // the originator's dispatch has already been issued (atomic body+parser
    // swap landed on the originating pane); the catch path clears the
    // suppression entry to avoid a stale arm. This is best-effort behavior;
    // future iterations may swap to log+continue, but TODAY the contract is
    // "throw and clear".
    const widget = makeFakeWidget();
    const peer = makeFakeWidget({ registryKey: 'LeetCode/two-sum.md::0::leaf-B' });

    // Originator dispatch succeeds; peer dispatch throws.
    widget.dispatchAuthoritativeBodySwap = vi.fn() as unknown as AnyMockFn;
    peer.dispatchAuthoritativeBodySwap = vi.fn(() => {
      throw new Error('peer dispatch failed');
    }) as unknown as AnyMockFn;

    const app = makeFakeApp();
    const suppression = new SelfWriteSuppression();
    const clearSpy = vi.fn();
    const origClear = suppression.clearForPath.bind(suppression);
    suppression.clearForPath = ((path: string) => {
      clearSpy(path);
      origClear(path);
    }) as typeof suppression.clearForPath;

    await expect(
      applyAuthoritativeBodyAndFrontmatter(
        {
          app: app as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['app'],
          file: FILE as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['file'],
          suppression,
          widget: widget as unknown as WidgetController,
          peers: [peer as unknown as WidgetController],
        },
        'NEW',
        'java',
        (fm) => {
          fm['lc-language'] = 'java';
        },
      ),
    ).rejects.toThrow('peer dispatch failed');

    // Originator dispatch DID fire before the peer threw.
    expect(widget.dispatchAuthoritativeBodySwap).toHaveBeenCalledTimes(1);
    // Suppression cleanup ran in the catch path.
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith(FILE.path);
    // Acknowledge was NOT reached.
    expect(widget.acknowledgeAuthoritativeBody).not.toHaveBeenCalled();
    expect(peer.acknowledgeAuthoritativeBody).not.toHaveBeenCalled();
  });

  it('(7) pre-updates currentDocHash on originator + peers so both modify events hit Pitfall P2 absorption (Pitfall 37)', async () => {
    // Regression: the helper fires TWO modify events (body-flush + fm-
    // rewrite). The suppression map only holds one entry per path — whichever
    // modify lands second falls through to branch (d) → ConflictModal.
    // The fix sets currentDocHash on every widget BEFORE the writes start so
    // BOTH modify events hit the modify-handler's Pitfall P2 early-return
    // (currentDocHash === observedHash → absorb as self-write). The fence
    // body is unchanged across both writes (only frontmatter mutates), so
    // both events observe the same hash and both early-return.
    const widget = makeFakeWidget() as FakeWidget & { currentDocHash: string };
    widget.currentDocHash = 'STALE_HASH';
    const peer = makeFakeWidget({ registryKey: 'LeetCode/two-sum.md::0::leaf-B' }) as
      FakeWidget & { currentDocHash: string };
    peer.currentDocHash = 'STALE_HASH';

    const app = makeFakeApp();
    const suppression = new SelfWriteSuppression();

    const callOrder: string[] = [];
    widget.dispatchAuthoritativeBodySwap = vi.fn(() => {
      callOrder.push(`dispatch:hash=${widget.currentDocHash}`);
    }) as unknown as AnyMockFn;
    app.vault.process = vi.fn(async (_f, transform: (s: string) => string) => {
      callOrder.push(`vault.process:hash=${widget.currentDocHash}`);
      return transform(DEFAULT_DISK);
    }) as unknown as AnyMockFn;
    app.fileManager.processFrontMatter = vi.fn(async (_f, fn) => {
      callOrder.push(`processFrontMatter:hash=${widget.currentDocHash}`);
      fn({});
    }) as unknown as AnyMockFn;

    await applyAuthoritativeBodyAndFrontmatter(
      {
        app: app as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['app'],
        file: FILE as unknown as Parameters<typeof applyAuthoritativeBodyAndFrontmatter>[0]['file'],
        suppression,
        widget: widget as unknown as WidgetController,
        peers: [peer as unknown as WidgetController],
      },
      'NEW',
      'java',
      (fm) => {
        fm['lc-language'] = 'java';
      },
    );

    const expectedHash = await sha1('NEW');

    // currentDocHash is updated to expectedHash on BOTH originator and peer
    // before any write runs.
    expect(widget.currentDocHash).toBe(expectedHash);
    expect(peer.currentDocHash).toBe(expectedHash);

    // Every step that runs after the pre-update sees the new hash — proving
    // the update lands BEFORE dispatch + vault.process + processFrontMatter.
    expect(callOrder[0]).toBe(`dispatch:hash=${expectedHash}`);
    expect(callOrder[1]).toBe(`vault.process:hash=${expectedHash}`);
    expect(callOrder[2]).toBe(`processFrontMatter:hash=${expectedHash}`);
  });
});
