# Phase 11: AI Knowledge Graph - Research

**Researched:** 2026-05-18
**Domain:** AI-powered pattern classification, vault graph topology, Obsidian plugin vault writes
**Confidence:** HIGH

## Summary

Phase 11 extends the existing on-AC knowledge-graph pipeline (`KnowledgeGraphWriter.onAccepted`) to replace LC's coarse-grained topic-tag wikilinks with AI-classified pattern-cluster wikilinks. The phase adds a non-streaming AI classification call (via `AIClient.invoke`) before vault writes, creates/updates hub notes at `LeetCode/Patterns/{Cluster}.md`, and introduces a new locked `## Related Variants` section with cross-cluster structural twin suggestions.

The implementation builds entirely on established codebase patterns: `vault.process` for body mutations, `processFrontMatter` for metadata, `AIClient.invoke` for non-streaming AI calls, disclosure composition via `withKgBullet`, and shape-guarded PluginData extension for the `featureFlags.lookAheadEdges` toggle. No new external packages are needed — this is a pure feature-layer addition on the existing AI + graph infrastructure.

**Primary recommendation:** Structure as a pipeline extension of `KnowledgeGraphWriter` that intercepts after step 1 (frontmatter) and replaces steps 2-3 (Techniques body + stubs) with AI-classified pattern writes + hub note management. The classification prompt should be a single non-streaming `AIClient.invoke` call returning structured JSON (pattern name + variants + optional look-ahead), parsed and validated before any vault write.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Inline blocking classification on AC (before vault writes, synchronous in AC flow)
- **D-02:** 22 seed patterns are NOT a ceiling; AI can create new pattern names; new patterns auto-create hub notes
- **D-03:** Prompt input = problem statement + user's code (no LC topic tags in prompt)
- **D-04:** Classification persisted in BOTH frontmatter (`lc-pattern`) + wikilink (`## Techniques`)
- **D-05:** Hub note uses difficulty-grouped tables (`### Easy`, `### Medium`, `### Hard`)
- **D-06:** Hub path: `LeetCode/Patterns/{Cluster}.md`
- **D-07:** Three-mechanism hub update: incremental append on AC, background full reconcile after AC, 1-hour timer, manual palette command
- **D-08:** Reconcile = scan all notes with `lc-pattern` frontmatter, rebuild hub
- **D-09:** Full replacement of `## Techniques` on AC (clean break from v1.0 lc-tag wikilinks)
- **D-10:** Lazy-on-AC only (never batch on plugin load)
- **D-11:** User-added lines preserved (same "free items" contract as v1.0's `mergeTechniquesSection`)
- **D-12:** AI suggests variants from full LC corpus, validated against local problem index, unknowns dropped
- **D-13:** `## Related Variants` format = wikilink list with brief reason, capped at 2
- **D-14:** Cross-cluster only (same-cluster suppressed)
- **D-15:** `## Related Variants` heading locked under `LOCKED_HEADINGS`
- **D-16:** Look-ahead edges flag-gated (`featureFlags.lookAheadEdges`, default OFF)

### Claude's Discretion
- AI call structure (single combined call vs separate calls vs piggybacking on AI Review)
- Prompt wording for the 22-seed taxonomy + "create new if none fits"
- `maxTokens` for classification call
- Module layout (`PatternClusterEngine`, `ClusterHubWriter`, `RelatedVariantsWriter` — separate or colocated)
- Reconcile implementation structure
- Look-ahead edges interaction with Related Variants in note layout
- `## Techniques` vs `## Related Variants` ordering

### Deferred Ideas (OUT OF SCOPE)
- AIKG-FUT-01 (batch migration UI)
- AIKG-FUT-02 (manual cluster override)
- AIKG-FUT-03 (cluster-color graph view)
- AIPROV-FUT-02 (per-feature AI provider routing)
- Taxonomy admin UI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIKG-01 | On AC, AI classifies into one of 22 canonical patterns; user prompted on OTHER | AI classification prompt pattern, `AIClient.invoke` non-streaming, structured JSON response parsing |
| AIKG-02 | Hub note at `LeetCode/Patterns/{Cluster}.md` listing all member problems | Hub note creation via `vault.create`, hub update via `vault.process`, difficulty-grouped table rendering |
| AIKG-03 | `## Techniques` upgraded from lc-tag wikilinks to AI pattern-cluster wikilinks (lazy-on-AC) | `mergeTechniquesSection` replacement logic, "free items" preservation pattern |
| AIKG-04 | Difficulty-progression edges on each cluster hub note | Hub note reconcile scan via `metadataCache`, difficulty-sorted table rendering |
| AIKG-05 | `## Related Variants` section (cross-cluster, capped at 2) | New section merge transform (mirrors `mergeAIReviewSection`), `LOCKED_HEADINGS` extension |
| AIKG-06 | Look-ahead wikilinks gated by `featureFlags.lookAheadEdges`, validated against index | PluginData shape extension, problem index validation, graceful drop of unknown slugs |
| AIKG-07 | All writes via `vault.process` (body) + `processFrontMatter` (frontmatter); `## Related Variants` locked | Established project convention (CF-06), `LOCKED_HEADINGS` tuple extension |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pattern classification (AI call) | API / Backend (AI Provider) | Frontend Server (Plugin) | AI provider does inference; plugin assembles prompt + parses response |
| Hub note management | Frontend Server (Plugin) | Database / Storage (Vault) | Plugin builds content; vault persists markdown files |
| `## Techniques` migration | Frontend Server (Plugin) | Database / Storage (Vault) | Pure string transform applied via `vault.process` |
| `## Related Variants` section | Frontend Server (Plugin) | Database / Storage (Vault) | Plugin renders section; vault persists |
| Frontmatter (`lc-pattern`) | Frontend Server (Plugin) | Database / Storage (Vault) | Plugin writes via `processFrontMatter` |
| Reconcile scan | Frontend Server (Plugin) | Database / Storage (Vault) | Plugin queries `metadataCache` for frontmatter scan |
| Feature flag gate | Frontend Server (Plugin) | -- | PluginData boolean, checked before look-ahead emission |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` | 1.12.3 | `vault.process`, `processFrontMatter`, `metadataCache`, `vault.create` | Required plugin API for all vault mutations |
| `AIClient` (internal) | n/a | Non-streaming `invoke(req)` for classification | Established Phase 07 seam; disclosure gate fires automatically |
| `vitest` | 4.1.5 | Unit tests for pure transforms + integration tests | Project-standard test framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `turndown` | 7.2.4 | HTML-to-Markdown for problem statement in prompt | Converting cached `contentHtml` to markdown for AI prompt input |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single combined AI call (pattern + variants + look-ahead) | Separate AI calls per concern | Combined is cheaper (1 API call vs 2-3), faster, and context stays unified |
| Non-streaming `AIClient.invoke` | Streaming `invokeStream` | Classification response is small (~200 tokens); streaming adds complexity with no UX benefit |
| `vault.process` for hub notes | `vault.modify` | `vault.modify` is FORBIDDEN by project convention (CF-06) |

**Installation:**
No new packages required. All capabilities come from existing project dependencies + Obsidian API.

## Package Legitimacy Audit

> No new external packages are recommended for Phase 11. All functionality builds on existing project dependencies (`obsidian`, `AIClient` internal module, `turndown`).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Phase 11 installs zero new packages.*

## Architecture Patterns

### System Architecture Diagram

```
                          On Accepted (AC)
                               |
                               v
              +-----------------------------------+
              |    KnowledgeGraphWriter.onAccepted |
              |    (existing pipeline orchestrator)|
              +-----------------------------------+
                   |              |              |
                   v              v              v
            Step 1:         Step 2:         Step 3:
            Frontmatter     AI Classify     Vault Writes
            (lc-pattern)    (AIClient)      (hub + note)
                   |              |              |
                   |              v              |
                   |    +------------------+    |
                   |    | buildKgPrompt()  |    |
                   |    | (pure transform) |    |
                   |    +--------+---------+    |
                   |             |              |
                   |             v              |
                   |    +------------------+    |
                   |    | AIClient.invoke  |    |
                   |    | (non-streaming)  |    |
                   |    +--------+---------+    |
                   |             |              |
                   |             v              |
                   |    +------------------+    |
                   |    | parseKgResponse  |    |
                   |    | (JSON parse +    |    |
                   |    |  validation)     |    |
                   |    +--------+---------+    |
                   |             |              |
                   v             v              v
           +------------+ +------------+ +------------------+
           |processFront| |mergeTechni-| |Hub Note          |
           |Matter      | |quesSection | |Create/Update     |
           |(lc-pattern)| |(AI cluster | |(vault.process/   |
           +------------+ | wikilink)  | | vault.create)    |
                          +------+-----+ +------------------+
                                 |
                                 v
                          +------------------+
                          |mergeRelated      |
                          |VariantsSection   |
                          |(vault.process)   |
                          +------------------+

   Background (after AC or on 1-hour timer):
              +-----------------------------------+
              |    reconcilePatternHubs()          |
              |    (scan metadataCache for all     |
              |     notes with lc-pattern FM)      |
              +-----------------------------------+
                               |
                               v
              +-----------------------------------+
              |    Rebuild each hub note from      |
              |    authoritative frontmatter scan  |
              +-----------------------------------+
```

### Recommended Project Structure
```
src/
├── graph/
│   ├── KnowledgeGraphWriter.ts        # Extended: AI classification integration point
│   ├── mergeTechniquesSection.ts       # REPLACED logic: AI cluster wikilink instead of lc-tags
│   ├── mergeRelatedVariantsSection.ts  # NEW: pure transform for ## Related Variants
│   ├── PatternClusterEngine.ts         # NEW: classification orchestration + response parsing
│   ├── ClusterHubWriter.ts             # NEW: hub note create/update/reconcile
│   ├── buildKgPrompt.ts                # NEW: pure prompt assembly for classification
│   ├── parseKgResponse.ts              # NEW: JSON response parser + validator
│   ├── patternTaxonomy.ts              # NEW: 22 seed patterns constant + name normalization
│   ├── StubNoteCreator.ts              # Existing (used for hub folder creation)
│   └── ...existing files...
├── ai/
│   ├── disclosure.ts                   # Extended: add withKgBullet factory
│   └── ...existing files...
├── notes/
│   ├── NoteTemplate.ts                 # Extended: LOCKED_HEADINGS + RELATED_VARIANTS_HEADING_LINE
│   └── ...existing files...
├── settings/
│   ├── SettingsStore.ts                # Extended: featureFlags.lookAheadEdges + PluginData shape
│   └── ...existing files...
└── main.ts                             # Extended: reconcile command + interval + KG pipeline wiring
```

### Pattern 1: Non-Streaming AI Classification Call
**What:** Use `AIClient.invoke` (not `invokeStream`) for the pattern classification since the response is small and structured.
**When to use:** Phase 11's classification response is ~100-200 tokens of structured JSON. No UX benefit from streaming.
**Example:**
```typescript
// Source: established codebase pattern from src/ai/AIClient.ts
const response = await this.aiClient.invoke({
  prompt: buildKgPrompt({ problemMd, code, language }),
  maxTokens: 500, // Classification + 2 variants + 2 look-ahead = well under 500
  stream: false,
  // No signal needed — classification is fast and non-interactive
});
const parsed = parseKgResponse(response.text);
// parsed: { pattern: string; variants: Array<{slug, reason}>; lookAhead: Array<{slug, reason}> }
```

### Pattern 2: Hub Note Create-or-Update (Idempotent)
**What:** Create hub note on first classification into a pattern; append on subsequent classifications; full reconcile rebuilds from scratch.
**When to use:** Every AC that classifies into a pattern needs to update the corresponding hub note.
**Example:**
```typescript
// Source: mirrors src/graph/StubNoteCreator.ts create + vault.process update pattern
const hubPath = `${problemsFolder}/Patterns/${patternName}.md`;
const existing = app.vault.getAbstractFileByPath(hubPath);
if (!existing) {
  // First problem in this pattern — create hub note
  await ensureFolder(app, `${problemsFolder}/Patterns`);
  await app.vault.create(hubPath, buildHubNoteBody(patternName, [entry]));
} else {
  // Append to existing hub — vault.process is atomic + retry-safe
  await app.vault.process(existing as TFile, (body) =>
    appendToHubNote(body, entry),
  );
}
```

### Pattern 3: Techniques Section Replacement (AI Cluster Wikilinks)
**What:** Replace the v1.0 lc-tag wikilinks with a single AI cluster wikilink while preserving user-added free-text lines.
**When to use:** Step 2 of the on-AC pipeline after AI classification completes.
**Example:**
```typescript
// Source: mirrors existing mergeTechniquesSection parseItems/splice pattern
// D-09: full replacement — old lc-tag links removed, AI cluster link inserted
// D-11: "free items" (user-added non-link lines) preserved
export function mergeTechniquesSectionAI(
  body: string,
  patternName: string,
): string {
  // Parse existing section, identify link items vs free items
  // Remove ALL existing link items (they are v1.0 lc-tags or prior AI clusters)
  // Insert single AI cluster wikilink: `- [[{patternName}]]`
  // Preserve all free items below
}
```

### Pattern 4: Disclosure Copy Composition
**What:** Add a `withKgBullet` factory following the `withDebugBullet`/`withReviewBullet` precedent.
**When to use:** Before any AI classification call, the disclosure modal must include the KG-specific bullet.
**Example:**
```typescript
// Source: src/ai/disclosure.ts existing pattern
export function withKgBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] },
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI Knowledge Graph sends the problem statement and your accepted solution code for pattern classification',
    ],
    neverSends: base.neverSends,
  };
}
```

### Pattern 5: PluginData Shape Extension with Feature Flag
**What:** Add `featureFlags` object to PluginData with `lookAheadEdges: boolean` (default false).
**When to use:** Gate look-ahead edge emission at runtime.
**Example:**
```typescript
// Source: mirrors autoAIReviewOnAC pattern in src/settings/SettingsStore.ts
// In PluginData interface:
featureFlags: { lookAheadEdges: boolean };

