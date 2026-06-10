---
slug: language-switch-body-not-swapped
status: resolved-failure-a
trigger: "found a regression with language change, after the i change the language, the cheveron and lc-language changed, but the code block remain the same."
created: 2026-06-10
updated: 2026-06-10
---

# Debug: Language switch — chevron + lc-language update but fence body stays the same

## Symptom

User reports: *"found a regression with language change, after the i change the language, the cheveron and lc-language changed, but the code block remain the same."*

User clicks chevron → picks new language → observable changes:
- Chevron label updates to new language ✅
- `lc-language` frontmatter updates to new slug ✅
- Code block content (the text inside the fence) remains unchanged ❌
- Code block syntax highlighting stays on the OLD language ❌

User flags this as a regression.

## Symptoms (gathered + user-confirmed 2026-06-10)

- **Expected behavior:** After switching language via chevron, the fence body should swap to new language's starter snippet AND highlighting should follow.
- **Actual behavior:** Chevron label and `lc-language` frontmatter update, but the fence body text is byte-for-byte identical AND the syntax highlighting stays on the OLD language until the user types in the editor.
- **Error messages:** None reported.
- **Reproduction:** Open a LeetCode-solve note, click the chevron, select a different language. Observe: chevron + frontmatter update; code block body and highlighting do not.

## Two failures identified

