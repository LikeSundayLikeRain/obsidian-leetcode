// Phase 17 Plan 04 — Unit tests for the external `lc-language` frontmatter
// reactivity listener (D-13 / D-14, Wave 2).
//
// Strategy mirrors `tests/main/switchFenceLanguage.test.ts`: the listener
// body is extracted into a thin private helper
// `handleFmChangeForLanguageReactivity` on the LeetCodePlugin class so it can
// be unit-tested without spinning up a full plugin (registerEvent +
// metadataCache wiring is left to the production `onload` integration). Each
// test invokes the helper directly with a fake plugin context (via
// `helper.call(fakePlugin, file, cache)`) and asserts the resulting
// `childView.dispatch` shape.
//
// Coverage targets (Plan 17-04 Task 1 acceptance criteria):
//   1. external lc-language change dispatches Compartment.reconfigure on child
//   2. fm change to same slug — no dispatch (Pitfall 3 dedupe via Gate 3)
//   3. note without lc-slug — no dispatch (Gate 1)
//   4. file not in registry — no dispatch (Gate 2)
//   5. listener does NOT call vault.process or processFrontMatter (D-14 guard,
//      exhaustive across all four scenarios above)
//   6. dispatch has no userEvent annotation AND no `changes:` payload —
//      effect-only path (CLAUDE.md §Conventions guard against future regression)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Mocks (must be declared before SUT import per vitest hoisting model).
// We mock the language builder so the test can verify what slug is forwarded
// without bringing the full @codemirror module graph into scope.
// ─────────────────────────────────────────────────────────────────────────

vi.mock('../../src/main/childEditorLanguage', () => {
  return {
    languageCompartment: {
      reconfigure: vi.fn().mockReturnValue('mock-fm-reconfigure-effect'),
    },
    buildLanguageExtensions: vi.fn().mockReturnValue('mock-fm-extensions-array'),
  };
});

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  languageCompartment,
  buildLanguageExtensions,
} from '../../src/main/childEditorLanguage';

// Importing LeetCodePlugin pulls the entire src/main.ts graph — same approach
// as switchFenceLanguage.test.ts. Transitive imports resolve via the obsidian
// alias (vitest.config.ts) and CM6 packages already in node_modules.
import LeetCodePlugin from '../../src/main';

// ─────────────────────────────────────────────────────────────────────────
// Fake plugin context — exposes only the fields the helper touches.
// ─────────────────────────────────────────────────────────────────────────

interface FakeFile {
  path: string;
}

interface FakePluginShape {
  childEditorRegistry: { get: ReturnType<typeof vi.fn> };
  settings: { getIndentSizeOverride: ReturnType<typeof vi.fn> };
  /**
   * Stubbed `readActiveFenceSlug` returning the configured `activeFenceSlug`.
   * The production implementation reads the active MarkdownView's CM6 state
   * and falls back to metadataCache; the unit test shortcuts that by binding
   * the return value directly on the fake `this`. This keeps Gate 3 dedupe
   * (Pitfall 3) verifiable without standing up a real CM6 view in the test.
   *
   * Phase 17 Plan 09 (gap closure 17-UAT.md Issue 3 / Test 12): existing tests
   * keep this stub for fixture compatibility; new round-trip tests rely on
   * `childLanguageTracker` instead per the post-fix design.
   */
  readActiveFenceSlug: ReturnType<typeof vi.fn>;
  /**
   * Phase 17 Plan 09 (gap closure 17-UAT.md Issue 3) — per-child slug tracker.
   * Records the language slug currently applied to each child editor's
   * `languageCompartment`. Updated whenever a Compartment.reconfigure dispatch
   * lands (chevron switch path AND fm-reactivity listener path). Gate 3 of the
   * fm-reactivity listener reads from this tracker — NOT from
   * `readActiveFenceSlug` — because per D-14 the parent fence opener does not
   * change on the listener path. Tracker values are seeded by the dispatch
   * sites; absent entries are treated as "unknown current" and the listener
   * proceeds to dispatch (idempotent — Compartment.reconfigure with an equal
   * LanguageSupport is a no-op visually but updates the tracker).
   */
  childLanguageTracker: WeakMap<object, string>;
  app: {
    workspace: { getActiveViewOfType: ReturnType<typeof vi.fn> };
    vault: { process: ReturnType<typeof vi.fn> };
    fileManager: { processFrontMatter: ReturnType<typeof vi.fn> };
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  };
}

