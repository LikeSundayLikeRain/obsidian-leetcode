// src/main/runLanguageSwitch.ts
//
// Failure B (Phase 22 follow-up) — pure helper that implements the chevron
// language-switch algorithm. The full algorithm contract is documented at the
// call site in src/main.ts (`LeetCodePlugin.switchLanguageFromWidget`).
//
// UX contract: chevron switch is always-overwrite (v1.2 parity). On switch we
// load the new language's starter snippet into the fence body, swap the parser
// in the same CM6 transaction, fan out to peer widgets, and rewrite
// `lc-language` frontmatter. We do NOT preserve user-typed code; users who
// want to switch back without losing work need the per-language buffer (TODO).
//
// This module exists so the algorithm can be unit-tested without instantiating
// a real `LeetCodePlugin`. Every Obsidian and plugin-internal dependency is
// passed in via `LanguageSwitchDeps`; the helper itself owns no global state
// and produces no side effects beyond the deps it is given.
//
// The plugin method `switchLanguageFromWidget` becomes a thin shim that
// constructs the deps from `this.app` / `this.client` / `this.lcSettings` /
// `this.selfWriteSuppression` / `this.widgetRegistry` and delegates here.

import type { App, TFile } from 'obsidian';
import type { WidgetController } from '../widget/WidgetController';
import type { SelfWriteSuppression } from '../widget/selfWriteSuppression';
import type {
  ResolveStarterClient,
  ResolveStarterSettings,
  ResolveStarterResult,
} from '../solve/resolveStarterCode';
import { resolveStarterCode } from '../solve/resolveStarterCode';
import { applyAuthoritativeBodyAndFrontmatter } from '../widget/applyAuthoritativeBody';
import { LC_LANG_DISPLAY_LABELS } from '../solve/languages';

/**
 * Dependency contract for `runLanguageSwitch`. Each field maps 1:1 to the
 * corresponding production wiring in `LeetCodePlugin.switchLanguageFromWidget`.
 *
 * `notify` and `logDebug` are injected as plain functions so the test harness
 * can capture them as spies — production wiring binds `(msg, ms) => new Notice(msg, ms)`
 * and `(...args) => logger.debug(...args)`.
 */
export interface LanguageSwitchDeps {
  app: App;
  settings: ResolveStarterSettings;
  client: ResolveStarterClient;
  suppression: SelfWriteSuppression;
  /** Iterates registered widget controllers across panes. The helper filters
   *  to peers (same path, distinct registryKey, editable, non-embed). */
  iterateWidgets(): Iterable<WidgetController>;
  /** Surfaces a Notice. Production: `(msg, ms) => new Notice(msg, ms)`. */
  notify(message: string, timeoutMs: number): void;
  /** Debug-level log sink. Production: `logger.debug`. */
  logDebug(message: string, ...args: unknown[]): void;
}

/**
 * Run the chevron language-switch algorithm. See the JSDoc on
 * `LeetCodePlugin.switchLanguageFromWidget` (src/main.ts) for the 16-step
 * contract; this implementation is the canonical body of that method.
 */
