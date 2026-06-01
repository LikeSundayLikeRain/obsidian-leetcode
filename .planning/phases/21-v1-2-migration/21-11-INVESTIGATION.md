# Plan 21-11 Task 1 — Investigation: LeetCodeFenceWidget susceptibility to the CM6 line-break-Decoration.replace + ViewPlugin contract violation

**Date:** 2026-06-01
**Author:** gsd-executor (Phase 21 Plan 21-11 Task 1)
**Status:** Read-only investigation. No code mutated.

---

## Question

The Live Preview UAT Test 4b (`21-HUMAN-UAT.md` lines 44–69) shows that mounting the legacy `AutoMigratingBannerWidget` via `Decoration.replace` from inside `leetCodeFenceViewPlugin`'s `buildLeetCodeFenceRanges` (`src/widget/liveModeViewPlugin.ts:160-208`) emits the CM6 RangeError:

> `Decorations that replace line breaks may not be specified via plugins`

The error occurs because the decoration spans the **multi-line** legacy fence (`legacyFrom = doc.line(fence.openerLine).from` to `legacyTo = doc.line(fence.closerLine).to`), and CM6's documented contract says line-break-spanning `Decoration.replace` MUST be supplied via a `StateField` (transaction-time), not via a `ViewPlugin`'s build-time `decorations` field.

The pre-existing `LeetCodeFenceWidget` mount path (same file, lines 213–232) builds a structurally identical `Decoration.replace` over the same kind of multi-line range (`from = doc.line(fence.openerLine).from` to `to = doc.line(fence.closerLine).to`). **Why does the v1.3 widget mount NOT fire the same RangeError in production?**

The answer determines the scope of Plan 21-11 Task 2:
- If v1.3 also violates the contract → fix BOTH (move both decorations into StateField(s)).
- If v1.3 escapes legitimately → fix only the legacy banner.

---

## Side-by-side construct shape comparison

Both decorations are emitted from the **same** function (`buildLeetCodeFenceRanges`) inside the **same** ViewPlugin (`leetCodeFenceViewPlugin`), via the **same** `RangeSetBuilder<Decoration>` and the **same** `Decoration.replace({ widget })` factory. Identical `from`/`to` shape:

| Property | v1.2 legacy banner (lines 173–182) | v1.3 LC widget (lines 213–232) |
|---|---|---|
| `from` | `view.state.doc.line(fence.openerLine).from` | `view.state.doc.line(fence.openerLine).from` |
| `to` | `view.state.doc.line(fence.closerLine).to` | `view.state.doc.line(fence.closerLine).to` |
| Multi-line span? | YES (covers opener line + body + closer line) | YES (covers opener line + body + closer line) |
| Decoration factory | `Decoration.replace({ widget: AutoMigratingBannerWidget })` | `Decoration.replace({ widget: LeetCodeFenceWidget })` |
| Provided via | `ViewPlugin.decorations` field (line 386) | `ViewPlugin.decorations` field (line 386) |
| StateField involved? | **NO** | **NO** |

The two paths are **byte-for-byte equivalent** in terms of the CM6 contract surface that produces the line-break RangeError. There is no structural difference in `from`, `to`, decoration spec, or the host extension shape that could explain a contract-asymmetric outcome.

---

## Hypotheses tested

### h1 — `replaceWith` widget property differs

**Status:** TESTED via source inspection — REFUTED.

Both call sites use `Decoration.replace({ widget: ... })` with the same option shape. There is no `replaceWith`, `inclusive`, or `block` property mismatch. The CM6 RangeError is keyed on `from`/`to` line-break crossing, not on widget-property differences.

### h2 — Obsidian's editor-folding extension pre-folds `leetcode-solve` fences before the ViewPlugin runs

**Status:** TESTED via source inspection — **SUPPORTED.**