- **Failure A (genuine regression — RESOLVED):** The `obsidianSemanticClasses` ViewPlugin in `src/main/childEditorSemanticClasses.ts` only recomputed its `cm-keyword`/`cm-type`/`cm-string`/etc. decorations when `update.docChanged || update.viewportChanged || update.geometryChanged`. The `effects`-only dispatch from `languageCompartment.reconfigure(...)` at `src/widget/WidgetController.ts:1897-1901` triggers NONE of those flags, so the semantic-class layer kept using the OLD-language tokens until the user typed. Since the visible color of every token comes from these classes (cascading through Obsidian's `.HyperMD-codeblock .cm-keyword { color: ... }` rules), the user saw the highlighting "frozen" at the old language.

- **Failure B (UX/design gap — separate decision, NOT YET FIXED):** `switchLanguageFromWidget` (`src/main.ts:3306-3331`) deliberately writes only `lc-language` frontmatter and never replaces the fence body with the new language's starter snippet. v1.2 had the body swap; v1.3 dropped it deliberately per the JSDoc. The user expects v1.2 behavior. This is a product decision separate from the parser-reconfigure regression.

## Root cause (Failure A — verified by code inspection + reproduced via test)

File: `src/main/childEditorSemanticClasses.ts:51-55` (pre-fix)

```typescript
update(update: ViewUpdate): void {
  if (update.docChanged || update.viewportChanged || update.geometryChanged) {
    this.decorations = buildSemanticClassDecorations(update.view);
  }
}
```

When `view.dispatch({ effects: languageCompartment.reconfigure(...) })` fires:
- `update.docChanged === false` (no document edit)
- `update.viewportChanged === false` (no scroll/resize)
- `update.geometryChanged === false` (no layout recompute)
- The new parser IS installed (verified by tests/widget/languageReactivity.test.ts)
- The syntax tree IS rebuilt under the hood, but the ViewPlugin doesn't re-walk it — the cached `this.decorations` retains the OLD language's class assignments

The CM6-idiomatic detection: `update.startState.facet(language) !== update.state.facet(language)` (the `language` facet is exported from `@codemirror/language`).

## Fix applied (Failure A)

File: `src/main/childEditorSemanticClasses.ts`

1. Added `language` to the `@codemirror/language` import.
2. Extended the `update()` predicate:

```typescript
update(update: ViewUpdate): void {
  const langChanged =
    update.startState.facet(language) !== update.state.facet(language);
  if (
    update.docChanged ||
    update.viewportChanged ||
    update.geometryChanged ||
    langChanged
  ) {
    this.decorations = buildSemanticClassDecorations(update.view);
  }
}
```

3. Added regression test: `tests/main/childEditorSemanticClasses.languageReactivity.test.ts`
   - Mounts a real CM6 EditorView with `obsidianSemanticClasses` and a Compartment-of-Python language pack.
   - Asserts `cm-keyword` decorations exist for `def foo():` under Python.
   - Dispatches `compartment.reconfigure(java())` — effects-only, no docChange.
   - Asserts the keyword count changes (Python → Java tokens reclassify).
   - Verified the test FAILS without the fix and PASSES with the fix.

## Fix plan (Failure B — pending user decision)

Two options for surfacing back to the user:
- **B1 — Restore v1.2 starter-swap behavior.** Modify `switchLanguageFromWidget` (`src/main.ts:3306-3331`) to (a) fetch the problem detail, (b) extract the new language's starter snippet, (c) replace the fence body atomically alongside the FM rewrite using `applyAuthoritativeBody` so SelfWriteSuppression handles the echo. This restores the v1.2 contract.
- **B2 — Keep current v1.3 behavior; document it.** Add a Notice / settings-page note that switching language preserves user code; user must use Reset to get a fresh starter.

Recommendation: **B1** restores the v1.2 contract the user expects. Implementation requires careful coordination with `selfWriteSuppression` and `applyAuthoritativeBody`. Defer to a follow-up plan/phase.

## Files involved

- `src/main/childEditorSemanticClasses.ts` (Failure A — FIXED here)
- `tests/main/childEditorSemanticClasses.languageReactivity.test.ts` (Failure A — new regression test)
- `src/widget/WidgetController.ts:1858-1923` (listener — already correct; not modified)
- `src/widget/WidgetController.ts:1357-1359` (mount-time extension order — already correct)
- `src/main.ts:3306-3331` (Failure B — modify only if user picks B1)

## Evidence

- ✅ Chevron label updates → `actionRowRefresh` closure runs → metadataCache 'changed' listener IS firing.
- ✅ `lc-language` frontmatter updates → `processFrontMatter` works, metadataCache observes the change.
- ✅ `tests/widget/languageReactivity.test.ts` confirms `view.dispatch({ effects: languageCompartment.reconfigure(...) })` IS called with the new slug.
- ✅ `languageCompartment` is a true module-singleton (`src/main/childEditorLanguage.ts:44`) imported by both mount (`WidgetController.ts:1358`) and reconfigure (`WidgetController.ts:1898`) — identity preserved.
- ✅ `buildLanguageExtensions(slug, indent)` returns a 4-element extension array including the new parser (`childEditorLanguage.ts:132-148`) — verified correct.
- ✅ `WidgetController` survives FM-driven post-processor re-renders via the registry adoption path — same `EditorView` instance receives the dispatch.
- ✅ Regression test fails without fix (`expected 2 not to be 2`) and passes with fix.
- ✅ Full test suite: 2925 passed, 8 skipped, 0 failed across 252 test files.

## Eliminated hypotheses

- Compartment-identity drift — module-singleton confirmed.
- Stale `EditorView` reference in listener — registry adoption preserves the same view.
- Listener never firing — chevron-refresh proves it does fire.
- `buildLanguageExtensions` returning wrong extensions — verified pure & correct.
- Bare `catch {}` swallowing dispatch error — would also break chevron path; chevron works.
- Stale-deploy theory — both project and deployed builds wire the listener.

## Specialist review

Specialist hint: `typescript` (CodeMirror 6 / TypeScript domain). The fix is idiomatic CM6 — comparing `startState.facet(language)` to `state.facet(language)` is the canonical way to detect language-pack changes from a ViewPlugin. No further specialist review needed.

## Resolution

- **root_cause:** `obsidianSemanticClasses` ViewPlugin in `src/main/childEditorSemanticClasses.ts:51-55` did not recompute its decorations on a language-facet change, so a `Compartment.reconfigure` dispatch (effects-only, no docChange) left stale `cm-keyword`/`cm-type`/etc. classes on existing tokens until the user edited.
- **fix:** Extended the `update()` predicate to compare `update.startState.facet(language) !== update.state.facet(language)` and recompute decorations on a language-facet change. Added regression test `tests/main/childEditorSemanticClasses.languageReactivity.test.ts`. Verified test fails without fix and passes with fix; full suite (2925 tests) green.
- **failure_b_status:** Body-not-swapped (v1.2 starter-swap behavior) is a separate UX/design decision deferred to user. Two options surfaced (B1 restore v1.2, B2 keep v1.3). No code change yet.