// In DEFAULT_DATA:
featureFlags: { lookAheadEdges: false },

// Shape-guard in load:
featureFlags: {
  lookAheadEdges: typeof raw.featureFlags?.lookAheadEdges === 'boolean'
    ? raw.featureFlags.lookAheadEdges
    : DEFAULT_DATA.featureFlags.lookAheadEdges,
},
```

### Pattern 6: Background Reconcile via registerInterval
**What:** Register a 1-hour interval for hub reconciliation that auto-cleans on plugin unload.
**When to use:** D-07 mechanism 3 — periodic background reconcile.
**Example:**
```typescript
// Source: Obsidian Plugin API registerInterval pattern
// In main.ts onload():
this.registerInterval(
  window.setInterval(() => {
    void this.reconcilePatternHubs();
  }, 60 * 60 * 1000), // 1 hour
);
```

### Pattern 7: Vault Scan for Reconcile
**What:** Iterate all markdown files, read frontmatter via `metadataCache`, collect `lc-pattern` values.
**When to use:** Reconcile rebuilds hub notes from the authoritative frontmatter source of truth.
**Example:**
```typescript
// Source: Obsidian API pattern for metadata-driven file scanning
const files = this.app.vault.getMarkdownFiles();
const entries: Map<string, HubEntry[]> = new Map();
for (const file of files) {
  const cache = this.app.metadataCache.getFileCache(file);
  const pattern = cache?.frontmatter?.['lc-pattern'];
  if (typeof pattern === 'string' && pattern.length > 0) {
    const difficulty = cache?.frontmatter?.['lc-difficulty'] ?? 'Medium';
    const title = cache?.frontmatter?.['lc-title'] ?? file.basename;
    // Collect into entries map grouped by pattern
  }
}
// Rebuild each hub note from collected entries
```

### Anti-Patterns to Avoid
- **Anti-pattern: Streaming for classification.** The classification response is tiny (~100-200 tokens). Streaming adds AbortController complexity, modal UI, and debounced rendering for zero UX benefit. Use `AIClient.invoke` (buffered).
- **Anti-pattern: Bundling topic tags in the AI prompt.** D-03 explicitly forbids including LC topic tags in the classification prompt — they bias the AI toward LC's coarse categories instead of the 22-pattern taxonomy.
- **Anti-pattern: vault.modify for hub notes.** CF-06 is absolute — only `vault.process` (existing files) and `vault.create` (new files) are permitted.
- **Anti-pattern: Reconcile on plugin load.** D-10 is absolute — lazy-on-AC only for note migration. The 1-hour timer reconcile handles hub-note consistency, NOT note-by-note Techniques migration.
- **Anti-pattern: Separate AI calls for variants vs classification.** A single combined call is cheaper, faster, and gives the AI the full context. Parse one structured JSON response rather than making 2-3 separate calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI API call management | Custom HTTP client | `AIClient.invoke` | Disclosure gate, provider routing, error handling all built in |
| Disclosure copy extension | Direct mutation of base array | `withKgBullet` composition factory | Base array is `Object.freeze`'d (WR-02); mutation throws in strict mode |
| Frontmatter writes | Manual YAML string manipulation | `app.fileManager.processFrontMatter` | Atomic, handles YAML parse errors, Obsidian-idiomatic |
| Body section merging | Regex-based text replacement | Parse-items/splice pattern (established) | Preserves user content, handles edge cases, idempotent |
| File existence checks | `fs.existsSync` | `app.vault.getAbstractFileByPath` | Cross-platform, Obsidian-aware, handles vault sync |
| Folder creation | Direct mkdir | `ensureTechniquesFolder` pattern (check + try/catch) | Handles concurrent-create races (Pitfall 6) |
| HTML to Markdown | Custom regex parser | `turndown` (already in bundle) | LC HTML has tables, code blocks, nested lists; edge cases abound |
| Interval cleanup | Manual clearInterval | `this.registerInterval` | Auto-cleans on plugin unload; no leak risk |

**Key insight:** Phase 11 introduces zero new infrastructure. Every capability needed already exists in the codebase from Phases 04, 07, and 09. The work is composing existing primitives into a new pipeline path.

## Common Pitfalls

### Pitfall 1: AI Response Format Drift
**What goes wrong:** AI returns free-text instead of structured JSON, or uses different field names across calls.
**Why it happens:** LLMs don't always follow format instructions perfectly, especially with longer context.
**How to avoid:** Strict JSON schema in prompt with example. Defensive `parseKgResponse` that validates every field and falls back gracefully (e.g., empty variants array if parsing fails). Log malformed responses at debug level.
**Warning signs:** Tests pass with mocked responses but fail in production with real AI providers.

### Pitfall 2: Reconcile Performance on Large Vaults
**What goes wrong:** 1-hour reconcile scans every markdown file in the vault, causing lag spikes.
**Why it happens:** `vault.getMarkdownFiles()` returns ALL vault files, not just LeetCode notes.
**How to avoid:** Filter by path prefix (`problemsFolder`) before reading metadata. Use `metadataCache` (in-memory, fast) not file reads. Consider early-exit if no `lc-pattern` frontmatter changes since last reconcile (timestamp check).
**Warning signs:** Users with 10,000+ file vaults report periodic lag.

### Pitfall 3: Hub Note Race Conditions
**What goes wrong:** Concurrent AC submissions (rapid re-submissions) both try to create the same hub note.
**Why it happens:** Two `onAccepted` calls fire before either's `vault.create` completes.
**How to avoid:** Follow `StubNoteCreator.createStubIfMissing` pattern — check existence, try create, catch race silently. `vault.process` on existing files is atomic and handles concurrent writes via retry.
**Warning signs:** Duplicate hub note creation errors in debug logs.

### Pitfall 4: Classification Cost Surprise
**What goes wrong:** Users with many ACs accumulate unexpected AI costs from classification calls.
**Why it happens:** Classification fires on EVERY AC — unlike AI Review which is opt-in toggle.
**How to avoid:** Classification MUST be gated by the same `autoAIReviewOnAC` toggle OR a separate KG toggle. Per CONTEXT D-01 it runs on AC — but the REQUIREMENTS don't specify a separate opt-in. **Recommendation:** Gate behind `autoAIReviewOnAC` OR add a dedicated `autoAIClassificationOnAC` setting (Claude's discretion area). At minimum, cost is tracked via `addCostLedger`.
**Warning signs:** User complaints about unexpected AI spend.

### Pitfall 5: Dangling Wikilinks in Hub Notes After Problem Rename
**What goes wrong:** Hub note links to `[[Two Sum]]` but user renamed the note to `[[1. Two Sum]]`.
**Why it happens:** Reconcile reads `lc-title` or file basename; if both changed, links break.
**How to avoid:** Hub note wikilinks should use the note's actual basename (from `file.basename`) during reconcile, not a stale title. Reconcile rebuilds from scratch so stale entries are purged.
**Warning signs:** Unresolved wikilinks in hub notes after note renames.

### Pitfall 6: Pattern Name Normalization
**What goes wrong:** AI returns "Two-Pointers" one time and "Two Pointers" the next; two hub notes created.
**Why it happens:** LLM output isn't perfectly deterministic; minor formatting differences in pattern names.
**How to avoid:** Normalize pattern names before hub note operations: trim, title-case, collapse whitespace. Provide the exact 22 seed names in the prompt so the AI uses them verbatim. For novel patterns, normalize to title case with spaces.
**Warning signs:** Duplicate hub notes like `Two Pointers.md` and `Two-Pointers.md`.

### Pitfall 7: lc-isolation Test Regression
**What goes wrong:** Adding `obsidianFetch` import to `src/graph/` breaks `tests/ai/lc-isolation.test.ts`.
**Why it happens:** The LC-isolation test asserts that `src/graph/` (an LC-side directory) never imports `obsidianFetch`.
**How to avoid:** The classification call lives on `AIClient.invoke` which is in `src/ai/`. The `src/graph/` module calls `AIClient` methods but never imports `obsidianFetch` directly. Keep the boundary clean: `src/graph/PatternClusterEngine.ts` accepts an `AIClient` instance via DI, never constructs one.
**Warning signs:** `lc-isolation.test.ts` fails on import.

### Pitfall 8: Section Ordering After Multiple Writes
**What goes wrong:** `## Related Variants` ends up before `## Techniques`, or after `## AI Review` inconsistently.
**Why it happens:** Multiple `vault.process` calls in sequence; each sees the body AFTER the prior write, but insertion logic uses different anchor points.
**How to avoid:** Define a canonical section order and document it. Recommendation: `## Techniques` → `## Related Variants` → `## AI Review` (variants are part of the graph, logically grouped with Techniques). The `mergeRelatedVariantsSection` transform must insert AFTER `## Techniques` and BEFORE `## AI Review` (or at the appropriate anchor if either is missing).
**Warning signs:** Inconsistent section ordering across notes.

