---
phase: 18-vim-recovery-polish
title: "Phase 18: Vim, Recovery & Polish — Research (post-revert redesign)"
researched: 2026-05-25
domain: Obsidian plugin · CM6 child editor lifecycle · @replit/codemirror-vim modal-state · vault.on event surface
confidence: MEDIUM-HIGH
upstream_anchor: .planning/debug/phase-18-regressions-2026-05-25.md
upstream_uat: .planning/phases/17-polish-edge-cases/17-UAT.md (Tests 17, 23, 24)
prior_attempts:
  - "ac54eb3 (18-02 vault.on + checkStaleChildAndInvalidate) — REVERTED in 98dec9b (chevron-blank-on-python3-c)"
  - "eabec6a (18-01 vim Scope intercept) — REVERTED in cf7cd51 (Esc + insert-mode entry broken)"
  - "60c5cdf (18-03 relative line numbers) — REVERTED in dc886a1 (toggle no-op; integration gap)"
---

# Phase 18: Vim, Recovery & Polish — Research

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-30** Fix scope is v1.2 ship gate. All three sub-plans MUST land before v1.2 release.
- **D-31** 18-04 (manual ship-readiness pass) replaces 17-06's deferred portions. Heap-snapshot UAT + bundle audit doc are re-run on the FINAL v1.2 build that includes Phase 18 fixes.
- **D-32** Vim focus routing fix mirrors `createCmdSlashScopeExtension` pattern at `src/main/childEditorFactory.ts:153-199` (Obsidian Scope on `app.keymap`, push on focus, pop on blur). NOT a DOM-level keydown listener — Obsidian's app-level vim handler is in the Scope-managed pipeline, so a Scope-based intercept is the only path that reliably wins.
- **D-33** `vault.on('modify')` listener for 18-02 fires `repairFenceStructure` ONLY when the modified file matches an active LC problem note (`lc-slug` frontmatter present). Idempotency guard from 17-13 is preserved verbatim.
- **D-34** Stale-child invalidation fires when child's tracked language slug disagrees with parent fence opener tag AND with `lc-language` frontmatter. The check runs at child mount AND on `metadataCache.changed`. Mismatched state forces a child rebuild (registry.delete + re-create on next visible-frame).
- **D-35** Relative line numbers setting is plugin-owned. NOT a wrapper around any third-party plugin's setting. Default OFF. Read once at child mount per D-18 / Plan 17-12 — toggling requires note remount.

> **Critical caveat from `.continue-here.md`:** The `Fix path:` prose in CONTEXT.md §18-01/02/03 is **pre-failure speculation**. The locked_decisions D-30..D-35 above are authoritative for SCOPE/INVARIANTS/IDEMPOTENCY, but the *mechanism* described in CONTEXT for each plan failed in production. This research treats D-32 (Scope-based intercept) and D-34 (stale-child invalidation gate) as **OPEN questions for re-design**, not closed decisions. Discuss-phase / planner must explicitly re-confirm with user before locking.

### Claude's Discretion

- Choice of intercept mechanism for vim (Scope vs CM6 keymap-with-precedence vs DOM-keydown-capture) — D-32 is the prior speculation, but the prior attempt using D-32 broke `Esc` + Insert-mode entry; mechanism is open.
- Exact key set intercepted (CONTEXT speculated `h/j/k/l/d/y/p/o/i/a/x/w/b/e/u/Ctrl-r/Esc/etc.` — that broad set is what broke things; the actual leaking-keys set is narrower and must be empirically determined via DevTools probe).
- Whether `checkStaleChildAndInvalidate` is the right gate at all — Plan 17-09's per-child language tracker plus Plan 17-13's parent-side updateListener may already cover the legitimate stale-child cases without needing a registry-deleting invalidation gate.
- Diagnostic instrumentation strategy — explicit research deliverable below.

### Deferred Ideas (OUT OF SCOPE)

- Visual theme parity (999.1 — Opinionated One Dark Pro palette) — stays in v1.3 backlog.
- Full LSP integration / IntelliSense — out of scope for v1.2.
- Mobile compatibility — v1.2 stays desktop-only.
- Plugin store re-submission — handled in a separate post-Phase-18 release phase.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **VIM-INTERACTION-01** | vim navigation keys (j/k/dd/o/i/a/etc.) execute in the focused child editor, not the parent | §3 (live probe), §4.1 (architecture), §6 (validation) |
| **REPAIR-02-RESILIENT** | fence auto-recovery fires regardless of how the closer was deleted (CM6 transaction, vim, external editor) | §3 (live probe), §4.2 (architecture), §6 (validation) |
| **LINENUM-RELATIVE-01** | child editor's gutter optionally renders relative line numbers via a plugin-owned setting | §3 (live probe), §4.3 (architecture), §6 (validation) |

---

## Project Constraints (from CLAUDE.md)

These are non-negotiable directives that any Phase 18 plan must honor:

