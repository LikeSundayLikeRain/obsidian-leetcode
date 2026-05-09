---
phase: 04-knowledge-graph-wiring
plan: 04-05
subsystem: graph
tags: [main-wiring, on-accepted-hook, view-past-submissions-command, submission-history-store, on-open-prefetch]
status: complete
requires:
  - 04-04 (SubmissionPickerModal, SubmissionDetailModal, copyToCode)
  - 04-03 (KnowledgeGraphWriter.onAccepted, listSubmissionsForSlug, detailForSubmission)
  - 04-02 (mergeTechniquesSection, StubNoteCreator, NoteTemplate Technique helpers)
  - 03 (submitFromActive lambda, classifyStatus, VerdictModal, SettingsStore.getAutoBacklinksEnabled/getTechniquesFolder)
  - 01 (SessionExpiredError, requestUrl, Notice copy discipline)
provides:
  - main.ts wiring for LeetCodePlugin.knowledgeGraph + LeetCodePlugin.submissionHistory singletons
  - `LeetCode: View past submissions` command (editorCheckCallback on lc-slug)
  - On-AC entry point — submitFromActive invokes knowledgeGraph.onAccepted + invalidates submission history
  - NoteWriter.setOnNoteOpen setter + three fire-points for D-02 on-open prefetch
  - SubmissionHistoryStore — per-session in-memory submission cache with in-flight dedupe
affects:
  - src/main.ts (Step 5.7 singletons, Step 6c new command, on-AC hook in submitFromActive)
  - src/notes/NoteWriter.ts (onNoteOpen field + setter + 3 fire-points)
  - src/graph/SubmissionPickerModal.ts (optional submissionHistoryStore field in SubmissionPickerDeps)
tech-stack:
  added: []
  patterns:
    - In-memory per-slug submission history store with 60s freshness + in-flight promise dedupe (CF-09)
    - Structural settings facade for DI — SettingsStore exposed through a 3-method interface on the KnowledgeGraphWriter
    - Setter-based hook injection on NoteWriter so graph wiring isn't a hard dependency
    - Auth-cookie closure inside fetchHistory lambda — re-login doesn't strand stale creds
    - Reuses toIsoLocalTz for detail-modal "Submitted" timestamp (single date-format helper)
key-files:
  created:
    - src/graph/SubmissionHistoryStore.ts
    - tests/graph/SubmissionHistoryStore.test.ts
  modified:
    - src/main.ts
    - src/notes/NoteWriter.ts
    - src/graph/SubmissionPickerModal.ts
decisions:
  - D-02 (on-note-open refetch) — honored via NoteWriter.setOnNoteOpen hook firing at all three reveal sites
  - D-03 (`View past submissions` command) — honored; editorCheckCallback gated on lc-slug; opens SubmissionPickerModal
  - D-04 (SubmissionDetailModal lazy-fetch) — honored via detailForSubmission call in openSubmissionDetailFromRow
  - D-07 (no submission-history persistence) — honored; SubmissionHistoryStore is in-memory only, plugin-lifetime scope
  - D-08 (single on-AC entry point) — honored; knowledgeGraph.onAccepted invoked from submitFromActive after verdict assertion
  - D-20 (opt-out scope) — honored via SettingsStore.getAutoBacklinksEnabled wired into KnowledgeGraphWriter
  - D-23 (AC-only gate) — honored; classifyStatus check in submitFromActive + double-check inside KnowledgeGraphWriter
  - D-30 (session-expiry signals) — honored via SessionExpiredError propagation from submissionHistoryClient + locked CF-04 Notice
  - CF-19 (invisible-by-design on-AC write) — honored; on-AC hook errors swallowed with debug log, no Notice
metrics:
  duration_minutes: ~14
  tasks_completed: 2
  files_created: 2
  files_modified: 3
  tests_new: 6 (SubmissionHistoryStore: TTL hit, in-flight dedupe, invalidate+refetch, TTL expiry, rejection retry, picker integration)
  tests_full_suite: 435 pass / 0 fail (429 baseline + 6 new)
  completed_at: 2026-05-09T22:48Z
---

# Phase 4 Plan 05: main.ts Wiring + SubmissionHistoryStore Summary