## Code Examples

Verified patterns from the existing codebase:

### AI Classification Prompt Structure
```typescript
// Source: mirrors buildReviewPrompt.ts + buildContestAnalysisPrompt.ts patterns
export function buildKgPrompt(args: BuildKgPromptArgs): string {
  return [
    'You are classifying a LeetCode solution into an algorithmic pattern.',
    '',
    'Choose from these canonical patterns:',
    '- Arrays & Hashing',
    '- Two Pointers',
    '- Sliding Window',
    '- Stack',
    '- Binary Search',
    '- Linked List',
    '- Trees',
    '- Tries',
    '- Heap / Priority Queue',
    '- Backtracking',
    '- Graphs',
    '- Advanced Graphs',
    '- 1-D Dynamic Programming',
    '- 2-D Dynamic Programming',
    '- Greedy',
    '- Intervals',
    '- Math & Geometry',
    '- Bit Manipulation',
    '- Prefix Sum',
    '- Monotonic Stack',
    '- Topological Sort',
    '- Union-Find',
    '- Simulation',
    '',
    'If none of these fits, create a new concise pattern name.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## Accepted ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## Instructions',
    '',
    'Respond with ONLY a JSON object (no markdown fences, no explanation):',
    '{',
    '  "pattern": "<exact pattern name from the list above, or a new name>",',
    '  "variants": [',
    '    { "slug": "<problem-slug>", "reason": "<1-sentence structural reason>" }',
    '  ],',
    '  "lookAhead": [',
    '    { "slug": "<unsolved-problem-slug>", "reason": "<why this helps>" }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- "variants": exactly 0-2 problems from a DIFFERENT pattern that are structural twins. Omit if none.',
    '- "lookAhead": exactly 0-2 unsolved problems that build on the same pattern. Omit if none.',
    '- All slugs must be valid LeetCode problem slugs (lowercase, hyphenated).',
  ].join('\n');
}
```

