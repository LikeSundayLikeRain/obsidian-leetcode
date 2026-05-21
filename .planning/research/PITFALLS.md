# Pitfalls Research — v1.1 (Contest, AI Coach, Preview)

**Domain:** Adding LLM, virtual contest, and read-mode preview surfaces to a shipped Obsidian plugin
**Researched:** 2026-05-14
**Confidence:** HIGH (Obsidian Developer Docs + Developer Policies via Context7 + obsidian-api d.ts + eslint-plugin-obsidianmd 0.3.0 README + community plugin source review of Copilot for Obsidian + Smart Connections + LeetCode-Query)

---

> **Scope note.** This document covers v1.1 milestone pitfalls only. The v1.0-era pitfalls (CORS via `requestUrl`, session expiry, CSRF, frontmatter mangling, BrowserWindow security, etc.) are already mitigated in production code and live in
> `.planning/milestones/v1.0-research/PITFALLS.md` (archived). Don't re-litigate them — but when a v1.1 feature *touches* a v1.0 convention (e.g., section lock, `'leetcode.*'` userEvent, `vault.process`), it shows up here as a regression risk.

---

## Critical Pitfalls

### Pitfall 1: Bundling an LLM SDK That Pulls Node-Only Transports

**What goes wrong:**
You `npm install @anthropic-ai/sdk` or `openai` and import the official client. The SDK transitively pulls `axios`, `node-fetch`, `https`, `agent-base`, `form-data`, etc. Some pieces (`https.Agent`, custom keepalive agents, `tls.connect`) are Node-only and either (a) blow up the esbuild output to 1–2 MB, (b) crash at runtime when imported in Obsidian's renderer with `Cannot read property 'Agent' of undefined`, or (c) fall back to `fetch()` which is then blocked by Electron CORS — exactly the problem v1.0 already solved with `requestUrl`. Confirmed pattern from Copilot for Obsidian: it does not use the official OpenAI/Anthropic SDKs as their wire layer; it sits on LangChain abstractions and routes through its own request layer.

**Why it happens:**
Official LLM SDKs target Node servers and the browser, not Electron renderers with web-security on. The Anthropic SDK ships an HTTPS agent with custom keepalive; the OpenAI SDK ships axios; both fail "softly" — they appear to work in dev (your dev vault may have CSP relaxed, or you may be running with `Tools → Developer Tools` open) and fail on real users.

**How to avoid:**
- **Do not** install `@anthropic-ai/sdk`, `openai`, or `aws-sdk` as production deps. Treat the AI provider layer as a *thin transport over `requestUrl`*.
- Build a single internal `AIProvider` interface (~80 LOC, 5 implementations) that constructs the request body, sets headers, calls `requestUrl`, and parses the response. Each provider is one switch case in a factory.
- For Bedrock, see Pitfall 4 below — SigV4 signing is enough work to *defer Bedrock to v1.2*.
- Pin the bundle-size budget at < 500 KB in CI (current is ~163 KB; AI + contest + preview should fit in a 300 KB headroom).

**Warning signs:**
- `node_modules/@anthropic-ai/sdk` or `node_modules/openai` showing up after `npm install`
- esbuild bundle jumps > 100 KB after AI integration lands
- Runtime error `Cannot find module 'https'` or `agent-base` in the dev console

**Phase to address:** Phase 06 (AI provider layer). Pick the abstraction *before* writing the first AI call.

---

### Pitfall 2: `requestUrl` Cannot Stream — But Users Expect ChatGPT-Style Token Drip

**What goes wrong:**
You wire up AI Debug. The user clicks "AI: Debug." Twenty seconds of silence pass. Then the entire reply pastes in at once. The user thinks the plugin hung and clicks again, double-charging their API key. This is **not a bug** — it is `requestUrl`'s contract. Verified against Obsidian Developer Docs (Context7, fetched 2026-05-14): `RequestUrlParam` accepts `url`, `method`, `headers`, `body`, `contentType`, `throw` — no streaming, no chunked callback, no `onProgress`. The response promise resolves only when the body is fully buffered. There is no `ReadableStream`, no SSE consumer, no incremental delivery primitive.

**Why it happens:**
Streaming requires a transport that fires events as bytes arrive. `requestUrl` is implemented in the Obsidian main process and resolves in one shot for CORS-safety reasons. Native `fetch()` does support `ReadableStream`/SSE — but using `fetch()` re-introduces the v1.0-era CORS problem for cross-origin AI endpoints (Anthropic, OpenAI, OpenRouter all return CORS errors from the renderer). Smart Connections' core README emphasizes "minimal/no dependencies" precisely because handling this layer well is hard; it offloads the wire layer to a separate Pro plugin.

**How to avoid (pick one of three, in this order of preference):**
1. **Non-streaming with strong "thinking" UX** (recommended for v1.1). Show a typing indicator + abort button + elapsed-time counter. After 30 s show "Still thinking…" with reassurance. Most LLM responses for code review are < 8 s; the UX cost of no streaming is small if the indicator is honest. **This is what Copilot for Obsidian falls back to when `requestUrl` is configured**.
2. **Native `fetch()` with `ReadableStream` for streaming endpoints only**. Works for Ollama (localhost — no CORS) and OpenRouter (which sets permissive CORS). **Does NOT work for Anthropic or OpenAI direct** — both reject browser-origin requests. Document the asymmetry in the settings help text.
3. **Polling-based pseudo-stream**. Some providers (Anthropic with `stream: true` over HTTPS) deliver chunked data. Even `requestUrl` will buffer the full body — but if you set a longer connect timeout and abort on the user's "Cancel" button, the UX cost is acceptable. **Do not** invent a poll loop on a partial stream — providers don't support resume.

**Warning signs:**
- A "streaming" code path that calls `requestUrl({ stream: true })` (no such option exists)
- User reports "the plugin froze" after clicking AI Debug
- Test against `https://api.anthropic.com` from native `fetch()` returns CORS error (proof you must use `requestUrl`)

**Phase to address:** Phase 06 (AI provider transport) — make non-streaming the default, document the asymmetry. Phase 07 (AI Debug UX) — invest in the "thinking" indicator.

---

### Pitfall 3: API Keys in `data.json` Without Disclosure = Plugin-Store Rejection

**What goes wrong:**
You store the OpenAI / Anthropic key as `aiKey: "sk-ant-..."` in `data.json` (which is the only practical option — Obsidian has no secure-keystore API for plugins). The store reviewer reads your README, sees no mention of "API key stored locally in plugin data," compares against Obsidian's developer policy ("Clearly explain which remote services are used and why they're needed") and Submission Requirements, and rejects the v1.1 release.

Even if it passes review, the *user-facing* problem is real: `data.json` is plaintext on disk in the user's vault under `.obsidian/plugins/obsidian-leetcode/data.json`. Anything that backs up the vault folder (Obsidian Sync, iCloud, Git, Dropbox) now has the user's API key in it. A user who shares their vault for collaboration leaks the key.

**Why it happens:**
Obsidian deliberately does not provide a system keychain API (Plugin guidelines: see Plugin → Plugin data); plugins are sandbox-equivalent. Plaintext is the only option. Developers assume this is acceptable (it is, with disclosure) but forget the disclosure, or write a vague "uses your API key" without naming the destination services.

