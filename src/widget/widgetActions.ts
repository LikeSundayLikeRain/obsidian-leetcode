// Phase 20 Plan 20-02 — Action-row mount adapter for v1.3 inline widget.
//
// Mounts the v1.2 buildCodeBlockButtonRow (99 LOC, reused VERBATIM per
// D-action-02) inside the widget container, with the v1.2 buildLanguageChevron
// (304 LOC, reused VERBATIM) plugged into the existing `prefix` slot.
//
// Architecture (D-action-04 seam):
//   - The host adapter satisfies BOTH `CodeBlockButtonRowHost` and
//     `LanguageChevronHost` structurally. Each `*FromActive` method routes
//     to the corresponding `*FromWidget(ctl)` plugin method (Task 2).
//   - `aiDebugFromActive` is a no-op — AI Debug is NOT in the widget row
//     per D-action-03 (deferred to verdict modal only).
//   - `switchLanguage` (LanguageChevronHost) routes to
//     `plugin.switchLanguageFromWidget(ctl, file, newSlug)`.
//
// Type discipline: the intersection cast `as CodeBlockButtonRowHost &
// LanguageChevronHost` is satisfied structurally because the `host` literal
// exposes every method on both interfaces. `as never` is FORBIDDEN — it
// bypasses TypeScript's structural mismatch detection (PLAN Step 1).

import type { Plugin, TFile } from 'obsidian';
import {
  buildCodeBlockButtonRow,
  type CodeBlockButtonRowHost,
} from '../main/codeBlockButtonRow';
import {
  buildLanguageChevron,
  type LanguageChevronHost,
} from '../main/languageChevronWidget';

/**
 * Phase 20 Plan 20-02 — minimal WidgetController shape used by mountActionRow.
 *
 * Structurally typed (rather than importing `WidgetController` directly) so
 * unit tests can pass plain object literals without spinning up a real CM6
 * EditorView. Production callers pass the real `WidgetController` instance
 * which structurally satisfies this contract.
 */
export interface WidgetActionRowCtl {
  container: HTMLElement;
  file: TFile;
  fenceIndex: number;
  plugin: Plugin & {
    runFromWidget(widget: WidgetActionRowCtl): void | Promise<void>;
    submitFromWidget(widget: WidgetActionRowCtl): void | Promise<void>;
    aiSolutionFromWidget(widget: WidgetActionRowCtl): void | Promise<void>;
    resetFromWidget(widget: WidgetActionRowCtl): void | Promise<void>;
    retrieveLastSubmissionFromWidget(
      widget: WidgetActionRowCtl,
    ): void | Promise<void>;
    switchLanguageFromWidget(
      widget: WidgetActionRowCtl,
      file: TFile,
      newSlug: string,
    ): void | Promise<void>;
  };
}

/**
 * Mount the v1.2 action row inside the widget's container as a sibling of
 * `.cm-editor`. Returns the row element so callers can store it on the
 * controller for later teardown / re-render.
 *
 * @param ctl - widget controller (provides container + plugin handle + file +
 *              fenceIndex)
 * @param file - the LC note's TFile (passed through to the chevron's
 *               switchLanguage path)
 * @param currentSlug - the current `lc-language` value, used for the chevron's
 *                      label and the .is-current dropdown marker
 * @param doc - the owning Document (use `host.ownerDocument` —
 *              popout-window safe per project lint rule)
 *
 * Per ACTION-01, ACTION-02, ACTION-05, ACTION-06, D-action-01..04, L2.
 */
export function mountActionRow(
  ctl: WidgetActionRowCtl,
  file: TFile,
  currentSlug: string,
  doc: Document,
): HTMLDivElement {
  // Adapter object satisfying BOTH CodeBlockButtonRowHost and
  // LanguageChevronHost structurally. `aiDebugFromActive` is a no-op per
  // D-action-03 — AI Debug is NOT in the widget row.
  //
  // Each *FromActive method routes to the corresponding *FromWidget(ctl) so
  // Phase 22 can mechanically delete the v1.2 *FromActive path and rename
  // *FromWidget → *FromActive (D-action-04 architectural seam).
  const host = {
    runFromActive: () => ctl.plugin.runFromWidget(ctl),
    submitFromActive: () => ctl.plugin.submitFromWidget(ctl),
    aiDebugFromActive: () => Promise.resolve(),
    aiSolutionFromActive: () => ctl.plugin.aiSolutionFromWidget(ctl),
    resetFromActive: () => ctl.plugin.resetFromWidget(ctl),
    retrieveLastSubmissionFromActive: () =>
      ctl.plugin.retrieveLastSubmissionFromWidget(ctl),
    switchLanguage: (f: TFile, newSlug: string) =>
      Promise.resolve(ctl.plugin.switchLanguageFromWidget(ctl, f, newSlug)),
  };

  // Plugin handle threaded through to satisfy the `Plugin & ...Host` shape
  // that buildCodeBlockButtonRow + buildLanguageChevron expect.
  // The intersection cast is structurally checked — every method on both
  // interfaces is present on `host`. `as never` is forbidden (PLAN Step 1).
  const hostWithPlugin = Object.assign(
    Object.create(ctl.plugin) as Plugin,
    host,
  ) as Plugin & CodeBlockButtonRowHost & LanguageChevronHost;

  const row = buildCodeBlockButtonRow(doc, hostWithPlugin, {
    prefix: () =>
      buildLanguageChevron(doc, hostWithPlugin, file, currentSlug),
  });

  ctl.container.appendChild(row);
  return row;
}