Evidence:
1. `src/main.ts:1060-1061` registers `registerMarkdownCodeBlockProcessor('leetcode-solve', handler)`. Per Obsidian's documented behavior, registering a code-block processor for a tag tells Obsidian to treat fences with that tag as block-level processed content. Obsidian's internal `CodeBlockExtension` (markdown rendering pipeline) folds (replaces) the fence's interior lines before the editor's ViewPlugin update cycle sees the doc range as "editable multi-line."
2. The legacy fence tags (` ```java `, ` ```python `, ` ```cpp `, etc.) are NOT registered with `registerMarkdownCodeBlockProcessor` — they are rendered by Obsidian's default markdown processor, which does NOT pre-fold them in Live Preview. The fence body lines remain plain editable text in the doc that the ViewPlugin sees, and `Decoration.replace` from `legacyFrom` to `legacyTo` then crosses real, unfolded line breaks → CM6 throws.
3. CONTEXT D-trigger-01 acknowledges this asymmetry implicitly: "atomic with first edit … the user's first interaction with the note is already on the v1.3 fence."

**This is the load-bearing reason the v1.3 path escapes the RangeError in production.** Strictly speaking, the v1.3 construct ALSO violates the documented CM6 contract — but Obsidian's `registerMarkdownCodeBlockProcessor` pre-fold makes the line-break-spanning condition vacuously satisfied at the moment CM6 evaluates the decoration's range. A `Decoration.replace` whose `[from, to)` collapses to a single (folded) block line does NOT trigger the line-break check.

The legacy fence has no such pre-fold path because no `registerMarkdownCodeBlockProcessor('java', ...)` (or `python`, `cpp`, etc.) is registered (and registering one for every LC langSlug would clash with Obsidian's default code-block rendering and break the user's other code blocks). This is why the migration banner, which targets the un-folded legacy fence, hits the CM6 contract head-on.

### h3 — Some Obsidian internal Markdown extension treats `leetcode-solve` as block-level whereas `java`/`python` are inline-eligible

**Status:** TESTED via source inspection — SUPPORTED, but it is a corollary of h2 (the `registerMarkdownCodeBlockProcessor` registration IS the mechanism by which `leetcode-solve` becomes block-level pre-folded).

### h4 — Order of extensions in the registered Extension array matters

**Status:** TESTED via source inspection — INCONCLUSIVE / NOT THE PRIMARY CAUSE.

The `registerEditorExtension` order is consistent for all extensions; CM6's Facet aggregation merges decorations from all sources at evaluation time regardless of registration order. The order matters for `transactionFilter`-like extensions (which `leetCodeFenceViewPlugin` is not), not for `EditorView.decorations` Facet contributors. h2 is sufficient to explain the asymmetry without invoking ordering.

---

## Repro construction (code-level)

A minimal repro path was identified but NOT executed (read-only investigation per Task 1 scope). The shape would be:

```ts
// Multi-line legacy fence inside `## Code` section.
const NOTE_WITH_LEGACY = [
  '---', 'lc-slug: two-sum', 'lc-language: python3', '---',
  '', '## Code', '',
  '```java',                      // legacy langSlug fence opener
  'class Solution {',
  '    public int[] twoSum() { return new int[0]; }',
  '}',
  '```',
  '',
].join('\n');

// EditorState + leetCodeFenceViewPlugin extension; settings configured so
// useInlineWidget=ON + autoMigrateOnOpen=ON triggers the legacy-kind branch.
// EditorView.create({ state, parent: containerEl }) — invocation throws
// RangeError 'Decorations that replace line breaks may not be specified via plugins'.
```

This is the construct shape the user observed in UAT Test 4b. Task 2 will encode this exact repro as the RED test for the StateField migration.

---

## Conclusion

**The LeetCodeFenceWidget construct IS structurally susceptible to the same CM6 line-break-Decoration.replace + ViewPlugin contract violation as the legacy AutoMigratingBannerWidget.** The v1.3 widget escapes the RangeError in production purely because Obsidian's `registerMarkdownCodeBlockProcessor('leetcode-solve', …)` registration pre-folds the fence body before CM6 evaluates the decoration's line-break-span condition. The legacy fence (` ```java `, ` ```python `, …) has no such registered processor and thus presents the unfolded multi-line range to CM6, which then enforces the contract.

While the v1.3 path "works" empirically, it is **latently fragile**: any future change that delays or disables the `registerMarkdownCodeBlockProcessor` pre-fold (Obsidian internal refactor, Live Preview rendering pipeline change, a user disabling source-mode rendering for the fence tag) would re-expose the v1.3 path to the same RangeError. Migrating BOTH paths into StateField extensions hardens the entire widget mount surface against this whole class of CM6 contract violations, not just the v1.2 banner case.

---

## Scope decision

Scope decision: Task 2 fixes BOTH the legacy banner AND the v1.3 widget. (Both paths host two separate StateFields, marker on legacy only.)

**Scope decision: Task 2 fixes BOTH the legacy banner AND the v1.3 widget.**

Task 2 will:
1. Author `src/widget/liveModeBannerStateField.ts` exporting **two separate StateFields**:
   - `legacyBannerStateField` (v1.2 scaffolding) tagged with the `PHASE_22_DELETE_WITH_V1_2_PATH` marker comment immediately above its export — Phase 22 deletes this StateField, its build helper, and its entry in the combined Extension array.
   - `leetCodeWidgetStateField` (permanent v1.3 path) — NO marker.
2. Modify `src/widget/liveModeViewPlugin.ts` so the ViewPlugin retains ONLY the parent→child sync push (`pushParentToChild`, lines 296–371) and the legacy-kind fire-and-forget migration trigger (lines 184–205). The `decorations` field is removed (or reduced to a no-op returning `Decoration.none`); both StateFields contribute decorations + atomicRanges via their `provide` hooks.
3. Combined Extension shape:
   ```ts
   export function leetCodeFenceViewPlugin(plugin: PluginHost): Extension {
     return [legacyBannerStateField(plugin), leetCodeWidgetStateField(plugin), ViewPlugin.define(...)];
   }
   ```
4. The two StateFields are **mutually exclusive per fence** (a single fence is either `kind === 'legacy'` or `kind === 'leetcode-solve'`, never both), so their RangeSets cannot overlap. CM6 unions both contributions into `EditorView.decorations` and `EditorView.atomicRanges` Facets.

**Rationale:**
- The asymmetry in production behavior is empirical, not contract-compliant. CM6's documented rule applies equally to both paths; only the Obsidian pre-fold quirk of `registerMarkdownCodeBlockProcessor` masks the v1.3 violation.
- The fix is structurally simple: extract the same per-fence range-build into a closure and host it in a StateField (`StateField.define<DecorationSet>`) whose `provide` hook contributes both decorations AND atomicRanges. Same primitive for both paths — write once, instantiate twice.
- The Phase 22 retirement marker contract requires the SEPARATION (two StateFields, marker on legacy only). Plan 21-11's plan body lines 158–208 dictate this exact split shape.
- Defense-in-depth: even without the production RangeError today, the v1.3 path is one Obsidian internal change away from re-exposing it. Hardening now costs ~30 LOC and avoids a future fire drill.

References:
- CM6 documentation: line-break-spanning `Decoration.replace` provided via `EditorView.decorations.from(stateField)` is permitted; provided via a `ViewPlugin`'s `decorations` field is forbidden.
- Obsidian source: `registerMarkdownCodeBlockProcessor` is documented in `obsidian.d.ts`; the pre-fold behavior is empirically observed (UAT Test 4b confirms it).
- CONTEXT D-trigger-01 acknowledges that v1.3 widget mount + legacy fence mount have asymmetric Live Preview behavior.