### Hub Note Body Builder
```typescript
// Source: project convention for markdown file generation
export function buildHubNoteBody(
  patternName: string,
  entries: HubEntry[],
): string {
  const sections: string[] = [
    `---`,
    `lc-pattern-hub: true`,
    `pattern: "${patternName}"`,
    `---`,
    '',
    `# ${patternName}`,
    '',
  ];

  for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
    const group = entries.filter(e => e.difficulty === difficulty);
    if (group.length === 0) continue;
    sections.push(`### ${difficulty}`, '');
    sections.push('| Problem | Date Solved |');
    sections.push('|---------|-------------|');
    for (const e of group) {
      sections.push(`| [[${e.title}]] | ${e.solvedDate} |`);
    }
    sections.push('');
  }

  return sections.join('\n');
}
```

### Related Variants Section Merge Transform
```typescript
// Source: mirrors mergeAIReviewSection.ts pattern exactly
import { RELATED_VARIANTS_HEADING_LINE, TECHNIQUES_HEADING_LINE } from '../notes/NoteTemplate';

export function mergeRelatedVariantsSection(
  body: string,
  variants: Array<{ slug: string; reason: string }>,
): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines, RELATED_VARIANTS_HEADING_LINE);

  const content = variants
    .map(v => `- [[${v.slug}]] — ${v.reason}`)
    .join('\n');

  if (headingIdx >= 0) {
    // Replacement: discard from heading to next H2 (or EOF)
    const end = findNextH2(lines, headingIdx + 1);
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    const after = lines.slice(end).join('\n');
    return before + '\n\n' + RELATED_VARIANTS_HEADING_LINE + '\n\n' + content + '\n\n' + after.replace(/^\n+/, '');
  }

  // First write: insert after ## Techniques (canonical anchor)
  const techIdx = findExactHeading(lines, TECHNIQUES_HEADING_LINE);
  if (techIdx >= 0) {
    const techEnd = findNextH2(lines, techIdx + 1);
    const before = lines.slice(0, techEnd).join('\n').replace(/\n+$/, '');
    const after = lines.slice(techEnd).join('\n');
    return before + '\n\n' + RELATED_VARIANTS_HEADING_LINE + '\n\n' + content + '\n\n' + after.replace(/^\n+/, '');
  }

  // Fallback: append before ## AI Review or at EOF
  const trimmedBody = body.replace(/\n+$/, '');
  return trimmedBody + '\n\n' + RELATED_VARIANTS_HEADING_LINE + '\n\n' + content + '\n';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1.0 lc-tag wikilinks in `## Techniques` | AI-classified pattern cluster wikilinks | Phase 11 (this phase) | One wikilink per pattern instead of 3-5 per LC topic; cleaner graph |
