# Phase 3: Run & Submit - Research

**Researched:** 2026-05-08
**Domain:** Hand-rolled LeetCode REST (interpret_solution/submit/check) + exponential-backoff polling + verdict modal + tabbed custom-test modal, built on the Phase 1 throttled `requestUrl` pipe and the Phase 2 note schema.
**Confidence:** HIGH on REST shape, cookie mechanics, modal/timer patterns (all verified via `node_modules` source + installed `obsidian.d.ts`). MEDIUM on exact `status_code` integers (verified against `leetcode-cli` helper but numeric map is 2019-era — current LC may have added codes). LOW on Retry-After header actual behavior (no authoritative documentation — community patterns only).

## Summary

Three findings change what the planner needs to do:

1. **`@leetnotion/leetcode-api` v3.0.0 already ships the full REST pipeline.** The installed version (`node_modules/.../lib/index.js:1780-1960`) exposes a `LeetCodeCLI` class with `testCode()`, `submitCode()`, `pollJudgeResult()`, `restRequest()`, and `authHeaders()`. CLAUDE.md's "Does NOT cover run/submit — must be hand-rolled" is **stale — written against an older major**. This is a major [RECONSIDER] item for the planner: hand-rolling D-28 `leetcodeRest.ts` is still viable but is no longer the only path. The library's REST implementation sends `cookie:` + `x-csrftoken:` explicitly in headers, matches the LC-CLI endpoint shapes verbatim, and runs through the same `fetch_default → fetcher.fetch` module-scoped singleton that Phase 1's `installRequestUrlFetcher()` already patches. Every REST call would flow through our throttle + `requestUrl` automatically.

