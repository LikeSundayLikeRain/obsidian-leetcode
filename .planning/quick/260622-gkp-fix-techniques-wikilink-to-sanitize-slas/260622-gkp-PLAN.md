---
phase: quick-260622-gkp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/graph/hubFilename.ts
  - src/graph/ClusterHubWriter.ts
  - src/graph/mergeTechniquesSection.ts
  - tests/graph/clusterHubWriter.test.ts
autonomous: true
requirements: [QUICK-260622-gkp]

must_haves:
  truths:
    - "mergeTechniquesSectionAI(body, 'Heap / Priority Queue') renders exactly `- [[Heap Priority Queue|Heap / Priority Queue]]` (link target = real hub file, display = canonical slash name)"
    - "A non-slash pattern still renders a plain link `- [[Two Pointers]]` (no alias when sanitize is a no-op)"
    - "Applying mergeTechniquesSectionAI twice for the slash case === applying it once (idempotent, alias-pipe trap solved)"
    - "main.ts and tests still import sanitizeHubFilename from './graph/ClusterHubWriter' unchanged (re-export preserved)"
    - "mergeTechniquesSection.ts purity contract preserved — imports only from a new zero-dependency module + NoteTemplate, no obsidian leak"
  artifacts:
    - path: "src/graph/hubFilename.ts"
      provides: "Pure zero-dependency sanitizeHubFilename (moved verbatim from ClusterHubWriter)"
      contains: "export function sanitizeHubFilename"
    - path: "src/graph/ClusterHubWriter.ts"
      provides: "Re-export of sanitizeHubFilename from ./hubFilename (keeps public named export stable)"
      contains: "export { sanitizeHubFilename } from './hubFilename'"
    - path: "src/graph/mergeTechniquesSection.ts"
      provides: "Alias-aware parseItems + sanitize-driven render rule (both AI and non-AI paths)"
      contains: "from './hubFilename'"
    - path: "tests/graph/clusterHubWriter.test.ts"
      provides: "Slash-alias render + idempotence + array-form regression tests"
      contains: "Heap Priority Queue|Heap / Priority Queue"
  key_links:
    - from: "src/graph/mergeTechniquesSection.ts"
      to: "src/graph/hubFilename.ts"
      via: "import { sanitizeHubFilename } from './hubFilename' — pure, no obsidian"
      pattern: "from './hubFilename'"
    - from: "src/graph/ClusterHubWriter.ts"
      to: "src/graph/hubFilename.ts"
      via: "import + re-export so main.ts / tests keep importing from ClusterHubWriter"
      pattern: "from './hubFilename'"
---

<objective>
Fix the dangling `## Techniques` wikilink for slash/reserved-char pattern names. `mergeTechniquesSectionAI` currently renders `- [[Heap / Priority Queue]]`, whose Obsidian target resolves to folder "Heap "/note "Priority Queue" — NOT the real hub file `Heap Priority Queue.md` created by the `sanitizeHubFilename` write-path. This is the markdown-wikilink twin of the `getPatternHubPath` read-path seam fixed in quick task 260621-154.

The fix renders an aliased wikilink (`[[<sanitized>|<display>]]`) ONLY when sanitization changes the name, so normal patterns keep their plain `[[Two Pointers]]` form. The hard part is idempotence: `LINK_RE` captures the entire `target|alias` inner text, so a naive render breaks dedup on the next merge pass. We make `parseItems` alias-aware (store the display name as identity) so parse→render→parse→render is a fixed point.

Purpose: stop re-breaking the Techniques link on every Heap re-solve (PatternClusterEngine.onAccepted re-runs mergeTechniquesSectionAI on every accept).
Output: a new pure `hubFilename.ts` module, a re-export shim in ClusterHubWriter, alias-aware merge logic, and regression tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@src/graph/mergeTechniquesSection.ts
@src/graph/ClusterHubWriter.ts
@tests/graph/clusterHubWriter.test.ts

