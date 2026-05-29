# Feature Research — v1.1 Milestone

**Domain:** Obsidian plugin for LeetCode practice + AI coaching + knowledge graph (v1.1 milestone)
**Researched:** 2026-05-14
**Confidence:** MEDIUM-HIGH (HIGH for vscode-leetcode + NeetCode patterns + Obsidian Copilot provider list — verified from source. MEDIUM for contest scoring formula and AI review presentation patterns — corroborated across multiple sources but not single-source canonical.)

> **Note:** This file is the v1.1 milestone feature landscape. The original v1.0 feature research has been superseded — v1.0 features are documented as "Validated" in `.planning/PROJECT.md` and as the "Delivered" capabilities in `.planning/MILESTONES.md`.

---

## Scope

This research covers the **v1.1 milestone** features ONLY:

1. **Preview Mode** — read-mode tab rendering ONLY the LC problem statement; "Start Problem" CTA creates the note.
2. **Virtual Contest** — past contest OR random; 90/100-min virtual timer; 4 problems; verdict tracking; post-contest summary.
3. **AI Debug** — user-triggered while solving; LLM gets code + problem + last failure; streams suggestions inline.
4. **AI ACed-Solution Review** — Approach / Efficiency / Code Style on Accepted.
5. **AI Knowledge-Graph Maintenance** — pattern-cluster hub notes, difficulty-progression edges, cross-cluster Related Variants, look-ahead edges.
6. **AI Provider Support** — multi-provider, BYO key + custom base URL.

---

## Comparable Products Investigated

