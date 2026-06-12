# Debug: Language switch not visibly wired (Phase 20 THEME-04)

**UAT Test:** Phase 20 Test 3
**Severity:** major
**Status:** root cause identified — verified by parallel debug agent

## Symptom

Verbatim user report: *"Theme retheme looks good for Java (current language), but the language switch is broken — looks like it hasn't been wired up. Couldn't verify all 8 language packs."*

## Root Cause

The v1.3 widget chevron IS wired end-to-end (chevron click → host adapter override → `switchLanguageFromWidget` → `processFrontMatter` → metadataCache 'changed' listener → `languageCompartment.reconfigure`), but the chevron click produces **zero visible feedback**, so the user reasonably concludes "not wired up." Two missing UI updates and one removed-by-design content swap conspire to make a successful switch look like a no-op:

1. The chevron LABEL is built once at mount in `src/main/languageChevronWidget.ts:96` from the slug passed into `mountActionRow`. No code path ever updates `labelSpan.textContent` after a switch — label stays frozen at "Java" forever.
2. The dropdown `.is-current` marker (`src/main/languageChevronWidget.ts:240-242`) is set once at build time and never refreshed.
3. The fence body content is NOT swapped to the new language's starter snippet (intentional per `src/main.ts:2786-2805` — v1.3 deliberately dropped v1.2's Step A fetch + Step B body/opener atomic replace; only frontmatter mutates).
4. The metadataCache 'changed' listener at `src/widget/WidgetController.ts:925-962` only dispatches `languageCompartment.reconfigure(...)` — it has no handle to the chevron DOM and no update path to widgetActions.ts.

Net effect: click → silent frontmatter write → silent parser reconfigure → chevron still says "Java" → body unchanged → indistinguishable from a no-op. UAT Test 3's "verify all 8 language packs" requirement surfaced this gap because the user has no way to confirm any switch happened, let alone iterate through 8.

## Evidence

- Chevron click handler at `src/main/languageChevronWidget.ts:243-256` correctly calls `plugin.switchLanguage(file, slug)`; host adapter at `src/widget/widgetActions.ts:96-97,104-107` correctly routes that to `ctl.plugin.switchLanguageFromWidget(ctl, f, newSlug)` via `Object.assign` over the plugin prototype.
- `switchLanguageFromWidget` (`src/main.ts:2806-2831`) does ONLY `widget.flushNow()` + `processFrontMatter` — NO body swap, NO label update, NO action-row refresh. JSDoc at `src/main.ts:2786-2805` explicitly documents this design.
- `mountActionRow` (`src/widget/widgetActions.ts:75-116`) is invoked exactly once at `src/widget/WidgetController.ts:1007` and exposes no update API. `grep` confirms `ctl.actionRow` is written but never re-read for refresh.
- The metadataCache listener (`src/widget/WidgetController.ts:935-958`) reconfigures the languageCompartment but never touches the chevron DOM.
- v1.2's `switchFenceLanguage` (`src/main.ts:3199-3292`) had two visible-feedback channels (Step B body replace + `languageRefreshEffect.of(newSlug)` decoration repaint) that v1.3 removed without a substitute.

## Files Involved

- `src/main.ts:2806-2831` (`switchLanguageFromWidget`): documented design only writes frontmatter; no body swap, no label update — by design but with no compensating UI feedback path.
- `src/main/languageChevronWidget.ts:75-303` (`buildLanguageChevron`): builds DOM with static label and `.is-current` marker captured at construction; exposes no update method.
- `src/widget/widgetActions.ts:75-116` (`mountActionRow`): one-shot mount; returns the row but no refresh hook.
- `src/widget/WidgetController.ts:925-962` (metadataCache listener): updates the parser only; no bridge to action-row DOM. Natural place to fan-out a chevron-label refresh.
- `src/widget/WidgetController.ts:1005-1018` (mount call site): single mount of the action row; no remount on language change.

## Suggested Fix Direction

Bridge the metadataCache 'changed' listener to a chevron-refresh entry point. Two viable shapes for `plan-phase --gaps` to evaluate:

(a) **Surgical DOM update (preferred):** Have `mountActionRow` capture references to the chevron's `labelSpan` and the per-item `.is-current` button list and return an updater closure (e.g., `(newSlug) => void`) stored on the controller. The metadataCache listener calls `ctl.actionRowRefresh?.(newSlug)` after the `languageCompartment.reconfigure` dispatch. Minimal DOM churn; no remount; cursor + scroll preserved automatically.

(b) **Re-mount-in-place:** Have the metadataCache listener tear down `ctl.actionRow` and call `mountActionRow(ctl, file, newSlug, doc)` again. Heavier (drops + rebuilds chevron event listeners) but simpler to write — matches v1.2's "rebuild on each refresh" mental model.

(a) is preferred — stays inside the v1.3 design (no parent CM6 dispatch, frontmatter-only mutation) and avoids the listener-leak risk of repeated mount/unmount.

Note: this gap was inherited from Phase 20-02's `mountActionRow` mount-and-forget design, not introduced by Phase 20-04. The same fix unblocks UAT Test 3 (all 8 packs verifiable) and any future flow that needs the chevron to reflect external `lc-language` writes (e.g., Obsidian Sync from another device).