**How to avoid:**
- Add a **dedicated README section** titled "AI provider configuration & data flow." It must list, by name, every endpoint the plugin can hit — `api.anthropic.com/v1/messages`, `api.openai.com/v1/chat/completions`, `openrouter.ai/api/v1/chat/completions`, `bedrock-runtime.{region}.amazonaws.com`, `localhost:11434/api/chat` (Ollama), and any custom base URL the user configures.
- State explicitly: "Your API key is stored in `.obsidian/plugins/obsidian-leetcode/data.json` in plaintext. Do not commit this file to a public repo. Sync services (Obsidian Sync, iCloud, Dropbox) will replicate it."
- In the **AI settings tab**, render a small inline note next to the API-key field with the same warning. Use `Setting.setDesc()` — never `innerHTML`.
- Mask the key field with `Setting.addText(t => t.inputEl.type = "password")`.
- **Never `console.log` the key.** Add an ESLint custom rule (or grep) for `console.log(.*Key)` to catch slips in CI.
- Add a "Clear AI key" command in command palette so users have an explicit revocation path.

**Warning signs:**
- README v1.1 diff has no new "AI" section
- Settings page shows `text` input (not `password`) for the key
- Any logger in `src/ai/*` that interpolates the key into a string

**Phase to address:** Phase 06 (AI settings tab) — disclosure, masking, clear command. README update is a hard prerequisite for the eventual v1.1 release PR.

---

### Pitfall 4: Bedrock SigV4 Is a Trap — Either Cut It Or Spend a Phase On It

**What goes wrong:**
"Multi-provider via BYO key + base URL" sounds uniform across Anthropic, OpenAI, OpenRouter, and Ollama — they're all `Bearer <key>` or no-auth. Bedrock breaks the model. AWS Bedrock requires SigV4 request signing: HMAC-SHA256 of a canonical request including timestamp, headers, body hash, region, service, and your AWS access key + secret. Doing it correctly requires either:
- The `aws-sdk` (~600 KB minified, plus transitive node-only deps — see Pitfall 1)
- The much smaller `@aws-sdk/signature-v4` (~30 KB) but it pulls `@smithy/*` deps that depend on Node `crypto`, `buffer`, `stream`
- Hand-rolling SigV4 (~150 LOC of crypto, easy to get subtly wrong; signing is opaque to debug)

Bedrock also requires region-specific endpoints, IAM role assumption (if the user uses STS), and inferenceProfile vs modelId routing. None of this fits the "set base URL + key" mental model the rest of the providers share.

**Why it happens:**
Bedrock is in the "5 providers" list because it sounds like a checkbox feature. In practice it is a separate ecosystem.

**How to avoid:**
- **Drop Bedrock from v1.1.** Ship Anthropic + OpenAI + OpenRouter + Ollama. That's 4 providers covering ~95% of users (per OpenRouter's own usage stats; Anthropic + OpenAI dominate). OpenRouter itself can route to Bedrock-hosted models for users who insist.
- If a user must hit Bedrock, document that they should use **Bedrock Access Gateway** or **LiteLLM** — both expose an OpenAI-compatible REST endpoint that re-signs SigV4 server-side. The plugin then talks to that gateway as if it were OpenAI.
- If Bedrock is non-negotiable, dedicate a separate phase, accept the bundle-size hit, and isolate it behind a dynamic import so users who don't enable Bedrock never load the SigV4 code.

**Warning signs:**
- Roadmap has "Bedrock" listed as a 1-day task
- Anyone proposes `aws-sdk` as a dependency
- You're reading SigV4 spec at midnight to figure out why a 403 says nothing useful

**Phase to address:** Phase 06 (provider abstraction) — explicitly scope to 4 providers + custom OpenAI-compatible base URL. Document the LiteLLM/Bedrock Gateway escape hatch in README.

---

### Pitfall 5: Multi-Provider Over-Engineering — The Adapter Trap