1. **`'leetcode.*'` userEvent annotation contract** — Section lock (`src/main/sectionLockExtension.ts:382-391`) drops keystrokes inside locked ranges UNLESS the userEvent string starts with `'leetcode.'`. Any future plugin dispatch targeting a locked range MUST set `userEvent: 'leetcode.<verb>'`. **Phase 18 does not need to introduce a new userEvent string** — its dispatches go to the child (not the parent's locked ranges).
2. **Phase 17 D-05 canonical write-path pattern** — Plugin writes touching the fence body dispatch through the child editor's CM6 instance (looked up via `this.childEditorRegistry.get(file.path)`); the existing `createChildSyncExtension` mirrors the change to the parent with `addToHistory.of(false)`. Fall back to `app.vault.process(...)` only when no child is registered. **Phase 18 must not violate this — the new vault.on('modify') trigger MUST repair the parent CM6 directly (via `parentView.dispatch`), never via vault.process during a mid-flight transaction.**
3. **DO NOT add `'leetcode.reset.child'` to `ECHO_PRONE_USER_EVENTS`** in `src/main/nestedEditorExtension.ts:273-276` — child-origin Reset relies on the existing child→parent sync mirror to propagate to the parent doc.
4. **`'leetcode.fence-repair'` STAYS in `ECHO_PRONE_USER_EVENTS`** — Phase 18's new vault.on-driven repair path must not re-introduce this as a propagated event.
5. **Bundle ceiling 1.8 MB** (CONTEXT D-19). Phase 18 estimated delta: < 5 KB raw.
6. **Vault path verification** — Active dev vault plugin folder is `obsidian-leetcode/`, NOT `leetcode/`. Verify with `app.plugins.manifests.leetcode.dir` before deploying. (Reference: `~/.claude/projects/-Users-moxu-projects-obsidian-leetcode/memory/vault_plugin_path.md`.)

---

## §1 Executive Summary

Phase 18 is the v1.2 ship-gate close-out for three independent UAT-surfaced bugs. Three earlier plans (commits ac54eb3 / eabec6a / 60c5cdf) shipped passing 1738 unit tests and **all three introduced major UAT regressions** when deployed to the user's vault. All three were reverted; the tree is back at Phase 17 round-3 baseline (HEAD `692ed26`, 1713 tests green).

**The pattern across all three failures:** unit tests asserted the contract at the seam they touched but did not exercise the *integration path* through which the seam reaches user-facing behavior. The 1738 green tests are not a proxy for "the fix works in the user's vault." For Phase 18 redesign, **live DevTools probes pasted by the user are the only reliable signal** — three concrete probe snippets (one per sub-plan) are specified in §3 below.

**What the resuming planner must internalize before drafting plans:**

1. **CONTEXT.md §18-01/02/03 `Fix path:` prose is pre-failure speculation** — `.continue-here.md` says so explicitly. The locked decisions D-30..D-35 are scope/invariants only; the *mechanism* for each is **OPEN** until live probes inform the design.
2. **The three sub-plans have very different shapes:**
   - 18-02 (chevron-blank) was a CRITICAL data-corruption-class bug — the chevron silently blanked the Code section for two of the eight supported languages (python3, c). It fires via the same path that all chevron clicks share. **Attack first.**
   - 18-01 (vim Scope) is an over-broad keystroke intercept. Narrowing the key set or changing the mechanism may both work; the user must demonstrate the actual leaking-keys set via probe before we choose.
   - 18-03 (relative line numbers) is a plumbing-only bug — the previous plan added a 7th `createChildEditor` parameter but the call site at `nestedEditorExtension.ts:NestedEditorWidget.toDOM` did not pass it through. The fix is mechanically simple; the *test pattern* is what failed (tested at the factory contract layer; missed the call-site integration).
3. **Two existing Phase 17 mechanisms may already cover what Phase 18 thought it needed:**
   - Plan 17-09's `childLanguageTracker: WeakMap<EditorView, string>` (`src/main.ts:278`) is the SSoT for "current applied child language." It is updated at every dispatch site (`dispatchChildLanguageReconfigure` line 2521, `handleFmChangeForLanguageReactivity` line 2634). **The previous 18-02 attempt re-derived "current slug" from the parent fence opener via `readActiveFenceSlug` — that was the bug.** Any new "current slug" check in 18-02 MUST consume the tracker, not the opener.
   - Plan 17-13's `createParentRepairExtension` (`src/main/childEditorSync.ts:385-422`) already covers parent CM6 transactions that delete the closer (Source Mode keystrokes). **The remaining gap that 18-02 needs to close is non-CM6 writes (vim's Ex commands, external editor saves) — those bypass CM6 entirely.**

**Primary recommendation:** Order of attack is `18-02 → 18-01 → 18-03`. Each begins with a `/gsd-debug` cycle that captures live probe state from the user's vault BEFORE writing any fix code. Tests at the contract layer continue to provide regression coverage but do not gate plan completion — the gate is operator-confirmed manual UAT against the live build.

---

## §2 Failure Mode Analysis (anchor: `.planning/debug/phase-18-regressions-2026-05-25.md`)

### 2.1 — 18-02: chevron-blank-on-python3-c (CRITICAL, data corruption class)

**Failure mode in production:**
- User clicks chevron, picks Python3 (or C). Other languages: java, javascript, rust, go, cpp directly are fine.
- Fence opener flips correctly: `\`\`\`python` (D-04 remap from `python3 → python`) or `\`\`\`cpp` (from `c → cpp`).
- Frontmatter `lc-language: python3` (or `c`) is correctly written.
- **Code section goes BLANK.** `.lc-nested-editor` div exists in the DOM but is empty — no `.cm-content` inner editor. The child registry's entry was deleted; widget rebuild produced an empty container.
- Reverting just 18-02 fixes the regression.

**Confirmed primary root cause** (from regression doc + source trace):
- `checkStaleChildAndInvalidate` was reading `openerSlug` via `readActiveFenceSlug` (`src/main.ts:2674`).
- `readActiveFenceSlug` returns the RAW fence-opener tag — for `python3` selection, that's literally `python` (D-04 remap). For `c` selection, that's literally `cpp`.
- The check compared `openerSlug` (raw `python`) against `currentSlug` from the per-child tracker (`python3`). They disagreed. The check tripped → `registry.delete(file.path)` → on next widget rebuild the container is empty until next CM6 cycle creates a fresh child.
- **Hotfix attempted:** alias-resolve `openerSlug` via `resolveLangSlug` (`src/solve/languages.ts:67`) so `python → python3` and `cpp → c`. **User reported "still broken" with the hotfix in place.** So either the alias resolution was incomplete OR there was a secondary cause.

**Suspected secondary cause** (unverified, candidate for live probe):
- `vault.on('modify')` listener fires DURING `switchFenceLanguage`'s mid-flight CM6 transaction. The chevron's path in `src/main.ts:2451-2458` dispatches `cm.dispatch({changes: [openerChange, bodyChange], userEvent: 'leetcode.lang-switch'})` — that's a SINGLE CM6 transaction. But Obsidian's vault.modify event fires when the editor flushes to disk, which can interleave with the Step C `processFrontMatter` write. If `triggerRepairFromVaultModify` runs against the in-flight state where `findCodeFence` transiently returns null (during the rewrite window), mid-flight repair could corrupt the parent CM6 state — and `checkStaleChildAndInvalidate` running on that path would then trip the registry delete.

**What the previous plan's `Fix path:` got wrong:**
- CONTEXT.md §18-02 said *"At child mount, compare child's tracked slug (from childLanguageTracker WeakMap, Plan 17-09) against `lc-language` frontmatter AND active fence opener tag. If they disagree, force a registry invalidation."* The bug is in this design: the parent fence opener tag is **structurally guaranteed to disagree** with `lc-language` for python3/c due to the D-04 remap. Any check that compares the raw opener tag to the canonical LC slug WILL trip on every chevron switch to python3 or c. Alias resolution fixes the comparison shape, but the fundamental conceptual bug is that **the parent fence opener is not a sound proxy for "current applied child language"** — only the per-child tracker is. Plan 17-09 made this exact discovery (see Phase 17-UAT.md Issue 3 — "asymmetric round-trip"); the previous 18-02 attempt re-introduced it.

**What "the right approach" might look like for redesign:**
- **Option A (minimal, safest):** Remove `checkStaleChildAndInvalidate` entirely. The 999.3 reproduction (vim dd bypass leaving stale state) may already be covered by Plan 17-13's parent-side `createParentRepairExtension` listener — that listener fires `repairFenceStructure` whenever the parent doc's `findCodeFence` returns null. Combined with Plan 17-09's per-child language tracker (which handles the round-trip case), there may be no remaining stale-child case that needs invalidation.
- **Option B (if A is insufficient):** Replace `checkStaleChildAndInvalidate` with a check that consumes ONLY the per-child tracker and the frontmatter — NEVER the parent fence opener. The check fires on `metadataCache.changed`, NOT during `switchFenceLanguage`'s mid-flight transaction. Disagreement between tracker and frontmatter dispatches a `Compartment.reconfigure` (the existing `handleFmChangeForLanguageReactivity` path), NOT a `registry.delete`.
- **Option C (most invasive, last resort):** Keep registry invalidation but guard it with a "transaction in flight" boolean that switchFenceLanguage sets/clears around its `cm.dispatch` + `processFrontMatter` block.