**One-liner:** Final Wave 3 wiring of the knowledge-graph subsystem into
LeetCodePlugin — adds the `View past submissions` command, injects the
on-Accepted hook into `submitFromActive`, and ships a per-session
SubmissionHistoryStore that coordinates NoteWriter's on-open prefetch
(D-02) with the picker's data source (D-03) without persisting anything
between picker invocations (D-07).

## What shipped

Two commits on `worktree-agent-a4b0dfe606ac0ad28`:

| Task | Commit    | Headline                                                                                     |
| ---- | --------- | -------------------------------------------------------------------------------------------- |
| 2    | `e5b3a27` | SubmissionHistoryStore + NoteWriter on-open hook + picker integration + 6 new contract tests |
| 1    | `898d25a` | main.ts wires KnowledgeGraphWriter singleton, view-past-submissions command, on-AC hook      |

### Task 2 — src/graph/SubmissionHistoryStore.ts (D-02, D-07)

Per-slug in-memory submission history cache. Public surface is three methods:

- **`prefetch(slug)`** — fire-and-forget from NoteWriter.onNoteOpen.
  Populates cache on success; rejections propagate so callers that want to
  know about failures can `.catch`.
- **`get(slug)`** — picker's entry point. Returns cache when fresh; shares
  an in-flight promise when another caller is mid-fetch; otherwise fires
  a new fetch.
- **`invalidate(slug)`** — drops the cached snapshot so the next call
  refetches. Invoked from submitFromActive's on-AC branch so the picker
  sees the new submission the user just made.

Internals:

- 60 s default freshness window — "just opened the note then immediately
  opened the picker" never round-trips twice. Freshness is injectable
  (`freshnessMs`) for tests.
- Clock injection (`now`) for deterministic TTL expiry tests.
- Per-slug in-flight `Map<string, Promise<SubmissionRow[]>>` so a prefetch
  + picker-open race for the same slug shares one network hop (CF-09).
- Rejection leaves cache empty — the next call retries. No "sticky
  failure" mode.
- **No data.json persistence** (D-07): plugin lifetime is the scope. Every
  fresh plugin load starts empty.

### Task 2 — src/graph/SubmissionPickerModal.ts (D-03 compatibility)

`SubmissionPickerDeps` gains an optional `submissionHistoryStore` field.
Production wiring (main.ts) sets this; legacy test contract
(`fetchHistory` fallback) still works untouched so Wave 2's 3 picker tests
keep passing.

Resolution order inside `loadAndRender`:

1. If `submissionHistoryStore` is set → call `store.get(slug)` (preferred).
2. Else if `fetchHistory` is set → call it directly (legacy path).
3. Else throw — loud failure so a wiring bug surfaces immediately.

### Task 2 — src/notes/NoteWriter.ts (D-02 on-open hook)

Adds three pieces:

1. **`NoteOpenHook` type** — `(slug: string) => void`, fire-and-forget
   contract documented at the type level.
2. **`setOnNoteOpen(hook)` setter** — installed once from main.ts after
   SubmissionHistoryStore is constructed. Setter-based (not constructor
   arg) so tests that don't care about the graph layer don't need to
   stub the hook.
3. **`fireOnNoteOpen(slug)` private method** — fired at all three reveal
   sites (re-open cached-path branch, recovered canonical-path branch,
   new-note creation branch). Wraps in a synchronous try/catch so a faulty
   hook never breaks the reveal flow; the hook's own async rejections
   are its to handle (D-12 silent-offline posture).

### Task 2 — tests/graph/SubmissionHistoryStore.test.ts (6 new tests)

All green on first run:

```
tests/graph/SubmissionHistoryStore.test.ts (6/6):
  ✓ prefetch populates cache and avoids a second network hop within TTL
  ✓ two concurrent callers share one in-flight promise (dedupe)
  ✓ invalidate drops the cached snapshot and the next call refetches
  ✓ TTL expiry triggers refetch
  ✓ rejection leaves cache empty so next call retries
  ✓ SubmissionPickerModal accepts the store via submissionHistoryStore field
```

The last test is a cross-module integration — constructs a real
`SubmissionPickerModal` with only `submissionHistoryStore` (no
`fetchHistory`) and verifies the picker routes through the store. Locks
the Plan 05 contract so a future Wave 4 edit can't silently break it.