**What goes wrong:**
You start with a clean `AIProvider` interface, then add abstractions: `Tokenizer`, `RateLimiter`, `RetryPolicy`, `MessageFormatter`, `ToolUseAdapter`, `StopSequenceMapper`. Each provider gets a 200-line class. After two weeks the AI module is 2,000 LOC for 4 providers, the abstractions leak (Anthropic uses `system` field, OpenAI uses `system` role, neither uses the other's), and changes to one provider ripple through five files. This is the exact failure mode that drove LangChain to its current size.

**Why it happens:**
"Multi-provider" is treated as a deep architecture problem. It is not — it is four providers that all accept JSON, return JSON, and have *cosmetic* shape differences. Abstracting that is over-engineering.

**How to avoid:**
- **Smallest abstraction that works for 4 providers**: a single async function `chat(provider, model, key, messages, options): Promise<AIResponse>`, plus per-provider request/response transformers (~30 LOC each). No classes, no DI. Total ~250 LOC.
- Provider-specific quirks (Anthropic's `system` is a top-level field, OpenAI's is a role-`system` message) live in the per-provider transformer — *not* in a shared `MessageFormatter`.
- Token counting? Don't count. Pass through whatever messages the user sent. If the call fails with "context too long," surface the provider error verbatim and let the user shorten input.
- Rate limiting? Don't implement client-side. Each AI call is user-triggered (debug button, AC review). The user is naturally rate-limited.
- Retry? Once on transient (5xx, 429) with 2 s delay; never on 4xx (it's wrong-input).
- *Use existing patterns from v1.0*: a `LeetCodeApiClient` thin wrapper exists in `src/api/`. Mirror that style — one function per intent, no class hierarchy.

**Warning signs:**
- AI module exceeds 500 LOC before the first model is wired
- A `BaseProvider` abstract class
- A `ProviderRegistry` or factory-of-factories
- More than two layers of indirection between `chat()` and `requestUrl()`

**Phase to address:** Phase 06 (AI provider layer). Set a 400-LOC budget for the entire AI provider directory before any abstraction work.

---

### Pitfall 6: Cost Surprise — 3 LLM Calls Per Accepted Submission

**What goes wrong:**
The "AI ACed Review" feature fires three LLM calls per Accepted: Approach, Efficiency, Code Style. A power user grinds 10 problems a session, 3 sessions a week → 90 calls/week. With Claude Sonnet pricing (~$3/M input, $15/M output) and ~3K input + ~1K output tokens per call, that's roughly $1.80–$2.50/week, $100/year. Users notice on their first month's bill, blame the plugin, leave a 1-star review.

**Why it happens:**
"AI on every Accepted" feels like the feature. The cost is invisible until the bill arrives. Plugins like Copilot for Obsidian solve this by letting users pay Brevilabs for a subscription tier that bundles cost predictability — that option is **not available** to a BYO-key plugin.

**How to avoid:**
- Make AI ACed Review **opt-in per-Accepted, not automatic.** Add an inline button under the verdict: `AI Review` (one click, runs the 3-call pipeline). Default-off in settings.
- Settings option: "Auto-run AI review on Accept" (boolean, default false).
- Settings option: "Combine review dimensions into one LLM call" (boolean, default true) — one call producing all 3 dimensions reduces cost ~3x at the price of slightly longer prompts.
- After every AI call, log a per-call line item to a local `AIUsageStats` (in `data.json`, capped at 100 entries, displayed in the settings tab as "Estimated this month: ~$X based on your model"). Use the provider-reported `usage.input_tokens` / `usage.output_tokens` — never invent numbers.
- README must list "Cost expectations" — link Anthropic and OpenAI pricing pages, give a per-AC estimate.
- Add a hard cap setting: "Max AI calls per day" (default 50). When hit, disable buttons until midnight; show a banner. This protects users who accidentally configure a tight loop.

**Warning signs:**
- AI review code path that has no opt-in toggle
- No `usage` logging anywhere in `src/ai/`
- README has no "Cost" section

**Phase to address:** Phase 08 (AI ACed Review) — opt-in by default, usage tracking, README cost section.

---

### Pitfall 7: Privacy — Sending User Code (Including Comments) to a Third Party

**What goes wrong:**
The "AI Debug" and "AI ACed Review" features send the user's entire `## Code` block to a third-party LLM. The user's code may contain:
- Personal comments ("// TODO: ask Sarah about this approach")
- Their employer's internal IP if they're solving LC problems with work-related code
- Hardcoded credentials they pasted while debugging
- Their personal style/identity (which is then used by the LLM provider for training, depending on provider settings)

A privacy-conscious user does not realize the plugin sends every character of their solution to Anthropic / OpenAI. Plugin reviewers may flag this as inadequate disclosure.

**Why it happens:**
"AI Debug" is named after the action, not the data flow. The user thinks "the plugin debugs my code" — they don't think "the plugin uploads my code to Anthropic, who can train on it depending on their ToS."

**How to avoid:**
- The first time the user clicks AI Debug or enables AI ACed Review, show a one-time **modal** disclosing: "This will send your code, the problem statement, and any error message to {Provider Name} ({base URL}). Your API key is used. The provider's data retention policy applies. [Provider Privacy Policy link]"
- Modal has two buttons: "Send" and "Cancel and disable AI features."
- After acknowledgement, store `ai.disclosure-acknowledged: <timestamp>` in `data.json` and don't show again for that provider. Re-show if the user changes provider in settings.
- README **must** dedicate a "What gets sent to your AI provider" subsection. List: code from `## Code`, problem title + statement (already public from leetcode.com), error message from the last failed run/submit. Explicit list of what does **not** get sent: frontmatter beyond `lc-id`, other vault notes, session cookie.
- Provide a "Sanitize before sending" toggle that strips `// TODO`, `// FIXME`, and lines containing `password|secret|key|token` (case-insensitive). Default off (most users would find it confusing); document clearly in settings.

**Warning signs:**
- No modal anywhere in the AI Debug code path
- README has no "Data sent to AI provider" subsection
- Logger emits the prompt to console (now the user's whole code is in their dev tools log)

**Phase to address:** Phase 07 (AI Debug) and Phase 08 (AI ACed Review). The disclosure modal is required for both — implement it once in Phase 07 and reuse.

---

### Pitfall 8: Hallucinated Slugs in Look-Ahead Wikilinks

**What goes wrong:**
The "AI knowledge graph" feature asks the LLM to suggest forward edges to problems the user hasn't solved yet. The LLM returns:

```markdown
## Related Variants
- [[0567-Permutation in String]]
- [[0904-fruit-into-baskets]]
- [[1234-sliding-window-extreme]]   ← does not exist on leetcode.com
```

The third link is hallucinated. When the user clicks it, Obsidian creates an empty stub note with that filename — polluting the vault. Worse, the AI sometimes returns *renamed* slugs (LC has occasionally renamed problems), so even the format-checking pattern `\d{4}-[a-z-]+` fails to flag it.

**Why it happens:**
LLMs are excellent at producing plausible-looking LC slugs and IDs — they were trained on LC content. They are not connected to the live LC problem database. There is no syntactic signal of hallucination.

**How to avoid:**
- **Validate every AI-proposed slug against the local problem index before writing.** v1.0 already maintains a slug → id index in `data.json` (problems list cache). Add a `validateSlug(slug: string): {valid: boolean, canonicalSlug?: string, id?: string}` helper. Drop unknown slugs silently; log them at debug level.
- The AI prompt should **provide a list of candidate slugs** rather than ask the LLM to recall from training data. Pass the top ~50 problems from the same topic-tag cluster; ask the LLM to pick from that list. This converts the recall problem into a ranking problem (LLMs are much better at ranking).
- For problems the user *has not solved yet*, look-ahead edges write `[[id-slug|Display Title]]` with the canonical id-slug, **even though the note doesn't exist yet**. The user clicking the wikilink triggers the existing v1.0 "open problem as note" flow, which fetches the problem and creates the note properly. Never write a stub note pre-emptively.
- After cluster generation, walk the resulting wikilinks once with `validateSlug`; drop anything that fails; log a warning to the dev console with the full LLM output for debugging.

**Warning signs:**
- Look-ahead wikilink writer has no validation step
- LLM prompt asks "suggest related problems" without providing a candidate set
- Empty stub notes appearing in the vault after a Knowledge Graph run

**Phase to address:** Phase 09 (AI knowledge graph) — slug validation must be implemented in the *first* PR of that phase, not added later.

---

### Pitfall 9: Pattern-Cluster Naming Drift — "Sliding Window" vs "Two Pointers Window"

**What goes wrong:**
You ask the LLM to name the cluster for "Longest Substring Without Repeating Characters." Today it answers "Sliding Window." Tomorrow, with a different temperature seed or a slightly different problem-set context, it answers "Two Pointers Window," "Variable-Length Sliding Window," or "Hash + Window." Each unique name produces a *separate* cluster hub note, fragmenting the user's knowledge graph: `[[Sliding Window]]`, `[[Two Pointers Window]]`, `[[Variable Sliding Window]]` all exist with one or two backlinks each, instead of a single coherent cluster of 30 problems.

**Why it happens:**
LLMs do not maintain a deterministic vocabulary across calls. Asking for a "name" is open-ended. The user has no taxonomy enforcement.

**How to avoid:**
- Maintain a **canonical cluster vocabulary** in plugin data (`data.json` → `aiClusterTaxonomy: string[]`). Bootstrapped from a curated list of ~40 well-known patterns (Sliding Window, Two Pointers, BFS/DFS, Topological Sort, Trie, Union-Find, Segment Tree, Bit Manipulation, Backtracking, Greedy, Dynamic Programming on Subsequences, Dynamic Programming on Intervals, Monotonic Stack, Heap (Priority Queue), Binary Search on Answer, Graph Shortest Path, etc. — see [Algorithm Patterns Cheat Sheet](https://hackernoon.com/14-patterns-to-ace-any-coding-interview-question)).
- AI prompt structure: "Pick **exactly one** name from this list. If none fit, answer `OTHER` and propose a name. Existing names: [list]." This converts free-form naming into constrained classification.
- When the LLM answers `OTHER`, the plugin prompts the user once: "AI proposed a new pattern category: 'X'. Add to your taxonomy? [Yes / Use 'Y' instead / Skip]." User decisions persist back to the taxonomy.
- After taxonomy bootstrap, use embedding similarity to dedupe near-duplicates: when adding a new entry, check cosine sim against existing entries (offline embedding model is overkill — string similarity > 0.85 suffices). Surface dedupes to the user before committing.
- **Migration of v1.0 ## Techniques sections.** Existing v1.0 notes have `[[Two Pointers]]`-style links generated from `lc-tag` slugs. Phase 09 needs an explicit migration plan: keep `## Techniques` as a frozen historical section, write the new AI clusters to a separate `## Patterns` section, OR provide a one-time "merge legacy techniques into AI clusters" command. **Do not silently rewrite `## Techniques` on existing notes** — the section lock + user trust both forbid silent rewrites of v1.0 content.

**Warning signs:**
- AI prompt phrased as "what pattern is this?" (open-ended)
- Vault graph shows multiple cluster hubs with overlapping membership (1–2 backlinks each)
- No `aiClusterTaxonomy` in plugin data schema

**Phase to address:** Phase 09 (AI knowledge graph). Taxonomy + dedup must precede any cluster-write code. Migration command is a separate plan within the same phase.

---

### Pitfall 10: Migrating v1.0 `## Techniques` Without Section-Lock Awareness

**What goes wrong:**
The migration code reads existing v1.0 notes and rewrites the `## Techniques` section to point at AI clusters instead of `lc-tag` techniques. It uses `vault.modify()` (or worse, `editor.dispatch()`) — and either (a) overwrites user edits in the body that occurred during the migration window, or (b) gets silently dropped by the section-lock changeFilter (CLAUDE.md "section lock" convention). Either way: data loss or a no-op that the migration logs as success.

**Why it happens:**
The v1.0 section lock (Plan 05.5) was designed to prevent stray edits. It treats `## Techniques` as a plugin-owned heading. New developers (or future-you) writing the migration may not realize the lock exists, write to the active editor with `cm.dispatch()`, and silently lose the edit. Or they correctly use `vault.process()` but forget that vault writes don't go through the lock — and when the user has the file open and is editing, the file content read inside `process()` may not match the on-screen content.

**How to avoid:**
- **All migration writes go through `vault.process()`** (per v1.0 convention CF-06). Never `cm.dispatch()`, never `vault.modify()`.
- If a `cm.dispatch()` *is* required (e.g., to refresh the user's view after migration), it must set `userEvent: 'leetcode.migrate-techniques'` per the `'leetcode.*'` userEvent convention.
- **Don't migrate the active note** while the user has it open with unsaved changes. Detect via `app.workspace.getActiveFile() === file` and the editor having pending updates (CM6 `view.state.doc.toString() !== await vault.read(file)`); skip and log "active with unsaved changes — re-run migration after save."
- Migration is a **command-palette action**, not automatic on plugin update. Show a confirmation modal: "Migrate N notes from v1.0 lc-tag Techniques to v1.1 AI clusters? This will rewrite the `## Techniques` section in each note. A backup will be written to `LeetCode/.migration-backup-{timestamp}.json`."
- Write the backup *before* any vault.process write. Backup format: `{path, originalSection}[]`.
- Migration runs in batches of 10 with 100 ms delay between batches to avoid blocking the UI. Show a progress notice via `Notice` (not a custom progress bar — keep it native).
- If the migration is interrupted or the plugin crashes mid-batch, the next plugin load detects an in-progress migration via a flag in `data.json` and prompts the user to resume or roll back.

**Warning signs:**
- Migration code calls `editor.replaceRange()` or `editor.dispatch()`
- No backup writer before the first vault.process call
- No batching (`for...of` over the full vault file list)
- No "active with unsaved changes" guard

**Phase to address:** Phase 09 (AI knowledge graph) — dedicated migration plan within the phase. The backup writer is a hard prerequisite for the migration command.

---

### Pitfall 11: Contest Timer That Drifts on Sleep / Reload

**What goes wrong:**
Virtual contest timer uses `setInterval(tick, 1000)`. Two minutes into a 90-minute contest the user closes their laptop. Forty minutes later they reopen. The timer thinks 2 minutes elapsed (interval was suspended during sleep). Or the user accidentally reloads the plugin (Cmd+R, or a config tweak) — `setInterval` is gone, the timer state is gone, the contest is gone.

**Why it happens:**
- `setInterval` is wall-clock-based, not monotonic. Browsers/Electron pause timers when the system sleeps.
- Plugin reload tears down all in-memory state including `setInterval` handles.
- Naive timer code calls `tick++` instead of computing `elapsed = Date.now() - startTimestamp`.

**How to avoid:**
- **Persist contest state to `data.json` on start** with: `{contestId, startedAt: Date.now(), durationMs, problems: [{slug, status, attemptsLog: [{at, verdict}]}]}`.
- **On every tick (or every 5 s, batched), update `data.json` with the latest state.** Use `this.app.fileManager` for atomic writes (`saveData()` is atomic).
- **Compute remaining time as `durationMs - (Date.now() - startedAt)`**, not by decrementing a counter. This is wall-clock-correct across sleep.
- **On plugin load, check for an active contest** (`startedAt + durationMs > Date.now()`). If found, prompt: "Resume contest in progress? {N minutes remaining}." User can resume or abandon.
- **Use `this.registerInterval(window.setInterval(...))`** so the interval is cleaned up on plugin unload. Never bare `setInterval`. (Already enforced by `eslint-plugin-obsidianmd/prefer-window-timers`.)
- During contest, register an `onbeforeunload` handler that prompts: "Contest in progress — are you sure you want to close Obsidian?" Use `window.onbeforeunload` (not `app.workspace.on('quit', ...)` — workspace quit fires too late).

**Warning signs:**
- Any `tickCount++` or decremented-counter pattern
- No `startedAt` or equivalent timestamp in contest data schema
- Bare `setInterval(...)` in `src/contest/`

**Phase to address:** Phase 10 (Contest virtual mode) — persistence schema + monotonic clock are foundational; build them in the first plan.

---

### Pitfall 12: Past-Contest API Surface Is Not Documented and Slugs Drift

**What goes wrong:**
You build "Surprise me" by picking a random number 1–375 and constructing `weekly-contest-{n}` or `biweekly-contest-{n}`. Some of those slugs (a) don't exist (gaps in numbering), (b) point to contests with deprecated problems (LC has occasionally removed problems from its public list — they 404 on the problem GraphQL query but the contest's question list still references them), or (c) have authentication-gated content (premium-only contests). Users hit "Surprise me," get a contest, and one of its 4 problems errors out mid-contest.

LeetCode's contest API is partially undocumented; `LeetCode-Query` exposes a "user contest records" endpoint but **not** "list past contests" or "fetch contest problems by slug" (verified 2026-05-14). The plugin must hand-roll those queries against the GraphQL endpoint.

**Why it happens:**
LC contest GraphQL queries are reverse-engineered from the LC frontend (browser DevTools → Network). They are subject to schema drift (Pitfall 14 in v1.0 file). LC has also rebranded some contests and removed old ones.

**How to avoid:**
- **Never construct contest slugs by random integer.** Maintain a known-good `contestCatalog` in `data.json` populated from a single GraphQL query on plugin load (`pastContests` or equivalent — verify the exact query name from LC's website Network tab; expect `topTwoContests`, `pastContests`, or `contestList`).
- The catalog stores `{slug, title, startTime, problemSlugs: string[]}`. Refresh weekly or on user request.
- "Surprise me" picks a random entry from the catalog **and verifies all 4 problem slugs are still fetchable** via a parallel `Promise.allSettled` of problem-detail queries. If any 404, pick a different contest. Cap retries at 3; surface "Couldn't find a fully-available contest. Try again later" if all retries fail.
- For premium-only contests: detect via the contest GraphQL response (presence of `isPremium` or `paidOnly` fields) and skip; show a nicer error than 403 from the problem fetch.
- Contest selection respects user difficulty preference: filter catalog to contests with at least one problem matching the user's difficulty band.
- Cache the catalog on disk in plugin data (similar pattern to v1.0 problem-list cache from Pitfall 8 of v1.0 file).

**Warning signs:**
- `Math.random() * 375` in contest selection code
- No `contestCatalog` in data schema
- Contest start without a pre-fetch of all 4 problems
- A user reports "contest started but problem 3 failed to load"

**Phase to address:** Phase 10 (Contest virtual mode) — catalog + verification before any "Surprise me" UI.

---

### Pitfall 13: Submission Rate Limit During Contest

**What goes wrong:**
v1.0's hand-rolled run/submit code uses a 20-req-per-10-s rate limiter (per the existing `mutex` / rate-limit pattern in v1.0 PITFALLS file Pitfall 8 + the LeetCode-Query convention). During a contest, a user runs and submits across 4 problems rapidly: ~3 runs + 1 submit per problem × 4 problems × maybe 2 attempts each = 32 requests in a few minutes. The rate limiter throttles, the user sees `Notice: Rate limited, retrying...` mid-contest, the timer is running, panic ensues.

LC enforces its own server-side rate limiting on submissions (separately from queries). During real contests LC explicitly warns users not to spam submissions; the run/submit/check chain has its own backoff. The plugin's client limiter and LC's server limiter compound: both fire simultaneously and the user is doubly throttled.

**Why it happens:**
The 20/10 rate limiter was set conservatively for v1.0 problem browsing, not for active solving. v1.0's "Run / Submit" UX assumed a single problem at a time. Contest mode breaks that assumption.

**How to avoid:**
- **Increase the rate limiter ceiling for run/submit endpoints during contest mode** — e.g., 60 requests per 10 s (still conservative; LC's actual server limit is higher). Set this *only when contest mode is active* via a contest-aware mutex configuration.
- **Surface 429 / rate-limit errors clearly during contest**: distinct toast color, link to a "what does this mean" help, optionally "your submission is queued, retrying in N s." Never lose the submission silently.
- **Pre-flight: detect LC submission cooldown.** Some LC errors return `{"detail": "Please wait ... seconds before submitting again"}`. Parse this and show the cooldown to the user — don't retry against the cooldown window, you'll just compound it.
- Document in README: "Contest mode shares LC's submission rate limit. Rapid-fire submissions across 4 problems may briefly cooldown."

**Warning signs:**
- Rate limiter is global and not aware of contest mode
- 429s during contest are shown as a generic "Network error"
- No backoff parsing on LC's "wait N seconds" message

**Phase to address:** Phase 10 (Contest virtual mode) — rate-limiter mode-awareness; Phase 11 (contest summary / polish) — UX for rate-limit messages.

---

### Pitfall 14: Preview Mode That Silently Creates Notes

**What goes wrong:**
The "Preview Mode" feature is supposed to show a problem **without** creating a vault note. The user clicks a problem in the browser; expected: read-mode preview tab. Actual: the plugin uses `app.workspace.openLinkText()` (which opens-or-creates a file) or `app.vault.create()` (which definitely creates) for the preview surface. Now the vault has a `0001-two-sum.md` file the user never asked for.

A worse variant: the preview **does** use a custom `ItemView`, but on the way the code calls `app.workspace.getLeaf(true)` and somewhere later, on the "Start Problem" button, calls `vault.create()` and silently *also* opens the existing preview tab — leaving two tabs (one preview, one note) for the same problem.

**Why it happens:**
Obsidian has no first-class concept of "ephemeral file-less tab" beyond `ItemView`. Custom `ItemView` is the right tool but has edge cases (no native pinning, no Obsidian-Sync, no link resolution for back-references). Developers reach for `openLinkText()` because it's one line and "feels" right.

**How to avoid:**
- **Preview is an `ItemView` registered with a custom view type** (e.g., `lc-problem-preview`) — same pattern v1.0 uses for the right-sidebar problem browser. No `TFile` is created; the view holds the problem in memory and renders read-mode markdown.
- **Render the problem markdown via `MarkdownRenderer.render(this.app, markdown, container, sourcePath, this)`** (the `prefer-active-doc` and `no-plugin-as-component` rules from `eslint-plugin-obsidianmd@0.3.0` are relevant — pass a proper `Component`, not the plugin instance, to avoid memory leaks).
- **"Start Problem" button calls the existing v1.0 "open as note" flow**, which creates the note via `vault.create()` if missing. After creation, close the preview tab and switch to the note tab. Use `this.leaf.detach()` after a 100 ms delay to avoid focus-flicker.
- **No accidental file creation paths.** Audit every `vault.create()` and `openLinkText()` call after Phase 11 lands; the preview module should have zero of either.
- **Muscle-memory regression**: existing users currently click a problem in the right-sidebar browser and get a note. Preview changes this to a preview-first flow. Mitigation: settings toggle "Click problem to: (a) Preview first (default new behavior), (b) Open as note (v1.0 behavior)." Default to (a) on fresh installs, default to (b) on upgrade — preserve existing user behavior unless they opt in. Use a one-time onboarding modal on first plugin load after the v1.1 update.

**Warning signs:**
- Preview code path that calls `vault.create()` or `openLinkText()`
- No view-type registration in `onload()` for the preview view
- Settings has no "click behavior" toggle
- After Preview lands, a fresh user click creates a stub note in the vault

**Phase to address:** Phase 11 (Preview Mode) — `ItemView`-based architecture is the *first* design decision. Migration / muscle-memory toggle is a separate plan within the phase.

---

### Pitfall 15: New eslint-plugin-obsidianmd Rules in 0.3.0 (project is on 0.1.9)

**What goes wrong:**
v1.0 ships with `eslint-plugin-obsidianmd@0.1.9`. As of 2026-05-12, the published version is **0.3.0** (verified via npm registry). Between 0.1.9 and 0.3.0, **new rules were added that v1.0 code does not yet violate but v1.1 features will likely trigger**:

- `commands/no-command-in-command-id` — v1.1 adds "Run AI Debug command" / "Start Contest command" — the literal command IDs must not include "command"
- `commands/no-command-in-command-name` — same, for human-facing names
- `commands/no-default-hotkeys` — already enforced; reaffirm for new commands
- `commands/no-plugin-id-in-command-id` — `obsidian-leetcode:contest-start` violates; use `contest-start`
- `editor-drop-paste` — the contest UI may add drop/paste handlers in problem note views; needs `evt.defaultPrevented` check
- `no-forbidden-elements` — `<iframe>`, `<object>`, etc. — relevant if AI streaming UX uses any embed
- `no-global-this` — `globalThis` for "is Node available" probes is common; switch to `window` / `activeWindow`
- `no-plugin-as-component` — the `MarkdownRenderer.render(app, md, el, path, plugin)` antipattern. **The Preview view will call `MarkdownRenderer.render()`** — must pass a proper `Component` (the view itself, since `ItemView extends Component`), NOT `this` (the plugin)
- `no-unsupported-api` — checks the manifest's `minAppVersion`; bumping to a newer Obsidian feature set requires a `minAppVersion` bump
- `prefer-instanceof` — `e instanceof KeyboardEvent` should be `(e as any).instanceOf(KeyboardEvent)` for popout-window safety. Contest timer key handlers will trigger this
- `prefer-window-timers` — already enforced in v1.0; reaffirm for contest `setInterval` / `setTimeout`
- `regex-lookbehind` — iOS Safari restriction. Plugin is desktop-only so lookbehinds are *technically* OK, but the rule errors anyway. Already a gotcha; AI prompt parsing may use lookbehinds inadvertently
- `vault/iterate` — auto-fixable; flags `vault.getMarkdownFiles().find(f => f.path === '...')` patterns. The migration code (Pitfall 10) is a likely violator
- `validate-license`, `validate-manifest` — version bump for v1.1 must keep these passing

**Why it happens:**
Major rule additions in 0.2.x and 0.3.0 are not announced on the eslint-plugin-obsidianmd README's changelog (none ships). The plugin store *will* run the latest version against your PR.

**How to avoid:**
- **Bump `eslint-plugin-obsidianmd` to `^0.3.0`** in the v1.1 milestone's first scaffolding plan. Run `npm run lint` and fix everything before any v1.1 feature code is written.
- Add a CI step that fails the build on any `eslint-plugin-obsidianmd` violation (the project already does this; reaffirm).
- For each new feature area, check the rule list above and confirm:
  - AI commands: clean IDs (Pitfall: `aiDebugCommand` → `ai-debug`)
  - Contest UI: no forbidden elements; no default hotkeys; `prefer-window-timers` honored
  - Preview view: `MarkdownRenderer.render(app, md, el, path, this)` where `this` is the **view**, not the plugin (`no-plugin-as-component`)

**Warning signs:**
- `package.json` still pins `eslint-plugin-obsidianmd@0.1.9` after v1.1 milestone opens
- New AI/contest commands have IDs with "command" or the plugin slug in them
- `lint` task absent from CI

**Phase to address:** Phase 06 first plan — bump eslint-plugin-obsidianmd, run lint, fix all new violations before any feature code.

---

### Pitfall 16: README Network Disclosure Drift

**What goes wrong:**
v1.0 README states: "This plugin communicates with leetcode.com to fetch problems and submit solutions." After v1.1, the plugin can also hit `api.anthropic.com`, `api.openai.com`, `openrouter.ai`, `localhost:11434`, and any user-configured custom base URL — but the README still says only "leetcode.com." A plugin-store reviewer checking the v1.1 release PR sees AI features in the changelog, scans the README, finds no AI disclosure, and rejects (citing Developer Policy: "Clearly explain which remote services are used and why they're needed").

**Why it happens:**
The README is updated late in the release cycle, often after code is done. Network disclosure is treated as boilerplate, not a hard requirement.

**How to avoid:**
- The Phase 06 first plan includes a README update PR alongside the AI provider scaffolding, **not deferred to release prep**.
- The README "Network use" section explicitly enumerates:
  - `leetcode.com` and `leetcode.com/graphql/` (existing; problem fetch + submit)
  - `api.anthropic.com/v1/messages` (when Anthropic is configured)
  - `api.openai.com/v1/chat/completions` (when OpenAI is configured)
  - `openrouter.ai/api/v1/chat/completions` (when OpenRouter is configured)
  - `<user-configured base URL>` (when "OpenAI-compatible" provider is configured — disclose that any URL works and the plugin sends prompts to it)
  - `localhost:11434` or other Ollama URL (when Ollama is configured — local network)
- Each entry has a one-sentence justification (why the request is made, what data is sent, when).
- A "What is NOT sent" subsection: telemetry, analytics, vault file paths, file contents outside `## Code` and `## Problem`.

**Warning signs:**
- v1.1 release PR opens with no README diff
- README mentions "AI" but doesn't list endpoints
- Telemetry / "what is not sent" section is missing

**Phase to address:** Phase 06 (AI provider scaffolding) — README update is part of the plan. Phase 11 (Preview / final polish) — final README audit before release PR.

---

### Pitfall 17: Frontmatter Bloat From Contest / AI Metadata

**What goes wrong:**
The v1.0 `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb` were dropped due to staleness risk (no production reader; values go stale on re-AC; documented in PROJECT.md Key Decisions). v1.1 is tempted to add: `lc-contest-id`, `lc-contest-date`, `lc-ai-cluster`, `lc-ai-review-runId`, `lc-ai-review-cost`, `lc-ai-last-reviewed`, `lc-ai-difficulty-progression`, etc. Each is "useful" in some narrow sense; together they bloat every problem note's frontmatter to 20+ keys, half of which are stale within days.

**Why it happens:**
"Frontmatter is free; just add the field" is a developer mental shortcut. It is not free: it adds visual noise, becomes load-bearing code (any reader of that field becomes a constraint on writers), and v1.0 already learned this lesson with the dropped fields.

**How to avoid:**
- **Default rule: don't add a frontmatter field unless there is a *production reader* of that field.** If the only purpose is "logging" or "potentially useful," store it elsewhere (cluster taxonomy in `data.json`, AI review history in a sidecar `.ai-review-{slug}.json`, contest membership in a contest summary note as wikilinks).
- Per v1.1 feature, the frontmatter additions should be **at most**:
  - **Contest**: nothing, OR `lc-contest: weekly-contest-378` if the user opens problem notes from contest mode and the Bases view filters by contest. Verify with a use case before adding.
  - **AI clusters**: nothing — the `[[Sliding Window]]` wikilink in `## Patterns` *is* the metadata. The cluster hub note's title is the canonical cluster name.
  - **AI review**: nothing in frontmatter. The review *is* the body content under a `## AI Review` section.
  - **Look-ahead edges**: nothing — they're wikilinks under `## Related Variants`.
  - **AI provider used**: nothing — log to `data.json` AIUsageStats only.
- Use `FileManager.processFrontMatter()` exclusively (already a v1.0 convention; reaffirm).
- If a field is added and later removed, write a one-shot migration command that strips it from existing notes. Never leave dead fields.

**Warning signs:**
- A new frontmatter key is added and the only reader is "the migration that wrote it"
- Frontmatter for a v1.1-era note has more than ~10 keys
- A field with a date that auto-updates on every plugin run

**Phase to address:** Every v1.1 phase that touches notes (06, 08, 09, 10, 11). Make "frontmatter additions need justification" a checklist item on every phase's plan.

---

### Pitfall 18: Bundle Size Crossing 500 KB During v1.1

**What goes wrong:**
v1.0 ships at ~163 KB. AI providers + contest UI + Preview view easily add 100–200 KB if implemented naively (LangChain alone is ~250 KB). Crossing 500 KB triggers slower plugin-store review (reviewers manually inspect the bundle for obfuscation), longer plugin load times (large `main.js` blocks Obsidian startup), and a worse user impression on slow machines.

**Why it happens:**
Compound effect of: Pitfall 1 (Node-only AI SDKs), Pitfall 5 (over-abstracted provider layer), Pitfall 4 (Bedrock SigV4), and adding UI frameworks (React, Svelte, Lit) for the contest summary or AI review modals.

**How to avoid:**
- **No UI frameworks.** v1.0 uses only Obsidian's `createEl` / `Setting` / `MarkdownRenderer`. v1.1 must too. The contest summary, AI review modal, and Preview view are all `ItemView` + DOM helpers.
- **Bundle size budget enforced in CI**: `du -b main.js` <= 500_000 as a hard fail; warn at 400 KB.
- **Use `esbuild --analyze`** after each major v1.1 plan lands; review what increased.
- **Tree-shake provider-specific code**: dynamic `import('./providers/anthropic')` so only the providers a user has configured are pulled in (esbuild splits them only if asked; `splitting: true` in esbuild config).
- **No new AI provider SDKs** (Pitfall 1).
- **No `aws-sdk`** (Pitfall 4 — drop Bedrock).
- **No `langchain`, `vercel/ai`, `openai`, `@anthropic-ai/sdk`** as production deps. All are 100+ KB and pull in node-only code.

**Warning signs:**
- `npm run build` reports `main.js > 500 KB`
- `node_modules/langchain` exists
- `package.json` has any of the above as a non-dev dep

**Phase to address:** Phase 06 first plan (CI bundle-size gate). Re-verify at the end of every phase.

---

## Technical Debt Patterns

Shortcuts specific to v1.1 — note that v1.0's debt patterns (no `requestUrl`, no `processFrontMatter`, etc.) are *already* paid down and shouldn't be re-introduced.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use the official Anthropic / OpenAI SDK | Fast first AI call | Bundle bloat, Node-only deps, future ESLint blockers | Never |
| Implement streaming with native `fetch()` for all providers | Token-drip UX | Anthropic / OpenAI direct calls fail with CORS | Only for providers with permissive CORS (OpenRouter, Ollama) |
| Add Bedrock in v1.1 with `aws-sdk` | "5 providers" feature complete | 600 KB bundle hit, hand-rolled SigV4 maintenance | Never in v1.1; defer to v1.2 with a dedicated phase |
| Auto-run AI review on every Accept | Feature feels magical | User cost surprise, 1-star reviews | Never default-on; user must opt-in |
| Skip the LLM input/output disclosure modal | Faster onboarding | Plugin-store rejection, privacy violation | Never |
| Use `vault.modify()` for migration | Simpler API | Section-lock conflict, TOCTOU race | Never — `vault.process()` is mandatory |
| Construct contest slug as `weekly-contest-${random}` | One-line "Surprise me" | Hits deprecated contests, broken problems | Never — use catalog + verification |
| Decrement a counter for contest timer | Trivial code | Drifts on sleep, lost on reload | Never — use `Date.now()` baseline |
| Open preview via `openLinkText()` | One-line "preview" | Creates accidental notes | Never — custom `ItemView` |
| Add `lc-ai-cluster` frontmatter on every note | "Searchable" | Frontmatter bloat, staleness | Only with a justified production reader |
| Pin `eslint-plugin-obsidianmd@0.1.9` for v1.1 | No new lint surprises | Plugin store will run latest; rejection at PR time | Never — bump to `^0.3.0` first thing |
| Skip README "Network use" update for AI endpoints | Less doc churn | Plugin-store rejection | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic API | Use `@anthropic-ai/sdk` directly | Use `requestUrl` + custom request builder (~30 LOC) |
| OpenAI API | Use `openai` SDK directly | Same — `requestUrl` + custom request builder |
| AWS Bedrock | Use `aws-sdk` for SigV4 | Defer Bedrock to v1.2; route via OpenRouter or LiteLLM gateway in v1.1 |
| OpenRouter | Use OpenAI SDK with `baseURL` override | Use a clean OpenRouter request builder; OpenRouter's response shape is OpenAI-compatible but the headers differ (`HTTP-Referer`, `X-Title`) |
| Ollama (local) | Trust user's URL without HTTP scheme | Default to `http://localhost:11434/api/chat`; validate URL begins with `http://` or `https://`; warn if HTTPS missing for non-localhost |
| LeetCode contest GraphQL | Trust an undocumented schema | Cache contest catalog; verify problem slugs before contest start; expect schema drift (Pitfall 14 in v1.0) |
| LeetCode contest "interpret_solution" | Same rate limiter as v1.0 | Mode-aware rate limiter; raise ceiling during contest |
| Obsidian `MarkdownRenderer.render` | Pass plugin instance as the `Component` | Pass the `ItemView` itself (it extends `Component`) — flagged by `no-plugin-as-component` rule (eslint-plugin-obsidianmd 0.3.0) |
| Obsidian `setInterval` for contest timer | Bare global `setInterval` | `this.registerInterval(window.setInterval(...))` — `prefer-window-timers` rule |
| Obsidian wikilink to non-existent note | Write `[[hallucinated-slug]]` and let Obsidian create stubs | Validate slug against local catalog before writing |
| Section-lock-affected migration | `cm.dispatch()` in migration code | `vault.process()` exclusively; or `cm.dispatch` with `userEvent: 'leetcode.migrate-techniques'` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Bundle > 500 KB | Slow plugin load, store review delay | CI bundle-size gate; no UI frameworks; no LLM SDKs | At v1.1 GA if not budgeted |
| 3 LLM calls per AC (no batching) | High user cost | Combine review dimensions into one call (default); opt-in auto-run | At ~10 ACs/week per power user |
| Contest timer tick at 100 ms | UI repaint storm | Tick at 1 s for display; compute remaining as `Date.now() - startedAt` | At any scale — just don't |
| Preview view re-renders on every editor change | Slow scroll, fan noise | `MarkdownRenderer.render` once on view open; cache the rendered DOM | After 30+ minutes of scrolling problem statements |
| Contest catalog re-fetch on every contest start | Slow "Surprise me" | Cache catalog with 7-day TTL; refresh on user request | At every contest start without caching |
| AI cluster recompute over the entire vault | 3+ minute hang on Run | Incremental: only the AC'd note + its 2-hop neighbors | At ~500 problem notes |
| Migration of `## Techniques` runs on plugin load | Obsidian startup hang | Migration is a manual command, batched 10-at-a-time with delay | At any scale — never automate on load |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging the AI API key in any code path | Credential exposure in dev console / log file | Audit `console.log`, `console.debug`, `Notice` for any reference to the key value; never include the key in error messages |
| Sending the LeetCode session cookie to AI provider | Cross-service credential mixing; LC ToS violation | Strict separation: AI calls only see code + problem text + error; never headers from LC requests |
| AI API key checked into the dev vault's `data.json` and committed to a public dotfile / vault repo | API key leak | README warning + masked input; `.gitignore` recommendation in setup docs |
| Trusting user-configured custom base URL without validation | User typos a URL like `https://evil.com/api/openai`; plugin sends prompts there | Validate URL is `http://localhost*` for "Ollama" mode; validate URL has `https://` for cloud providers; show a "you are sending data to {host}" inline warning under the URL field |
| AI response interpreted as code and `eval`'d for "auto-fix" | Remote code execution | Never `eval` AI output; never `new Function()`; AI output is text inserted under `## AI Debug Suggestion` |
| AI response containing wikilinks to user-system paths (`[[../../../etc/passwd]]`) | Path traversal via Obsidian's link resolver | Validate slug format `^\d{4}-[a-z0-9-]+$` before writing |
| LLM-generated commands as command palette entries | LLM-injected command surface | Never derive command IDs / names / handlers from AI output |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| AI Debug shows nothing for 20 s | User thinks plugin hung; clicks again, double-charges | "Thinking..." indicator + abort button + elapsed-time counter |
| AI ACed Review fires on every Accept by default | Cost surprise | Default off; one-click opt-in; "Auto-run" setting with cost warning |
| Contest "Surprise me" picks a contest with broken problems | Mid-contest panic | Pre-flight verify all 4 problem slugs before starting timer |
| Contest timer uses `setInterval` decrement | Drift on sleep, loss on reload | `Date.now()` baseline + persistence to `data.json` |
| Preview opens but doesn't say "this is a preview" | User confused why "Run" button is missing | Banner at top of preview: "Preview Mode — click Start Problem to begin solving" |
| Preview replaces v1.0 click-to-create-note muscle memory silently | Users on upgrade lose existing flow | Click-behavior toggle; new users get preview default, existing users keep v1.0 default |
| AI cluster names jitter every run | Graph fragmentation | Canonical taxonomy; deduplication on cluster create |
| Look-ahead wikilink to hallucinated slug | Empty stub note in vault | Validate slug against local catalog before writing |
| User configures Ollama URL without `http://` prefix | Cryptic connection error | URL validator with helpful default and warning |
| User runs out of LLM credit mid-contest | Multi-feature failure cascade | Don't tie contest to AI; AI review post-contest is a separate optional action |

---

## "Looks Done But Isn't" Checklist

- [ ] **AI Debug:** Provider is wired, but no "thinking" indicator → user perceives hang
- [ ] **AI Debug:** Streaming works locally with Ollama, but you didn't test with `requestUrl` + Anthropic — Anthropic will fail with CORS via native fetch
- [ ] **AI ACed Review:** Auto-runs on every AC because the opt-in toggle was added but defaults to `true`
- [ ] **AI Provider settings:** Key field is plaintext `text` input, not `password`
- [ ] **AI Provider settings:** README missing "Network use" subsection update for AI endpoints
- [ ] **AI Provider settings:** No "Clear AI key" command in palette
- [ ] **AI Privacy:** No first-run disclosure modal before the first AI call
- [ ] **AI Privacy:** README missing "What gets sent to your AI provider" subsection
- [ ] **AI Cost:** No usage logging; user has no way to see their estimated cost
- [ ] **AI Knowledge Graph:** Look-ahead wikilink validator missing — hallucinated slugs become stub notes
- [ ] **AI Knowledge Graph:** No canonical cluster taxonomy → cluster name jitter
- [ ] **AI Knowledge Graph:** Migration command exists but no backup writer before vault writes
- [ ] **AI Knowledge Graph:** Migration uses `vault.modify()` or `cm.dispatch()` — silently dropped or overwrites user edits
- [ ] **Contest:** Timer is `setInterval` decrement, drifts on sleep
- [ ] **Contest:** State not persisted to `data.json` — plugin reload kills the contest
- [ ] **Contest:** "Surprise me" picks contests without verifying problem slugs are still fetchable
- [ ] **Contest:** Rate limiter not contest-aware; throttles legitimate run/submit during contest
- [ ] **Contest:** No `onbeforeunload` warning when user tries to close Obsidian during contest
- [ ] **Preview:** `vault.create()` called somewhere in the preview path — accidental notes
- [ ] **Preview:** Preview opens but `MarkdownRenderer.render` passes plugin instance as Component (memory leak; new ESLint rule)
- [ ] **Preview:** No click-behavior toggle for upgraders — they lose v1.0 muscle memory
- [ ] **Plugin store:** `eslint-plugin-obsidianmd` still pinned to `0.1.9` — newly-added 0.3.0 rules will fail on submission
- [ ] **Plugin store:** Bundle size > 500 KB
- [ ] **Plugin store:** New commands have IDs like `obsidian-leetcode:contest-start` (plugin ID prefix banned by `no-plugin-id-in-command-id`)
- [ ] **Plugin store:** New commands have IDs / names with the word "command" (banned by `no-command-in-command-id` / `no-command-in-command-name`)
- [ ] **Plugin store:** README network section unchanged — only mentions leetcode.com

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| AI SDK bundled and shipped | HIGH | Hotfix release: rip out SDK, replace with `requestUrl` builder; users update manually |
| API key plaintext disclosed by reviewer post-ship | MEDIUM | README diff + masked input + Clear-AI-key command; ship in patch release |
| Hallucinated wikilinks already created stub notes in user vault | MEDIUM | Provide a "Clean orphaned LC stub notes" command that scans for empty notes with LC slug pattern and offers deletion |
| Cluster name fragmentation in user vault | MEDIUM | Provide a "Merge cluster X into Y" command in palette; user-driven cleanup |
| `## Techniques` migration corrupted notes | HIGH | If backup writer was implemented (Pitfall 10), restore from backup. If not, no automated recovery — user must restore from Obsidian Sync history or Time Machine |
| Contest state lost on plugin reload | LOW (if persistence implemented) | Prompt to resume on next plugin load |
| Contest started with broken problem | LOW | Surface error, end contest gracefully, don't write a half-summary note |
| Bundle > 500 KB shipped | MEDIUM | esbuild splitting; dynamic provider imports; remove dev-only deps that leaked into prod |
| README network disclosure missing | LOW | README PR; reviewer accepts within hours |
| AI cost surprise (user complaint) | LOW | Add daily cap + usage display in patch release; tweet acknowledgment |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1: Node-only AI SDK in bundle | Phase 06 (AI provider scaffolding) | `package.json` audit: zero of `openai`, `@anthropic-ai/sdk`, `aws-sdk`, `langchain` as prod deps; bundle size < 250 KB after Phase 06 |
| 2: `requestUrl` no streaming | Phase 06 (transport) + Phase 07 (UX) | "Thinking" indicator visible in AI Debug; manual test against Anthropic via `requestUrl` returns full response in one shot |
| 3: API key disclosure | Phase 06 (AI settings tab) | README has "AI provider configuration & data flow" section listing every endpoint; key field is `password`-masked |
| 4: Bedrock SigV4 trap | Phase 06 (provider scoping) | Roadmap explicitly excludes Bedrock; README documents LiteLLM gateway as the v1.1 path |
| 5: Multi-provider over-engineering | Phase 06 (AI provider layer) | Total `src/ai/providers/` LOC < 400; no abstract base class; no DI |
| 6: Cost surprise from auto-run AI review | Phase 08 (AI ACed Review) | Auto-run setting defaults to `false`; usage stats visible in settings |
| 7: Privacy / sending user code | Phase 07 (AI Debug) | First-call modal; README "What gets sent" subsection |
| 8: Hallucinated slugs in look-ahead links | Phase 09 (AI knowledge graph) | `validateSlug` invoked on every cluster write; integration test: AI returns fake slug → wikilink dropped, not written |
| 9: Cluster name drift | Phase 09 (AI knowledge graph) | `aiClusterTaxonomy` exists in plugin data; AI prompt is a constrained pick-from-list, not free-form |
| 10: Migration breaks v1.0 section lock | Phase 09 (AI knowledge graph migration) | Migration uses `vault.process()` exclusively; backup written before any vault write; manual command (not auto on load) |
| 11: Contest timer drift / lost on reload | Phase 10 (Contest virtual mode) | Timer computes `Date.now() - startedAt`; state in `data.json`; resume prompt on plugin load |
| 12: Past-contest catalog drift | Phase 10 (Contest virtual mode) | `contestCatalog` fetched + verified before contest start; "Surprise me" runs `Promise.allSettled` slug check |
| 13: Submission rate limit during contest | Phase 10 (Contest virtual mode) + Phase 11 (polish) | Rate limiter is mode-aware; manual test: 30 submissions in 60 s during contest doesn't 429 client-side |
| 14: Preview creates notes silently | Phase 11 (Preview Mode) | grep `vault.create\|openLinkText` in `src/preview/` returns zero; first-click test on fresh install does not create a `.md` file |
| 15: New eslint-plugin-obsidianmd 0.3.0 rules | Phase 06 (first plan) | `package.json` pins `^0.3.0`; `npm run lint` clean before any feature code |
| 16: README network disclosure drift | Phase 06 + Phase 11 (release prep) | README PR alongside Phase 06 + final audit at Phase 11 |
| 17: Frontmatter bloat | Every v1.1 phase touching notes (06–11) | Code review: every new frontmatter key has a documented production reader |
| 18: Bundle > 500 KB | Phase 06 (CI gate) + every phase end | `du -b main.js` < 500_000 in CI; `esbuild --analyze` reviewed at each phase boundary |

---

## Sources

- Obsidian Developer Docs (Context7 `/obsidianmd/obsidian-developer-docs`, fetched 2026-05-14):
  - `requestUrl()` API surface — confirms no streaming primitive, single-shot response (HIGH)
  - `RequestUrlParam` parameter list (HIGH)
  - `RequestUrlResponse` / `RequestUrlResponsePromise` interfaces (HIGH)
- Obsidian Developer Policies (fetched 2026-05-14): network disclosure required, no client-side telemetry, server-side telemetry requires privacy policy link (HIGH)
- Obsidian Plugin Guidelines: `processFrontMatter` for atomic frontmatter; `innerHTML` forbidden; recommended DOM helpers (HIGH)
- `eslint-plugin-obsidianmd@0.3.0` README (npm registry tarball, fetched 2026-05-14): full rule list including new rules `commands/no-command-in-command-id`, `commands/no-command-in-command-name`, `no-plugin-as-component`, `no-forbidden-elements`, `prefer-instanceof`, `vault/iterate` (HIGH)
- `logancyang/obsidian-copilot` (fetched 2026-05-14): multi-provider via OpenRouter / OpenAI / Anthropic / Gemini / Cohere; "Set Keys" UX; no SDK dependence in transport layer (MEDIUM — README only)
- `brianpetro/obsidian-smart-connections` (fetched 2026-05-14): "minimal/no dependencies" principle; LLM provider routing moved to separate Smart Chat plugin; reinforces "thin transport" approach (MEDIUM)
- `JacobLinCool/LeetCode-Query` README (fetched 2026-05-14): contest support limited to "User Contest Records"; no documented "list past contests" or "fetch contest problems by slug" — confirms hand-rolled GraphQL needed (HIGH)
- v1.0 PROJECT.md + CLAUDE.md + MILESTONES.md: section-lock convention, `'leetcode.*'` userEvent, `vault.process` rule, frontmatter-purposeful policy, ~163 KB current bundle (HIGH — primary source)
- npm registry: `eslint-plugin-obsidianmd@0.3.0` published 2 days before research date; v1.0 pins `0.1.9`; gap is real (HIGH)

---
*Pitfalls research for: Obsidian LeetCode v1.1 milestone (Contest, AI Coach, Preview)*
*Researched: 2026-05-14*
