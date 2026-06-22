---
phase: quick-260622-gkp
plan: 01
subsystem: graph
status: complete
tags: [knowledge-graph, wikilinks, sanitize, idempotence, refactor, tdd]
requires:
  - src/graph/patternTaxonomy.ts (normalizePatternName)
  - src/notes/NoteTemplate.ts (heading SSoT constants)
provides:
  - src/graph/hubFilename.ts (pure sanitizeHubFilename)
  - Alias-aware ## Techniques wikilink render (slash patterns -> [[fn|display]])
affects:
  - src/graph/ClusterHubWriter.ts (re-export)
  - src/graph/mergeTechniquesSection.ts (parse + render)
tech-stack:
  added: []
  patterns:
    - "Pure zero-dependency module extraction to preserve a purity contract across a module boundary"
    - "Alias-aware parse (store display name as identity) -> render fixed point"
key-files:
  created:
    - src/graph/hubFilename.ts
  modified:
    - src/graph/ClusterHubWriter.ts
    - src/graph/mergeTechniquesSection.ts
    - tests/graph/clusterHubWriter.test.ts
decisions:
  - "Extract sanitizeHubFilename into a zero-dependency module so the pure mergeTechniquesSection can consume it without an obsidian leak; ClusterHubWriter re-exports it to keep main.ts + test imports unchanged"
  - "Centralize the sanitize-driven render rule in renderSection so BOTH mergeTechniquesSection (non-AI) and mergeTechniquesSectionAI emit filesystem-correct links"
  - "Make parseItems alias-aware (store post-pipe display name as Item.target) to achieve parse->render idempotence for aliased links"
metrics:
  duration: ~12 min
  completed: 2026-06-22
  tasks: 3
  files: 4
---

# Phase quick-260622-gkp Plan 01: Fix Techniques wikilink to sanitize slash patterns — Summary

Aliased `## Techniques` wikilinks (`[[Heap Priority Queue|Heap / Priority Queue]]`) now point at the real sanitized hub file for slash/reserved-char pattern names, while plain patterns keep their `[[Two Pointers]]` form — and re-merging on every re-solve is idempotent because `parseItems` is alias-aware.

## What Was Built

- **`src/graph/hubFilename.ts` (new, pure, zero imports):** `sanitizeHubFilename` moved verbatim from ClusterHubWriter — same two `.replace()` calls, same `/[/\\:*?"<>|\x00-\x1F]/g` regex, same `\s+` collapse + `.trim()`, with the `// eslint-disable-next-line no-control-regex` directive on the control-char regex line. This zero-dependency module is what lets the pure `mergeTechniquesSection` consume it without an obsidian leak.
- **`src/graph/ClusterHubWriter.ts`:** deleted the moved function body; added `import { sanitizeHubFilename } from './hubFilename'` (its three internal call sites unchanged) and `export { sanitizeHubFilename } from './hubFilename'` so `main.ts` line 193 and the test file line 9 import unchanged. `src/main.ts` untouched.
- **`src/graph/mergeTechniquesSection.ts`:**
  - `parseItems` now splits the captured `[[inner]]` on the first `|` and stores the **display** name as `Item.target` (canonical identity for dedup).
  - `renderSection` link branch computes `fn = sanitizeHubFilename(item.target)` and emits `[[display]]` when `fn === display`, else `[[fn|display]]`. Centralized — both AI and non-AI paths get it.
- **`tests/graph/clusterHubWriter.test.ts`:** 5 new tests inside the existing `mergeTechniquesSectionAI` block (aliased slash render, plain non-slash, slash idempotence, no-dup re-merge, array-form plain+aliased idempotence). All pre-existing assertions untouched.

## Round-trip invariant

`render -> [[fn|display]] -> parse (split on '|') -> target=display -> render (recompute fn) -> [[fn|display]]`. Fixed point for both aliased and plain links. Proven by the slash + array idempotence tests (twice === once).

## Deviations from Plan

None — plan executed exactly as written. The `eslint-disable` directive placement (the prior CI failure cause) was preserved correctly during the verbatim move and confirmed by `npm run lint` reporting 0 errors.

## Verification Evidence

**`git diff --stat HEAD~2 HEAD`:**
```
 src/graph/ClusterHubWriter.ts        | 30 +++++----------------
 src/graph/hubFilename.ts             | 31 +++++++++++++++++++++
 src/graph/mergeTechniquesSection.ts  | 26 ++++++++++++++++--
 tests/graph/clusterHubWriter.test.ts | 52 ++++++++++++++++++++++++++++++++++++
 4 files changed, 113 insertions(+), 26 deletions(-)
```
`src/main.ts`, `PatternClusterEngine.ts`, `patternTaxonomy.ts`, `buildKgPrompt.ts`, vault files — NOT in diff.

- **`npm run lint`** → `0 errors, 1 warning` (the pre-existing unrelated `ViewPlugin` unused-var warning in `tests/widget/parentToChildCursorPreservation.test.ts` — warnings do not fail the gate).
- **`npm run build`** → `tsc -noEmit -skipLibCheck && esbuild`, exit 0, 0 type errors.
- **`npx vitest run tests/graph/clusterHubWriter.test.ts --no-file-parallelism`** → 22 passed (17 pre-existing + 5 new).
- **`npx vitest run tests/graph/ --no-file-parallelism`** → 26 files / 208 tests passed.

## Commits

- `ecbcd5b` refactor(quick-260622-gkp): extract sanitizeHubFilename into pure hubFilename module
- `d459157` fix(quick-260622-gkp): render slash patterns as aliased Techniques wikilinks

Executor has NOT pushed — orchestrator handles push + CI watch and the docs commit.

## Self-Check: PASSED

- FOUND: src/graph/hubFilename.ts
- FOUND: commit ecbcd5b
- FOUND: commit d459157
- main.ts NOT in diff (re-export preserved its import)