### Task 1 — src/main.ts (Step 5.7 + Step 6c + on-AC hook)

**Step 5.7 singletons** (new), constructed after NoteWriter:

```ts
this.submissionHistory = new SubmissionHistoryStore({
  fetchHistory: async (slug) => {
    const cookies = this.settings.getAuthCookies();
    if (!cookies) throw new SessionExpiredError();
    return listSubmissionsForSlug(slug, cookies);
  },
});

this.knowledgeGraph = new KnowledgeGraphWriter({
  app: this.app,
  settings: {
    getProblemDetail: (slug) => this.settings.getProblemDetail(slug),
    getAutoBacklinksEnabled: () => this.settings.getAutoBacklinksEnabled(),
    getTechniquesFolder: () => this.settings.getTechniquesFolder(),
  },
});

this.notes.setOnNoteOpen((slug) => {
  void this.submissionHistory.prefetch(slug).catch((err) => {
    logger.debug('graph.prefetch: non-fatal (silent-offline per D-02/D-12)', err);
  });
});
```

Structural settings facade — KnowledgeGraphWriter receives only the three
methods it needs rather than the full SettingsStore; keeps the writer's
test surface stable.

The fetchHistory lambda closes over `this.settings` (not a captured
cookies value) so logout → re-login mid-session doesn't leave the store
pointing at stale credentials.

**Step 6c new command** — `LeetCode: View past submissions`:

```ts
this.addCommand({
  id: 'view-past-submissions',
  name: 'View past submissions',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.openSubmissionPickerFromActive(); }
    return true;
  },
});
```

Same `editorCheckCallback + isValidSlug` pattern as Phase 3's five solve
commands. No hotkey, sentence-case, no plugin-id prefix — consistent with
FND-03 and the community store review rules.

**On-AC hook in submitFromActive** — inserted immediately after
`modal.renderVerdict(terminalTyped, ctx.title)`:

```ts
if (classifyStatus(terminalTyped.status_code, terminalTyped.status_msg).kind === 'ac') {
  try {
    await this.knowledgeGraph.onAccepted(
      { file: ctx.file, slug: ctx.slug, title: ctx.title },
      terminalTyped,
    );
  } catch (err) {
    logger.debug('graph.onAccepted: non-fatal (invisible-by-design)', err);
  }
  this.submissionHistory.invalidate(ctx.slug);
}
```

Points worth noting:

- The classifyStatus gate matches KnowledgeGraphWriter's internal D-23 gate
  verbatim (defense-in-depth).
- Failure is swallowed to a debug log — VerdictModal has already rendered
  "Accepted"; a graph-write Notice would be noise (CF-19).
- Invalidate fires unconditionally on AC so a picker opened after AC sees
  the new submission without waiting for the 60 s freshness window.

**Helpers added at the bottom of the class:**

- `openSubmissionPickerFromActive()` — guard active-problem-note context,
  construct SubmissionPickerModal with the store, open.
