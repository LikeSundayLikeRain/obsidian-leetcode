---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 08
status: complete
gap_closure: true
closes_gaps: ["language-switch-not-wired"]
tasks_completed: 4
tasks_deferred: 1
manual_uat: deferred-to-phase-end
---

# Plan 20-08 Summary — Language chevron live refresh

## Objective

Fix Phase 20 UAT Test 3 (`20-HUMAN-UAT.md` line 26-31, severity major):
"Theme retheme looks good for Java (current language), but the language
switch is broken — looks like it hasn't been wired up. Couldn't verify all
8 language packs."

Confirmed root cause (`.planning/debug/language-switch-not-wired.md`): the
chevron click was wired end-to-end but produced ZERO visible feedback
because the chevron label and `.is-current` dropdown marker were captured
at mount and never refreshed. v1.3 deliberately does NOT swap fence body
on language switch (only frontmatter mutates); successful switch was
indistinguishable from a no-op.

## Tasks

- [x] Task 1 — `buildLanguageChevron` returns `LanguageChevronHandle` with refresh closure
- [x] Task 2 — `mountActionRow` returns `MountedActionRow = { row, refresh }`
- [x] Task 3 — `WidgetController.actionRowRefresh` wired into metadataCache listener
- [x] Task 4 — 5 regression tests pinning chevron refresh contract
- [ ] Task 5 — Manual UAT (deferred to phase-end UAT loop per orchestrator decision)

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/main/languageChevronWidget.ts` | +60 / -3 | New `LanguageChevronHandle` interface; items map; refresh closure; return shape struct |
| `src/main/codeActionsEditorExtension.ts` | +8 / -2 | v1.2 caller — append `.wrapper` to extract HTMLElement (Decoration.widget rebuilds via WidgetType.eq, no live refresh needed) |
| `src/widget/widgetActions.ts` | +35 / -8 | `MountedActionRow` interface; capture chevronHandle from prefix factory; refresh proxy closure; `actionRowRefresh?` field on `WidgetActionRowCtl` |
| `src/widget/WidgetController.ts` | +27 / -1 | `actionRowRefresh?` field; consume `mounted.row` + `mounted.refresh` from mountActionRow; metadataCache listener calls `ctl.actionRowRefresh?.(newSlug)` after Compartment.reconfigure |
| `tests/main/languageChevronWidget.test.ts` | 24 callsites rewritten | `const wrapper = buildLanguageChevron(...)` → `const { wrapper } = buildLanguageChevron(...)` |
| `tests/widget/widgetActionRow.test.ts` | 13 callsites rewritten | `const row = mountActionRow(...)` → `const { row } = mountActionRow(...)` |
| `tests/widget/languageChevronRefresh.test.ts` | NEW (134 LOC) | 5 regression cases pinning the refresh contract |

## Key Implementation Details

### LanguageChevronHandle return shape

```ts
export interface LanguageChevronHandle {
  wrapper: HTMLElement;
  labelSpan: HTMLSpanElement;
  items: Map<string, HTMLButtonElement>;  // keyed by slug
  refresh: (newSlug: string) => void;
}
```

`refresh(newSlug)`:
1. Returns early if `newSlug === mountedSlug` (idempotent).
2. Updates `labelSpan.textContent = LC_LANG_DISPLAY_LABELS[newSlug] ?? newSlug`.
3. Drops `.is-current` from every item.
4. Adds `.is-current` to `items.get(newSlug)` if present (unknown slug: no item gets the class — matches build-time fallback).

### v1.3 inline widget wiring

```ts
// mountActionRow captures the handle from the prefix factory:
let chevronHandle: LanguageChevronHandle | null = null;
const row = buildCodeBlockButtonRow(doc, hostWithPlugin, {
  prefix: () => {
    chevronHandle = buildLanguageChevron(doc, hostWithPlugin, file, currentSlug);
    return chevronHandle.wrapper;
  },
});
// mountActionRow returns { row, refresh: (slug) => chevronHandle?.refresh(slug) }

// WidgetController.mountLeetCodeWidget stores the closure:
const mounted = mountActionRow(...);
ctl.actionRow = mounted.row;
ctl.actionRowRefresh = mounted.refresh;

// metadataCache 'changed' listener — calls refresh AFTER reconfigure:
ctl.view.dispatch({ effects: languageCompartment.reconfigure(...) });
ctl.actionRowRefresh?.(newSlug);
```

### v1.2 path adapter

`Decoration.widget` rebuilds the chevron DOM via `WidgetType.eq()` whenever
`currentSlug` changes (`codeActionsEditorExtension.ts:145-155`), so the v1.2
path needs only the wrapper HTMLElement — no live refresh handle. Adapter:

```ts
prefix: () =>
  buildLanguageChevron(doc, this.plugin, this.file, this.currentSlug).wrapper,
```

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean (BOTH compile branches green) |
| `npm run build` | exit 0 |
| `npx vitest run tests/main/languageChevronWidget.test.ts tests/widget/widgetActionRow.test.ts tests/widget/languageReactivity.test.ts tests/widget/languageChevronRefresh.test.ts` | 48/48 pass (24 + 13 + 6 + 5) |
| `npx vitest run` (full project) | 2066 pass / 6 skipped / 0 fail (+5 from baseline 2061) |
| `grep -cnE 'const wrapper = buildLanguageChevron' tests/main/languageChevronWidget.test.ts` | 0 (was 24) |
| `grep -cnE 'const \{ wrapper \} = buildLanguageChevron' tests/main/languageChevronWidget.test.ts` | 24 |
| `grep -nE 'actionRowRefresh' src/widget/` | 4 hits: declaration + 1 populate site + 1 metadataCache call site + interface field on WidgetActionRowCtl |
| `grep -nE 'buildLanguageChevron\(' src/ \| grep -v test` | 2 production callsites (widgetActions v1.3 captures handle; codeActionsEditorExtension v1.2 uses .wrapper) |

## Test Caller Rewrite — Plan Estimate vs Actual

Plan estimated 27 production-test caller sites in
`tests/main/languageChevronWidget.test.ts`; actual was 24 (the file evolved
between plan authoring and execution). All 24 rewritten via:

```bash
sed -i '' 's/const wrapper = buildLanguageChevron(/const { wrapper } = buildLanguageChevron(/g' \
  tests/main/languageChevronWidget.test.ts
```

After: `grep -c "const wrapper = buildLanguageChevron"` returns 0;
`grep -c "const { wrapper } = buildLanguageChevron"` returns 24.

## Atomic Commits

1. `e692a84` Task 1 (core) — `buildLanguageChevron` returns refresh handle
2. `5b9b8f7` Task 1 (adapters) — v1.2 caller `.wrapper` extraction + 24 test caller rewrites
3. `1df173b` Task 2 — `mountActionRow` returns `{ row, refresh }` + 13 widgetActionRow test rewrites
4. `47431a8` Task 3 — `WidgetController.actionRowRefresh` + metadataCache listener wiring
5. `1d77de1` Task 4 — 5 chevron refresh regression cases

## Manual UAT — Deferred

Task 5 (dev-vault verification of all 8 language packs producing visible
feedback: label change + `.is-current` re-target + syntax highlight update)
deferred to the phase-end UAT loop where all 4 gap-closure plans
(20-05/06/07/08) are verified together.

## Phase 22 Implication

Phase 22 (flip useInlineWidget=ON) inherits this fix. Users will see the
chevron label change immediately on every language switch (chevron click
OR external `lc-language` write — Obsidian Sync, processFrontMatter from
any other code path, manual frontmatter edit) regardless of which language
pack they're switching between.
