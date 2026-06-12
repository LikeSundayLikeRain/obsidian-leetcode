# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## r6-fresh-problem-widget-regression — fresh problem first open shows static fallback instead of widget
- **Date:** 2026-06-02
- **Error patterns:** renderStaticFallback, addChild, repairFrontmatterIfNeeded, repaired, widget mount, first open, codeBlockProcessor, metadataCache race, lc-language, attempt-once Set
- **Root cause:** `if (repaired)` branch in codeBlockProcessor.ts used a bounded metadataCache poll then fell through to addChild. With the attempt-once Set guard (1a8a140), the first invocation was the only one reaching the repair block. When repairFrontmatterIfNeeded returned true (metadataCache race: lc-language not yet indexed), the fall-through addChild raced stale cache and widget mount was silently lost.
- **Fix:** Changed `if (repaired)` to mirror `if (migrated)` exactly: call rerenderReadingModePanes + renderStaticFallback + return. Second invocation triggered by rerender hits Set.has=true, short-circuits migrate/repair, falls through to addChild with fresh metadataCache.
- **Files changed:** src/widget/codeBlockProcessor.ts, tests/widget/codeBlockProcessor.r6Regression.test.ts
---