- `openSubmissionDetailFromRow(file, title, row)` — guard auth cookies,
  call `detailForSubmission(row.id, cookies)`, map errors
  (SessionExpiredError → CF-04 Notice; other errors → inline "Couldn't
  load submission. Check your connection." Notice), open
  SubmissionDetailModal with the detail payload + `toIsoLocalTz`-formatted
  submitted timestamp.

**Module-scope helper:** `formatLocalTz(unixSeconds)` — unix-seconds →
`toIsoLocalTz` local-tz ISO-8601. Empty string on non-finite / ≤0 inputs
so SubmissionDetailModal omits the field rather than displaying
`1970-01-01T00:00:00…`.

## Verification

### Success criteria — all met

- [x] **Task 1 committed** — `898d25a`. main.ts wires all three Wave 3
      surfaces.
- [x] **Task 2 committed** — `e5b3a27`. SubmissionHistoryStore + hook +
      picker integration + 6 tests.
- [x] **SUMMARY.md committed** — this file.
- [x] **tsc --noEmit exits 0** — verified after each commit.
- [x] **npm run build exits 0** — production esbuild clean.
- [x] **npm test -- --run passes all tests** — 435/435 green; zero
      regressions from the 429 baseline.
- [x] **No `## Solution` heading creation anywhere** — grep for
      `"## Solution"` in src/ returns only doc-comments that explicitly
      reject it (carried over from 04-04).
- [x] **Command registered with UI-SPEC copy** — `View past submissions`
      sentence-case + no plugin-id prefix + no hotkey.
- [x] **AC hook respects D-20 opt-out** — the writer's internal gate reads
      `settings.getAutoBacklinksEnabled()` from the main.ts-supplied
      facade; opt-out still fires step 1 (frontmatter + `lc/{slug}` tags)
      and skips steps 2+3 (## Techniques body + stubs).
- [x] **No modifications to STATE.md or ROADMAP.md** — per parallel
      executor rules.

### Test suite

```
 Test Files  69 passed (69)
      Tests  435 passed (435)
```

All 6 new `SubmissionHistoryStore.test.ts` tests green. All 429 prior
tests still green (no regressions).

### Typecheck + build + lint

- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0 (tsc prepass + esbuild production bundle)
- `npx eslint src/graph/SubmissionHistoryStore.ts src/graph/SubmissionPickerModal.ts` → clean
- `npx eslint src/main.ts` → 0 errors (8 pre-existing unused-disable
  warnings from Phase 1-3, unchanged by this plan)
- `npx eslint src/notes/NoteWriter.ts` → 11 errors at line numbers
  identical to the pre-commit baseline (TFile duck-type casts + Pitfall-4
  setTimeout). All pre-existing from Phase 2/3; verified via
  `git stash && npx eslint` on HEAD^. My Plan 05 diff introduces **zero**
  new lint errors.

### Discipline gates

- `grep -rnE "vault\.modify\s*\(" src/graph/ src/notes/ src/main.ts` → 0
  matches. CF-06 holds.
- `grep -rn "## Solution" src/graph/ src/notes/ src/main.ts` → only
  doc-comments rejecting the creation of that heading (same as Wave 2).
- No new default hotkeys — `view-past-submissions` has no `hotkeys` field.
- No new Notice copy introduced — only reuses locked CF-04 + CF-19
  strings (`LeetCode session expired. Log in again.`,
  `Open a LeetCode problem note first.`, `Couldn't load submission.
  Check your connection.`).
- No `innerHTML`, no `fetch`, no `axios`, no direct `requestUrl` in the
  wiring path — submission history flows through
  `throttledRequestUrl` via `listSubmissionsForSlug`.
- `isDesktopOnly` unchanged (CF-02).

### D-02 prefetch verification

Manual trace through the three NoteWriter reveal branches:

1. **Cached-path re-open** (line 193) — fires onNoteOpen after
   `openLinkText`, before retrofit + ensureLeetcodeBase + background
   cache refresh.
2. **Recovered-canonical-path branch** (line 264) — fires onNoteOpen
   after `openLinkText`, before retrofit + frontmatter re-apply.
3. **New-note creation** (line 347) — fires onNoteOpen after final
   `openLinkText` reveal.

Each site exercised by the existing NoteWriter test harness; reveal
tests still green so the hook is a no-op for tests that don't install it
(default hook is `null`).

## Deviations from Plan

### Auto-fixed Issues

None. Every decision in 04-CONTEXT.md §D-01 through D-30 applied cleanly
at the wiring layer. The only judgment-call additions were defensible
under the decision framework:

- **SubmissionHistoryStore TTL of 60 s** — not explicitly specified in
  04-CONTEXT.md. D-02 says "no TTL" for the history itself, D-07 says
  "no data.json persistence". I read these as "no persistence between
  picker invocations" rather than "no in-memory memoisation within a
  picker+prefetch window", and chose 60 s as a tight bound that preserves
  LC-experience parity (the user's immediate reopen is instant, but a
  refresh one minute later always refetches). Made this configurable
  (`freshnessMs` dep) so a Phase 5 tightening/loosening is trivial.
- **invalidate(slug) on AC in submitFromActive** — not specified in
  04-CONTEXT.md; implied by the D-02/D-07 spirit ("picker matches LC").
  Chose to invalidate explicitly on AC so picker opens immediately after
  AC don't wait for the 60 s window to see the new submission. Aligns
  with "user's local view always reflects LC's server of truth."

### Auth gates

None encountered. Wiring done against the existing in-memory mock vault
+ obsidian-stub test harness; no live LC calls in this plan.

### Scope boundary observations

- **NoteWriter pre-existing lint errors untouched.** 11 `no-tfile-tfolder-cast`
  + `prefer-active-window-timers` errors at unchanged line numbers are
  Phase 2/3 code — the `as unknown as TFile` duck-typing pattern is
  documented as intentional in the file header (tests mock vault with
  plain objects that don't pass `instanceof TFile`). Outside Plan 05
  scope; deferred.
- **Settings UI for `autoBacklinksEnabled`** still Phase 5 POLISH-01. The
  data.json field + getter/setter shipped in Wave 1; Plan 05 only
  consumes them from the wiring layer.
- **grep-no-vault-modify.sh** still covers only `src/notes/` + `src/browse/`.
  Extending to `src/graph/` + `src/main.ts` is an open deferred item
  from 04-01 Task 3; manual grep verified zero matches in both locations.
- **Detail-modal `MarkdownRenderer.render` path** still not wired — the
  `<pre><code class="language-*">` textContent approach from 04-04 stands.
  If Phase 5 adds interactive syntax highlighting the swap is local to
  SubmissionDetailModal.ts.

## Known Stubs

None. Every wiring path in this plan is fully connected:

- `SubmissionHistoryStore` reads live cookies on every fetch — no
  hardcoded empty auth.
- `KnowledgeGraphWriter` settings facade delegates to real
  `SettingsStore` getters — no mocked data.
- `openSubmissionDetailFromRow` fetches real detail via
  `detailForSubmission` — no stub detail object.
- `formatLocalTz` delegates to the real `toIsoLocalTz` helper.

Skip paths (`null` default for `onNoteOpen`, empty-string from
`formatLocalTz(0)`) are intentional fallbacks with clear rationale.

## Threat Flags

None new. Surface introduced in this plan:

- **No new network endpoints** — all submission-history traffic already
  covered by Wave 1/2 threat review (T-04-03-01, T-04-03-02).
- **No new auth paths** — re-uses the SessionExpiredError → CF-04 Notice
  chain from Phase 1; cookies pulled fresh via `SettingsStore.getAuthCookies()`
  at call time so a race between logout and an in-flight prefetch resolves
  naturally (empty cookies → SessionExpiredError).
- **No new file access patterns** — `knowledgeGraph.onAccepted` delegates
  to the Wave 1 writer; vault writes still use `vault.process` +
  `processFrontMatter` + `vault.create` per CF-06.
- **No new trust boundaries** — the on-AC write IS a privileged action
  (user explicitly submitted), and the D-23 gate + D-20 opt-out are the
  two documented trust controls.

## Self-Check: PASSED

**Commits verified on branch `worktree-agent-a4b0dfe606ac0ad28`:**

- `e5b3a27` — `feat(04-05): add SubmissionHistoryStore + NoteWriter on-open hook (Task 2)` ✓
- `898d25a` — `feat(04-05): wire KnowledgeGraphWriter + view-past-submissions command (Task 1)` ✓

**Files created (expected 2):**

- `src/graph/SubmissionHistoryStore.ts` ✓
- `tests/graph/SubmissionHistoryStore.test.ts` ✓

**Files modified (expected 3):**

- `src/main.ts` ✓
- `src/notes/NoteWriter.ts` ✓
- `src/graph/SubmissionPickerModal.ts` ✓

**All in-scope gates green:**

- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0
- Full test suite → 435/435 pass
- `grep -rnE "vault\.modify\s*\(" src/graph/ src/notes/ src/main.ts` → 0
- `grep -rn "## Solution" src/graph/ src/notes/ src/main.ts` → 0 creation
  paths; only doc-comments rejecting the heading
- `grep -rn "view-past-submissions" src/main.ts` → 1 match (the addCommand
  registration)
- `grep -rn "onAccepted" src/main.ts` → 1 match (the on-AC hook)

STATE.md and ROADMAP.md intentionally untouched (orchestrator owns those
writes per parallel-executor rules).