function makeFakePlugin(opts: {
  childView?: { dispatch: ReturnType<typeof vi.fn> } | undefined;
  /** The slug currently applied in the parent fence opener (D-13 Gate 3). */
  activeFenceSlug?: string;
  override?: 'auto' | 2 | 4 | 8;
  /**
   * Phase 17 Plan 09 — pre-seeded child language tracker entry. When provided,
   * the fake plugin's `childLanguageTracker` is initialized with
   * `tracker.set(opts.childView, opts.trackedSlug)`. Absent → tracker is empty
   * (post-fix Gate 3 treats this as "unknown current" and proceeds to
   * dispatch — see Test 11 below).
   */
  trackedSlug?: string;
}): FakePluginShape {
  const childView = opts.childView;
  const childLanguageTracker = new WeakMap<object, string>();
  if (childView && typeof opts.trackedSlug === 'string') {
    childLanguageTracker.set(childView, opts.trackedSlug);
  }
  return {
    childEditorRegistry: {
      get: vi.fn().mockReturnValue(childView),
    },
    settings: {
      getIndentSizeOverride: vi.fn().mockReturnValue(opts.override ?? 'auto'),
    },
    // Stub the helper that the SUT calls via `this.readActiveFenceSlug(...)`.
    // Production impl is exercised via integration in 17-UAT.md Test 12.
    readActiveFenceSlug: vi.fn().mockReturnValue(opts.activeFenceSlug),
    childLanguageTracker,
    app: {
      workspace: {
        getActiveViewOfType: vi.fn().mockReturnValue(undefined),
      },
      vault: {
        process: vi.fn(),
      },
      fileManager: {
        processFrontMatter: vi.fn(),
      },
      metadataCache: {
        // Surfaced for D-14 guard test — the listener must NOT consult
        // metadataCache for vault writes.
        getFileCache: vi.fn().mockReturnValue({
          frontmatter: opts.activeFenceSlug
            ? { 'lc-slug': 'two-sum', 'lc-language': opts.activeFenceSlug }
            : { 'lc-slug': 'two-sum' },
        }),
      },
    },
  };
}

// Pull the helper off the prototype — same indirection as switchFenceLanguage.
// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional; bound via .call
const helper = (LeetCodePlugin.prototype as unknown as {
  handleFmChangeForLanguageReactivity(
    file: FakeFile,
    cache: { frontmatter?: Record<string, unknown> } | null | undefined,
  ): void;
}).handleFmChangeForLanguageReactivity;