2. **Cookies are NOT auto-sent by `requestUrl`** (P0 #1 — definitive answer). Obsidian's `requestUrl` takes only an explicit `headers: Record<string, string>` param (`obsidian.d.ts:5273-5290`); there is no cookie jar integration. The library confirms this — its `authHeaders()` builds `cookie: 'csrftoken=X; LEETCODE_SESSION=Y;'` as a plain header and hands it to fetch. Phase 3 must read from `SettingsStore.getAuthCookies()` and inject the `Cookie` header on every REST call. No Electron cookie-jar plumbing needed (and it wouldn't work anyway — `requestUrl` bypasses Electron CORS via a native path that doesn't consult the renderer cookie store).

3. **`question_id` is the internal `questionId`, NOT `questionFrontendId`** (P0 #2 — definitive answer). The library's `SubmitCodeOptions.questionId: number` and `TestCodeOptions.questionId: number` pair with a `DetailedProblem` schema that exposes BOTH fields: `questionId?: string` and `questionFrontendId?: string` (`lib/index.d.ts:300-302`). The LC-CLI `config.js` template uses `$id` bound to `parseInt(problem.id, 10)` where `problem.id` is LC's internal numeric id, and the `leetcode-cli` plugin builds `question_id: parseInt(problem.id, 10)` verbatim. The Phase 2 cache today only stores `questionFrontendId` (via `DetailCacheEntry.id`), so **the Phase 2 detail fetch must be extended** to also fetch and store the internal `questionId`. This is a schema-change task, not runtime-discovery.

**Primary recommendation:** Plan Phase 3 with a **fork in mind** early: either (A) use the library's `LeetCodeCLI.testCode/submitCode/pollJudgeResult` directly (re-constructing the LC client as a `LeetCodeCLI` instance when cookies exist), or (B) hand-roll `src/solve/leetcodeRest.ts` as originally planned in D-28 but treat the library's implementation as the authoritative reference for body shape, headers, and CSRF refresh. Path A saves ~150 LoC but locks into the library's 1 s fixed-interval polling; path B keeps our locked 1/2/4/8 backoff (D-21) and 60 s cap (D-22). **Recommend path B — hand-rolled** because D-21 backoff cadence and D-23 abort semantics are first-class plugin UX requirements the library doesn't support, and the hand-rolled cost is now low (LC-CLI code is the copy-paste reference; we're ~80 LoC from done).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Code Extraction & Language Resolution (SOLVE-01, SOLVE-08, SOLVE-09):**
- **D-01:** First fenced code block in the active note is the submission payload. Code sent to LC is always current note content at submit time.
- **D-02:** Fence tag wins for language resolution. Fence tag normalized to LC's `langSlug` set. One problem note supports multiple languages over time.
- **D-03:** Untagged fence falls back to global default language from `SettingsStore`.
- **D-04:** No fenced code block → Notice: `No code block found. Add a fenced block with your solution.` Abort. No network call, no auto-injection.
- **D-05:** Language normalization table in `NoteTemplate.ts` or new `src/solve/languages.ts`. Must map every LC `langSlug` + common aliases (`py`→`python3`, `ts`→`typescript`, `c++`→`cpp`). Unknown tag → untagged fallback (D-03).

**Starter-Code Injection (SOLVE-02):**
- **D-06:** New plugin-owned heading `## Code` between `## Problem` and `## Notes`. Phase 3 canonical body shape: `## Problem` → `## Code` → `## Notes`.
- **D-07:** Retrofit + on-demand injection: new notes insert `## Code` with cached `codeSnippets[lc-language]`; existing notes get retrofit on next open if `## Code` missing OR no fenced block; on-demand command unconditionally replaces. Idempotent on existing fenced block.
- **D-08:** `## Code` heading: plugin-owned. Fenced block(s) under it: user-owned once exists. Anything else (comments, notes between blocks): preserved.
- **D-09:** Retrofit silent on success, debug log on failure, note untouched on failure.

**Run & Submit UX Surface (SOLVE-03, SOLVE-04, SOLVE-05, SOLVE-07):**
- **D-10:** Command palette only. Commands: `LeetCode: Run code (sample)`, `Run code (custom input)`, `Submit`, `Insert starter code`, `Cancel running submission`. No-hotkey defaults.
- **D-11:** Overlay Run/Submit buttons deferred to Phase 5 Polish.
- **D-12:** Verdict modal = single `Modal` subclass switching on `status_code`/`status_msg`. Shared chrome: title + runtime/memory line + verdict-specific body + footer buttons. `createEl()` only.
- **D-13:** Verdict bodies: AC = big green + percentiles. WA = LC-native `Input`/`Output`/`Expected` + diff highlighting. TLE/MLE = status + failing input. CE = `compile_error` monospace. RE = `runtime_error` + failing input.
- **D-14:** Action buttons: WA/TLE/RE → Copy failing testcase to custom input; CE → Copy error; Unknown → Copy payload; all → Close.
- **D-15:** Unknown verdict → `Unrecognized verdict` modal + collapsed `<details>` with payload + Copy payload button + warn log via `logger.ts`. Phase 4 on-accepted does NOT fire for unknown.
- **D-16:** Run (`interpret_solution`) and Submit (`submit`) have identical body shape except endpoint + `submit` adds `judge_type: 'large'`. Both return `{ interpret_id | submission_id }` polled via `/check/{id}`. Check response shape differs (run: `code_answer[]`, `expected_code_answer[]`, `correct_answer`; submit: verdict + percentile).

**Custom Test Input UI (SOLVE-04):**
- **D-17:** Tabbed modal (Case 1/2/3/+) with plain textarea per tab. First open pre-populates Case 1 with `exampleTestcases`. Tab affordances: click-switch, `×` on hover to remove (min 1), `+` at end. Run runs active tab via `interpret_solution`.
- **D-18:** Cases persist in note under new `## Custom Tests` heading with `### Case N` subheadings + ```text fenced blocks. Lazy-created.
- **D-19:** `## Custom Tests` plugin-owned, user-added text between cases preserved. Extend `HeadingRegion` for nested `###` if needed — planner discretion.
- **D-20:** `## Custom Tests` ordering: below `## Notes`.

**Polling, Concurrency, Timeouts (SOLVE-05, SOLVE-06):**
- **D-21:** Polling cadence 1 s → 2 s → 4 s → 8 s → 8 s → 8 s ... Total cap 60 s.
- **D-22:** Verdict modal opens in pending state with spinner + `Polling LeetCode for verdict…` subtitle + Cancel button. Cap hit → error state + timeout message + Close. Cancel → modal closes, request aborted silently.
- **D-23:** Abort via `AbortController` or flag in orchestrator. `requestUrl` doesn't support AbortController; drop-response-on-abort-flag is the approach.
- **D-24:** Block concurrent submits with Notice `A submission is already in progress. Cancel it first or wait for the verdict.` Abort new invocation — no queue, no cancel previous.
- **D-25:** All three endpoints route through existing `api/throttle.ts` (Phase 1 D-12). No new throttle.
- **D-26:** 429/503 during poll → retry with current backoff. Three consecutive non-2xx → judge timeout (D-22 flow).
- **D-27:** Session-expiry via `isSessionExpired` in `src/api/LeetCodeClient.ts`. On expiry: abort polling, close modal, fire Phase 1 re-auth Notice. No auto-retry after re-auth.

**REST Endpoint Mechanics:**
- **D-28:** Hand-rolled REST module in `src/solve/leetcodeRest.ts`. Functions: `interpretSolution`, `submitSolution`, `checkSubmission`. All through existing `requestUrlFetcher` + throttle pipe.
- **D-29:** Endpoints + headers per CLAUDE.md + leetcode-cli reference. Cookie injection mechanics flagged as P0 research.
- **D-30:** Body shape per leetcode-cli. `question_id` vs `questionFrontendId` flagged as P0 research.
- **D-31:** Capture live fixtures for all 6 verdict types before merging Phase 3. Store in `tests/fixtures/lc-verdicts/`.

### Claude's Discretion

- Module layout under `src/solve/` (orchestrator/REST/modal split)
- Singleton vs factory for `SubmissionOrchestrator` (prefer singleton)
- CSS approach for verdict-modal diff highlighting
- Icon/emoji in verdict titles
- Retry-after handling for 429s (respect header if present, else backoff)
- In-memory representation of custom test cases
- Whether to cache `question_id` in `problemDetails` (prefer yes)
- Language normalization aliases scope (start obvious, expand on reports)
- Whether verdict modal auto-closes on AC (recommend no)

### Deferred Ideas (OUT OF SCOPE)

- Overlay Run/Submit buttons on code block → Phase 5 Polish (design goal locked)
- Per-argument labeled inputs in custom-test modal → Phase 5
- Submission history browsing → post-v1
- Retry button in verdict modal → Phase 5
- Auto-language detection from starter code → deferred
- Large-output truncation in verdict modal → Phase 5 Polish
- Mocked LC server integration tests → deferred reliability upgrade
- Character/word-level diff highlighting → Phase 5 Polish
- Error-copy polish for REST failures → POLISH-02 (Phase 5)
- On-Accepted solution append, frontmatter update, `[[Technique]]` backlinks, technique stubs → Phase 4 (GRAPH-01..05)
- Settings-UI completeness → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI → v2

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SOLVE-01 | User can write solution code directly in the problem note's code block using the native editor | D-01 + first-fenced-block extraction (`codeExtractor.ts`); note's CodeMirror 6 block already exists from Phase 2 starter-code injection (D-07) |
| SOLVE-02 | Starter code snippet for the user's chosen language is inserted into the note on first open | D-06 + D-07 — retrofit flow in NoteWriter, snippet from cached `codeSnippets[langSlug]` (already in Phase 2 cache per CF-13); see "HeadingRegion Extension" and "Starter-Code Insertion Detection" sections below |
| SOLVE-03 | User can run code against LC's sample test cases via a command/button | D-10 `Run code (sample)` command + `interpretSolution` hitting `POST /problems/{slug}/interpret_solution/` with `data_input = cached exampleTestcases`; body shape confirmed below |
| SOLVE-04 | User can run code against custom input | D-17–D-20 + same `interpretSolution` with user-provided `data_input`; tabbed modal pre-populated from cached `exampleTestcases` on first open |
| SOLVE-05 | User can submit code to LC's judge via a command/button | D-10 `Submit` command + `submitSolution` hitting `POST /problems/{slug}/submit/`; body shape below (judge_type: 'large') |
| SOLVE-06 | Plugin polls `/check/{id}` with exponential backoff until verdict returned (AC/WA/TLE/MLE/CE/RE) | D-21 cadence (1/2/4/8 s, 60 s cap) + `checkSubmission` + the `status_code` integer map documented below + D-26 error handling |
| SOLVE-07 | Verdict, runtime, memory, and any error output displayed in result modal/pane | D-12–D-15 + the full `JudgeCheckResponse` field map documented below — exact field names LC returns + which verdict states include which fields |
| SOLVE-08 | All supported LC submission languages available per problem | D-02, D-03, D-05 language normalization table; cached `codeSnippets[].langSlug` is the LC-authoritative set |
| SOLVE-09 | Code uses the user's current note content at submit time (no stale snapshots) | D-01 — read active note body at invocation, extract first fenced block, send. No caching layer between note and REST body |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fenced-block extraction from active note | Plugin / renderer | — | Reads current editor state via `MarkdownView.editor.getValue()` or `vault.read()`; no network |
| Language normalization (fence tag → `langSlug`) | Plugin / renderer | — | Pure TS map; lives in `src/solve/languages.ts` |
| Starter-code retrofit (## Code injection) | Plugin / vault | Obsidian MetadataCache | Vault write via `vault.process()` + generalized `HeadingRegion` (extended for `## Code`) |
| REST call construction (headers, body, endpoint) | Plugin / network adapter | LC server | Hand-rolled on top of `requestUrl` via the Phase 1 throttle; library reference in node_modules |
| Exponential-backoff polling state machine | Plugin / renderer | LC server | Plugin-owned timer loop using `window.setTimeout` registered via `plugin.registerInterval()` |
| CSRF refresh (from `set-cookie` on response) | Plugin / credential store | LC server | Library's `handleCsrf()` does this on every response; we replicate in hand-rolled REST or reuse the library's `LeetCodeCLI` instance's credential |
| Verdict modal rendering + state transitions | Plugin / DOM | — | `createEl()` only; ref-based update pattern (see Modal Update section) |
| Tabbed custom-test modal + persistence | Plugin / DOM + vault | — | `createEl()` for UI; `vault.process()` for persistence via extended `HeadingRegion` with nested `###` |
| Concurrency gating (single-flight + cancel) | Plugin / `SubmissionOrchestrator` | — | In-memory flag + `AbortController`-compatible abort signal |
| Session-expiry detection | Plugin / `LeetCodeClient` (reused) | LC server | `isSessionExpired` helper owned by Phase 1; imported, never duplicated |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` | installed (1.12.3+) | `requestUrl`, `Modal`, `Notice`, `setIcon`, `MarkdownView`, `Plugin.registerInterval` | [VERIFIED: node_modules/obsidian/obsidian.d.ts:5270, 4332, 4467, 1907] Already the runtime foundation — Phase 3 uses the same API surface as Phases 1–2 |
| `@leetnotion/leetcode-api` | `3.0.0` | Credential + CSRF + `LeetCodeCLI` (optional reference) | [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.js:1780-1960] v3.0.0 ships `LeetCodeCLI` with full REST pipeline — see Assumptions Log A1 re: whether to consume or hand-roll |
| TypeScript | `^5.8.3` | Plugin language | [VERIFIED: package.json] Same as Phases 1–2 |
| `esbuild` | `0.25.5` | Bundler | [VERIFIED: package.json] Same as Phases 1–2 |
| `vitest` | `4.1.5` | Unit tests | [VERIFIED: package.json] Same as Phases 1–2 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `turndown` | `7.2.4` | HTML→MD (Phase 2) | [CITED: CLAUDE.md] Phase 3 does NOT invoke turndown directly — only reads from Phase 2's cached output |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled REST in `src/solve/leetcodeRest.ts` (D-28) | `@leetnotion/leetcode-api` `LeetCodeCLI.testCode/submitCode/pollJudgeResult` | Library saves ~150 LoC but polls at fixed 1s interval (vs our locked 1/2/4/8s backoff D-21), doesn't expose per-attempt abort (vs D-23), doesn't surface the raw `JudgeCheckResponse` for our verdict-specific rendering (D-13/D-15). See Reconsider section. |
| `AbortController` | Manual abort flag in orchestrator | `requestUrl` doesn't accept AbortSignal per `RequestUrlParam` ([VERIFIED: obsidian.d.ts:5273-5290]); manual flag is the only option |
| `registerInterval` | Chained `setTimeout` via `window.setTimeout` + `plugin.registerInterval(id)` | For non-uniform backoff (1/2/4/8), setInterval doesn't fit. Chain setTimeout. `registerInterval` accepts a timer id (number) — register each chained setTimeout id if we want teardown on unload. See Polling Pattern section. |

**Installation:** No new npm packages needed. Everything already installed from Phases 1–2.

**Version verification:** All versions already verified in Phases 1–2 research. Phase 3 adds no new deps.

## Architecture Patterns

### System Architecture Diagram

```
[ Active MarkdownView (user's problem note) ]
              │
              │  (user invokes command)
              ▼
   ┌──────────────────────┐
   │ Command dispatch     │  — reads active view, checks `lc-slug` frontmatter
   │ (main.ts)            │
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐       ┌────────────────────────┐
   │ SubmissionOrchestrator│◄──────│ codeExtractor.ts       │
   │ (src/solve/)          │       │ - first fenced block   │
   │ - single-flight flag  │       │ - language normalization│
   │ - AbortController flag│       └────────────────────────┘
   └──────────┬───────────┘
              │         ┌──────────────────────┐
              ├────────►│ VerdictModal          │  ◄── opens in pending state immediately
              │         │ - pendingState()      │      (sub-element refs: titleEl, bodyEl, footerEl)
              │         │ - renderVerdict(r)    │  ◄── called when poll returns
              │         │ - renderTimeout()     │  ◄── called on D-22 cap hit
              │         └──────────────────────┘
              ▼
   ┌──────────────────────┐
   │ leetcodeRest.ts      │  — hand-rolled fetch wrappers
   │ - interpretSolution  │  POST /problems/{slug}/interpret_solution/
   │ - submitSolution     │  POST /problems/{slug}/submit/
   │ - checkSubmission    │  GET  /submissions/detail/{id}/check/
   └──────────┬───────────┘
              │                 (uses `throttledRequestUrl` helper
              ▼                  exported from api/throttle.ts)
   ┌──────────────────────┐
   │ requestUrlFetcher.ts │  — Phase 1 throttle + requestUrl pipe
   │ (Phase 1 D-12)       │     (already installed before LC client is built)
   └──────────┬───────────┘
              │
              ▼
         [ leetcode.com ]

─── Parallel UI path: custom input ───
   ┌──────────────────────┐        ┌──────────────────────┐
   │ CustomTestModal       │───────►│ HeadingRegion        │
   │ - tabbed UI           │        │ (extended for ###    │
   │ - textarea per case   │        │  nested cases — D-19)│
   │ - Run button          │        └──────┬───────────────┘
   └──────────┬───────────┘               │
              │ (persist on close/Run)    ▼
              │                  [ vault.process() on note ]
              └──► (back to SubmissionOrchestrator with active-tab input)
```

### Recommended Project Structure

```
src/
├── solve/                   # NEW Phase 3 folder (feature-first, CF-11)
│   ├── SubmissionOrchestrator.ts   # Single-flight flag, backoff loop, abort handling, modal wiring
│   ├── leetcodeRest.ts             # Hand-rolled REST: interpretSolution, submitSolution, checkSubmission
│   ├── codeExtractor.ts            # First-fenced-block extraction + language tag normalization
│   ├── languages.ts                # Fence-tag → LC langSlug map (SOLVE-08)
│   ├── VerdictModal.ts             # createEl-based modal; renders all 6 verdicts + unknown
│   ├── CustomTestModal.ts          # Tabbed modal; reads/writes `## Custom Tests` section
│   ├── types.ts                    # Discriminated unions: VerdictPayload, RunPayload, SubmitPayload
│   └── statusMap.ts                # status_code integer map (10=AC, 11=WA, ...); central + testable
├── notes/
│   ├── HeadingRegion.ts     # EXTEND — add support for ## Code ownership + ## Custom Tests with nested ###
│   ├── NoteTemplate.ts      # EXTEND — add buildCodeBody() for starter-code + update buildNoteBody() to include ## Code
│   ├── NoteWriter.ts        # EXTEND — after Problem body write, call retrofitStarterCode()
│   └── ... (Phase 2 files unchanged)
├── api/
│   ├── throttle.ts          # EXTEND — add `throttledRequestUrl(params): Promise<RequestUrlResponse>` helper that mirrors the shim shape but returns the raw response (vs the fetch-compatible Response wrapper)
│   └── ... (Phase 1 files unchanged)
└── shared/
    ├── errors.ts            # EXTEND — add SubmissionError subclasses (NoCodeBlock, InProgress, JudgeTimeout, UnknownVerdict)
    └── ... (Phase 1 files unchanged)

tests/
├── fixtures/
│   └── lc-verdicts/              # D-31 live-captured JSON fixtures, one per verdict type
│       ├── accepted.json
│       ├── wrong-answer.json
│       ├── time-limit-exceeded.json
│       ├── memory-limit-exceeded.json
│       ├── compile-error.json
│       └── runtime-error.json
├── helpers/
│   ├── mock-leetcode-client.ts    # EXTEND — add fake for REST endpoints
│   └── obsidian-stub.ts           # EXTEND — richer Modal/Notice stubs if needed
├── submission-orchestrator-backoff.test.ts  # fake-timer-driven polling cadence tests
├── submission-orchestrator-concurrency.test.ts   # single-flight enforcement
├── submission-orchestrator-abort.test.ts   # Cancel button + timeout semantics
├── verdict-modal-renders-{accepted,wa,tle,mle,ce,re,unknown}.test.ts
├── code-extractor-first-fence.test.ts
├── code-extractor-language-resolution.test.ts
├── language-normalization.test.ts
├── leetcoderest-request-shape.test.ts      # asserts headers + body exactly match LC contract
├── leetcoderest-session-expiry.test.ts     # 401/403/redirect-to-login dispatch
├── heading-region-code-section.test.ts     # starter-code retrofit idempotency
├── heading-region-nested-cases.test.ts     # ### Case N parsing + write-back
├── custom-test-modal-persistence.test.ts   # read-from-note → modal → write-back round-trip
└── status-map.test.ts                       # each integer → expected verdict name
```

### Pattern 1: REST call shape (interpretSolution / submitSolution)

**What:** Hand-rolled POST to `/problems/{slug}/interpret_solution/` or `/problems/{slug}/submit/`, sending JSON body through the Phase 1 throttled `requestUrl` pipe, with explicit cookie + CSRF headers.

**When to use:** Every Phase 3 run or submit invocation.

**Example:**

```typescript
// src/solve/leetcodeRest.ts
// Source: reverse-engineered from node_modules/@leetnotion/leetcode-api/lib/index.js:1786-1959
//         which is the authoritative current-LC implementation (2026-04-03).
// [VERIFIED: node_modules source] — matches skygragon/leetcode-cli config.js paths
//         and body shapes (lib/plugins/leetcode.js, confirmed 2026-05-08 via WebFetch).

import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type { Throttle } from '../api/throttle';
import type { AuthCookies } from '../auth/types';
import { isSessionExpired } from '../api/LeetCodeClient';
import { SessionExpiredError } from '../shared/errors';

const BASE_URL = 'https://leetcode.com' as const;
const USER_AGENT = 'Mozilla/5.0 (compatible; obsidian-leetcode-plugin)';

/** Headers every Phase 3 REST call sends. Matches LeetCodeCLI.authHeaders() verbatim.
 *  [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.js:1786] */
function authHeaders(slug: string, cookies: AuthCookies): Record<string, string> {
  return {
    'content-type': 'application/json',
    'origin': BASE_URL,
    'referer': `${BASE_URL}/problems/${slug}/description/`,   // NOTE: /description/ path, not bare slug
    'cookie': `csrftoken=${cookies.csrftoken}; LEETCODE_SESSION=${cookies.LEETCODE_SESSION};`,
    'x-csrftoken': cookies.csrftoken,
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': USER_AGENT,
  };
}

export interface InterpretArgs {
  slug: string;
  lang: string;          // LC langSlug: 'python3', 'java', 'cpp', 'javascript', ...
  questionId: string;    // LC's INTERNAL questionId (NOT frontend id). See P0 #2 below.
  typedCode: string;
  dataInput: string;
  cookies: AuthCookies;
}

export async function interpretSolution(args: InterpretArgs, throttle: Throttle): Promise<{ interpret_id: string; interpret_expected_id?: string }> {
  await throttle.acquire();
  try {
    const res = await requestUrl({
      url: `${BASE_URL}/problems/${args.slug}/interpret_solution/`,
      method: 'POST',
      headers: authHeaders(args.slug, args.cookies),
      body: JSON.stringify({
        lang: args.lang,
        question_id: args.questionId,
        test_mode: false,
        typed_code: args.typedCode,
        data_input: args.dataInput,
      }),
      throw: false,   // let caller see 401/403/redirects
    });
    if (res.status === 302 || res.status === 303 || res.status === 401 || res.status === 403) {
      throw new SessionExpiredError();
    }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 200)}`);
    const data = res.json as { interpret_id?: string; interpret_expected_id?: string };
    if (!data.interpret_id) throw new Error('No interpret_id returned (code may have been submitted too soon)');
    return { interpret_id: data.interpret_id, interpret_expected_id: data.interpret_expected_id };
  } finally {
    throttle.release();
  }
}

// submitSolution is identical except endpoint + body.judge_type = 'large' + return { submission_id: number }.
// checkSubmission is a GET on /submissions/detail/{id}/check/ with the same authHeaders.
```

### Pattern 2: Exponential-backoff polling loop (D-21, D-22, D-23)

**What:** Chained `window.setTimeout` with non-uniform delays (1 s → 2 s → 4 s → 8 s → 8 s ...), each attempt registered via `plugin.registerInterval()` for unload cleanup, with an abort flag checked between polls and before response processing.

**When to use:** After `interpret_id` or `submission_id` is obtained and we need to poll `/check/{id}` for completion.

**Why not `setInterval`:** backoff is non-uniform — the intervals change per iteration. A single `setInterval` can't express 1/2/4/8. Chained `setTimeout` is the idiomatic fit.

**Why not `@leetnotion/leetcode-api`'s `pollJudgeResult`:** it polls at a fixed 1 s interval ([VERIFIED: lib/index.js:1843]) and doesn't expose cancel. Our D-21 cadence + D-23 abort requires a hand-rolled loop.

**Example:**

```typescript
// src/solve/SubmissionOrchestrator.ts (sketch)
// Source: community pattern — chained setTimeout is the standard for non-uniform
// backoff in Obsidian plugins (no published library handles this). The
// window.setTimeout + registerInterval dance is documented in obsidian.d.ts:1901-1907.

const BACKOFF_MS = [1000, 2000, 4000, 8000] as const;   // D-21
const MAX_WALLCLOCK_MS = 60_000;                         // D-22

async function pollUntilVerdict(
  submissionId: string,
  plugin: Plugin,
  cookies: AuthCookies,
  throttle: Throttle,
  abortFlag: { cancelled: boolean },
): Promise<JudgeCheckResponse> {
  const startedAt = Date.now();
  let attempt = 0;
  let consecutiveFailures = 0;

  return new Promise((resolve, reject) => {
    const schedule = (ms: number): void => {
      if (abortFlag.cancelled) return reject(new AbortError());
      if (Date.now() - startedAt > MAX_WALLCLOCK_MS) return reject(new JudgeTimeoutError());

      // window.setTimeout — Obsidian's docs explicitly call this out to
      // disambiguate Node's `setTimeout` from the browser one in TS.
      // [VERIFIED: obsidian.d.ts:1903 — "Use window.setInterval instead of
      // setInterval to avoid TypeScript confusing between NodeJS vs Browser API"]
      const timerId = window.setTimeout(async () => {
        if (abortFlag.cancelled) return reject(new AbortError());
        try {
          const res = await checkSubmission(submissionId, cookies, throttle);
          if (abortFlag.cancelled) return reject(new AbortError());   // re-check after await (CRITICAL)
          if (res.state === 'SUCCESS') return resolve(res);
          consecutiveFailures = 0;
        } catch (err) {
          if (++consecutiveFailures >= 3) return reject(new JudgeTimeoutError());   // D-26
          // fall through to re-schedule
        }
        const nextDelay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        attempt++;
        schedule(nextDelay);
      }, ms);
      plugin.registerInterval(timerId);   // auto-cleanup on plugin unload
    };

    schedule(BACKOFF_MS[0]);
  });
}
```

**Key subtleties (verified):**
- `registerInterval(id: number)` accepts ANY timer id — `setTimeout` and `setInterval` both produce compatible handles. The name is a historical misnomer; it's a generic "cancel on unload" registration.
- Re-check `abortFlag.cancelled` AFTER every `await`, because cancellation is a purely in-memory signal with no preemption.
- Use `window.setTimeout` (not bare `setTimeout`) to avoid TS narrowing to Node's type.
- Existing `src/shared/timers.ts` exports `setWindowTimeout`/`clearWindowTimeout` — use these for popout-window-safe scheduling. These return `TimerHandle` which is `ReturnType<typeof setTimeout>` — pass to `plugin.registerInterval(handle as unknown as number)`.

### Pattern 3: Modal update (pending → verdict state) — D-12/D-15/D-22

**What:** Hold refs to sub-elements inside `onOpen`; mutate them via `.empty()` + `.setText()` / re-`createEl()` when state transitions. Do NOT call `onOpen` again or re-invoke `contentEl.empty()` blindly — that loses the modal's root structure.

**When to use:** `VerdictModal` transitions from pending (after open) → verdict state (after poll returns) → optional timeout state (60 s cap hit).

**Why this pattern:** Obsidian's `Modal.onOpen()` runs once, at `open()` time ([VERIFIED: obsidian.d.ts:4383]). There's no `update()` or `setState()` hook. The canonical pattern in community plugins is refs + mutation.

**Example:**

```typescript
// src/solve/VerdictModal.ts (sketch)
// Source: Obsidian Modal API (obsidian.d.ts:4332-4404) + community pattern
// from plugins like Templater, Advanced Tables, Dataview (refs + mutate).

export class VerdictModal extends Modal {
  private runtimeRowEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private onCancel: (() => void) | null = null;

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('Running…');                       // initial title
    contentEl.addClass('leetcode-verdict');

    this.runtimeRowEl = contentEl.createDiv({ cls: 'leetcode-verdict-runtime' });
    this.bodyEl = contentEl.createDiv({ cls: 'leetcode-verdict-body' });
    this.renderPending();                              // initial pending content

    this.footerEl = contentEl.createDiv({ cls: 'leetcode-verdict-footer' });
    this.renderPendingFooter();
  }

  private renderPending(): void {
    this.bodyEl.empty();
    this.bodyEl.createEl('p', { text: 'Polling LeetCode for verdict…' });
    this.bodyEl.createEl('p', {
      text: 'Backoff: 1s → 2s → 4s → 8s',
      cls: 'leetcode-verdict-subtitle',
    });
  }

  private renderPendingFooter(): void {
    this.footerEl.empty();
    const cancelBtn = this.footerEl.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.onCancel?.();
      this.close();
    });
  }

  /** Called by SubmissionOrchestrator when the poll returns. Mutates in place. */
  renderVerdict(verdict: JudgeCheckResponse, problemTitle: string): void {
    this.titleEl.setText(`${verdict.status_msg} — ${problemTitle}`);   // e.g., 'Wrong Answer — Two Sum'

    this.runtimeRowEl.empty();
    if (verdict.status_runtime || verdict.status_memory) {
      this.runtimeRowEl.setText(`Runtime: ${verdict.status_runtime ?? '—'} · Memory: ${verdict.status_memory ?? '—'}`);
    }

    this.bodyEl.empty();
    // Switch on verdict.status_code → renderAc / renderWa / renderTle / ... / renderUnknown

    this.footerEl.empty();
    // Verdict-specific action button (Copy failing testcase / Copy error / Copy payload) + Close
  }

  renderTimeout(): void {
    this.titleEl.setText('Judge timeout');
    this.bodyEl.empty();
    this.bodyEl.createEl('p', { text: 'LeetCode judge timed out. Try again.' });
    this.footerEl.empty();
    const closeBtn = this.footerEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
    closeBtn.addEventListener('click', () => this.close());
  }

  setCancelHandler(fn: () => void): void { this.onCancel = fn; }
}
```

### Pattern 4: Tabbed custom-test modal (D-17)

**What:** Obsidian Modal has NO native tab widget ([VERIFIED: obsidian.d.ts:4332-4404 — only `titleEl`, `contentEl`, `setContent`, etc.]). Build tabs with `createEl()`. Existing plugin has no prior pattern — this is new.

**Example:**

```typescript
// src/solve/CustomTestModal.ts (sketch)
export class CustomTestModal extends Modal {
  private cases: Array<{ input: string }>;
  private activeTab = 0;
  private tabsEl!: HTMLElement;
  private textareaEl!: HTMLTextAreaElement;

  constructor(app: App, initialCases: string[], private onRun: (input: string) => void) {
    super(app);
    this.cases = initialCases.length > 0 ? initialCases.map(i => ({ input: i })) : [{ input: '' }];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('leetcode-customtest');

    this.tabsEl = contentEl.createDiv({ cls: 'leetcode-customtest-tabs' });
    this.renderTabs();

    this.textareaEl = contentEl.createEl('textarea', {
      cls: 'leetcode-customtest-textarea',
      attr: { rows: '10', spellcheck: 'false' },
    });
    this.textareaEl.value = this.cases[this.activeTab].input;
    this.textareaEl.addEventListener('input', () => {
      this.cases[this.activeTab].input = this.textareaEl.value;
    });

    const footer = contentEl.createDiv({ cls: 'leetcode-customtest-footer' });
    const runBtn = footer.createEl('button', { text: 'Run', cls: 'mod-cta' });
    runBtn.addEventListener('click', () => {
      this.onRun(this.cases[this.activeTab].input);
      this.close();
    });
  }

  private renderTabs(): void {
    this.tabsEl.empty();
    this.cases.forEach((c, i) => {
      const tab = this.tabsEl.createEl('button', {
        cls: `leetcode-customtest-tab ${i === this.activeTab ? 'is-active' : ''}`,
        text: `Case ${i + 1}`,
      });
      tab.addEventListener('click', () => { this.switchTab(i); });
      if (this.cases.length > 1) {
        const removeBtn = tab.createEl('span', { text: '×', cls: 'leetcode-customtest-tab-remove' });
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeCase(i);
        });
      }
    });
    const addBtn = this.tabsEl.createEl('button', { cls: 'leetcode-customtest-tab-add', text: '+' });
    addBtn.addEventListener('click', () => { this.addCase(); });
  }

  private switchTab(i: number): void {
    this.cases[this.activeTab].input = this.textareaEl.value;  // persist current
    this.activeTab = i;
    this.textareaEl.value = this.cases[i].input;
    this.renderTabs();
  }
  // addCase, removeCase similar...

  onClose(): void {
    // Persist current tab + write back to `## Custom Tests` section in the note
    // via the extended HeadingRegion helper.
  }
}
```

### Anti-Patterns to Avoid

- **Calling `onOpen()` manually to "refresh" a modal.** Obsidian runs it once at `open()` time. Calling it again doesn't `empty()` the content first — you get duplicated DOM. Use refs + mutation (Pattern 3).
- **`contentEl.innerHTML = ...`.** Forbidden by plugin review (CF-07). Use `empty()` + `createEl()` / `setText()`.
- **`new Response(text, { headers })`.** Our Phase 1 shim wraps `requestUrl` in a `Response` because the library expects fetch semantics. Phase 3 hand-rolled REST should call `requestUrl` **directly** and not go through that wrapper — the `Response` constructor does unnecessary work and drops the parsed-JSON convenience (`res.json` is already an object on `RequestUrlResponse`).
- **Relying on Electron cookie jar.** `requestUrl` does NOT consult it ([VERIFIED: obsidian.d.ts:5273 — headers is the only auth surface]). Send cookies in the `Cookie:` header explicitly.
- **Using `fetch()` / `axios` as a fallback when `requestUrl` fails.** CORS-blocked in Electron renderer; would create a silent-failure path.
- **Building a second throttle or fetcher.** CF-01 + D-25 — reuse `api/throttle.ts`. Add a thin `throttledRequestUrl(params): Promise<RequestUrlResponse>` helper if the existing `Response`-wrapping shim isn't a clean fit.
- **Polling with fixed `setInterval`.** D-21's 1/2/4/8 s cadence is non-uniform; chained `setTimeout` is the fit.
- **`vault.modify()` on problem notes.** CF-06 — forbidden. Use `vault.process()` for body + `processFrontMatter()` for frontmatter. Grep gate already in place.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSRF token parsing from `set-cookie` | Custom cookie jar | The library already did it — `LeetCodeCLI.handleCsrf()` in `node_modules/.../index.js:1801` | The library emits an `'update-csrf'` event on the credential; if we keep using the existing `LeetCodeClient.lc` instance, we can listen on it. Alternative: ignore CSRF refresh (see P0 #5 below — in practice, csrftoken rotates rarely and Phase 1's `SettingsStore.getAuthCookies()` returns the last persisted value, which is stable for the duration of a session). |
| Language normalization table | Hand-built dictionary | Read from cached `codeSnippets[].langSlug` | Phase 2's `DetailCacheEntry.codeSnippets` already contains the authoritative LC langSlug set per problem (`lib/index.d.ts:99-104` confirms shape). Add alias layer only. |
| Exponential backoff primitive | Custom backoff class | Inline in `SubmissionOrchestrator.pollUntilVerdict` | 4 hard-coded delays + cap; not worth a library. |
| Modal tab widget | CSS framework | `createEl('button')` with active-class toggle | Obsidian Modal has no tab API; building is ~40 LoC. |
| Status-code → name mapping | Stringly-typed switch | A typed `statusMap.ts` single-source-of-truth | Make the AC/WA/TLE/MLE/CE/RE + unknown dispatch table-driven so adding a verdict (e.g., if LC introduces COMPILE_TIMEOUT with a new code) is one line. |
| JSON-body fetch | `new Response()` wrapper | Call `requestUrl()` directly in `leetcodeRest.ts` | The Phase 1 `Response`-wrapping shim exists for the library's fetch consumers. Hand-rolled REST can call `requestUrl` directly through a thin `throttledRequestUrl` helper and read `res.json` / `res.status` / `res.headers` natively. |

**Key insight:** The library (`@leetnotion/leetcode-api` v3.0.0) has already solved every hard problem in this phase — CSRF parsing, cookie header construction, body shape, endpoint paths, status-string matching. Our hand-rolled path cribs from its source as the authoritative reference; we're not re-discovering anything. The reason to still hand-roll is (a) D-21 backoff cadence, (b) D-23 abort semantics, (c) our own throttle integration, (d) verdict-modal-specific raw-response access.

## Runtime State Inventory

> Phase 3 is new-feature development (no rename/refactor). Skipping this section.

## Common Pitfalls

### Pitfall 1: `question_id` vs `questionFrontendId` silent failure

**What goes wrong:** Sending `questionFrontendId` (numeric, matches the URL slug id) to `/submit/` produces HTTP 200 but LC returns `{ error: "Submit result invalid" }` or a non-matching `submission_id`. The submission goes through against the WRONG problem.

**Why it happens:** LC's internal `questionId` is the primary key. For most problems (Two Sum: both = "1"), they're equal. For premium variants, contest problems, and some data-structure problems, they DIVERGE. `DetailedProblem` exposes both: `questionId?: string` (internal) and `questionFrontendId?: string` (display) — [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.d.ts:300-302]. The `leetcode-cli` Node plugin passes `parseInt(problem.id, 10)` where `problem.id` is the internal questionId — confirmed via WebFetch of raw source ([CITED: github.com/skygragon/leetcode-cli/lib/plugins/leetcode.js]).

**How to avoid:**
1. Extend Phase 2's `LeetCodeProblemDetail` interface (`src/api/LeetCodeClient.ts:15-26`) to include `questionId: string | null`.
2. Extend `DetailCacheEntry` (`src/settings/SettingsStore.ts:16-26`) to include `internalQuestionId?: string`.
3. Phase 3's REST body uses `cached.internalQuestionId ?? cached.id` — falling back to frontend id for legacy cache entries, but preferring the internal id when present.
4. If frontend id and internal id differ and the cached entry predates Phase 3, trigger a background-refresh to populate the internal id before the first submit for that problem.

**Warning signs:** LC returns `submission_id` but the subsequent `/check/{id}` returns verdict for a DIFFERENT problem, or `status_msg === 'Unknown Error'` on first submit for a premium/contest problem.

### Pitfall 2: Cookie header drift after CSRF rotation

**What goes wrong:** LC rotates `csrftoken` on some state-changing actions (login, logout, some submit responses include `set-cookie: csrftoken=newvalue`). If we read cookies at orchestrator construction time and cache them in memory, subsequent REST calls send a stale CSRF, hitting 403 with `CSRF verification failed`.

**Why it happens:** The library (`LeetCodeCLI.handleCsrf`) reads `set-cookie` on every response and updates `this.credential.csrf`, then emits `update-csrf` — but our `SettingsStore.getAuthCookies()` is read-only; we never update `data.json` from a response.

**How to avoid:** **Read `settings.getAuthCookies()` AT EACH REST CALL**, not at orchestrator construction. `SettingsStore` is an in-memory cache itself, so per-call reads are zero-cost. Additionally: after login (which Phase 1 already handles), the fresh csrftoken is persisted. For mid-session rotation, Phase 3 can optionally implement a lightweight "read set-cookie on response, persist updated csrftoken if present" step — but in practice, rotation during a single session is rare and a 403 will trigger the Phase 1 re-auth flow cleanly. **Recommendation: read-on-each-call without an active rotation handler for Phase 3; revisit if 403s are observed during dogfooding.**

**Warning signs:** First submit succeeds, second submit returns 403 with CSRF error text.

### Pitfall 3: `requestUrl` redirect handling on expired session

**What goes wrong:** When LC's session is expired, `POST /interpret_solution/` returns a 302 redirect to `/accounts/login/` instead of a 401. If `requestUrl` silently follows the redirect, we get a 200 with login HTML and no JSON-parseable body, blowing up on `res.json`.

**Why it happens:** `obsidian.d.ts:5273-5290` declares `RequestUrlParam` with no `redirect` option. Electron's default behavior is to follow redirects (HTTP clients typically do). Whether `requestUrl` exposes the 302 status or follows silently isn't documented in the `.d.ts`.

**How to avoid:**
1. Set `throw: false` on the `RequestUrlParam` so we see the response even on 4xx/5xx.
2. Check `res.status` BEFORE `res.json` — if `res.status === 302 || res.status === 303`, treat as session-expired (matches D-27).
3. Inspect `res.text` for `<title>Log In</title>` or `<form` with login action — fallback detection if the redirect was followed to 200.
4. Fall through to `isSessionExpired(err)` check in the catch.

**Warning signs:** `res.json` throws with `Unexpected token '<'` — you're looking at HTML.

**[ASSUMED]** — redirect behavior not documented in installed `obsidian.d.ts`. The community consensus (various plugin GitHub issues) is that `requestUrl` follows redirects by default but exposes the final status. Needs empirical verification during fixture capture (D-31); add a deliberate expired-session case to the capture plan.

### Pitfall 4: `AbortController` absent; abort races

**What goes wrong:** User clicks Cancel during a `checkSubmission` in-flight. The in-flight `requestUrl` has no way to be cancelled (no `AbortSignal` support per `RequestUrlParam`). If the orchestrator's abort flag is flipped AFTER the `await` resolves but BEFORE the next `schedule()` call, we've already processed one extra poll result.

**Why it happens:** `requestUrl` fire-and-forget, D-23.

**How to avoid:** Check `abortFlag.cancelled` at THREE points per poll iteration:
1. Entry to the scheduled callback (before `checkSubmission`)
2. After the `await checkSubmission` resolves (before processing the result)
3. Before scheduling the next timer

Also: on cancel, the modal closes immediately — even if a stale poll result lands in `.then()` later, the modal's DOM refs are gone and the render call is a no-op. Defense in depth.

**Warning signs:** Cancel feels "sluggish" — user sees the spinner for 1-2 seconds after clicking Cancel.

### Pitfall 5: `## Custom Tests` round-trip produces drift

**What goes wrong:** User has typed text between `### Case 1` and `### Case 2` in their note (a note to themselves, e.g., "Case 2 is a palindrome"). They open CustomTestModal, click Run without editing. Modal persists cases back — but the inter-case user text is lost because the naive parser just serialized `### Case N` blocks in order.

**Why it happens:** D-19 calls for preservation of user-added text within a plugin-owned section, but existing `HeadingRegion.ts:36-105` only handles single-`##` region rewrites (no nested `###`). A naive extension would blow away inter-case content.

**How to avoid:** The HeadingRegion extension MUST:
1. Parse the `## Custom Tests` region into a sequence of items: `{ type: 'case', n: number, block: string } | { type: 'free-text', content: string }`.
2. On write-back, preserve `free-text` items verbatim; only overwrite `case` items' fenced-block content.
3. New cases appended from the modal go AFTER all existing items (including trailing free text).

Recommendation: **add a new helper module `src/notes/CaseRegion.ts` rather than extending `HeadingRegion.ts`**. The existing module is a tight string rewriter built around single-heading ownership — adding nested-heading awareness doubles its complexity. A sibling module with its own tests (`heading-region-nested-cases.test.ts`) isolates risk.

**Warning signs:** User reports "my notes under Custom Tests disappeared."

### Pitfall 6: Starter-code fence-block detection too loose

**What goes wrong:** User pastes a pseudo-code `text` fenced block under `## Code` for planning:
````
## Code
```text
// plan: hash map, one pass
```
````
Phase 3 sees "there's a fenced block → leave alone" and never injects starter code. User then runs Submit and gets "No code block found" or submits the pseudo-code literally.

**Why it happens:** D-07's "no fenced block → retrofit" detection is the obvious rule; the edge case is fenced-block-but-not-code.

**How to avoid:** Starter-code retrofit detection semantics:
1. A fenced block with a recognized LC langSlug (`python3`, `java`, `cpp`, `javascript`, `typescript`, `rust`, `golang`, `csharp`, `c`, `kotlin`, `swift`, `scala`, `php`, `ruby`, `mysql`, `postgresql`, `mssql`, `oraclesql`) → user-owned, don't touch.
2. A fenced block with `text`, `plaintext`, no tag, or an unknown tag → NOT considered starter code. Retrofit still fires AND places the starter block ABOVE the user's pseudo-code block (first in the section).
3. Multiple fenced blocks under `## Code`: the FIRST one is the submission target (matches D-01). Retrofit only fires when NONE of the blocks is tagged with a recognized LC langSlug.

This matches user intent: users who write pseudo-code want it preserved, AND they want a real starter block for actual solving.

**Warning signs:** User reports "I wrote pseudo-code and Submit sent that instead of my solution."

### Pitfall 7: Verdict modal unknown-status false negatives

**What goes wrong:** LC introduces a new status_code (e.g., 17 = "Output Format Mismatch") between the research date and a user's submission. The modal shows "Unrecognized verdict" + copy-payload. Good — that's D-15. But: the plugin's status_code integer map is hard-coded; a silent drift between LC's current state and our map is invisible until a user files an issue.

**Why it happens:** leetcode-cli's 2019 map has a gap between 16 (Internal Error) and 20 (Compile Error) — LC may have filled that gap in 2021-2026.

**How to avoid:**
1. `statusMap.ts` uses a typed record with a `kind: 'known' | 'unknown'` discriminator.
2. Log WARN with the full status_code + status_msg whenever `kind === 'unknown'` is dispatched. Logger already redacts sensitive data.
3. During D-31 fixture capture, deliberately try to trigger edge cases (multi-file inputs, format mismatches) to surface any new codes.

**Warning signs:** Warn log spike with "Unknown status_code: N" where N is near the known set.

## Code Examples

### First-fenced-block extraction (SOLVE-01, SOLVE-09, D-01)

```typescript
// src/solve/codeExtractor.ts
// Pure function; no Obsidian imports. Testable with vitest.

const FENCE_OPEN = /^```([a-zA-Z0-9_+-]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;

export interface ExtractedCode {
  lang: string | null;   // null = untagged fence
  code: string;
}

export function extractFirstFencedBlock(noteBody: string): ExtractedCode | null {
  const lines = noteBody.split('\n');
  let i = 0;
  while (i < lines.length) {
    const openMatch = FENCE_OPEN.exec(lines[i] ?? '');
    if (openMatch) {
      const lang = openMatch[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      // i is now at the close fence or EOF. Unclosed fence → treat as no valid block.
      if (i >= lines.length) return null;
      return { lang: lang.length > 0 ? lang : null, code: codeLines.join('\n') };
    }
    i++;
  }
  return null;
}
```

### Language normalization (SOLVE-08, D-02, D-03, D-05)

```typescript
// src/solve/languages.ts
// [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.d.ts:99-104 confirms codeSnippets[].langSlug is the LC-authoritative set]

/** Canonical LC langSlugs observed across problems. Expand as cached codeSnippets reveal more. */
export const LC_LANG_SLUGS = new Set([
  'python3', 'python', 'java', 'cpp', 'c', 'csharp', 'javascript', 'typescript',
  'rust', 'golang', 'kotlin', 'swift', 'scala', 'php', 'ruby', 'elixir', 'dart',
  'erlang', 'racket', 'mysql', 'postgresql', 'mssql', 'oraclesql',
]);

/** Common aliases the user might type in a fence tag. Lowercase keys. */
const ALIASES: Record<string, string> = {
  'py': 'python3',
  'py3': 'python3',
  'python2': 'python',
  'ts': 'typescript',
  'js': 'javascript',
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'go': 'golang',
  'kt': 'kotlin',
  'rb': 'ruby',
  'rs': 'rust',
  'pg': 'postgresql',
  'sql': 'mysql',   // ambiguous; MySQL is LC's default SQL engine
};

/** D-02 + D-03 + D-05: resolve a fence tag (or null for untagged) to an LC langSlug. */
export function resolveLanguage(fenceTag: string | null, defaultLangSlug: string): string {
  if (!fenceTag) return defaultLangSlug;
  const lower = fenceTag.toLowerCase();
  if (LC_LANG_SLUGS.has(lower)) return lower;
  if (ALIASES[lower]) return ALIASES[lower];
  return defaultLangSlug;   // unknown tag → treat as untagged (D-05)
}
```

### Status-code dispatch (SOLVE-06, SOLVE-07, D-12, D-15)

```typescript
// src/solve/statusMap.ts
// [VERIFIED: raw.githubusercontent.com/skygragon/leetcode-cli/master/lib/helper.js
//  statusToName() — WebFetch 2026-05-08]

export type VerdictKind = 'ac' | 'wa' | 'mle' | 'ole' | 'tle' | 're' | 'ie' | 'ce' | 'unknown-lc' | 'unknown';

export interface StatusInfo {
  kind: VerdictKind;
  displayName: string;
}

const KNOWN: Record<number, StatusInfo> = {
  10: { kind: 'ac',          displayName: 'Accepted' },
  11: { kind: 'wa',          displayName: 'Wrong Answer' },
  12: { kind: 'mle',         displayName: 'Memory Limit Exceeded' },
  13: { kind: 'ole',         displayName: 'Output Limit Exceeded' },
  14: { kind: 'tle',         displayName: 'Time Limit Exceeded' },
  15: { kind: 're',          displayName: 'Runtime Error' },
  16: { kind: 'ie',          displayName: 'Internal Error' },
  20: { kind: 'ce',          displayName: 'Compile Error' },
  21: { kind: 'unknown-lc',  displayName: 'Unknown Error' },
};

export function classifyStatus(code: number, msg: string | undefined): StatusInfo {
  const known = KNOWN[code];
  if (known) return known;
  return { kind: 'unknown', displayName: msg ?? `Unrecognized status ${code}` };
}
```

### Check-response field map (for VerdictModal renderer)

```typescript
// src/solve/types.ts
// [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.d.ts:1158-1199
//  JudgeCheckResponse — current library's understanding of the LC response shape]

export interface JudgeCheckResponse {
  state: 'PENDING' | 'STARTED' | 'SUCCESS';
  status_code?: number;          // present only on state === 'SUCCESS'
  status_msg?: string;           // 'Accepted' | 'Wrong Answer' | ...
  status_runtime?: string;       // '12 ms'
  runtime_percentile?: number;   // 85.4
  status_memory?: string;        // '14.2 MB'
  memory_percentile?: number;    // 78.1
  lang?: string;
  run_success?: boolean;

  // Run (interpret_solution) fields:
  code_answer?: string | string[];
  expected_code_answer?: string | string[];
  code_output?: string | string[];
  correct_answer?: boolean;

  // Submit fields:
  total_correct?: number;
  total_testcases?: number;
  input?: string;                // first failing case (present on WA/TLE/RE on submit)
  last_testcase?: string;        // alt name for first failing case
  std_output?: string;           // user's stdout on submit (WA)
  expected_output?: string;      // judge's expected output (WA submit)

  // Error text fields (all error states):
  runtime_error?: string;
  compile_error?: string;
  syntax_error?: string;
  full_runtime_error?: string;   // undocumented in library types but observed in LC responses; [ASSUMED] — verify at D-31
  full_compile_error?: string;   // same

  submission_id?: string | number;
}
```

### Field presence per verdict state (what to render in D-13)

| Verdict | Primary fields on `/check/{id}` response | Render per D-13 |
|---------|------------------------------------------|-----------------|
| AC | `status_code: 10`, `status_runtime`, `runtime_percentile`, `status_memory`, `memory_percentile`, `total_correct === total_testcases` | Status + runtime line + percentile row |
| WA (submit) | `status_code: 11`, `input` or `last_testcase`, `std_output`, `expected_output` | Input / Output / Expected with diff highlight |
| WA (run) | `status_code: 11`, `code_answer`, `expected_code_answer`, `code_output` | Input (from user's `data_input`) / Output / Expected |
| TLE | `status_code: 14`, `input`/`last_testcase`, sometimes `code_output` partial | Status + failing input + (optional) computed output |
| MLE | `status_code: 12`, `input`/`last_testcase` | Status + failing input |
| CE | `status_code: 20`, `compile_error`, `full_compile_error` | Monospace pre block of the full error |
| RE | `status_code: 15`, `runtime_error`, `full_runtime_error`, `input`/`last_testcase` | Error text + failing input |
| Unknown | `status_code: N` not in KNOWN | Raw JSON `<details>` + copy-payload button + warn log (D-15) |

**Confidence levels:**
- Status codes: [VERIFIED: skygragon/leetcode-cli helper.js 2026-05-08]; integers are stable LC protocol.
- Field presence per verdict: [CITED: node_modules/@leetnotion/leetcode-api/lib/index.d.ts:1176-1199 union type] + [CITED: leetcode-cli source — `state`, `run_success`, `code_answer`, `status_runtime`, `status_code`, `input`, `last_testcase`, `total_correct`, `total_testcases`, `*_error`, `judge_type`, `code_output`, `expected_output`, `std_output`]. LC's actual shape per verdict is not formally documented — D-31 fixture capture is the final authority.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Hand-roll all REST — no npm library covers run/submit" (CLAUDE.md) | `@leetnotion/leetcode-api@3.0.0` ships `LeetCodeCLI.testCode/submitCode/pollJudgeResult` | 2026-04-03 (v3.0.0 release; current installed version) | Planner has a fork: consume library REST or hand-roll per D-28. Recommend hand-roll (see Reconsider) but CLAUDE.md row should be updated post-phase. |
| vscode-leetcode's VSCode-URI-scheme bounce login | BrowserWindow cookie capture (Phase 1 AUTH-01) | Phase 1 | Already resolved; Phase 3 inherits |
| Fixed 2-second polling (per old CLAUDE.md "Stack Patterns" → "Poll check/ every 2 s; abort after 30 s") | Exponential backoff 1/2/4/8 s, 60 s cap (D-21/D-22) | 2026-05-08 (CONTEXT.md) | Planner uses D-21 verbatim. CLAUDE.md guidance is overridden per CONTEXT.md reference. |

**Deprecated/outdated:**
- CLAUDE.md §LeetCode API "Hand-rolled REST for run/submit — No npm library covers these three LC REST endpoints" — contradicted by installed v3.0.0. Don't delete (the hand-rolled path is still preferred for control), but note the library option in a follow-up CLAUDE.md update.
- The 30-second poll cap in CLAUDE.md Stack Patterns — superseded by D-22's 60 s cap.

## Reconsider?

**`@leetnotion/leetcode-api` v3.0.0 already implements the full REST pipeline — should we reconsider D-28?**

The library exports `LeetCodeCLI` which extends `LeetCode` and provides `testCode()`, `submitCode()`, and `pollJudgeResult()` — the exact three operations D-28 hand-rolls. Its implementation [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.js:1780-1959] matches CLAUDE.md's reference sources verbatim: same endpoints, same body fields, same header construction. Because it routes through the SAME `fetch_default → fetcher.fetch` module-scoped singleton that Phase 1's `installRequestUrlFetcher()` patches, using it would ALSO automatically go through our throttle + requestUrl.

**Arguments for consuming the library (Path A):**
- Saves ~150 LoC of hand-rolled REST
- CSRF refresh is automatic via `handleCsrf()` + `'update-csrf'` event
- Credential lifecycle is already managed
- Headers are already correct
- Plugin would rebuild `LeetCodeClient.lc` as `new LeetCodeCLI(cred)` instead of `new LeetCode(cred)` — one-line change

**Arguments for staying hand-rolled (Path B — CONTEXT D-28):**
- Library's `pollJudgeResult` polls at fixed 1 s with 60-attempt cap (60 s wallclock = same as D-22, coincidentally) — but NO abort hook. D-23 cancel would require racing a timeout vs the library's own loop. Ugly.
- Library's `pollJudgeResult` retries ANY exception; we want D-26's "3 consecutive non-2xx → judge timeout" semantics.
- Library's `submitCode` returns an internal `JudgeResult` shape (`{ ok, state, testcase, passed, total, error, stdout, answer, expected_answer }`) that DROPS `status_code`, `runtime_percentile`, `memory_percentile`, and the raw `*_error` fields our D-13/D-15 modal needs.
- Library's `testCode` DOES poll the expected/correct endpoint for comparison — but in a way that assumes a fixed interval and doesn't expose the raw responses.
- A library internals change in v4 (fast-moving fork) could silently break Phase 3.

**RECOMMENDATION: Stay hand-rolled (Path B), honor D-28.** The library's implementation is the authoritative COPY source (body shape, headers, CSRF mechanics) — but keep our own orchestrator. Total hand-rolled code ~100 LoC (three REST wrappers + polling loop), well-scoped, fully controllable.

**Do NOT re-open the D-28 decision.** This Reconsider section exists only to flag that the CLAUDE.md stance ("no library covers run/submit") is stale and should be updated in Phase 5 polish after Phase 3 ships.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` (exists; Phase 1–2 tests already pass) |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SOLVE-01 | First fenced block is the submission payload | unit | `npx vitest run tests/code-extractor-first-fence.test.ts` | ❌ Wave 0 |
| SOLVE-01 | No fenced block → Notice + abort | unit | `npx vitest run tests/submission-orchestrator-no-code.test.ts` | ❌ Wave 0 |
| SOLVE-02 | Starter code inserted on first open | unit | `npx vitest run tests/heading-region-code-section.test.ts` | ❌ Wave 0 |
| SOLVE-02 | Retrofit skips when fenced block present with LC langSlug | unit | `npx vitest run tests/heading-region-code-section.test.ts` | ❌ Wave 0 |
| SOLVE-03 | Run sample → interpret_solution with cached exampleTestcases | unit | `npx vitest run tests/leetcoderest-request-shape.test.ts` | ❌ Wave 0 |
| SOLVE-04 | Custom input modal round-trips cases through `## Custom Tests` | unit | `npx vitest run tests/custom-test-modal-persistence.test.ts` | ❌ Wave 0 |
| SOLVE-04 | Nested `### Case N` parsing preserves inter-case user text | unit | `npx vitest run tests/heading-region-nested-cases.test.ts` | ❌ Wave 0 |
| SOLVE-05 | Submit → submit endpoint with judge_type 'large' | unit | `npx vitest run tests/leetcoderest-request-shape.test.ts` | ❌ Wave 0 |
| SOLVE-06 | Backoff cadence 1/2/4/8/8 s under fake timers | unit | `npx vitest run tests/submission-orchestrator-backoff.test.ts` | ❌ Wave 0 |
| SOLVE-06 | 60 s cap triggers timeout state | unit | `npx vitest run tests/submission-orchestrator-backoff.test.ts` | ❌ Wave 0 |
| SOLVE-06 | Cancel during poll aborts cleanly | unit | `npx vitest run tests/submission-orchestrator-abort.test.ts` | ❌ Wave 0 |
| SOLVE-06 | Concurrent submit blocked with Notice | unit | `npx vitest run tests/submission-orchestrator-concurrency.test.ts` | ❌ Wave 0 |
| SOLVE-06 | 3 consecutive non-2xx → judge timeout | unit | `npx vitest run tests/submission-orchestrator-backoff.test.ts` | ❌ Wave 0 |
| SOLVE-06 | 302/401/403 → SessionExpired flow | unit | `npx vitest run tests/leetcoderest-session-expiry.test.ts` | ❌ Wave 0 |
| SOLVE-07 | AC fixture → renders big status + runtime/memory + percentile | unit (fixture) | `npx vitest run tests/verdict-modal-renders-accepted.test.ts` | ❌ Wave 0 + D-31 |
| SOLVE-07 | WA fixture → renders Input/Output/Expected | unit (fixture) | `npx vitest run tests/verdict-modal-renders-wa.test.ts` | ❌ Wave 0 + D-31 |
| SOLVE-07 | TLE fixture → renders failing input | unit (fixture) | `npx vitest run tests/verdict-modal-renders-tle.test.ts` | ❌ Wave 0 + D-31 |
| SOLVE-07 | MLE fixture → renders failing input | unit (fixture) | `npx vitest run tests/verdict-modal-renders-mle.test.ts` | ❌ Wave 0 + D-31 |
| SOLVE-07 | CE fixture → renders compile_error monospace | unit (fixture) | `npx vitest run tests/verdict-modal-renders-ce.test.ts` | ❌ Wave 0 + D-31 |
| SOLVE-07 | RE fixture → renders runtime_error + failing input | unit (fixture) | `npx vitest run tests/verdict-modal-renders-re.test.ts` | ❌ Wave 0 + D-31 |
| SOLVE-07 | Unknown status_code → copy-payload + warn log | unit | `npx vitest run tests/verdict-modal-renders-unknown.test.ts` | ❌ Wave 0 |
| SOLVE-08 | Every LC langSlug from cached codeSnippets resolves to itself | unit | `npx vitest run tests/language-normalization.test.ts` | ❌ Wave 0 |
| SOLVE-08 | Common aliases (py, ts, c++, ...) resolve to canonical slug | unit | `npx vitest run tests/language-normalization.test.ts` | ❌ Wave 0 |
| SOLVE-08 | Unknown fence tag falls back to default | unit | `npx vitest run tests/language-normalization.test.ts` | ❌ Wave 0 |
| SOLVE-09 | REST body reads current note content, not cached | unit | `npx vitest run tests/submission-orchestrator-current-content.test.ts` | ❌ Wave 0 |
| D-31 | Live fixture capture completed for all 6 verdicts | manual | (manual gate — see "Fixture Capture Plan") | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/<touched-file>.test.ts` (under 5 s for a single file)
- **Per wave merge:** `npm test` (full suite; Phase 1+2 has ~40 tests; Phase 3 adds ~25; total under 30 s)
- **Phase gate:** `npm test` green + D-31 fixture capture complete before `/gsd-verify-work`

### Wave 0 Gaps

All test files are new — Phase 3 is greenfield in `src/solve/`. Wave 0 plan includes:

- [ ] `tests/submission-orchestrator-backoff.test.ts` — covers SOLVE-06 (cadence + cap + 3-failure timeout)
- [ ] `tests/submission-orchestrator-concurrency.test.ts` — covers SOLVE-06 D-24
- [ ] `tests/submission-orchestrator-abort.test.ts` — covers SOLVE-06 D-23
- [ ] `tests/submission-orchestrator-no-code.test.ts` — covers SOLVE-01 D-04
- [ ] `tests/submission-orchestrator-current-content.test.ts` — covers SOLVE-09
- [ ] `tests/leetcoderest-request-shape.test.ts` — covers SOLVE-03, SOLVE-05 (body + headers exact)
- [ ] `tests/leetcoderest-session-expiry.test.ts` — covers SOLVE-06 D-27
- [ ] `tests/code-extractor-first-fence.test.ts` — covers SOLVE-01 D-01
- [ ] `tests/code-extractor-language-resolution.test.ts` — covers SOLVE-08 D-02/D-03
- [ ] `tests/language-normalization.test.ts` — covers SOLVE-08 D-05
- [ ] `tests/status-map.test.ts` — covers SOLVE-06 SOLVE-07 D-15
- [ ] `tests/heading-region-code-section.test.ts` — covers SOLVE-02 D-07/D-08
- [ ] `tests/heading-region-nested-cases.test.ts` — covers SOLVE-04 D-19
- [ ] `tests/custom-test-modal-persistence.test.ts` — covers SOLVE-04 D-18
- [ ] `tests/verdict-modal-renders-accepted.test.ts` — covers SOLVE-07
- [ ] `tests/verdict-modal-renders-wa.test.ts` — covers SOLVE-07
- [ ] `tests/verdict-modal-renders-tle.test.ts` — covers SOLVE-07
- [ ] `tests/verdict-modal-renders-mle.test.ts` — covers SOLVE-07
- [ ] `tests/verdict-modal-renders-ce.test.ts` — covers SOLVE-07
- [ ] `tests/verdict-modal-renders-re.test.ts` — covers SOLVE-07
- [ ] `tests/verdict-modal-renders-unknown.test.ts` — covers SOLVE-07 D-15
- [ ] `tests/fixtures/lc-verdicts/{accepted,wa,tle,mle,ce,re}.json` — D-31 live-captured

**Test helpers to extend:**
- `tests/helpers/mock-leetcode-client.ts` — add `{ interpretSolution, submitSolution, checkSubmission }` fakes that return captured fixture JSON. Plan a small FSM: `.mockCheckSequence([pendingResponse, pendingResponse, finalResponse])` so polling tests assert cadence under `vi.useFakeTimers()`.
- `tests/helpers/obsidian-stub.ts` — upgrade `Modal` stub to implement `contentEl = document.createElement('div')`, `titleEl`, `onOpen()`, `onClose()`, `open()`, `close()` so verdict-modal tests can drive the DOM directly.

### Fixture Capture Plan (D-31)

**Pre-merge gate:** Execute live against LC with author's dogfooding account. One plan in Phase 3 execution — probably Plan 01 (Wave 0 infra) or a dedicated Plan 02 immediately after.

**Approach:**
1. Build a small one-shot script (can be a vitest test tagged `.skip` by default) that runs through 6 submissions with known bad/good code:
   - AC: correct Two Sum solution
   - WA: deliberate off-by-one on Two Sum
   - TLE: O(n²) solution on a size-1000 Two Sum variant (use a problem that has a TLE-prone test)
   - MLE: deliberate `list(range(10**9))` in Python on a small-memory problem
   - CE: unclosed brace, deliberate syntax error
   - RE: `raise Exception('x')` on first line, or `int('abc')`
2. Capture both the `/interpret_solution/` and `/submit/` response AND the `/check/{id}` response for each.
3. Write the raw JSON to `tests/fixtures/lc-verdicts/{kind}.json` (one per verdict).
4. Verdict-modal render tests read these fixtures and assert DOM structure.

**Why this must happen BEFORE the verdict modal is built:** the modal's renderer switches on fields that may not be present (e.g., `runtime_percentile` on failed-first-attempt submissions). Building blind would miss edge cases; building against real fixtures catches them.

## Security Domain

> Required — `security_enforcement` not disabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session cookie (LEETCODE_SESSION) + CSRF token, read from `SettingsStore.getAuthCookies()` at each call. Phase 1 already persists to `data.json`. Phase 3 adds NO new credential code. |
| V3 Session Management | yes | Session-expiry detection via `isSessionExpired` (Phase 1, CF-04). On expiry: abort, fire re-auth Notice, user re-invokes (D-27). |
| V4 Access Control | yes | LC's own server-side access control — we're a client. Phase 3 does NOT bypass paywalls (Premium detection deferred to Phase 5 per POLISH-01). Don't submit on behalf of non-authenticated users — extractor returns null if cookies missing. |
| V5 Input Validation | yes | Fence-tag normalization (D-05) — unknown tag → default. LC langSlug validation against cached codeSnippets list. `question_id` validated before submit (must be non-null cached entry). |
| V6 Cryptography | no | No crypto in Phase 3. |

### Known Threat Patterns for Obsidian plugin + LC REST stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via user-controlled output in verdict modal (LC returns `std_output` / `expected_output` strings from user code) | Tampering | `createEl()` + `setText()` only — NEVER `innerHTML` or `.innerText = <user string>`. `<pre>` blocks via `createEl('pre')` with `.setText(str)`. (CF-07) |
| Cookie exfiltration via log leakage | Information Disclosure | `src/shared/logger.ts` redacts keys matching `/session\|csrf\|cookie\|token/i` — already wired (Phase 1 CF-03). Phase 3 logs: only non-sensitive submission metadata (slug, status_code, runtime). NEVER log full request/response bodies. |
| CSRF token embedded in error message | Information Disclosure | Same redact regex catches inline `csrftoken=xxx` patterns. Phase 3 error messages MUST NOT contain cookie values. |
| Replay / session fixation | Tampering | LC controls session lifecycle; we trust it. Our role is to never log or persist cookies outside `data.json`. |
| MITM against LC | Tampering, Info Disclosure | Enforced by HTTPS — `BASE_URL = 'https://leetcode.com'` is a constant. No http fallback. |
| Sending user's cookies to a non-LC host | Info Disclosure | `BASE_URL` constant in `leetcodeRest.ts`; no user-provided URL input. Lint gate: grep in Phase 3 execution: `grep -nE "url:\s*\`\$\{" src/solve/` should only show `${BASE_URL}/...` patterns. |
| Malicious LC response (e.g., crafted `compile_error` with embedded `<script>`) | Tampering | `createEl()` path is safe by construction — `setText()` treats string as text, never parsed. |
| User pastes cookie string with embedded control chars | Input Validation | `SettingsStore.isValidAuthCookies` shape-guard (Phase 1) — only accepts strings. Phase 3 inherits. |
| Unknown verdict payload dumped to clipboard (D-15) | Info Disclosure | Before copying `/check/{id}` payload to clipboard, run it through the logger's `redact()` function to strip any embedded cookie/session artifacts. Same policy as logger. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@leetnotion/leetcode-api` v3.0.0's `LeetCodeCLI.testCode/submitCode` routes through the patched `fetcher` instance (verified via `fetch_default = (...args) => fetcher.fetch(...args)` in lib/index.js:22, and the class uses `fetch_default` at line 1817) | Reconsider section | If fixer's `fetcher` instance isn't routed through our throttle (e.g., due to ESM import cycle oddities), Path A would bypass throttle. Hand-rolled Path B is immune — use that. |
| A2 | `requestUrl` follows redirects by default; 302 from `/interpret_solution/` to `/accounts/login/` is visible either as `res.status === 302` OR as a 200 with HTML body. | Pitfall 3 | If it silently follows AND hides the original status, session-expiry detection needs to fall back to HTML-body inspection. Detection path in D-27 already has fallback via `isSessionExpired(err)`; no change needed — but D-31 fixture capture MUST include one expired-session case to verify. |
| A3 | `full_compile_error` and `full_runtime_error` are present in the real LC response (observed in community plugin source but not declared in library's `JudgeCheckResponse` type). | Code Examples → JudgeCheckResponse | If absent, fall back to `compile_error` / `runtime_error`. Renderer already handles both via `?? fallback`. Low risk. |
| A4 | LC's status_code integer map is stable across 2019 (leetcode-cli) → 2026 (today). New codes since 2019 are rare. | Pitfall 7 | If LC introduced new codes we don't recognize, the D-15 unknown-verdict flow catches them gracefully. Logger warn on unknown lets dogfood detect it. Fail-safe. |
| A5 | CSRF rotation is rare enough in a single session that Phase 3 can skip active `set-cookie` handling; 403 triggers Phase 1 re-auth cleanly. | Pitfall 2 | If rotation is frequent, Phase 3 gets spurious 403s. Mitigation: dogfood monitors; if observed, add `handleCsrf`-style update in a Phase 3 patch. Planner should include a comment in the orchestrator noting this is a deferred enhancement. |
| A6 | Obsidian's `requestUrl` does not consult the Electron cookie jar (not tested — inferred from absent `cookies` field in `RequestUrlParam` and the library's explicit `cookie:` header construction). | Pattern 1 | If it does, our explicit `Cookie:` header could conflict with the jar's value. Standard HTTP behavior: explicit header wins. Safe. |
| A7 | Existing `src/notes/HeadingRegion.ts` single-region rewriter is NOT safe to extend for nested `### Case N` — planner should add a sibling `CaseRegion.ts` module instead. | Pitfall 5 | If planner extends anyway, nested-case write-back needs careful state-machine parse. Sibling module is lower-risk. Strong recommendation; planner decides. |

**Nine claims, all with mitigations. None block planning.**

## Open Questions (RESOLVED)

1. **Does `requestUrl` follow 302 redirects silently, or surface them via `res.status`?**
   - What we know: `RequestUrlParam` has no `redirect` option; Electron's default is follow.
   - What's unclear: whether follow-through preserves original status.
   - **RESOLVED:** Wave 0 spike (Plan 01 Task 3) resolves this empirically. Default assumption: surfaces as `res.status=302`. If spike observes silent-follow-to-200-HTML, fall back to HTML-body sniff (`/<title>Log In|<form[^>]+action="\/accounts\/login/i`). Plan 04 `leetcodeRest.ts` implements BOTH paths defensively (status check AND HTML sniff) per Assumption A2 defense-in-depth. No plan decision blocked on spike outcome.

2. **How frequent is CSRF rotation in a dogfooding session?**
   - What we know: library does `handleCsrf` on every response.
   - What's unclear: whether LC actually rotates often, or once-per-login.
   - **RESOLVED:** Dogfood-monitored. Phase 3 skips active rotation handling; reads cookies per-call (Pitfall 2 mitigation via `settings.getAuthCookies()` inside the check closure — Plan 05 Task 2). Safe default: per-call cookie read propagates fresh values from `SettingsStore` whenever user re-logs. If dogfooding observes >1 rotation/day with spurious 403s, add `handleCsrf`-style updater as a Phase 3 patch. Not a blocker for planning.

3. **Is the verdict modal title "LeetCode: Wrong Answer — Two Sum" or "Wrong Answer — Two Sum"?** (UI-SPEC question)
   - What we know: UI-SPEC.md (Phase 1) says sentence case + "LeetCode" is the brand prefix allowed on Notices.
   - What's unclear: Modal titles are a different surface — the plugin's display name already prefixes the Obsidian command palette. The modal title is presenter-to-user.
   - **RESOLVED:** Per UI-SPEC contract (Phase 3 UI-SPEC), modal title is `{verdict name} — {problem title}` with NO plugin prefix (e.g., `Wrong Answer — Two Sum`). Obsidian's modal chrome already provides app context. Plan 05 Task 2 implements this exact title format (`${info.displayName} — ${problemTitle}`) verbatim.

4. **Should the custom-test modal's active tab's unsaved edits persist if the user cancels without clicking Run?**
   - What we know: D-18 says cases persist on Run; D-17's tab affordances describe add/remove but not save-on-close.
   - What's unclear: explicit on-close persistence.
   - **RESOLVED:** UI-SPEC Decision 6 confirms: persist on ANY close path (Cancel button, Escape key, outside click, Run button). Reads feel "saved by default." Plan 05 Task 3's `CustomTestModal.onClose()` calls `persist()` unconditionally (guarded by `didPersist` flag to avoid double-persist when Run → close() cascades).

## Environment Availability

> Phase 3 is pure code/config against already-installed Phase 1–2 stack. No new external dependencies. Skipping this section.

## Project Constraints (from CLAUDE.md)

- **Desktop Obsidian only (v1).** `isDesktopOnly: true` preserved (CF-02).
- **leetcode.com only.** Hard-coded in `BASE_URL` constant.
- **Obsidian plugin TypeScript.** Phase 3 stays inside the official API surface.
- **Prefer well-maintained library over hand-rolling GraphQL.** Already resolved (Phase 1 uses `@leetnotion/leetcode-api`). Phase 3's hand-rolled REST is scoped to the THREE endpoints the library lacks GraphQL for — this matches CLAUDE.md's "Hand-rolled REST for run/submit" row. (Note: CLAUDE.md row is stale — see Reconsider section — but the hand-rolled decision still stands.)
- **Pass `eslint-plugin-obsidianmd` with zero Required violations.** No `innerHTML`, no `fetch`/`axios`, no default hotkeys (D-10), no plugin-id-in-command-id, `createEl()` for DOM (CF-05, CF-07).
- **Previously-fetched content readable offline.** Phase 3 adds NO offline-reading surface — submissions are live-only per REQUIREMENTS (submission status NEVER cached per CLAUDE.md §5 Offline Cache).
- **Session cookie in local plugin data only; never logged, never transmitted except to LC.** CF-03 upheld — Phase 3 reads cookies only to build `Cookie:` header for LC POSTs; logger redacts; BASE_URL constant prevents off-LC leakage.
- **`requestUrl` (Obsidian built-in) for all HTTP.** CF-01, D-25, D-28 — all three REST endpoints via the existing throttle pipe.
- **`createEl()` / DOM API for all UI, never `innerHTML`.** CF-07 — VerdictModal and CustomTestModal build entirely with `createEl()` + `setText()`.
- **`app.fileManager.processFrontMatter()` for atomic frontmatter writes.** CF-06 — Phase 3 does NOT write frontmatter directly (Phase 4 owns solve-time fields) but starter-code retrofit + Custom Tests persistence use `vault.process()` for body writes.
- **Do NOT use `Vault.modify()` on problem notes.** CF-06 — grep gate. Phase 3 extends to `src/solve/`:
  ```
  grep -rE "vault\.modify\s*\(" src/solve/ src/notes/ --include='*.ts'    # must be empty
  ```
- **No React, no Svelte.** Vanilla TS + createEl. Phase 3 bundle should stay well under the 50 kB CLAUDE.md target.
- **Register via `this.registerInterval()` on timers.** Polling loop per Pattern 2 above.
- **No default hotkeys on commands.** D-10 + CLAUDE.md §8 — Phase 3's five commands ship hotkey-free.

## Sources

### Primary (HIGH confidence)

- `node_modules/@leetnotion/leetcode-api/lib/index.d.ts` (installed v3.0.0) — `DetailedProblem`, `JudgeCheckResponse`, `TestCodeOptions`, `SubmitCodeOptions`, `InterpretResponse`, `SubmitResponse`, `LeetCodeCLI` class signature
- `node_modules/@leetnotion/leetcode-api/lib/index.js:1780-1960` — `LeetCodeCLI.authHeaders`, `handleCsrf`, `restRequest`, `pollJudgeResult`, `testCode`, `submitCode` implementation (authoritative reference for hand-rolled REST)
- `node_modules/obsidian/obsidian.d.ts:5270-5314` — `requestUrl`, `RequestUrlParam`, `RequestUrlResponse`
- `node_modules/obsidian/obsidian.d.ts:4332-4404` — `Modal` class signature
- `node_modules/obsidian/obsidian.d.ts:4467-4504` — `Notice` class signature
- `node_modules/obsidian/obsidian.d.ts:1901-1907` — `Plugin.registerInterval` signature
- `src/api/LeetCodeClient.ts` — `isSessionExpired` (reused, not duplicated)
- `src/api/throttle.ts` — `Throttle` class with `acquire`/`release`/queue observer (extended for direct `requestUrl` use)
- `src/api/requestUrlFetcher.ts` — Phase 1 throttle-integrated fetcher (reused; shows the fetch_default patching pattern)
- `src/settings/SettingsStore.ts` — `DetailCacheEntry`, `getAuthCookies`, `getProblemDetail` (extended with `internalQuestionId`)
- `src/notes/NoteTemplate.ts`, `src/notes/HeadingRegion.ts`, `src/notes/NoteWriter.ts` — Phase 2 extension points
- `src/shared/timers.ts` — popout-window-safe `setWindowTimeout`/`clearWindowTimeout`
- `src/shared/logger.ts` — redacting logger for warn-level unknown-verdict logs
- `src/shared/errors.ts` — `SessionExpiredError`, `RateLimitError` (extend with `SubmissionError` hierarchy)

### Secondary (MEDIUM confidence)

- `raw.githubusercontent.com/skygragon/leetcode-cli/master/lib/config.js` (WebFetch 2026-05-08) — endpoint path templates `test`, `submit`, `verify`
- `raw.githubusercontent.com/skygragon/leetcode-cli/master/lib/plugins/leetcode.js` (WebFetch 2026-05-08) — request body fields, headers (`Origin`, `Referer`, `X-CSRFToken`, `Cookie`, `X-Requested-With`), `parseInt(problem.id, 10)` as `question_id`, check-response field list (`state`, `run_success`, `code_answer`, `status_runtime`, `status_code`, `input`, `last_testcase`, `total_correct`, `total_testcases`, `*_error`, `judge_type`, `code_output`, `expected_output`, `std_output`)
- `raw.githubusercontent.com/skygragon/leetcode-cli/master/lib/helper.js` (WebFetch 2026-05-08) — `statusToName` integer map (10/11/12/13/14/15/16/20/21)

### Tertiary (LOW confidence)

- Community consensus on `requestUrl` redirect behavior — various plugin GitHub issues. Needs empirical verification during D-31 fixture capture (Assumption A2).

## Risk Assessment

**What's likely to break:**
- Cookie injection mechanics — if `requestUrl` does unexpected things with the `Cookie:` header (e.g., sanitization, length limits), the first submit fails. **Mitigation:** Wave 0 spike — a single hand-crafted `requestUrl` call to `/api/problems/all/` with explicit `Cookie:` header, asserting 200. Takes ~1 hour; de-risks the rest of Phase 3.
- `question_id` value for premium problems — Phase 2 cache doesn't store `internalQuestionId`. **Mitigation:** schema migration in Plan 01 or 02 (extend `DetailCacheEntry` + refetch on first submit if field missing).
- Unclosed-fence edge case in code extractor — user starts typing a new fenced block and has no close yet. **Mitigation:** treat unclosed fence as "no valid block" (return null), fire the D-04 Notice.
- Modal `contentEl` DOM refs going stale after `close()` — standard pattern is to null refs in `onClose`. **Mitigation:** documented in Pattern 3 above.

**What needs spike-level investigation before planning:**
- Assumption A2 (302/redirect behavior) — RECOMMEND a 15-minute spike in Wave 0: manually log out of LC, invoke `requestUrl` against `/api/problems/all/` with cookies from a logged-out state, inspect `res.status` and `res.text`. Settle this before writing the session-expiry dispatch.

**What's "research done, planner can proceed":**
- Everything else. The REST shape, header shape, cookie mechanics, status_code map, modal patterns, polling loop, tabbed-modal pattern, fixture capture plan, language normalization, heading-region extension strategy, and test matrix are all definitively scoped.

## Metadata

**Confidence breakdown:**
- REST endpoint shape (paths, bodies, headers): HIGH — library source + leetcode-cli source agree verbatim
- Cookie mechanics: HIGH — `RequestUrlParam` type declaration + library's explicit `Cookie:` header construction
- `question_id` semantics: HIGH — library's `SubmitCodeOptions.questionId` + `DetailedProblem`'s dual field + leetcode-cli's `parseInt(problem.id, 10)`
- Status_code integer map: HIGH — leetcode-cli helper.js (2019) stable since; D-31 fixture capture catches any 2026-era additions
- JudgeCheckResponse field presence per verdict: MEDIUM — library type union is conservative; D-31 fixture capture is the authoritative verification
- Modal update pattern: HIGH — `obsidian.d.ts` Modal class + community pattern (refs + mutate)
- Polling timer pattern: HIGH — `registerInterval(id: number)` signature + `setWindowTimeout` existing helper
- HeadingRegion extension: MEDIUM — existing module is single-heading; nested `###` support is new code. Recommendation is to add sibling module rather than extend.
- Starter-code detection semantics: HIGH — recommended semantics are algorithmic, no external uncertainty
- Redirect behavior (A2): LOW — needs empirical verification

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (30 days; LC API is stable; library version pinned to 3.0.0 in package.json)

---

*Phase: 3-run-submit*
*Researched: 2026-05-08*