| Product | What it informs | Confidence |
|---------|-----------------|------------|
| **vscode-leetcode** (LeetCode-OpenSource/vscode-leetcode) | Reference for preview UX, problem editor model, NO contest, NO AI | HIGH (README verified via `gh api`) |
| **LeetHub V2** (QasimWani/LeetHub) | Per-problem README pattern, post-AC capture model | HIGH (`scripts/leetcode.js` inspected) |
| **NeetCode 150** (`neetcode-gh/leetcode/.problemSiteData.json`) | Canonical pattern names + structure | HIGH (450 entries, 18 patterns extracted from source data) |
| **Obsidian Copilot** (logancyang/obsidian-copilot) | Multi-provider BYO key UX in Obsidian | HIGH (`src/constants.ts` inspected; 17 providers enumerated) |
| **Continue.dev** | Multi-provider config schema (apiKey + apiBase + roles) | MEDIUM (overview docs verified) |
| **LeetCode native virtual contest** | 90 / 100 min duration; per-problem score; ICPC-style penalty | MEDIUM (training-data + community references; live page 403'd to scraper) |
| **Cursor / GitHub Copilot Chat** | BYO key + user-triggered-AI precedent | LOW (docs page 404'd; relying on training data corroboration) |

---

## Feature Landscape

### A. Preview Mode

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Right-click problem → "Preview" without creating a note | vscode-leetcode does exactly this verbatim ("right click the problem in the `LeetCode Explorer` and select `Preview Problem`"). Users coming from vscode-leetcode expect this. | LOW | Renders cached HTML→Markdown content. **Depends on v1.0:** `ProblemBrowser` view, problem-cache layer (`data.json`), turndown HTML→MD pipeline. |
| Read-mode rendering (formatted, not raw HTML) | Users expect Obsidian-native rendering | LOW | Reuse v1.0 `turndown` + `MarkdownRenderer.render()`. **Depends on v1.0:** existing turndown integration. |
| "Start Problem" / "Open Problem" CTA toggle (label changes based on whether note exists) | Avoids confusing users who already have the note | LOW | Check vault for `LeetCode/{id}-{slug}.md`; toggle button label. **Depends on v1.0:** note-creation pipeline (Phase 02). |
| Difficulty + topic-tag chips visible in preview | Decision-support before committing to solving | LOW | Already in cached metadata. |
| Closeable as a tab (not a blocking modal) | Users want to keep preview open while browsing | LOW | Use `ItemView` not `Modal`. **Depends on v1.0:** ItemView registration pattern. |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| Preview shows: "you have N notes already linked to patterns this problem touches" | Decision aid: do I need to solve this for coverage? | MEDIUM | **Depends on:** Feature E (pattern-cluster hubs). Defer to phase that ships pattern hubs. |
| Preview shows: cached daily-challenge / contest membership badge | "Oh, this is a contest problem — virtual-contest it instead" | LOW | Cross-reference contest list cache. |
| Preview is the default click target (single-click previews; double-click or "Start" creates note) | Explicit motivation in milestone scope: "no accidental note creation" | MEDIUM | Behavior change vs v1.0; needs settings toggle for users who want v1.0 click-to-create back. **Depends on v1.0:** ProblemBrowser click handler. |

#### Anti-Features (Tempting but Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Render LC HTML inline via `innerHTML` for fidelity | LC's HTML has nice tables/code blocks | Forbidden by Obsidian plugin guidelines (XSS); will fail community store review | Use existing v1.0 `turndown` + `MarkdownRenderer.render()` — battle-tested |
| Auto-cache the full problem set on preview-tab open | "Make preview instant for everything" | Already-rejected by v1.0 (3,000 problems × 10–50 KB = 30–150 MB; destroys `data.json`) | On-demand fetch + 7-day cache (existing v1.0 rule) |
| Inline "Start Problem" actions that pre-pick a language | Saves a click | The default-language setting already handles this | Honor `defaultLanguage` setting — no extra knob |

---

### B. Virtual Contest

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| 90-min weekly + 100-min biweekly timer (visible, persistent) | LC's native virtual contest does exactly this | LOW | Two static durations: weekly = 5400 s, biweekly = 6000 s. Persist start time to `data.json`. **Depends on v1.0:** `data.json` plugin storage. |
| 4 problems materialized as notes at contest start | LC contests are always 4 problems (Q1–Q4) | LOW | Reuse v1.0 note-creation pipeline; create all four atomically on Start. **Depends on v1.0:** problems-as-notes pipeline (Phase 02). |
| Per-problem run/submit during contest (not different from normal flow) | Muscle memory should work | LOW | Already there in v1.0 — route through during contest. **Depends on v1.0:** Run/Submit pipeline (Phase 03). |
| Verdict tracked per problem with timestamp (first-AC time + WA count) | Required for scoring + penalty | LOW | **Depends on v1.0:** verdict pipeline + `KnowledgeGraphWriter.onAccepted` event hook. |
| Post-contest summary (solved count, per-problem time, WA count, total score) as a vault note | LC's native contest UI shows this; Codeforces virtual practice shows this | MEDIUM | Generate `LeetCode/contests/{contestSlug}-{date}.md`. Frontmatter: `lc-contest-slug`, `lc-contest-type`, contest score. |
| Pause/abort contest with confirmation | Users will accidentally hit Stop | LOW | Modal confirmation; persisted state cleared on confirm. |
| "Surprise me" random past-contest picker | Explicit milestone scope | LOW | Random selection from cached contest list (uniform). |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| Post-contest summary is a **first-class vault note** (graph-citizen, tagged, linkable) | LC's contest-history page disappears when browser closes; in Obsidian it joins the graph forever | LOW | Just write Markdown to `LeetCode/contests/`. **Depends on v1.0:** vault.create + frontmatter pipeline. |
| Post-contest summary auto-tags missed problems with `#revisit` | Personal-tag union-merge already shipped | LOW | **Depends on v1.0:** personal-tag union-merge (Phase 02). |
| Post-contest report includes **AI technique-tag inference** for solved problems | AI fills `## Techniques` with cluster-link wikilinks immediately | MEDIUM | **Depends on:** Feature E (AI knowledge-graph). Skippable in early phase. |
| LC's actual scoring rendered in summary (1+2+3+4 base, with WA-time penalty) | "How would I have ranked?" | MEDIUM | LC contest scoring: each Q has base points (Q1=3, Q2=4, Q3=5, Q4=6 typically; varies per contest); penalty = 5 min × WA count added to first-AC time. **Confidence MEDIUM** — exact base points published per-contest; render LC's published values, don't invent. |
| Random contest picker with difficulty-weighting ("give me a hard one") | Bias toward weak areas | LOW | UI toggle: hardest-Q1, balanced, hardest-Q4. |
| Resume in-progress contest on Obsidian restart | Power-user; users hate losing state | MEDIUM | Persist `ContestSession` state in `data.json` + heartbeat; on plugin load, prompt "Resume contest started X minutes ago?" |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Live contest participation** | Users will ask | Already explicitly out-of-scope in PROJECT.md: real-time leaderboards, simultaneous-submission throttling, contest-day rankings — plugin store will scrutinize | Virtual past contests only. Document in README. |
| **Leaderboard scraping** | "Compare to people who did it live" | Massive scope creep; LC may rate-limit; scraping ethics | Show user's score against contest's published rank cutoffs (1500/1700/2000) — static metadata. |
| **Auto-submit on timer expiry** | "Don't waste my code that I almost finished" | Users hate auto-submit (lose chance to review); pollutes submission history with broken code | Show "Time's up — Submit when ready / End contest" modal. Submit only on explicit click. |
| **Hard-mode timer (block editor when time is up)** | Simulates real contest pressure | Annoying; users will close timer to keep coding; fights Obsidian's open-editor model | Soft timer: red "OVERTIME +N:NN" badge; do not block edits. |
| **Built-in rank prediction with LC API integration** | Curiosity feature | Requires post-contest API not exposed for arbitrary virtual; rate limits | Show static cutoffs only. |

---

### C. AI Debug (User-Triggered)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| User-triggered (button), NOT automatic | Cursor / Copilot Chat / Continue.dev all use explicit-trigger; auto-AI is universally hated | LOW | Action button under `## Code` action row. **Depends on v1.0:** `CodeActionsWidget` (Phase 05.2). |
| Include problem statement + current code + last failure verdict in prompt | Without these, LLM can't help | LOW | Pull from frontmatter (`lc-id`), `## Code` fence content, last `VerdictModal` event. **Depends on v1.0:** verdict pipeline + section-aware fence extraction. |
| Stream tokens (don't block on full response) | Users abandon non-streaming AI | MEDIUM | **CRITICAL:** `requestUrl` returns full body (no streaming). Must use native `fetch` for AI providers. (CORS isn't a problem for AI providers — they all set `Access-Control-Allow-Origin: *`.) v1.0 `requestUrl`-everywhere convention is **LeetCode-specific**, not universal. |
| Inline rendering in the note (not in a side panel) | Obsidian's value-prop is everything-in-the-note | MEDIUM | Append under `## AI Debug` OR transient widget under action row. **Decision needed in design phase.** Section-lock-aware (extend `sectionLockExtension.ts`). |
| Cancel / abort mid-stream | LLM can hang 30+ seconds | LOW | `AbortController` on fetch. |
| Per-call cost transparency | BYO-key users care; Continue.dev shows; Copilot does not | LOW | Compute from input/output tokens × provider price table. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| Auto-include the **failing test case** in prompt | v1.0 already extracts it ("Copy failing testcase" button in VerdictModal) | LOW | **Depends on v1.0:** Phase 05.4 VerdictModal failing-testcase extraction. |
| Auto-include the user's **`## Notes` section** as context (opt-in checkbox) | "I think it's an off-by-one" — let user steer LLM | LOW | Checkbox in AI Debug button menu. |
| Suggestions include **Apply Patch** affordance like Cursor / Copilot Chat | Differentiated; users will copy-paste otherwise | HIGH | Diff parsing + safe apply within `## Code` fence. v1.0 section-lock applies — would need `'leetcode.ai-apply'` userEvent annotation per CLAUDE.md convention. **Defer to v1.2.** |
| Stop mid-stream with `Esc` keystroke | Power users want this | LOW | Keybinding bound only when stream active. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **AI auto-debug whenever a Run or Submit fails** | "Save the user a click" | Universally hated; burns API budget without user consent | Always user-triggered. Optionally: dismissible toast suggesting AI Debug after WA — opt-in setting. |
| **Send full vault to LLM as context** | "Maximum context" | Privacy nightmare; token cost; mostly irrelevant; plugin-store red flag | Send: problem statement, current code, last verdict, failing test case, optionally `## Notes`. Nothing else. |
| **Pre-submit "would this be accepted?" oracle** | "Skip the LC round trip" | LLMs wrong about correctness ~30% of the time; users submit broken code on the LLM's say-so | LC's actual judge is free + authoritative; just submit. |
| **AI generates full solution from scratch when triggered with no code** | "I'm stuck, write it" | (a) Defeats practice purpose. (b) "Homework cheat tool" framing → plugin-store risk | Require non-empty `## Code` fence. Show "Write something first" if empty. |

---

### D. AI ACed-Solution Review (3 Dimensions)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Triggered on Accepted verdict (not on every run) | Submitting AC is when user is ready to learn | LOW | **Depends on v1.0:** `KnowledgeGraphWriter.onAccepted` hook (Phase 04). |
| Three sections: Approach (Current vs Suggested + Key Idea + Consider) / Efficiency (Current O / Suggested O) / Code Style | Milestone scope spelled this out; matches Cursor "Improvements" + Sourcegraph Cody "Code Smell" | MEDIUM | Single LLM call, structured output → `## AI Review` section. |
| Review **lives inline in the note** (not separate file, not sidebar) | Obsidian's value-prop = everything-in-the-note | LOW | Append `## AI Review` after `## Notes`. **Depends on v1.0:** section-aware writes via `vault.process` (CLAUDE.md convention). |
| Idempotent (re-AC'ing overwrites cleanly, doesn't append) | Users re-solve; multiple stale reviews would clutter | LOW | Replace existing `## AI Review` block. **Depends on v1.0:** section replace helpers. |
| Skippable / disable-able in settings | BYO-key cost / privacy | LOW | Toggle: "Auto-review on Accepted". **Default OFF** (privacy-first per plugin-store guidance). |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| Review is **non-streaming** (sync request) | Different from Debug. Users have shipped; want a complete report not real-time stream. Matches "GitHub PR review" model. | LOW | Single-shot fetch; "Reviewing..." toast; fill section when done. |
| **Suggested code** in a separate fence — preserves user's original code untouched | Side-by-side comparison; never overwrite user code | LOW | Two fences in `## AI Review`. |
| Time/space complexity comparison rendered as Markdown table | Easier to scan than prose | LOW | Current / Suggested rows. |
| Review references the **pattern-cluster** the AI assigned (deep-link) | Connects review to graph; user can click through | MEDIUM | **Depends on:** Feature E (pattern-cluster work). |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-apply suggested code on AC** | "Save my best code automatically" | Catastrophic. (a) Users hate AI rewriting their code without consent. (b) User's code AC'd — by definition it's correct; AI's "improvement" might be slower/buggier. (c) Re-AC creates a loop. | Display in `## AI Review` only. User copies if they want. |
| **Re-use whatever provider streamed Debug seconds ago, even if user's default differs** | "Use whatever's connected" | Users may have specifically switched (cheap-Ollama-debug → Anthropic-review) | Always use the user's currently-configured provider per call. |
| **Comparative leaderboard ("you're top 50%")** | Gamification | Requires LC's percentile API on every AC; rate-limited; v1.0 explicitly dropped runtime/memory frontmatter (PROJECT.md: "no production reader; staleness risk"). Don't reintroduce in disguise. | Show LC runtime/memory percentile fresh from GraphQL only when user opens the submission detail modal. AI review focuses on approach not percentile. |
| **Review every Run (including failures)** | "More feedback" | Burns budget; "feedback" on broken code is noise | AC-only trigger. Failed runs use AI Debug. |
| **Open the review in a separate split or modal** | "Preserve the note" | Users close modals + forget; loses graph value | Inline `## AI Review` section, period. |

---

### E. AI Knowledge-Graph Maintenance

This is the **most differentiated feature** in the milestone. v1.0 already has lc-tag-based Techniques (`[[Two Pointers]]` from LC topic slug). v1.1 supersedes with AI-named pattern clusters + difficulty progression + cross-cluster variants + look-ahead edges.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Pattern cluster names match community conventions | Users come pre-trained on NeetCode 150 / Blind 75 names | MEDIUM | **Constrain LLM to fixed taxonomy.** NeetCode's canonical 18 patterns (extracted from `.problemSiteData.json`, 450 entries): `Arrays & Hashing`, `Two Pointers`, `Sliding Window`, `Stack`, `Binary Search`, `Linked List`, `Trees`, `Tries`, `Heap / Priority Queue`, `Backtracking`, `Graphs`, `Advanced Graphs`, `1-D Dynamic Programming`, `2-D Dynamic Programming`, `Greedy`, `Intervals`, `Math & Geometry`, `Bit Manipulation`. Add: `Prefix Sum`, `Monotonic Stack`, `Topological Sort`, `Union-Find`. **LLM picks from list — cannot invent free-form names.** |
| Each cluster gets a **hub note** in the vault | Single navigation point for the cluster | LOW | Auto-create on first AC mapping to cluster; idempotent. **Depends on v1.0:** technique-stub creation pipeline (Phase 04). |
| Hub note auto-lists problems in the cluster (sorted by difficulty) | "I have 12 sliding-window problems — here they are" | LOW | Use Obsidian Bases query (matches v1.0 `LeetCode.base`). **Depends on v1.0:** Bases integration. |
| Difficulty-progression edges: Easy → Medium → Hard within cluster | Learning path | MEDIUM | "Next" link in hub OR `## Progression` section. AI determines order based on conceptual scaffolding. |
| `## Related Variants` section lists **cross-cluster structural twins ONLY** | Avoids redundancy with same-cluster siblings | MEDIUM | AI prompt constraint: "list only problems in OTHER clusters". |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **Look-ahead edges to UNSOLVED problems** when AI judges them load-bearing | **UNIQUE.** No comparable product has this. NeetCode shows static roadmap; LeetHub captures only solved; Obsidian Copilot semantic-searches existing notes. Look-ahead is the v1.1 USP. | HIGH | Materialize as: dangling wikilinks `[[1234-skyline-problem]]` in `## Related Variants`. Click → v1.1 Preview tab → "Open Problem (creates note)". Obsidian shows dangling links lighter in graph view → "unexplored next-steps" visible. **Depends on:** Feature A (Preview tab). |
| Look-ahead edge target stub gets `#suggested` + `#unsolved` tags | Filterable in graph view | LOW | When user previews a dangling link, stub note (created on first preview/Start) gets these tags. |
| **Pattern hubs supersede `[[Two Pointers]]` v1.0 lc-tag links** | AI-named clusters are higher quality than LC's noisy topic tags (LC tags everything "Array") | MEDIUM | See **Migration** section below. |
| Hub notes get a 1-paragraph AI-written summary | Users learn the pattern when they open the hub | LOW | One-shot LLM call per hub on first creation. Cache in note body. |
| Pattern-cluster names visible in graph view as cluster-color-coded nodes | Obsidian graph view supports node color via group filters → pattern hubs become visual cluster centers | LOW | Document recommended graph-view filter in README; don't bake in. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **AI invents free-form pattern names** ("Sliding Optimization Window") | Sounds creative | Fragments graph; users searching "Sliding Window" find nothing; conflicts with NeetCode terminology users are pre-trained on | Constrained taxonomy (18 NeetCode + ~4 additions). LLM picks from list; cannot invent. |
| **Same-cluster Related Variants** (Sliding Window problem links to other Sliding Window problems in `## Related Variants`) | "Show everything related" | Redundant — they're already siblings in the hub. Bloats graph. | `## Related Variants` is **cross-cluster ONLY** (per milestone spec). |
| **Auto-rewrite all v1.0 notes on plugin update** | "Make my whole vault consistent" | (a) Massive LLM cost (1 call × N solved). (b) Network user didn't authorize. (c) Plugin-store red flag. (d) User horror when personal `## Notes` are touched. | See **Migration** strategy below. |
| **AI rewrites user's `## Notes` with "improvements"** | Open-ended graph-curation | Users hate that. `## Notes` is the user's voice. | Clear write-zones: AI owns `## Techniques`, `## Related Variants`, `## AI Review`. User owns `## Notes`. v1.0 section-lock enforces. |
| **Look-ahead edges as TODO checkboxes inside the current note** | "Make it actionable" | Pollutes note; users check off without solving; turns practice file into task tracker | Look-ahead = wikilinks under `## Related Variants` — same model as solved variants, distinguished by Obsidian's dangling-link styling + `#unsolved` tag on stub. |
| **Forward-edge spamming** (every problem points to 5+ unsolved next-problems) | "Maximum guidance" | Bloats note; AI confidence on "what's next" is genuinely low; users get analysis paralysis | Cap: at most 2 look-ahead edges per problem note. AI prompt constraint. |

#### Migration Strategy for v1.0 Notes (Required by Quality Gate)

v1.0 shipped `## Techniques` with wikilinks generated from LC's topic slugs (`[[Two Pointers]]`, `[[Hash Table]]`). v1.1 changes to AI-named cluster hubs. **Three options analyzed:**

| Strategy | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Eager batch on plugin update** | Vault consistent immediately. | (a) Surprising — N LLM calls fire on Obsidian launch. (b) Cost: ~$0.01/note × 200 = $2 just to upgrade. (c) Plugin-store red flag (mass network on load). (d) No undo. (e) `## Notes` at risk if pipeline buggy. | **REJECT.** Anti-feature. |
| **Lazy migrate on note open** | Distributed cost; only what user opens. | (a) Surprise on every old-note open. (b) Inconsistent vault state during transition. (c) Still costs LLM calls. | **REJECT.** Surprise on normal navigation. |
| **Opt-in batch with preview** (Settings UI: "Migrate v1.0 notes" — count + estimated cost + preview of changes + explicit Run + per-note skip) | (a) User-driven. (b) Cost-transparent. (c) Reversible. (d) Plugin-store-safe. | More UI work. | **RECOMMEND.** |
| **Never migrate, only new ACs use clusters** | Zero risk. Zero migration cost. | Vault has dual conventions. Pattern-hub names overlap with NeetCode/lc-tag names. | **FALLBACK.** Ship if opt-in batch can't make v1.1. Document dual-convention coexistence in README. |

**Recommendation:** **Default = no automatic rewrite.** Opt-in batch with preview is the GOAL; if it slips, ship the "never migrate, new ACs use clusters" fallback.

**Naming-collision insight:** v1.0 generates `[[Two Pointers]]` from LC topic. v1.1 may generate `[[Two Pointers]]` for the AI cluster. Same wikilink → resolves to same note. **Migration only needed where AI cluster ≠ LC topic** (e.g., LC tagged `[[Array]]`, AI clusters `[[Sliding Window]]`). Reduces the migration surface significantly.

**REQ candidate:** "Migration of v1.0 notes is opt-in; default = no automatic rewrite."

---

### F. Multi-Provider AI (BYO Key + Custom Base URL)

Sourced from Obsidian Copilot's `src/constants.ts` (verified 17 providers via `gh api`) and Continue.dev overview docs (40+ providers).

#### Table Stakes

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Anthropic + OpenAI + OpenRouter + Ollama out-of-the-box | These four cover ~90% of users (Anthropic = best Claude; OpenAI = GPT default; OpenRouter = aggregator BYO; Ollama = local privacy) | MEDIUM | Each ≈ 1 hand-rolled fetch wrapper. Avoid bundling Anthropic/OpenAI native SDKs (heavy). |
| Bedrock support (per milestone spec) | User explicitly listed Bedrock | HIGH | Bedrock auth = SigV4 signing — significantly more complex. May want to defer to v1.1.x or use a wrapper. |
| Custom base URL field per provider | OpenRouter / LiteLLM / Azure OpenAI / Anthropic-compatible proxies need this. Continue.dev exposes `apiBase`. Obsidian Copilot has `OPENAI_FORMAT = "3rd party (openai-format)"` provider. | LOW | Settings field per provider; validate scheme = https. |
| API key stored in `data.json` (plain text) | Per v1.0 convention (session cookie also lives in `data.json`); per Obsidian community norm | LOW | Plain text. Document in README. **NEVER log it.** **Depends on v1.0:** plugin-data save/load. |
| Settings show: provider dropdown, model name, base URL, API key (masked), test-connection button | Standard pattern across Continue / Copilot | LOW | One section per active provider; "+ Add Provider" button. |
| Switch active provider per call type (Debug = Ollama local, Review = Anthropic) | Power users want this; saves money on Debug | MEDIUM | Setting: 3 dropdowns (Debug / Review / KG). Default = same for all. Continue.dev calls these "roles". |
| README discloses external API calls | Plugin-store requirement (PROJECT.md: "Network use disclosed in README") | LOW | Add: "v1.1 sends prompts to your configured AI provider when you trigger AI Debug or on Accepted submission (if enabled). Your API key is stored locally in `data.json` and is never transmitted anywhere except your chosen provider." |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-feature provider routing (Debug / Review / KG separately configurable) | Continue.dev ships `roles: [chat, edit, apply]` | MEDIUM | 3 dropdowns. |
| Token / cost telemetry **shown locally only**, never transmitted | Privacy-first BYO is a differentiator (Copilot Plus uploads telemetry — free does not) | LOW | Track in `data.json`. Optional sidebar "AI usage this month". |
| Sane defaults (model dropdowns pre-populated per provider; user doesn't need to know model names) | Continue.dev requires user to type model names; Copilot pre-populates | LOW | Hardcode current model list per provider; allow override. |
| Connection test (1-token call) before saving | Saves debugging when key is wrong | LOW | "Test" button per provider; ✓ / ✗ feedback. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Plugin-hosted proxy / shared API key** | "Make it free for users" | Already explicitly out-of-scope in PROJECT.md: telemetry surface, hosting cost, plugin-store risk | BYO-key only. |
| **OS keychain integration** | "Encrypted at rest" | Adds Electron native dependency (keytar bindings); cross-platform pain; not in v1.0 stack; minimal security gain | Plain text in `data.json`. Document in README. |
| **Auto-fallback to different provider if primary fails** | "Resilience" | Surprising; user might not want prompt sent to OpenAI when Anthropic fails (privacy/cost) | Show error; let user retry or switch manually. |
| **Telemetry: anonymized usage stats** | "Help us help you" | Plugin-store explicit denial. v1.0's "no telemetry" is a feature. | None — no telemetry at all. |
| **Built-in "smart routing"** | "Magic" | Requires usage telemetry; opaque cost; users don't trust black boxes for billable resources | User picks per feature. |
| **Streaming via `requestUrl`** | "Use the v1.0 HTTP convention everywhere" | `requestUrl` returns full body — no progressive streaming | Use native `fetch` for AI providers (CORS not an issue — providers all set `*`). v1.0's `requestUrl` convention applies to **leetcode.com** specifically. |

---

## Feature Dependencies

```
[F: Multi-Provider AI Settings]
    └──required by──> [C: AI Debug]
    └──required by──> [D: AI ACed Review]
    └──required by──> [E: AI Knowledge-Graph]

[E: AI Knowledge-Graph (pattern hubs)]
    └──enhances──> [B: Virtual Contest summary] (auto-tag missed problems by cluster)
    └──enhances──> [A: Preview Mode] (show "you have N notes in this cluster")
    └──enhances──> [D: AI Review] (deep-link to cluster from review)

[A: Preview Mode]
    └──enhances──> [B: Virtual Contest] (preview a contest problem before starting)
    └──required by──> [E.4: Look-ahead edges] (click dangling link → preview before commit)

[B: Virtual Contest]
    └──independent──> (works without AI; AI auto-tagging is bonus enhancement)

[D: AI Review] ──conflicts──> [Auto-apply suggested code] — explicit anti-feature

[E: KG migration] ──conflicts──> [auto-rewrite-on-load] — explicit anti-feature

[v1.0: KnowledgeGraphWriter.onAccepted] ──hooks──> [D: AI Review trigger] + [E: cluster assignment trigger]

[v1.0: CodeActionsWidget action row] ──hosts──> [C: AI Debug button]

[v1.0: section-lock + 'leetcode.*' userEvent] ──governs──> [C inline render] + [D: ## AI Review writes]

[v1.0: data.json plugin storage] ──hosts──> [F: API keys] + [B: contest session state]

[v1.0: turndown HTML→MD pipeline] ──used by──> [A: Preview rendering]

[v1.0: ProblemBrowser ItemView] ──hosts──> [A: right-click → Preview action]
```

### Critical Dependency Notes

- **C/D/E all require F.** F (provider settings) must ship first or in same phase as any AI feature. **F is foundational.**
- **A is independent.** Can ship in parallel with anything; only depends on v1.0 cache + browser. Decoupled from AI.
- **B is independent of AI.** Ships without AI; AI auto-tagging is v1.1.x enhancement.
- **E.4 (look-ahead) blocks on A.** Look-ahead edges materialize as dangling wikilinks; clicking one needs the Preview tab to land on something useful.
- **D section-lock interaction.** `## AI Review` must be added to `sectionLockExtension.ts` lock-list. Plugin writes via `app.vault.process(...)` (vault-layer, bypasses lock by design — same pattern as v1.0 `copyToCode.ts`).
- **C streaming transport.** AI Debug needs streaming; v1.0 `requestUrl` cannot stream. Adds `fetch` for AI providers ONLY. **STACK addition required.**

---

## MVP Definition (for v1.1 milestone)

### Launch With (v1.1 ship — P1)

Minimum viable for the milestone — what's needed to validate the v1.1 thesis ("AI coaching + contest practice + curated graph make solving compound").

- [ ] **F1: Multi-provider settings UI** (Anthropic + OpenAI + OpenRouter + Ollama; custom base URL per provider; key in `data.json`; test-connection button) — Foundation for all AI.
- [ ] **F2: Single active provider per AI feature type** (one Debug provider, one Review provider, one KG provider — defaults to same).
- [ ] **A1: Preview tab** (right-click → preview; CTA toggle Start/Open) — Decoupled; ships independently.
- [ ] **B1: Virtual contest core** (past contest picker + Surprise me + 90/100-min timer + 4 notes + verdict tracking + post-contest summary note) — Decoupled.
- [ ] **C1: AI Debug button** (under `## Code` action row; problem + code + last failure + failing test in prompt; streamed inline render) — Requires F.
- [ ] **D1: AI ACed Review** (3-section review on Accepted; settings toggle default OFF; inline `## AI Review` section; non-streaming) — Requires F.
- [ ] **E1: Pattern-cluster hubs** (constrained 22-pattern taxonomy: 18 NeetCode + ~4 additions; auto-create hubs on AC; replace `## Techniques` with cluster wikilinks for **NEW ACs only**; v1.0 lc-tag links untouched by default) — Requires F.
- [ ] **E2: Difficulty-progression edges** (within a cluster) — Requires E1.
- [ ] **E3: Cross-cluster `## Related Variants` (structural twins only)** — Requires E1.
- [ ] **E4: Look-ahead edges to unsolved problems** (capped at 2 per note; surface as dangling wikilinks; preview on click) — Requires E1 + A1.
- [ ] **README disclosure update** (AI provider network calls, key storage location).

### Add After Validation (v1.1.x patches — P2)

- [ ] **E5: Opt-in migration UI** for v1.0 notes — preview, cost estimate, run button.
- [ ] **B2: Contest summary AI-pattern auto-tagging** (after E1).
- [ ] **F3: Cost telemetry sidebar** (local-only token/cost tracker).
- [ ] **C2: AI Debug "include `## Notes`" checkbox**.
- [ ] **A2: Preview shows pattern-cluster coverage** (after E1).

### Future Consideration (v1.2+ — P3)

- [ ] **C3: AI Debug Apply-Patch** (Cursor-style diff apply) — HIGH complexity, section-lock-aware diff merge.
- [ ] **F4: Bedrock SigV4 support** — complex auth.
- [ ] **F5: GitHub Copilot / Azure OpenAI providers** — enterprise nice-to-have.
- [ ] **B3: Resume in-progress contest after Obsidian restart** — needs reliable persistence.
- [ ] **E6: Pattern-cluster summaries auto-regenerate when N new problems join** — graph-curation polish.
- [ ] **E7: Manual cluster override** (user disagrees with AI assignment) — defer; surface as known limitation.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Depends On |
|---------|------------|---------------------|----------|------------|
| F1 Provider settings (4 providers) | HIGH | MEDIUM | P1 | — |
| F2 Per-feature provider routing | MEDIUM | LOW | P1 | F1 |
| A1 Preview tab | HIGH | LOW | P1 | v1.0 cache + ProblemBrowser |
| B1 Virtual contest core | HIGH | MEDIUM | P1 | v1.0 note pipeline + verdict pipeline |
| C1 AI Debug | HIGH | MEDIUM | P1 | F1 + v1.0 CodeActionsWidget |
| D1 AI ACed Review | HIGH | MEDIUM | P1 | F1 + v1.0 onAccepted hook |
| E1 Pattern-cluster hubs | HIGH | MEDIUM | P1 | F1 |
| E2 Difficulty-progression | MEDIUM | LOW | P1 | E1 |
| E3 Cross-cluster Variants | MEDIUM | MEDIUM | P1 | E1 |
| E4 Look-ahead edges | HIGH (USP) | MEDIUM | P1 | E1 + A1 |
| E5 Opt-in migration UI | MEDIUM | MEDIUM | P2 | E1 |
| B2 Contest AI auto-tag | MEDIUM | LOW | P2 | E1 |
| F3 Cost telemetry | MEDIUM | LOW | P2 | F1 |
| C3 AI Debug Apply-Patch | LOW (nice) | HIGH | P3 | C1 |
| F4 Bedrock SigV4 | LOW (niche) | HIGH | P3 | F1 |

---

## Competitor Feature Analysis

| Feature | vscode-leetcode | LeetHub V2 | NeetCode 150 | Obsidian Copilot | Continue.dev | Our Approach (v1.1) |
|---------|-----------------|------------|--------------|------------------|--------------|---------------------|
| Problem preview before opening | YES (right-click) | N/A | N/A | N/A | N/A | YES — default click target. |
| Virtual contest mode | NO | NO | NO | N/A | N/A | YES — past + Surprise me + summary note. |
| AI debug | NO | NO | NO | YES (chat — vault-context, not problem-aware) | YES (chat + edit) | YES — problem-aware, user-triggered, streaming. |
| AI code review | NO | NO | NO | YES (manual) | YES (PR checks) | YES — auto on AC, 3 dimensions, inline. |
| Pattern-cluster knowledge graph | NO | NO (filenames only) | YES (static 18 patterns) | NO (semantic search instead) | NO | YES — AI-curated within NeetCode taxonomy + look-ahead. |
| Multi-provider BYO key | N/A | N/A | N/A | YES (17 providers) | YES (40+) | YES (4 launch + custom base URL). |
| Custom base URL | N/A | N/A | N/A | YES (`OPENAI_FORMAT`) | YES (`apiBase`) | YES per provider. |
| Per-feature provider routing | N/A | N/A | N/A | NO | YES (`roles`) | YES (Debug / Review / KG). |
| Per-problem README + metadata | NO (just code file) | YES (README + code) | N/A | N/A | N/A | YES (v1.0 already structured note). |
| Look-ahead "you should try X next" | NO | NO | NO (static, not personalized) | NO (semantic, not progression-aware) | NO | YES — AI-judged, capped 2/note, dangling-link UX. |

**Key insight:** **No comparable product has the AI-curated personalized look-ahead edge to unsolved problems.** NeetCode shows a static roadmap; Obsidian Copilot semantic-searches existing notes; LeetHub captures only past. **Look-ahead edges are the v1.1 differentiator.**

---

## Sources

| Source | Confidence | Used For |
|--------|------------|----------|
| `LeetCode-OpenSource/vscode-leetcode` README (verified via `gh api`) | HIGH | Preview UX precedent, "no AI / no contest" gap analysis |
| `QasimWani/LeetHub` `scripts/leetcode.js` (verified via `gh api`) | HIGH | Per-problem README capture model, post-AC trigger |
| `neetcode-gh/leetcode/.problemSiteData.json` (450 entries, verified via curl + grep) | HIGH | Canonical 18-pattern taxonomy |
| `logancyang/obsidian-copilot/src/constants.ts` (verified via `gh api`) | HIGH | Multi-provider enum: OPENROUTERAI, OPENAI, OPENAI_FORMAT, ANTHROPIC, GOOGLE, XAI, AMAZON_BEDROCK, AZURE_OPENAI, GROQ, OLLAMA, LM_STUDIO, COPILOT_PLUS, MISTRAL, DEEPSEEK, COHEREAI, SILICONFLOW, GITHUB_COPILOT |
| `logancyang/obsidian-copilot` README (verified via `gh api`) | HIGH | Set-Keys flow, OpenRouter recommended-default pattern |
| Continue.dev `docs.continue.dev/customize/model-providers/overview` (WebFetch) | MEDIUM | YAML config schema with `apiKey` + roles `[chat, edit, apply]`; 40+ provider list |
| LeetCode native virtual contest UI behavior | MEDIUM | 90-min weekly / 100-min biweekly; ICPC-style penalty pattern (training data + community wiki references; live page 403'd) |
| Project's `CLAUDE.md` Conventions section | HIGH | `'leetcode.*'` userEvent annotation requirement for plugin CM6 dispatches into locked ranges |
| Project's `PROJECT.md` Out-of-Scope + Constraints | HIGH | "BYO key only", "no telemetry", "leetcode.com only", "isDesktopOnly" — non-negotiable boundaries |
| Project's `MILESTONES.md` v1.0 Delivered | HIGH | What v1.1 can build on (CodeActionsWidget, KnowledgeGraphWriter.onAccepted, section-lock, ProblemBrowser, turndown, etc.) |
| Cursor / Copilot Chat (training data; docs URL 404'd) | LOW | "User-triggered AI universally preferred over auto-AI" pattern recognition |

---

## Confidence Summary

| Domain | Confidence | Why |
|--------|------------|-----|
| Pattern-cluster taxonomy (18 NeetCode patterns) | HIGH | Source data file verified; 450 entries enumerated |
| Multi-provider settings UX pattern | HIGH | 17-provider enum + Set-Keys flow extracted from Obsidian Copilot source |
| Preview UX (right-click / preview-before-create) | HIGH | vscode-leetcode README explicit |
| Inline-vs-sidebar AI rendering decision | MEDIUM | Obsidian Copilot uses both; choice for our case driven by Obsidian-native graph philosophy from PROJECT.md, not single canonical source |
| Contest scoring formula (LC virtual) | MEDIUM | Penalty pattern (5 min/wrong) corroborated across LC + Codeforces ICPC; exact base points vary per contest — recommendation is "render LC's published values, don't invent" |
| Look-ahead edges UX | LOW | No direct precedent in any comparable product; recommendation is novel synthesis. **Validation needed during v1.1 dogfood.** |
| Migration strategy | MEDIUM | Three-option analysis is structured; recommendation is conservative (opt-in default); real-world validation requires v1.1 dogfood |

---

## Gaps and Open Questions for Roadmap

1. **Streaming HTTP transport for AI providers.** v1.0 uses `requestUrl` for LC. AI streaming requires `fetch` (since `requestUrl` returns full body). Crosses v1.0 convention. **Likely a STACK addition, not a FEATURE concern.**
2. **Section-lock extension for `## AI Review`.** Need to extend `sectionLockExtension.ts` to lock the new section. Per CLAUDE.md, plugin writes via `vault.process` bypass the lock — same pattern as `copyToCode.ts`. Document up front.
3. **Look-ahead edge target stub generation.** When AI references `[[1234-skyline-problem]]` and user clicks, what fires? Preview tab? Auto-create stub? Recommendation: preview-first, stub-on-explicit-Start. Confirm in design phase.
4. **Cost-disclosure threshold.** Per-call estimate in toast? Settings-tab summary? Sidebar widget? Recommendation: settings-tab summary + per-call toast — defer details.
5. **Pattern-cluster hub note format.** Bases query? Dataview-style code block? Static auto-updated list? Likely Bases (matches v1.0 `LeetCode.base`); confirm in design phase.
6. **AI cluster disagreement handling.** "Wrong, this isn't sliding window, it's prefix sum." Manual override mechanism? Recommendation: defer to v1.2; surface as known limitation in v1.1 README.

---

*Feature research for: Obsidian LeetCode v1.1 (Contest, AI Coach, Preview).*
*Researched: 2026-05-14*