describe('handleFmChangeForLanguageReactivity (D-13 / D-14, Wave 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 1 — happy path: external lc-language change dispatches reconfigure
  // ───────────────────────────────────────────────────────────────────────
  it('external lc-language change dispatches Compartment.reconfigure on child', () => {
    const dispatchMock = vi.fn();
    // Parent fence currently says `java`; fm now says `python` → mismatch.
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    // Effect-only dispatch — assert the spec carries a reconfigure effect.
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.anything(),
      }),
    );
    // languageCompartment.reconfigure(buildLanguageExtensions(...)) chain
    expect(buildLanguageExtensions).toHaveBeenCalledWith('python', 'auto');
    expect(languageCompartment.reconfigure).toHaveBeenCalledWith(
      'mock-fm-extensions-array',
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 2 — Pitfall 3: fm change to same slug does NOT dispatch
  //
  // Phase 17 Plan 09 migration: post-fix Gate 3 reads from
  // `childLanguageTracker`, NOT from `readActiveFenceSlug`. The fixture
  // seeds `trackedSlug: 'python'` so `tracker.get(childView) === fmLangRaw`
  // trips Gate 3 — the legacy `activeFenceSlug` stub is left in place but
  // is no longer consulted by the SUT (preserved as a contract guard: if
  // a future regression re-introduces a `readActiveFenceSlug` read in
  // Gate 3, this stub keeps the legacy assertion meaningful).
  // ───────────────────────────────────────────────────────────────────────
  it('fm change to same slug — no dispatch (Pitfall 3 dedupe via Gate 3)', () => {
    const dispatchMock = vi.fn();
    // Tracker pre-seeded to 'python'; fm 'python' → tracker equality →
    // Gate 3 trips.
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'python',
      trackedSlug: 'python',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).not.toHaveBeenCalled();
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 3 — Gate 1: note without lc-slug — no dispatch
  // ───────────────────────────────────────────────────────────────────────
  it('note without lc-slug — no dispatch (Gate 1)', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'random.md' };
    // No `lc-slug` in cache → not a LeetCode note.
    const cache = {
      frontmatter: { 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).not.toHaveBeenCalled();
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 4 — Gate 2: file not in registry — no dispatch
  // ───────────────────────────────────────────────────────────────────────
  it('file not in registry — no dispatch (Gate 2)', () => {
    // No childView wired into registry → registry.get returns undefined.
    const fake = makeFakePlugin({
      childView: undefined,
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    // Registry was consulted (Gate 2) but no dispatch fired.
    expect(fake.childEditorRegistry.get).toHaveBeenCalledWith(
      'LeetCode/1-two-sum.md',
    );
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 5 — D-14: listener never calls vault.process or processFrontMatter.
  // Exhaustive across all four scenarios — frontmatter is SoT in passive
  // listener mode; the fence opener tag is NOT rewritten.
  // ───────────────────────────────────────────────────────────────────────
  it('D-14 — listener does NOT call vault.process or processFrontMatter (exhaustive)', () => {
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };

    // Scenario A: happy path
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'java',
      });
      const cache = {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario B: same-slug dedupe (Plan 17-09 migration: tracker-seeded
    // to mirror the post-fix Gate 3 path)
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'python',
        trackedSlug: 'python',
      });
      const cache = {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario C: missing lc-slug
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'java',
      });
      const cache = {
        frontmatter: { 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario D: not in registry
    {
      const fake = makeFakePlugin({
        childView: undefined,
        activeFenceSlug: 'java',
      });
      const cache = {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
      };
      helper.call(fake as unknown as object, file, cache);
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // Test 6 — D-13 dispatch carries no `userEvent` annotation AND no
  // `changes:` payload (effect-only path). Effect-only dispatches (no
  // changes: payload) are not subject to the section-lock changeFilter per
  // CLAUDE.md §Conventions — this assertion guards that no changes payload
  // was accidentally added.
  // ───────────────────────────────────────────────────────────────────────
  it('D-13 dispatch is effect-only — no userEvent, no changes payload', () => {
    const dispatchMock = vi.fn();
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    const cache = {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python' },
    };

    helper.call(fake as unknown as object, file, cache);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const dispatchSpec = dispatchMock.mock.calls[0]![0] as Record<string, unknown>;
    // Effect-only dispatches (no changes: payload) are not subject to the
    // section-lock changeFilter per CLAUDE.md §Conventions — this assertion
    // guards that no changes payload was accidentally added.
    expect(dispatchSpec.changes).toBeUndefined();
    expect(dispatchSpec.userEvent).toBeUndefined();
    // Effects key MUST be present (the whole point of the dispatch).
    expect(dispatchSpec.effects).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Phase 17 Plan 09 — Round-trip fm reactivity (17-UAT.md Issue 3 / Test 12)
  //
  // The bug: Java → Python3 → Java fm swap dispatches only ONCE on current
  // main. Gate 3 reads from `readActiveFenceSlug` which parses the parent
  // fence opener tag — but per D-14 the listener does NOT rewrite the
  // opener, so after the first swap the opener still says ```java`. The
  // second swap (Python3 → Java in fm) reads currentSlug = 'java' from the
  // unchanged opener, compares to fmLangRaw = 'java', and trips Gate 3
  // early — no dispatch fires.
  //
  // Fix: introduce a per-child `childLanguageTracker: WeakMap<EditorView,
  // string>` on the plugin instance. Both dispatch sites (chevron switch +
  // fm-reactivity listener) update the tracker. Gate 3 reads from the
  // tracker, not from `readActiveFenceSlug`.
  //
  // Tests below codify the post-fix design:
  //   Test 7  — round-trip Java → Python3 → Java BOTH dispatch (RED on main)
  //   Test 8  — Gate 3 dedupe still works via tracker comparison
  //   Test 9  — empty tracker treated as "unknown current" → dispatches
  //   Test 10 — D-14 invariant preserved across all post-fix scenarios
  // ───────────────────────────────────────────────────────────────────────

  it('round-trip fm swap — java → python3 → java BOTH dispatch (Plan 17-09 / 17-UAT.md Issue 3)', () => {
    const dispatchMock = vi.fn();
    // Tracker pre-seeded to 'java' simulating the chevron switch path or
    // initial mount having recorded the note's starting language. Per D-14
    // the parent fence opener tag does NOT change on the listener path, so
    // we keep `readActiveFenceSlug` returning the stale 'java' value
    // throughout — this is exactly the production scenario that exposes the
    // asymmetry on current main: Step B's Gate 3 reads 'java' from the
    // opener and trips early, dropping the second dispatch.
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
      trackedSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };

    // ── Step A: Java → Python3 ────────────────────────────────────────────
    helper.call(fake as unknown as object, file, {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(buildLanguageExtensions).toHaveBeenLastCalledWith('python3', 'auto');
    // Tracker MUST be updated by the dispatch site (the contract Task 2
    // satisfies). The post-fix Gate 3 will consult this on the next swap.
    const childView = (
      fake.childEditorRegistry.get as unknown as (path: string) => object
    )('LeetCode/1-two-sum.md');
    expect(fake.childLanguageTracker.get(childView)).toBe('python3');

    // ── Step B (the failing leg on current main): Python3 → Java ─────────
    helper.call(fake as unknown as object, file, {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    });
    // On current main this assertion FAILS — dispatchMock was called only
    // once because Gate 3's readActiveFenceSlug returned the stale 'java'
    // from the unchanged fence opener, matched fmLangRaw='java', and
    // short-circuited. Post-fix: Gate 3 reads tracker.get(childView) =
    // 'python3' (from Step A's tracker.set), sees it differs from 'java',
    // and dispatches symmetrically.
    expect(dispatchMock).toHaveBeenCalledTimes(2);
    expect(buildLanguageExtensions).toHaveBeenLastCalledWith('java', 'auto');
    expect(fake.childLanguageTracker.get(childView)).toBe('java');
  });

  it('Gate 3 dedupe still works after tracker swap — same-slug fm write no-op', () => {
    const dispatchMock = vi.fn();
    // Tracker says 'java'; fm now says 'java' → same-slug → Gate 3 trips
    // via tracker comparison (NOT via readActiveFenceSlug post-fix).
    // activeFenceSlug deliberately set to a DIFFERENT value ('python3') to
    // prove the post-fix Gate 3 reads from the tracker, not from the helper.
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'python3',
      trackedSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };

    helper.call(fake as unknown as object, file, {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    });

    // No dispatch — tracker.get(childView) === 'java' === fmLangRaw.
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
  });

  it('Gate 3 with empty childLanguageTracker — first fm change dispatches even if equal to initialSlug', () => {
    const dispatchMock = vi.fn();
    // No `trackedSlug` → tracker has no entry for childView. This models the
    // first metadataCache.changed event after note open, before any chevron
    // switch or fm dispatch has seeded the tracker. Post-fix: tracker.get
    // returns undefined; Gate 3 treats undefined !== fmLangRaw and proceeds
    // to dispatch (idempotent — Compartment.reconfigure with an equal
    // LanguageSupport is a no-op visually but seeds the tracker for the
    // next swap).
    const fake = makeFakePlugin({
      childView: { dispatch: dispatchMock },
      activeFenceSlug: 'java',
    });
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };

    helper.call(fake as unknown as object, file, {
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    });

    // Dispatch fires even though fm 'java' equals readActiveFenceSlug 'java'
    // — because the tracker is empty, Gate 3 cannot dedupe and proceeds.
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    // Tracker is now seeded with the dispatched slug — proves the dispatch
    // site is the tracker-write contract.
    const childView = (
      fake.childEditorRegistry.get as unknown as (path: string) => object
    )('LeetCode/1-two-sum.md');
    expect(fake.childLanguageTracker.get(childView)).toBe('java');
  });

  it('round-trip path preserves D-14 — listener never calls vault.process or processFrontMatter', () => {
    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };

    // Scenario A: round-trip swap (Test 7)
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'java',
        trackedSlug: 'java',
      });
      helper.call(fake as unknown as object, file, {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      });
      helper.call(fake as unknown as object, file, {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      });
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario B: tracker dedupe (Test 8)
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'python3',
        trackedSlug: 'java',
      });
      helper.call(fake as unknown as object, file, {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      });
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }

    // Scenario C: empty tracker (Test 9)
    {
      const fake = makeFakePlugin({
        childView: { dispatch: vi.fn() },
        activeFenceSlug: 'java',
      });
      helper.call(fake as unknown as object, file, {
        frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      });
      expect(fake.app.vault.process).not.toHaveBeenCalled();
      expect(fake.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    }
  });
});