| Stub technique notes (`LeetCode/Techniques/`) | Hub pattern notes (`LeetCode/Patterns/`) | Phase 11 (this phase) | Hub notes aggregate members; stubs were 1:1 with tags |
| Topic tags from LC's GraphQL response | AI classification from problem + solution | Phase 11 (this phase) | Classification based on HOW user solved it, not LC's static labels |

**Deprecated/outdated:**
- v1.0 `mergeTechniquesSection` union-merge logic: replaced by AI-cluster single-link write (D-09)
- Stub technique notes in `Techniques/` folder: superseded by hub notes in `Patterns/` folder
- `topicTags` as input to step 2: replaced by AI classification output

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Single combined AI call (pattern + variants + look-ahead) is cheaper and faster than separate calls | Architecture Patterns | Minor cost difference; could split later if JSON parsing fails too often |
| A2 | `vault.getMarkdownFiles()` is available and performant for reconcile scan | Pattern 7 | If not available, must iterate through `getAbstractFileByPath` or metadataCache resolver |
| A3 | AI can reliably return valid JSON when prompted with explicit schema + "no markdown fences" instruction | Pitfall 1 | May need retry/fallback logic or regex extraction if AI wraps in code fence |
| A4 | `metadataCache.getFileCache(file)?.frontmatter` is synchronously available for all loaded files | Pattern 7 | If metadata is lazy-loaded, reconcile may miss recently-created notes |
| A5 | 500 maxTokens is sufficient for pattern + 2 variants + 2 look-ahead in JSON format | Pattern 1 | May need increase; 200-300 tokens typical, 500 gives generous headroom |
| A6 | The 22 seed patterns cover 90%+ of LeetCode problems adequately | Prompt design | If AI creates too many novel patterns, graph fragments; user may need taxonomy admin (deferred) |