export async function runLanguageSwitch(
  deps: LanguageSwitchDeps,
  widget: WidgetController,
  file: TFile,
  newSlug: string,
): Promise<void> {
  // Step 1 — defensive guard for read-only / teardown-race.
  if (widget.readOnly) {
    return fmOnlyLanguageWrite(deps, file, newSlug);
  }
  try {
    // Touch view.state to detect detached / destroyed view.
    void widget.view.state;
  } catch {
    return;
  }

  // Step 2 — same-slug short-circuit at entry.
  const fmAtEntry = deps.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const currentSlug =
    typeof fmAtEntry?.['lc-language'] === 'string'
      ? (fmAtEntry['lc-language'] as string)
      : null;
  if (currentSlug === newSlug) return;

  // Step 3 — flush BEFORE any vault write so pending characters land under
  // the OLD slug (Pattern F).
  await widget.flushNow();

  // Step 4 — IME composition gate. Defer the entire switch until
  // compositionend so a Compartment.reconfigure cannot fire while the
  // CJK candidate menu is open.
  if (widget.isComposing) {
    const contentDOM = (widget.view as unknown as { contentDOM?: HTMLElement }).contentDOM;
    if (contentDOM && typeof contentDOM.addEventListener === 'function') {
      const onEnd = (): void => {
        void runLanguageSwitch(deps, widget, file, newSlug);
      };
      contentDOM.addEventListener('compositionend', onEnd, { once: true });
    }
    return;
  }

  // Step 5 — read lc-slug from frontmatter; silent return on missing/non-string.
  const lcSlugRaw = fmAtEntry?.['lc-slug'];
  if (typeof lcSlugRaw !== 'string' || lcSlugRaw.length === 0) return;
  const lcSlug = lcSlugRaw;

  // Step 6 — resolve the new language's starter snippet. v1.2 always-overwrite
  // UX: the chevron click is a destructive action, equivalent to Reset for the
  // new language. We do not need the OLD starter (no comparison gate) and we do
  // not check childDirty / hasEverBeenDirtySinceMount — typing is overwritten.
  // Per-language buffer preservation (switch-back-restores-typing) is a future
  // enhancement; today the contract is "switch language = load starter".
  const starterDeps = { settings: deps.settings, client: deps.client };
  const newRes: ResolveStarterResult = await resolveStarterCode(
    starterDeps,
    lcSlug,
    newSlug,
  );
  const newStarter = newRes.code;
  const prettyLabel = LC_LANG_DISPLAY_LABELS[newSlug] ?? newSlug;

  // Step 7 — newStarter unavailable. Differentiated Notice copy so the user
  // can disambiguate "offline; try again" from "LC has no starter for this
  // language on this problem". fm-only write proceeds in both cases (the
  // chevron + lc-language frontmatter still updates so syntax highlighting
  // follows the new language).
  if (newStarter === null) {
    if (newRes.reason === 'network') {
      deps.notify(
        `Couldn't fetch starter for ${prettyLabel} (offline?). Code unchanged; try again when online.`,
        5000,
      );
    } else {
      deps.notify(
        `LeetCode has no ${prettyLabel} starter for this problem. Code unchanged.`,
        5000,
      );
    }
    return fmOnlyLanguageWrite(deps, file, newSlug);
  }

  // Steps 12-15 — combined atomic body+parser dispatch + frontmatter write.
  // Multi-pane fan-out: every editable peer widget on this file path receives
  // the same body+effect dispatch directly (no peer reload-from-disk).
  const peers = collectPeerWidgets(deps, widget, file.path);
  try {
    await applyAuthoritativeBodyAndFrontmatter(
      {
        app: deps.app,
        file,
        suppression: deps.suppression,
        widget,
        peers,
      },
      newStarter,
      newSlug,
      (fm) => {
        // Inner same-slug guard (D10): skip the assignment if an external
        // sync flipped fm to newSlug between step 2's read and now,
        // avoiding a spurious metadataCache 'changed' event.
        if (fm['lc-language'] !== newSlug) fm['lc-language'] = newSlug;
      },
    );
  } catch (err) {
    deps.notify(
      "Failed to switch language. The note's frontmatter may be malformed.",
      5000,
    );
    deps.logDebug('switchLanguageFromWidget: combined write failed', err);
  }
}

/**
 * fm-only language write helper. Used by the read-only / teardown / DIRTY /
 * unavailable branches of `runLanguageSwitch`. Inner same-slug guard avoids
 * spurious metadataCache 'changed' on external-sync race.
 */
async function fmOnlyLanguageWrite(
  deps: LanguageSwitchDeps,
  file: TFile,
  newSlug: string,
): Promise<void> {
  try {
    await deps.app.fileManager.processFrontMatter(
      file,
      (fmObj: Record<string, unknown>) => {
        if (fmObj['lc-language'] !== newSlug) fmObj['lc-language'] = newSlug;
      },
    );
  } catch (err) {
    deps.notify(
      "Failed to switch language. The note's frontmatter may be malformed.",
      5000,
    );
    deps.logDebug('fmOnlyLanguageWrite: processFrontMatter failed', err);
  }
}

/**
 * Collect every peer WidgetController registered for `path` excluding the
 * originator. Used for multi-pane fan-out so the body+parser dispatch lands
 * on every pane synchronously (no peer reload-from-disk path needed).
 */
function collectPeerWidgets(
  deps: LanguageSwitchDeps,
  originator: WidgetController,
  path: string,
): WidgetController[] {
  const peers: WidgetController[] = [];
  for (const ctl of deps.iterateWidgets()) {
    const candidate = ctl as unknown as WidgetController & {
      file: { path: string };
    };
    if (
      candidate.file.path === path &&
      candidate.registryKey !== originator.registryKey &&
      // Skip read-only / embed peers — they have no childDirtyExtension and
      // dispatching the body change into a read-only view is a no-op at best.
      !candidate.readOnly &&
      !candidate.isEmbed
    ) {
      peers.push(candidate);
    }
  }
  return peers;
}