# Read-path twin already shipped (do NOT modify): main.ts getPatternHubPath at line 3503
# uses sanitizeHubFilename(normalizePatternName(p)). PatternClusterEngine.onAccepted
# (lines ~160 re-accept + ~238 first-classification) calls mergeTechniquesSectionAI on
# every accept — do NOT modify PatternClusterEngine.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract sanitizeHubFilename into a pure module + re-export from ClusterHubWriter</name>
  <files>src/graph/hubFilename.ts (new), src/graph/ClusterHubWriter.ts</files>
  <action>
    Create NEW file src/graph/hubFilename.ts as a pure, zero-dependency module (imports nothing — this is what keeps mergeTechniquesSection's purity contract intact when it later imports from here).

    Move the `sanitizeHubFilename` function VERBATIM from ClusterHubWriter.ts (currently lines 210-232: the full doc-comment block AND the function body). Behavior MUST stay byte-identical: same two `.replace()` calls, same regex `/[/\\:*?"<>|\x00-\x1F]/g`, same `\s+` collapse, same `.trim()`. CRITICAL: the `// eslint-disable-next-line no-control-regex -- ...` directive MUST sit on the line IMMEDIATELY ABOVE the `.replace(/[/\\:*?"<>|\x00-\x1F]/g, ' ')` regex line (the control-char regex line) — exactly as it is now in ClusterHubWriter. A misplaced directive failed CI on the last push. Add a one-line file header comment noting this is the pure home of the function, extracted so the pure mergeTechniquesSection module can consume it without an obsidian dependency.

    In ClusterHubWriter.ts: DELETE the now-moved `export function sanitizeHubFilename` block (the doc-comment + body, lines ~210-232). Replace it with a re-export near the top of the module's helper section (or with the other re-exports): `export { sanitizeHubFilename } from './hubFilename';`. Add an import so the in-file call sites (ensureHub line ~86, appendEntry line ~117, reconcile line ~174) still resolve: `import { sanitizeHubFilename } from './hubFilename';`. Do NOT change those three call sites' logic. The public named export `{ ClusterHubWriter, sanitizeHubFilename }` that main.ts line 193 and the test file line 9 rely on MUST keep working unchanged — verify the re-export covers it.

    Do NOT touch src/main.ts (the re-export keeps its import valid).
  </action>
  <verify>
    <automated>node -e "const m=require('child_process').execSync('npx tsc -noEmit -skipLibCheck 2>&1 || true').toString(); process.exit(/hubFilename|sanitizeHubFilename/.test(m)?1:0)"</automated>
    grep -n "export { sanitizeHubFilename } from './hubFilename'" src/graph/ClusterHubWriter.ts ; grep -c "export function sanitizeHubFilename" src/graph/hubFilename.ts (expect 1) ; confirm ClusterHubWriter.ts no longer defines the function body (grep -c "export function sanitizeHubFilename" src/graph/ClusterHubWriter.ts expect 0)
  </verify>
  <done>hubFilename.ts exports a byte-identical sanitizeHubFilename with the eslint-disable directive correctly on the control-char regex line; ClusterHubWriter re-exports it and its three internal call sites still resolve; main.ts is untouched.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Alias-aware parseItems + sanitize-driven render rule in mergeTechniquesSection, with tests</name>
  <files>src/graph/mergeTechniquesSection.ts, tests/graph/clusterHubWriter.test.ts</files>
  <behavior>
    - mergeTechniquesSectionAI(body, 'Heap / Priority Queue') renders EXACTLY `- [[Heap Priority Queue|Heap / Priority Queue]]`.
    - mergeTechniquesSectionAI(body, 'Two Pointers') renders plain `- [[Two Pointers]]` (no pipe — sanitize is a no-op).
    - Idempotence (slash): twice === once for the 'Heap / Priority Queue' case.
    - Re-merge of a body already containing `- [[Heap Priority Queue|Heap / Priority Queue]]` does not duplicate the link and does not corrupt the alias.
    - Array form: mergeTechniquesSectionAI(body, ['Trees', 'Heap / Priority Queue']) renders Trees plain + Heap aliased; idempotent.
    - ALL existing assertions stay green (plain `[[Two Pointers]]`/`[[Sliding Window]]`/`[[Greedy]]`/`[[Binary Search]]`, mixed-bullet removal, free-item preservation, existing idempotence test).
  </behavior>
  <action>
    Import sanitizeHubFilename from the new pure module at the top of mergeTechniquesSection.ts: `import { sanitizeHubFilename } from './hubFilename';`. This is the ONLY new import; it keeps the purity contract (hubFilename imports nothing, so no obsidian leak). Do NOT import from ClusterHubWriter (that would pull in obsidian and violate the header contract at lines 7-11).

    ALIAS-AWARE PARSE (the idempotence fix). `LINK_RE` (line 45) captures the entire inner text between `[[ ]]` as group 2, INCLUDING any `|alias`. In parseItems (line ~138 where it currently does `items.push({ type: 'link', target: m[2] ?? '', bullet: m[1] ?? '-' })`): split the captured inner on the FIRST `|`. Store the CANONICAL DISPLAY name as `target` — i.e. when a pipe is present, `target` = the post-pipe portion (the display name); when absent, `target` = the whole capture. This makes Item.target the real pattern name so the existing dedup/identity comparisons (mergeTechniquesSection lines 81-95 against topicTag.name; mergeTechniquesSectionAI implicitly via render) compare apples to apples. Rationale: a rendered `[[Heap Priority Queue|Heap / Priority Queue]]` must re-parse to target `Heap / Priority Queue`, matching the pattern name `Heap / Priority Queue` so it is recognized as already-present, not foreign. (Keep the Item type's `target` field; you do not need a separate alias field on Item because the renderer re-derives the alias deterministically from target via sanitizeHubFilename.)

    CENTRALIZED RENDER RULE. In renderSection (line ~163, the `parts.push(\`${item.bullet} [[${item.target}]]\`)` branch): compute `const fn = sanitizeHubFilename(item.target);`. Emit `${item.bullet} [[${item.target}]]` when `fn === item.target` (plain — preserves every existing assertion). Emit `${item.bullet} [[${fn}|${item.target}]]` when `fn !== item.target` (aliased — link target is the real sanitized file, display keeps the canonical name). Centralizing here means BOTH entry points (mergeTechniquesSection non-AI lc-tag path AND mergeTechniquesSectionAI) get the fix; do NOT special-case only the AI path.

    Confirm the round-trip invariant by reasoning through it: render produces `[[fn|display]]` → parse splits on `|` → target = display → render computes fn again from display → `[[fn|display]]`. Fixed point. For plain links: render `[[display]]` (fn===display) → parse target = display → render `[[display]]`. Fixed point. Both `mergeTechniquesSection` and `mergeTechniquesSectionAI` must satisfy parse→render→parse→render === render.

    TESTS — append to tests/graph/clusterHubWriter.test.ts inside the existing `describe('mergeTechniquesSectionAI (D-09 full replacement)', ...)` block (do NOT modify any existing test):
    - 'renders a slash pattern as an aliased wikilink to the sanitized hub file': body with a `## Techniques` section, call with 'Heap / Priority Queue', assert result toContain the EXACT string `- [[Heap Priority Queue|Heap / Priority Queue]]`.
    - 'renders a non-slash pattern as a plain wikilink (no alias)': call with 'Two Pointers', assert toContain `- [[Two Pointers]]` and NOT toContain `Two Pointers|`.
    - 'is idempotent for a slash pattern (alias-pipe trap)': once = AI(body,'Heap / Priority Queue'); twice = AI(once,'Heap / Priority Queue'); expect(twice).toBe(once).
    - 'does not duplicate or corrupt an already-aliased link on re-merge': seed body whose Techniques already contains `- [[Heap Priority Queue|Heap / Priority Queue]]`, re-merge with 'Heap / Priority Queue', assert exactly one occurrence (use a regex match count) and the alias intact.
    - 'array form renders plain + aliased and is idempotent': AI(body, ['Trees', 'Heap / Priority Queue']) toContain `- [[Trees]]` and `- [[Heap Priority Queue|Heap / Priority Queue]]`; applying twice === once.

    Comment-text discipline: none of the new assertions negative-grep on a literal that you must also write into source — but DO NOT add a code comment in mergeTechniquesSection.ts containing the literal `Two Pointers|` (a test negative-greps `NOT toContain 'Two Pointers|'` only against rendered output, never the source file, so this is safe; just keep that literal out of source comments to avoid confusion).
  </action>
  <verify>
    <automated>npx vitest run tests/graph/clusterHubWriter.test.ts --no-file-parallelism</automated>
    All existing + 5 new assertions pass.
  </verify>
  <done>Slash patterns render aliased, non-slash render plain, both AI and non-AI paths idempotent and round-trip-stable, every pre-existing clusterHubWriter assertion still green.</done>
</task>

<task type="auto">
  <name>Task 3: Full local CI gate (lint + build + graph suites)</name>
  <files>(verification only — no source edits)</files>
  <action>
    Run the FULL local CI gate that the last push skipped (it ran only tsc + scoped tests and failed CI on lint). Run all three, in order, and fix any failure before declaring done. Do NOT push — the orchestrator handles push + CI watch.

    1. `npm run lint` — must report 0 ERRORS. The no-control-regex eslint-disable directive must be correctly placed on the control-char regex line in hubFilename.ts (the #1 prior CI failure cause). One pre-existing unrelated WARNING in tests/widget/parentToChildCursorPreservation.test.ts is acceptable — warnings do not fail the gate.
    2. `npm run build` — `tsc -noEmit -skipLibCheck && esbuild`, 0 type errors. Confirms the module extraction + re-export + new import all type-check and the bundle builds.
    3. `npx vitest run tests/graph/ --no-file-parallelism` — all graph suites green (full `npm test` is known-flaky under parallelism per MEMORY; the graph subset under --no-file-parallelism is the trustworthy local signal).
    4. `git diff --stat` — confirm ONLY these files changed: src/graph/hubFilename.ts (new), src/graph/ClusterHubWriter.ts, src/graph/mergeTechniquesSection.ts, tests/graph/clusterHubWriter.test.ts. If src/main.ts, PatternClusterEngine.ts, patternTaxonomy.ts, buildKgPrompt.ts, or any vault file appears in the diff, revert that churn.
  </action>
  <verify>
    <automated>npm run lint 2>&1 | grep -E '[0-9]+ error' ; npm run build && npx vitest run tests/graph/ --no-file-parallelism</automated>
    lint reports 0 errors; build exits 0; graph suites pass.
  </verify>
  <done>npm run lint = 0 errors, npm run build exits 0, all tests/graph/ suites green under --no-file-parallelism, git diff --stat shows only the 4 intended files. Executor has NOT pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AI classification → vault note body | AI-produced pattern names flow into rendered wikilinks written to the user's vault via vault.process |
| pattern name → filesystem path | slash / reserved chars in a pattern name could break the hub-file path (the original bug) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gkp-01 | Tampering | wikilink render with a slash pattern name | mitigate | Aliased `[[<sanitizeHubFilename(name)>|<name>]]` so the link resolves to the real (already-sanitized) hub file instead of an orphan folder/note pair |
| T-gkp-02 | Denial of Service | non-idempotent re-merge on every accept | mitigate | Alias-aware parseItems stores the display name as identity → parse→render fixed point; idempotence test proves no link duplication on re-solve |
| T-gkp-03 | Tampering | purity-contract violation pulling obsidian into the pure module | mitigate | Extract sanitizeHubFilename into a zero-dependency module; mergeTechniquesSection imports only from it + NoteTemplate (no obsidian) |
| T-gkp-SC | Tampering | npm/pip/cargo installs | mitigate | No new packages installed in this plan — nothing to verify |
</threat_model>

<verification>
- `npm run lint` → 0 errors (eslint-disable no-control-regex correctly placed on the control-char regex line; pre-existing unrelated warning acceptable).
- `npm run build` → tsc -noEmit -skipLibCheck && esbuild, 0 type errors.
- `npx vitest run tests/graph/ --no-file-parallelism` → graph suites green.
- `git diff --stat` → only src/graph/hubFilename.ts, src/graph/ClusterHubWriter.ts, src/graph/mergeTechniquesSection.ts, tests/graph/clusterHubWriter.test.ts.
- Executor runs lint + build + graph tests locally BEFORE declaring done. Does NOT push.
</verification>

<success_criteria>
- mergeTechniquesSectionAI(body, 'Heap / Priority Queue') renders EXACTLY `- [[Heap Priority Queue|Heap / Priority Queue]]`.
- Non-slash patterns still render plain `- [[Two Pointers]]` — every pre-existing assertion green.
- Slash case is idempotent (twice === once) — alias-pipe trap solved in parseItems.
- main.ts + test imports of sanitizeHubFilename from ClusterHubWriter keep working via re-export.
- mergeTechniquesSection.ts purity contract intact (no obsidian import).
- Full local CI gate passes; only the 4 intended files changed.
</success_criteria>

<output>
Create `.planning/quick/260622-gkp-fix-techniques-wikilink-to-sanitize-slas/260622-gkp-SUMMARY.md` when done
</output>