## Open Questions (RESOLVED)

1. **Classification opt-in: shared toggle or dedicated?** (RESOLVED: dedicated `autoAIKnowledgeGraph` toggle, default ON — Plan 01 Task 2 + Plan 03 Task 2)
   - What we know: AI Review has `autoAIReviewOnAC` toggle. Classification is a separate concern (D-01 says it fires on AC).
   - What's unclear: Should classification be always-on when AI is configured, or require a separate opt-in?
   - Recommendation: Gate behind the existing `autoAIReviewOnAC` OR add a distinct `autoAIKnowledgeGraph` toggle. The CONTEXT decisions don't specify — this is Claude's discretion. Recommend a dedicated toggle (default ON when AI is configured) since KG is a core feature, not just review.

2. **JSON parsing resilience** (RESOLVED: 4-strategy cascade in parseKgResponse — Plan 01 Task 1)
   - What we know: LLMs sometimes wrap JSON in markdown code fences or add explanatory text.
   - What's unclear: How reliable are different providers at raw JSON output?
   - Recommendation: `parseKgResponse` should try: (1) direct `JSON.parse`, (2) strip markdown fences then parse, (3) regex extract `{...}` then parse, (4) fallback to `{ pattern: 'OTHER', variants: [], lookAhead: [] }` and log.