**Live probe needed (§3.1) before choosing.**

---

### 2.2 — 18-01: vim Scope intercept (over-broad)

**Failure mode in production:**
- **POSITIVE:** j/k/dd/o navigation no longer leaks to parent (the bug 18-01 was meant to fix). Routing direction works.
- **NEGATIVE 1:** `Esc` no longer returns Insert→Normal mode. Scope intercept appears to swallow `Esc` before vim's modal state machine sees it.
- **NEGATIVE 2:** `o`/`i`/`a`/`s` Insert-mode entry intermittently fails to enable typing. Status panel updates to `--INSERT--` but the editor doesn't accept input until the user presses i/a/s a second time.
- **NEGATIVE 3:** `:set nu` / `:set nonu` aliases are no-ops. Either `Vim.defineEx` registration didn't fire or the Scope routes the `:` keystroke away from vim's command-line handler.

**Confirmed root cause:** The Scope intercept registered too many keys. Vim's modal state machine relies on key events flowing through CM6's `vim()` extension's internal input handler — our Scope was bypassing for navigation keys but apparently also for `Esc` and Insert-mode initiator keys. Specifically:
- `@replit/codemirror-vim` 6.3.0 hooks the keydown event at the CM6 view level via its own `keymap.of` returned from `vim()`. The vim modal state lives in a CM6 `StateField` (per the package's `index.d.ts:435 vim: vimState`) — readable via `getCM(view)` (line 1086).
- Obsidian's `app.keymap.pushScope(scope)` is HIGHER priority than any CM6 `keymap.of` — it intercepts BEFORE the keydown reaches CM6 at all. When the previous Scope registered a navigation key, it consumed the keydown; vim's modal handler never saw it (correctly, that's the goal). But when the Scope registered Esc or i/a/o/s, vim's modal-state transition (Normal → Insert, Insert → Normal) was bypassed too — leaving the modal state inconsistent with the visible mode indicator.

**What the previous plan's `Fix path:` got wrong:**
- CONTEXT.md §18-01 said *"intercept vim navigation/edit keys (h/j/k/l/d/y/p/o/i/a/x/w/b/e/u/Ctrl-r/Esc/etc.)"* — that key set is too broad. The keys that need intercepting are ONLY the keys that empirically leak to the parent. The Insert-mode entry keys (i/a/o/s/I/A/O/S) and Esc do not leak (they correctly transition the child's vim state); they were intercepted unnecessarily.
- The "Scope or DOM" framing missed a third option: **intercept at CM6 keymap-with-precedence** on the child's extension array. Such a keymap.of with `Prec.highest` runs INSIDE CM6's keymap pipeline (after the Scope but before any CM6 default keymap), keeping vim's modal-state handler in the loop while still winning over the parent CM6's vim handler.

**What "the right approach" might look like for redesign:**
- **Option A (Scope, narrow):** Keep D-32's Scope mechanism but intercept ONLY the keys empirically observed to leak. The probe in §3.2 captures the leaking set. Likely candidates: navigation+edit keys in NORMAL mode only — `j` / `k` / `h` / `l` / `dd` / `yy` / `p` / `x` / `gg` / `G` / `w` / `b` / `e` / `0` / `$`. Insert-mode keystrokes (anything after `i`/`a`/`o`/`s`/Esc-back-to-Normal) should NOT be intercepted — they're plain typing/Esc and route correctly through CM6's vim() input handler. The Scope handler must check vim's mode (via `getCM(view).state.vim.insertMode`) and pass through everything in Insert mode.
- **Option B (CM6 keymap-with-precedence):** Replace the Scope with a CM6 `keymap.of` returned from a function that wraps vim's commands and is mounted with `Prec.highest` on the child's extension array (before `vim()`). This keeps vim's modal-state machine fully in control and only requires winning over CM6's parent keymap pipeline (not the OS keydown event). Tradeoff: Obsidian's app-level Scope MIGHT still beat this for some hotkey-bound vim keys (e.g., j is bound to "scroll down" globally?). The probe in §3.2 reveals whether this is true for the user's setup.
- **Option C (DOM-keydown-capture on the child's contentDOM):** Last-resort — adds a `keydown` listener on `view.contentDOM` with `{capture: true}` that calls `event.stopImmediatePropagation()` for vim navigation keys. Wins over both Scope and CM6 because it fires before either gets the event. But Obsidian community-plugin guidelines discourage capture-phase keydown listeners for accessibility; falls last.

**Live probe needed (§3.2) to pick mechanism + key set.**

---

### 2.3 — 18-03: relative line numbers (integration path gap)

**Failure mode in production:**
- Toggle setting ON in plugin settings → reload app → child editor still shows ABSOLUTE line numbers (or no gutter at all if `showLineNumber` is OFF).
- The `formatNumber` callback may not even be called.

**Confirmed root cause:** "Tested the contract but not the integration." The plan added a 7th parameter (`showRelativeLineNumbers`) to `createChildEditor`, and the unit test in `tests/main/childEditorFactory.test.ts` exercised the factory directly with that 7th argument. **But the call site at `src/main/nestedEditorExtension.ts:NestedEditorWidget.toDOM` (line 119-125) does NOT pass that 7th argument** — it constructs the widget with 6 args (filePath, registry, fenceContent, initialSlug, indentOverride, app) and `toDOM` calls `createChildEditor` with the same 6-tuple. The factory received `undefined` for the 7th param, the gate `showRelativeLineNumbers ? [...] : []` evaluated falsy, and the formatter never reached the gutter.

**What the previous plan's `Fix path:` got wrong:**
- The plan was correct in shape — add the field, add the toggle, add the formatter, gate the extension. The plan was wrong in its **completion check** — the unit test fixture pre-bound the factory's call site, so a green test did not prove the production call site at `NestedEditorWidget.toDOM` was updated.
- The plan missed `NestedEditorWidget`'s constructor signature (line 80-89 of `nestedEditorExtension.ts`) which has 6 readonly fields. Adding the 7th param to `createChildEditor` REQUIRES adding a 7th field to `NestedEditorWidget` and threading it through `buildNestedDecorations` (line 233 — where the widget is constructed) which in turn needs to read the new setting from the SettingsStore.

**What "the right approach" looks like:**
- The integration path is `SettingsStore field` → `SettingsStore.getShowRelativeLineNumbers()` → `buildNestedDecorations` reads it → passes into `new NestedEditorWidget(...)` → `NestedEditorWidget.toDOM` passes into `createChildEditor` → factory gates `lineNumbers({formatNumber})` extension. **All five touchpoints must be updated atomically.**
- The acceptance check is **a live DevTools probe of the rendered gutter** — read `.cm-gutter .cm-gutterElement` text content and verify it shows relative numbers (e.g., for cursor on line 4: `[1, 2, 3, 0, 1, 2, 3]` not `[1, 2, 3, 4, 5, 6, 7]`).

**Live probe needed (§3.3) to confirm gutter actually renders.**

---

## §3 Live Diagnostic Probe Strategy

Each probe is a self-contained JavaScript snippet the user pastes into Obsidian's developer console (`Cmd-Shift-I` → Console tab) with a problem note open. Output is copy-pasted back to Claude before any fix code is written.

### §3.1 — Probe for 18-02 (chevron-blank ground truth)

```javascript
// Phase 18 redesign — chevron-blank diagnostic probe.
// Run ONCE before clicking the chevron, then again after.
// Capture both outputs and paste back.
(function lcChevronBlankProbe() {
  const app = window.app;
  const plugin = app.plugins.plugins.leetcode;
  if (!plugin) return console.error('lc plugin not loaded');
  const view = app.workspace.getActiveViewOfType(
    require('obsidian').MarkdownView,
  );
  if (!view || !view.file) return console.error('no active markdown view');
  const file = view.file;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const cm = view.editor.cm;
  const doc = cm.state.doc;

  // Find ## Code section opener line
  let openerLineIdx = -1, openerText = '';
  for (let i = 1; i <= doc.lines; i++) {
    const t = doc.line(i).text;
    if (/^\s*```\S+\s*$/.test(t)) { openerLineIdx = i; openerText = t; break; }
  }

  // Read per-child tracker (Plan 17-09) for this file
  const childView = plugin.childEditorRegistry?.get(file.path);
  const trackedSlug = childView ? plugin.childLanguageTracker.get(childView) : null;

  // Resolve raw vs alias-normalized opener slug
  const rawOpenerSlug = openerText.match(/```\s*(\S+)/)?.[1] ?? null;
  const { resolveLangSlug } = window.lcDebug?.languages ?? {};
  const normalizedOpenerSlug = resolveLangSlug
    ? resolveLangSlug(rawOpenerSlug, fm['lc-language'] ?? 'python3')
    : '(resolveLangSlug not exposed; raw only)';

  console.log('=== lc-chevron-blank-probe ===');
  console.log('file.path             :', file.path);
  console.log('fm.lc-slug            :', fm['lc-slug']);
  console.log('fm.lc-language        :', fm['lc-language']);
  console.log('opener line idx       :', openerLineIdx);
  console.log('opener line text      :', JSON.stringify(openerText));
  console.log('rawOpenerSlug         :', rawOpenerSlug);
  console.log('normalizedOpenerSlug  :', normalizedOpenerSlug);
  console.log('trackedSlug (17-09)   :', trackedSlug);
  console.log('child registered      :', !!childView);
  console.log('child .cm-content     :', !!view.containerEl.querySelector('.lc-nested-editor .cm-content'));
  console.log('child doc preview     :', childView ? childView.state.doc.toString().slice(0, 80) : '(no child)');
  console.log('=== end ===');
})();
```

**What to capture:**
- BEFORE chevron click (note showing Java): record all 9 lines.
- AFTER chevron switch to Python3: record all 9 lines + check whether `.cm-content` has gone null.
- AFTER chevron switch to C: same.

**What to look for:**
- Does `trackedSlug` get updated synchronously by `dispatchChildLanguageReconfigure` (line 2521) BEFORE the user-visible blank window?
- Does the `.cm-content` selector return null only AFTER the click, or transiently during the click?
- Does `rawOpenerSlug` differ from `trackedSlug` (the bug shape) or do they match (alias resolution worked)?

### §3.2 — Probe for 18-01 (vim leaking-keys ground truth)

```javascript
// Phase 18 redesign — vim leaking-keys diagnostic probe.
// Adds a temporary capture-phase keydown listener that logs:
//   (a) which DOM element received the keydown
//   (b) what active vim mode the child is in
//   (c) whether the keydown reached the parent or child CM6
//
// User instructions:
// 1. Run this snippet to install the probe.
// 2. Click into the child editor (status panel = --NORMAL--).
// 3. Press: j, k, dd, yy, i, Esc, a, o, s, x, p (one at a time, slowly).
// 4. Run lcVimProbeStop() to remove the probe and dump captured events.
// 5. Paste the dump back.
(function lcVimProbe() {
  if (window.__lcVimProbe) return console.warn('already installed');
  const app = window.app;
  const plugin = app.plugins.plugins.leetcode;
  const view = app.workspace.getActiveViewOfType(
    require('obsidian').MarkdownView,
  );
  if (!view) return console.error('no active markdown view');
  const events = [];
  const handler = (e) => {
    const target = e.target;
    const inChild = !!target.closest('.lc-nested-editor');
    const inParent = !inChild && !!target.closest('.cm-content');
    // Try to read child vim mode if available
    let vimMode = '?';
    try {
      const childView = plugin.childEditorRegistry.values().next().value;
      const cmStateVim = childView?.state.field?.(
        Object.values(childView.state.config.dynamicSlots || {}).find(
          (f) => f?.name === 'vim',
        )?.field,
      );
      vimMode = cmStateVim?.insertMode ? 'INSERT' : (cmStateVim?.visualMode ? 'VISUAL' : 'NORMAL');
    } catch {}
    events.push({
      key: e.key, code: e.code,
      meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey,
      inChild, inParent,
      vimMode,
      target: target.className?.toString().slice(0, 60),
      ts: Date.now(),
    });
  };
  document.addEventListener('keydown', handler, { capture: true });
  window.__lcVimProbe = { handler, events };
  window.lcVimProbeStop = () => {
    document.removeEventListener('keydown', handler, { capture: true });
    console.log('=== lc-vim-probe ===');
    console.table(events);
    console.log('Active scopes (Obsidian):', app.keymap.scope, '/ stack length:', app.keymap.scope?.parent ? 'has parent' : 'top-only');
    console.log('=== end ===');
    delete window.__lcVimProbe;
    delete window.lcVimProbeStop;
  };
  console.log('Probe installed. Type your test keystrokes, then run lcVimProbeStop().');
})();
```

**What to capture:**
- For each keystroke: the actual `key` (`j` not `KeyJ`), where the keydown landed (`inChild`/`inParent`), the vim mode at that moment, and the active Obsidian scope.

**What to look for:**
- WHICH keys have `inChild: true` AND end up affecting the parent doc? (= the leaking set)
- Are Insert-mode keystrokes flowing correctly (each `i` followed by typing should show `inChild: true, vimMode: INSERT` and then the typed character with `vimMode: INSERT`)?
- Does Esc get recorded with `vimMode: INSERT` and then the next key shows `vimMode: NORMAL`? (= modal state machine is working)

### §3.3 — Probe for 18-03 (relative line number gutter ground truth)

```javascript
// Phase 18 redesign — relative line number gutter probe.
// Run after the user has the new toggle ON and the note reloaded.
(function lcGutterProbe() {
  const app = window.app;
  const view = app.workspace.getActiveViewOfType(
    require('obsidian').MarkdownView,
  );
  if (!view) return console.error('no active markdown view');
  const childGutter = view.containerEl.querySelector(
    '.lc-nested-editor .cm-gutter.cm-lineNumbers',
  );
  if (!childGutter) return console.warn('no lineNumbers gutter — feature OFF or unmounted');
  const elements = childGutter.querySelectorAll('.cm-gutterElement');
  const texts = [];
  elements.forEach((el) => texts.push(el.textContent));
  // Also read the current cursor line in the child to validate "0" appears at cursor row
  const plugin = app.plugins.plugins.leetcode;
  const childView = view.file ? plugin.childEditorRegistry.get(view.file.path) : null;
  const cursorLine = childView ? childView.state.doc.lineAt(childView.state.selection.main.head).number : '?';

  console.log('=== lc-gutter-probe ===');
  console.log('gutter element count :', elements.length);
  console.log('rendered texts       :', texts);
  console.log('cursor line (1-based):', cursorLine);
  console.log('expected pattern     : at cursor row, text === "0" or actual line; other rows show distance from cursor');
  console.log('=== end ===');
})();
```

**What to capture:**
- The full array of gutter texts when toggle is ON.
- The cursor line.

**What to look for:**
- If toggle is ON but texts are `['1', '2', '3', '4', ...]` → the formatter never reached the gutter (integration gap; this was the actual bug).
- If toggle is ON and texts are `['3', '2', '1', '0', '1', '2', '3']` (cursor on line 4) → working correctly.
- If `gutter element count: 0` → the `lineNumbers()` extension is not mounted (Obsidian's `showLineNumber` is OFF; the gate at `childEditorFactory.ts:274` is gating both relative and absolute correctly).

---

## §4 Architectural Approach for Each Sub-Plan

### §4.1 — 18-01: vim modal-state architecture & mechanism choice

#### How `@replit/codemirror-vim` 6.3.0 integrates with CM6

Verified from `node_modules/@replit/codemirror-vim/dist/index.d.ts` (lines 1083-1088):

```typescript
export declare function vim(options?: {
  status?: boolean;
}): Extension;
export declare function getCM(view: EditorView): CodeMirror | null;
```

The `vim()` factory returns a CM6 `Extension` array containing (a) a `keymap.of([...])` with vim's input handler, (b) a `StateField` holding `vimState` (per `vim?: vimState | null` at line 673), (c) a status-panel ViewPlugin when `{ status: true }`. Vim's modal state machine lives in that `StateField` — readable via `getCM(view).state.vim`.

The package's input handler reads keystrokes from CM6's keymap pipeline and dispatches Normal/Insert/Visual transitions internally. Crucially: **the modal state machine only sees keystrokes that reach CM6's keymap pipeline**. Anything intercepted at Obsidian's `app.keymap` (Scope) or via DOM-capture-phase listener is invisible to vim.

#### Mechanism comparison

| Mechanism | Priority | Risk | Vim modal-state interaction |
|---|---|---|---|
| Obsidian Scope on `app.keymap` (D-32) | **highest** — beats all CM6 | Bypasses vim's input handler entirely | **MUST manually drive vim mode transitions for each intercepted key** OR be extremely narrow about what it intercepts |
| CM6 `keymap.of` with `Prec.highest` on child | Higher than parent's CM6 keymap, lower than Scope | Cleaner — vim's input handler still fires | Vim modal state stays consistent automatically |
| DOM keydown capture-phase listener | Beats Scope and CM6 | Last resort; community-plugin lint may flag | Same as Scope (bypasses vim) |

#### Recommended approach for redesign (high confidence)

**Choose the mechanism AFTER §3.2 probe.** Two scenarios:

**Scenario A — keys leak to parent even though child is focused (most likely; matches D-32's premise):**
- Use Obsidian Scope (D-32) but with the *narrowest possible* key set.
- Inside the Scope handler, gate by vim mode: pass through (return `true` = "I didn't handle it") whenever `getCM(view).state.vim.insertMode === true`. This guarantees Insert-mode typing, Esc, and the `:` command-line are all routed through vim's input handler unchanged.
- Intercept ONLY the empirically-leaking Normal-mode keys from §3.2.
- For each intercepted key, route to the child's vim instance via `getCM(view)`'s exposed command surface (e.g., `Vim.handleKey` if the package exposes it; otherwise dispatch a CodeMirror command from the v6 commands map at `index.d.ts:308`).

**Scenario B — keys do NOT leak to parent when child is focused (unlikely but possible):**
- The bug is somewhere else entirely (e.g., focus tracking is wrong). 18-01 may not need an intercept at all; the fix may be in `NestedEditorWidget.toDOM` or the focus-retention path.
- In this case, the entire 18-01 plan re-shapes around fixing the focus tracking, not adding an intercept.

#### `:set nu` / `:set nonu` aliases

Verified from package `index.d.ts:308`:
```typescript
defineEx: (name: string, prefix: string | undefined, func: ExFn) => void;
```

Registration call shape (`Vim` import is `import { Vim } from '@replit/codemirror-vim'` — package re-exports the namespace):
```typescript
Vim.defineEx('set', 'se', (cm, params) => {
  const arg = params.args?.[0];
  if (arg === 'nu' || arg === 'number') { /* enable line numbers */ }
  if (arg === 'nonu' || arg === 'nonumber') { /* disable */ }
});
```

**Pitfall:** `defineEx` registers GLOBALLY for all vim instances in the process. Calling it twice (once per child mount) registers the alias twice — last one wins, but the registration must fire AT LEAST once before the first chevron-driven note open. Recommend registering at plugin `onload` time (once), NOT inside `createChildEditor` (per-mount).

**Pitfall:** The handler must call into the CM6 view's gutter mechanism. Since the gutter is gated by `lineNumbersEnabled` at mount time (read-once-at-mount, per D-18), the `:set nu` handler cannot toggle the extension — it can only toggle a CSS class or the gutter's display style. Live runtime toggle of the `lineNumbers()` extension itself requires a `Compartment.reconfigure`. This is **out of scope for D-35** (read-once-at-mount semantic). The simpler interpretation: `:set nu`/`:set nonu` accept the keystroke without error but are no-ops at runtime (or display a hint Notice). User confirmation needed before promising live runtime toggle.

---

### §4.2 — 18-02: chevron-blank fix + vault.on('modify') recovery

#### Sequence of events on a chevron switch (confirmed via source trace)

```
T0  user clicks chevron, picks Python3 (LC slug 'python3')
T1  switchFenceLanguage(file, 'python3') begins (src/main.ts:2386)
T2  active-view + lc-slug guards pass
T3  client.getProblemDetail('twoSum') resolves; snippet ready
T4  cm.dispatch({changes: [openerChange (->```python), bodyChange (->starter)],
              effects: languageRefreshEffect.of('python3'),
              userEvent: 'leetcode.lang-switch'})    [SINGLE CM6 TRANSACTION]
T5  Parent CM6's nestedEditorExtension StateField.update fires:
      - tr.docChanged === true -> rebuild decorations (line 302)
      - widget.eq() returns true (file path unchanged) -> NO widget rebuild
T6  Parent CM6's externalChangeListener fires:
      - userEvent === 'leetcode.lang-switch' -> NOT in ECHO_PRONE_USER_EVENTS
      - detectAndPropagateExternalChange runs -> mirrors body to child
      - child receives full-replace dispatch with syncAnnotation.of(true)
T7  dispatchChildLanguageReconfigure(file.path, 'python3') runs (line 2468)
      - childView.dispatch({effects: languageCompartment.reconfigure(...),
                            userEvent: 'leetcode.lang-switch'})
      - childLanguageTracker.set(childView, 'python3')   [TRACKER UPDATED]
T8  await processFrontMatter(file, fm => { fm['lc-language'] = 'python3' })
T9  Obsidian writes file to disk
T10 vault.on('modify') fires (Obsidian event, fires AFTER persistence)
T11 metadataCache.on('changed') fires (Obsidian event, AFTER cache reflows)
      - handleFmChangeForLanguageReactivity reads fmLang='python3'
      - Gate 3: trackedSlug 'python3' === fmLang 'python3' -> SHORT-CIRCUIT (correct)
```

The previous 18-02 attempt added two listeners that fire at T10 / T11:
- `vault.on('modify')` -> triggers `repairFenceStructure` if `findCodeFence` returns null
- `metadataCache.on('changed')` -> triggers `checkStaleChildAndInvalidate`, which compared `readActiveFenceSlug` (raw `python`) to `trackedSlug` (`python3`) and tripped `registry.delete`.

**Why the bug manifests for python3 + c only:** D-04 remap (`src/solve/languages.ts:99-109`) maps `python3 → python`, `c → cpp` for the fence tag. For all other languages the LC slug equals the fence tag (`java → java`, `javascript → javascript`). So the raw fence opener slug equals the tracked LC slug for 6 of 8 languages but NOT for python3 and c.

#### Recommended approach for redesign (medium confidence — needs probe confirmation first)

**Recommended path: Option A from §2.1 — remove `checkStaleChildAndInvalidate` entirely.**

Reasoning:
1. Plan 17-09's `childLanguageTracker` + Plan 17-12's `handleFmChangeForLanguageReactivity` already handle the "frontmatter says X but child renders Y" case via `Compartment.reconfigure` (NOT registry.delete).
2. Plan 17-13's `createParentRepairExtension` handles the "parent CM6 lost its fence closer" case via `repairFenceStructure` (NOT registry.delete).
3. The 999.3 reproduction case (vim's `dd` deleting the closer line) — Plan 17-13 already covers parent CM6 transactions, so the only remaining gap is non-CM6 writes (vim-Ex commands that persist to disk via Obsidian's vault layer, external editor saves while Obsidian is foregrounded).
4. The scenario "child is registered but its language doesn't match the fence" was the original 999.3 hypothesis but has not been reproduced post-Phase-17 round-3. The hypothesis may be obsolete.

**For the vault.on('modify') trigger (still needed for non-CM6 writes):**
- Register `this.app.vault.on('modify', file => { ... })` at `onload`, wrapped in `this.registerEvent(...)` for auto-cleanup.
- Gate by `lc-slug` frontmatter present (D-33).
- Gate by `findCodeFence(view.editor.cm.state) === null` — same gate as Plan 17-13's `createParentRepairExtension`.
- **Critically: do NOT fire repair if the active MarkdownView's CM6 state shows a healthy fence.** vault.on('modify') fires on every save, including the chevron's mid-flight `processFrontMatter` write at T8 in the sequence above. If the parent CM6 has the fence intact (because Step B at T4 already wrote it), the listener must short-circuit. The `findCodeFence === null` gate covers this; it only fires repair when the parent CM6 state actually shows damage.
- Re-entry guard: skip when `tr.annotation(Transaction.userEvent) === 'leetcode.fence-repair'` (already in `createParentRepairExtension`; the new vault.on path doesn't dispatch transactions itself, but the repair it triggers does — and the repair's dispatch fires the parent's `createParentRepairExtension` updateListener on its own dispatch, which is already protected by the existing re-entry guard).

**Idempotency invariants preserved (D-33):**
- `repairFenceStructure` is idempotent — when fence is intact, returns false.
- `vault.on('modify')` re-entry guard via `findCodeFence === null` gate.
- The existing `'leetcode.fence-repair'` userEvent stays in `ECHO_PRONE_USER_EVENTS`.

#### What about D-34 (stale-child invalidation)?

**Recommendation: re-discuss with user.** D-34 says "Mismatched state forces a child rebuild (registry.delete + re-create on next visible-frame)." The previous attempt to honor D-34 produced the chevron-blank bug. The redesign should propose:

- **Variant 1: keep D-34 but never compare against the parent fence opener.** Only compare `trackedSlug` against `lc-language` frontmatter. If they disagree, dispatch `Compartment.reconfigure` (NOT `registry.delete`). This is what `handleFmChangeForLanguageReactivity` already does.
- **Variant 2: drop D-34.** The 999.3 reproduction may be covered by 17-09 + 17-13 already.

User should pick before plan drafting.

---

### §4.3 — 18-03: relative line numbers integration path

#### Single integration path through `createChildEditor`

Trace from factory back to all call sites:

```
src/main/childEditorFactory.ts:229  export function createChildEditor(content, parent, initialSlug, indentOverride, app?, syncExtensions?)
                |
                v
   ONE call site at production runtime:
src/main/nestedEditorExtension.ts:119
   childView = createChildEditor(this.fenceContent, container, this.initialSlug, this.indentOverride, this.app)
                ^
                |
   Constructed in:
src/main/nestedEditorExtension.ts:233
   widget: new NestedEditorWidget(file.path, registry, fenceContent, initialSlug, indentOverride, plugin.app)
                ^
                |
   buildNestedDecorations reads from PluginHost type (line 50-60):
   - plugin.settings.getIndentSizeOverride()    (line 225)
   - fm['lc-language']                            (line 224)
   - file.path                                    (line 233)
```

**To wire `showRelativeLineNumbers` end-to-end, FIVE files must change:**

1. `src/settings/SettingsStore.ts` — add field, default `false`, getter `getShowRelativeLineNumbers()`.
2. `src/settings/SettingsTab.ts` — add toggle row under `## Code editor` heading (precedent: `Indent size` Setting block at line 216).
3. `src/main/nestedEditorExtension.ts:50-60` — add `getShowRelativeLineNumbers(): boolean` to `PluginHost.settings` type.
4. `src/main/nestedEditorExtension.ts:79-89` — add `readonly showRelativeLineNumbers: boolean` to `NestedEditorWidget` constructor.
5. `src/main/nestedEditorExtension.ts:119-125` — pass `this.showRelativeLineNumbers` to `createChildEditor`.
6. `src/main/nestedEditorExtension.ts:225-233` — read `plugin.settings.getShowRelativeLineNumbers()` and pass to `new NestedEditorWidget(...)`.
7. `src/main/childEditorFactory.ts:229` — add 7th param `showRelativeLineNumbers: boolean`.
8. `src/main/childEditorFactory.ts:274-278` — extend the `lineNumbersEnabled` gate to receive `formatNumber` callback when both are ON.

#### CM6 `lineNumbers({formatNumber})` API

Verified via `@codemirror/view` types (already imported at `childEditorFactory.ts:24-32`):

```typescript
// Source: @codemirror/view docs
export interface LineNumberConfig {
  formatNumber?: (n: number, state: EditorState) => string
  domEventHandlers?: ...
}
export function lineNumbers(config?: LineNumberConfig): Extension
```

`formatNumber(n, state)` is called per line render. `n` is the absolute line number; `state` is the EditorState at render time (so cursor position is readable via `state.selection.main.head`).

#### Recommended `relativeFormatter` (high confidence)

```typescript
function relativeFormatter(n: number, state: EditorState): string {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  if (n === cursorLine) return String(n);  // current line shows absolute
  return String(Math.abs(n - cursorLine));  // distance from cursor
}
```

This matches Vim's `:set rnu` (`relativenumber`) default behavior — current line shows absolute, others show distance.

**Cursor-move re-rendering:** CM6's `lineNumbers` invalidates the gutter on `update.selectionSet === true` (verified via source tour); no extra wiring needed. The user moves cursor → gutter re-renders.

#### Reference implementation

`@replit/codemirror-vim` does NOT bundle a relative-line-number gutter — `:set rnu` in vim 6.3.0 sets a `vimOption` flag but vim 6.3.0 does NOT itself install the gutter (verified from `index.d.ts` — no gutter / lineNumbers export in the package). So our `lineNumbers({formatNumber})` lives at the plugin layer and is independent of vim.

Community precedent: the open-source `obsidian-vimrc-support` plugin and `cm-relative-line-numbers` (CM5) do exactly this. CM6 ports universally use `lineNumbers({formatNumber: (n, s) => ...})`. No external package needed.

---

## §5 Cross-Plan Invariants (must remain TRUE after Phase 18)

1. **All Phase 17 invariants preserved:** section lock, sync annotations, `'leetcode.child-sync'` userEvent, `ECHO_PRONE_USER_EVENTS = {'leetcode.child-sync', 'leetcode.fence-repair'}`, focus-retention behavior on Run/Submit buttons, customTabCommand priority chain, Plan 17-13's parent-side updateListener-based repair, Plan 17-09's per-child `childLanguageTracker` WeakMap, Plan 17-10's semantic class layer.
2. **CLAUDE.md Conventions section unchanged** — no new userEvent strings introduced. `'leetcode.reset.child'` does NOT get added to `ECHO_PRONE_USER_EVENTS`. `'leetcode.fence-repair'` STAYS in `ECHO_PRONE_USER_EVENTS`.
3. **Bundle stays under 1.8 MB** (CONTEXT D-19). Phase 18 estimated raw delta < 5 KB; verify in 18-04.
4. **No new build-time dependencies** — `@replit/codemirror-vim@6.3.0` already shipped in Phase 17. Plan 18-01 only USES its public API.
5. **Settings additions in 18-03 follow existing SettingsStore pattern** — default value at parse time, no migration logic since this is a new field.
6. **Tests pass at every wave merge:** Wave 1 leaves 1713+ green; Wave 2 leaves 1713+ green; Wave 3 (18-04) is doc-only.
7. **Read-once-at-mount semantic preserved** for both `vimMode` (D-18) and `showLineNumber` (Plan 17-12) and `showRelativeLineNumbers` (D-35). Toggling any of these requires note remount or Cmd-E flip.
8. **Plugin write-path pattern (Phase 17 D-05):** any plugin write touching the fence body dispatches through the child's CM6; falls back to `app.vault.process(...)` only when no child registered. The new vault.on('modify') trigger MUST NOT call `vault.process` — it MUST call `repairFenceStructure(parentView, activeSlug)` which internally uses `parentView.dispatch`.

---

## §6 Validation Architecture (Nyquist gate)

### §6.1 — Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (verified in `tests/main/childEditorFactory.test.ts:1` and similar) |
| Config file | `vitest.config.ts` at repo root |
| Quick run command | `npx vitest run --reporter=dot` (verify in package.json scripts) |
| Full suite command | `npm test` |

### §6.2 — Phase Requirements → Test + Manual Map

| REQ-ID | Behavior | Test Type | Automated Command | Manual Verification (REQUIRED) |
|---|---|---|---|---|
| VIM-INTERACTION-01 | j/k/dd in NORMAL mode route to child; Esc + i/a/o/s do NOT regress | unit (Scope membership) + behavioral (vim modal-state probe) | `npx vitest run tests/main/childEditorVimScope.test.ts` | **REQUIRED** — §3.2 probe BEFORE coding; live UAT after deploy testing all keys in 17-UAT.md Test 17 |
| REPAIR-02-RESILIENT | vault.on('modify') triggers repair when CM6 didn't see the change; chevron does NOT trigger registry.delete | unit (gate logic) + integration (no chevron-blank regression) | `npx vitest run tests/main/childEditorSync.repair.test.ts tests/main/switchFenceLanguage.test.ts` | **REQUIRED** — §3.1 probe BEFORE coding; live UAT after deploy: chevron through ALL 8 languages (especially python3 + c) without blank Code section; vim `dd` on closer triggers repair |
| LINENUM-RELATIVE-01 | toggle ON + reload renders relative numbers; toggle OFF preserves absolute | unit (factory contract) + integration (call-site wiring) | `npx vitest run tests/main/childEditorFactory.test.ts tests/main/nestedEditorExtension.test.ts` | **REQUIRED** — §3.3 probe to confirm DOM gutter renders relative numbers |

### §6.3 — Sampling Rate

- **Per task commit:** `npx vitest run --reporter=dot` (full suite — current baseline 1713 green, ~30s)
- **Per wave merge:** `npm run build && npx vitest run` + manual probe rerun
- **Phase gate:** Full suite green + ALL THREE probes confirmed pass on user's vault (operator pasted output) + 17-UAT.md Tests 17/23/25 manually run on FINAL build

### §6.4 — Wave 0 Gaps

- [ ] **Add integration test** `tests/main/nestedEditorExtension.integration.test.ts` — covers the full chain `SettingsStore.getShowRelativeLineNumbers() → buildNestedDecorations → NestedEditorWidget.toDOM → createChildEditor → lineNumbers({formatNumber})` to prevent the "tested the contract but not the integration" gap (`.continue-here.md` anti-pattern #1) for 18-03.
- [ ] **Add chevron round-trip test** `tests/main/switchFenceLanguage.python3.test.ts` — exercises chevron switch through python3 + c (the languages that triggered chevron-blank), asserts (a) parent fence opener becomes `python` / `cpp`, (b) `childLanguageTracker` is set to `python3` / `c` (not the remapped tag), (c) registry entry is NOT deleted, (d) `.cm-content` element exists post-switch.
- [ ] **Add vim modal-state behavioral test** `tests/main/childEditorVimScope.modal.test.ts` — given a mocked Scope intercept, verify Esc + i/a/o/s + Ex commands all flow through to vim's input handler (assert `getCM(view).state.vim.insertMode` toggles correctly).
- [ ] **Frame manual UAT requirements in plan acceptance:** every Phase 18 plan's `<acceptance_criteria>` MUST include "operator-pasted probe output confirms expected state" — NOT just "unit test passes."

---

## §7 Open Questions for the Planner (RESOLVED 2026-05-25)

1. **D-34 — keep or drop?** **RESOLVED: DROPPED.** User confirmed 2026-05-25 during research review. Plan 18-02 removes `checkStaleChildAndInvalidate` entirely — no `registry.delete` invalidation gate. Stale-child cases covered by Plan 17-09 (per-child language tracker WeakMap) + Plan 17-12 (line-number gating at mount) + Plan 17-13 (parent-side updateListener-based repair). The original 999.3 reproduction (vim `dd` bypass) is handled by `vault.on('modify')` repair path alone, with NO registry side effects.

2. **D-32 — Scope mechanism is the only path?** **RESOLVED: DEFERRED to live probe in Plan 18-01.** User confirmed 2026-05-25 during research review. Plan 18-01 starts with a `<task type="checkpoint:human-verify">` block running the §3.2 probe BEFORE any auto-coding task. Mechanism choice between Scope-with-narrow-keys (Hypothesis A) and focus-transition primer (Hypothesis B) is decided by probe output. User added a NEW symptom not in the regression doc: "first `o` creates a blank line but not editable; I have to hit another `i`/`a`/`o` to get a blinking cursor" — suggests Hypothesis B (focus transition) may be the simpler root cause. The plan accommodates both.

3. **18-03 plumbing — single plan or split?** **RESOLVED: Single plan, single auto-coding task.** Plan 18-03 lists ALL FIVE integration touchpoints in acceptance criteria as a hard gate (settings field, settings UI, factory param, PluginHost type, NestedEditorWidget pass-through). The previous failure (NestedEditorWidget.toDOM not passing the new param) is what motivated the explicit-touchpoint rule.

4. **Test 25 (LINENUM-RELATIVE-01) — was it added by reverted 18-03?** **RESOLVED: deferred to 18-03 Task 3 live UAT.** Test 25 verification step is part of 18-03's UAT checkpoint; if the entry is stale on resume, the live UAT step rewrites it.

5. **Manual UAT integration with `/gsd-debug` agent:** **RESOLVED: Plans 18-01 / 18-02 / 18-03 each have a `<task type="checkpoint:human-verify">` BEFORE auto-coding AND a live-UAT checkpoint AFTER coding.** This is enforced by the planner's quality gate.

6. **18-04 ship-readiness gate scope:** **RESOLVED: confirmed.** 18-04 Tasks 3 (heap snapshot) + 5 (regression spot-check) both run on the SAME final-build commit. Probes from §3 are NOT re-run in 18-04 — they're already gated by the Wave 1/2 plans' UAT checkpoints. 18-04's regression spot-check is a curated subset of 17-UAT (Tests 17/23/25) on the final shipped build.

7. **`:set nu` / `:set nonu` semantics:** **RESOLVED: NOT IMPLEMENTED in Phase 18.** User confirmed 2026-05-25 — runtime `:set nu` aliases are out of scope. Vim's default "unknown option" error is the accepted behavior. Line-number toggling is governed exclusively by the plugin settings (`showLineNumber` + `showRelativeLineNumbers`) + Obsidian's global setting. ROADMAP.md Phase 18 Success Criterion 1 updated 2026-05-25 to reflect this scope reduction.

8. **vault.on('modify') firing during chevron switch:** **RESOLVED: probe §3.1 extended.** Plan 18-02 Task 1 probe specifically logs whether `findCodeFence` returns null at any moment during a chevron switch. If yes, plan instructs the auto-coding task to add a `'leetcode.lang-switch'` transaction-recency gate to the vault.on listener. If no, the listener fires unconditionally (with the lc-slug frontmatter precondition).

---

## §8 Sources

### Primary (HIGH confidence)
- `.planning/debug/phase-18-regressions-2026-05-25.md` — production failure modes, confirmed root causes, recommended fix paths (anchor doc).
- `.planning/debug/chevron-switch-child-body-stale.md` — Phase 16 ECHO_PRONE_USER_EVENTS resolution; informs why chevron's `'leetcode.lang-switch'` userEvent must continue to flow through `detectAndPropagateExternalChange`.
- `src/main.ts` lines 278 (childLanguageTracker), 920 (metadataCache.changed), 2386 (switchFenceLanguage), 2506 (dispatchChildLanguageReconfigure), 2573 (handleFmChangeForLanguageReactivity), 2674 (readActiveFenceSlug) — the integration anchors for 18-02.
- `src/main/childEditorFactory.ts` lines 153-199 (createCmdSlashScopeExtension — the canonical Scope reference for D-32), 229-378 (createChildEditor — the integration target for 18-03).
- `src/main/childEditorSync.ts` lines 82-127 (createChildSyncExtension), 385-422 (createParentRepairExtension), 488-614 (repairFenceStructure) — the recovery anchors for 18-02.
- `src/main/nestedEditorExtension.ts` lines 79-157 (NestedEditorWidget), 185-244 (buildNestedDecorations), 273-276 (ECHO_PRONE_USER_EVENTS), 285-380 (buildNestedEditorExtension) — the integration target for 18-03.
- `src/main/sectionLockExtension.ts` lines 354-432 — the section-lock changeFilter and `'leetcode.*'` userEvent contract.
- `src/solve/languages.ts` lines 67-77 (resolveLangSlug), 99-120 (LC_LANG_FENCE_TAG / lcSlugToFenceTag) — the alias/remap rules underpinning the chevron-blank bug.
- `node_modules/@replit/codemirror-vim/dist/index.d.ts` — verified package exports for `defineEx`, `getCM`, `vim()` factory at v6.3.0.
- `CLAUDE.md` Conventions section — `'leetcode.*'` userEvent contract; Phase 17 D-05 canonical write-path pattern.

### Secondary (MEDIUM confidence)
- `.planning/phases/18-vim-recovery-polish/CONTEXT.md` — locked decisions D-30..D-35 are authoritative; Fix path: prose for 18-01/02/03 is **pre-failure speculation** per `.continue-here.md` and treated as such.
- `.planning/phases/18-vim-recovery-polish/.continue-here.md` — handoff context; identifies the Critical Anti-Patterns (#1 unit tests don't catch UI bugs; #2 don't iterate the existing PLAN.md files; #3 simple slug normalization is insufficient).
- `.planning/phases/17-polish-edge-cases/17-UAT.md` — Tests 17 / 23 / 24 baseline outcomes; Test 25 may be stale from reverted 18-03.

### Tertiary (LOW confidence — flagged for validation)
- CM6 `lineNumbers({formatNumber})` API surface — inferred from `@codemirror/view` types and community CM6 plugins; no Context7 lookup performed in this research session. Validate against `@codemirror/view` source on first plan draft.

---

## §9 Metadata

**Confidence breakdown:**
- 18-02 architecture (chevron-blank): MEDIUM-HIGH — primary root cause confirmed via source trace; secondary cause speculation only, needs probe.
- 18-01 architecture (vim Scope): MEDIUM — mechanism choice depends on §3.2 probe output; package API verified against `index.d.ts`.
- 18-03 architecture (relative lines): HIGH — integration path traced; only mechanical risk is the 5-file atomic change set.
- Diagnostic probes: HIGH — directly mappable to the bugs documented in the regression doc.
- Cross-plan invariants: HIGH — direct read of CLAUDE.md + PHASE 17 source.

**Research date:** 2026-05-25
**Valid until:** 7 days (depends on no new debug rounds; user-pasted probe output likely refines this)

## RESEARCH COMPLETE