3. **Section ordering: `## Related Variants` placement** (RESOLVED: after Techniques, before AI Review — Plan 01 Task 2)
   - What we know: `## Techniques` is anchored. `## AI Review` is at EOF. `## Related Variants` is new.
   - What's unclear: Does `## Related Variants` go immediately after `## Techniques` or after `## AI Review`?
   - Recommendation: After `## Techniques` and before `## AI Review`. The variants are graph-topology content (like Techniques), not AI commentary. This groups related concepts.

4. **Cost accounting for classification call** (RESOLVED: compute from response.usage via pricing.ts + addCostLedger — Plan 02 Task 2)
   - What we know: `addCostLedger(usd)` exists. Phase 09's review calculates cost from usage tokens.
   - What's unclear: Classification call is `AIClient.invoke` which returns `usdCost: 0` (cost added by caller pattern from Phase 08/09).
   - Recommendation: After `invoke` resolves, compute cost from `response.usage` via the `pricing.ts` module and call `addCostLedger`. Matches Phase 09 pattern exactly.

## Environment Availability

> Step 2.6: SKIPPED (no external dependencies identified). Phase 11 is purely internal code/config — all tools (TypeScript, esbuild, vitest, Obsidian API) are already present from prior phases.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/graph/ tests/ai/ --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIKG-01 | AI classifies on AC into 22 patterns; OTHER prompts user | unit | `npx vitest run tests/graph/patternClassification.test.ts` | Wave 0 |
| AIKG-02 | Hub note created/updated at `LeetCode/Patterns/{Cluster}.md` | unit | `npx vitest run tests/graph/clusterHubWriter.test.ts` | Wave 0 |
| AIKG-03 | `## Techniques` upgraded to AI cluster wikilinks (lazy-on-AC) | unit | `npx vitest run tests/graph/mergeTechniquesSection.test.ts` | Existing (modify) |
| AIKG-04 | Difficulty-progression edges on hub notes | unit | `npx vitest run tests/graph/clusterHubWriter.test.ts` | Wave 0 |
| AIKG-05 | `## Related Variants` section (cross-cluster, cap 2) | unit | `npx vitest run tests/graph/mergeRelatedVariantsSection.test.ts` | Wave 0 |
| AIKG-06 | Look-ahead wikilinks gated by featureFlag, validated | unit | `npx vitest run tests/graph/patternClassification.test.ts` | Wave 0 |
| AIKG-07 | All writes via vault.process / processFrontMatter; heading locked | unit + grep | `npx vitest run tests/graph/onAccepted*.test.ts` | Existing (modify) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/graph/ tests/ai/ --reporter=dot`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/graph/patternClassification.test.ts` — covers AIKG-01, AIKG-06 (prompt assembly + response parsing + flag gating)
- [ ] `tests/graph/clusterHubWriter.test.ts` — covers AIKG-02, AIKG-04 (hub creation, difficulty tables, reconcile)
- [ ] `tests/graph/mergeRelatedVariantsSection.test.ts` — covers AIKG-05 (insertion, replacement, cap enforcement)
- [ ] `tests/graph/buildKgPrompt.test.ts` — covers prompt determinism (same pattern as buildReviewPrompt.test.ts)
- [ ] `tests/graph/parseKgResponse.test.ts` — covers JSON parsing resilience, validation, fallback
- [ ] `tests/ai/disclosure.withKgBullet.test.ts` — covers disclosure composition (same pattern as withReviewBullet test)

*(Existing `mergeTechniquesSection.test.ts` and `onAccepted.*.test.ts` files need modification to test the new AI-driven path)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A (inherits from Phase 07 AIClient disclosure gate) |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | JSON response parsing with strict schema validation; slug validation against local index |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for AI Classification

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AI prompt injection via problem statement | Tampering | Problem statement is read-only LC content; user code is the user's own. No elevated privilege from classification. |
| Malformed JSON response crashing plugin | Denial of Service | `parseKgResponse` wraps in try/catch, returns safe fallback `{ pattern: 'OTHER', variants: [], lookAhead: [] }` |
| AI returning non-existent problem slugs | Information Disclosure | All slugs validated against local problem index; unknowns dropped silently (AIKG-06) |
| Cost exhaustion via rapid AC re-submissions | Denial of Service | Cost ledger tracking + daily cap (AIREV-06 from Phase 09); classification inherits this gate |
| Data leak of vault content to AI provider | Information Disclosure | Only problem statement + user code sent (D-03); disclosure gate informs user; `withKgBullet` enumerates exactly what ships |
| LC-isolation boundary violation | Tampering | `tests/ai/lc-isolation.test.ts` asserts `src/graph/` never imports `obsidianFetch` directly |

## Sources

### Primary (HIGH confidence)
- `src/graph/KnowledgeGraphWriter.ts` — existing on-AC pipeline architecture (read from codebase)
- `src/graph/mergeTechniquesSection.ts` — existing pure transform pattern with "free items" preservation (read from codebase)
- `src/ai/AIClient.ts` — `invoke()` and `invokeStream()` API surface + disclosure gate (read from codebase)
- `src/ai/disclosure.ts` — `withDebugBullet`/`withReviewBullet` composition pattern, `DISCLOSURE_BASE_COPY` freeze (read from codebase)
- `src/ai/mergeAIReviewSection.ts` — idempotent section merge transform pattern (read from codebase)
- `src/notes/NoteTemplate.ts` — `LOCKED_HEADINGS` tuple, `TECHNIQUES_HEADING_LINE` constant (read from codebase)
- `src/settings/SettingsStore.ts` — `PluginData` shape-guard pattern, `autoAIReviewOnAC` toggle precedent (read from codebase)
- `src/main.ts:1943` — existing AC gate + `knowledgeGraph.onAccepted()` invocation site (read from codebase)
- `.planning/phases/11-ai-knowledge-graph/11-CONTEXT.md` — all locked decisions D-01 through D-16 (read from planning)

### Secondary (MEDIUM confidence)
- NeetCode.io 22-pattern taxonomy — well-known community resource for LeetCode pattern classification [ASSUMED]
- `vault.getMarkdownFiles()` availability — Obsidian API method exists in `obsidian.d.ts` [ASSUMED]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all capabilities from existing codebase primitives
- Architecture: HIGH — extends established pipeline with documented integration points
- Pitfalls: HIGH — derived from actual codebase constraints (CF-06, LC-isolation, disclosure freeze) and real patterns
- Prompt design: MEDIUM — AI response reliability varies by provider; needs defensive parsing

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (stable — no external dependency changes expected)
