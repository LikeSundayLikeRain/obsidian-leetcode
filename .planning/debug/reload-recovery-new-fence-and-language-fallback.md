---
slug: reload-recovery-new-fence-and-language-fallback
status: open
trigger: "On Phase 17 round-3 baseline (HEAD 95e421c, no Phase 18 fixes deployed): when a problem note's `## Code` fence has its closer deleted out-of-band (e.g., manually in another editor) and Obsidian is reloaded with that note as the active note, `createParentRepairExtension`'s repair path produces TWO bugs: (1) a brand-new fence is inserted ABOVE the existing damaged fence instead of just appending the missing closer to the existing fence; (2) the inserted opener uses `python3` regardless of the note's actual `lc-language` frontmatter / chevron selection."
created: 2026-05-25
related_phase: 18-vim-recovery-polish
related_plans:
  - "17-13 (createParentRepairExtension — reload-time repair)"
  - "17-02 (repairFenceStructure — marker-disambiguation + body-aware insertion + activeSlug threading)"
related_uat: .planning/phases/17-polish-edge-cases/17-UAT.md (Test 23 REPAIR-02 — partial coverage; reload variant not exercised)
discovered_during: Phase 18 Plan 18-02 Task 1 live UAT probe (chevron-blank-on-python3-c baseline confirmation)
---

# Reload Recovery — New-Fence Insertion + Python3 Fallback

## Trigger

User opened a LeetCode problem note with `lc-language: c` and chevron set to **C**, then deleted the bare ` ``` ` closer line out-of-band (in a non-Obsidian editor). On reopening Obsidian:

1. `createParentRepairExtension`'s `EditorView.updateListener` fires when the parent CM6 mounts the doc and `findCodeFence(state) === null`.
2. The listener calls `repairFenceStructure(parentView, activeSlug)` where `activeSlug = readLcLanguageFromDoc(update.state) ?? 'python3'`.
3. **Bug 1 — structural:** instead of appending a closer to the existing damaged fence, repair inserts a NEW fence (opener + closer pair) above the user's body content. Result: two fences in `## Code`. The first (newly-inserted) fence is mounted as the child editor; the second (original) renders as raw markdown text.
4. **Bug 2 — language fallback:** the inserted opener carries the tag `python3` even though `lc-language: c` and the chevron is on C. Symptom: child editor renders `class Solution:` (Python starter) above the unmounted ` ```cpp ` fence with the C body content.

Visual evidence (screenshot pasted by user during 18-02 Task 1 probe): see Phase 18 conversation log 2026-05-25.

## Confirmed Root Cause Hypotheses

### Bug 1 — structural new-fence insertion

`repairFenceStructure` already has body-aware insertion logic (`src/main/childEditorSync.ts:540-598`) that should detect the surviving opener and append a closer below the last body line. The repro produces a NEW opener+closer pair instead, suggesting one of:

- **H1.A** — at reload time, `findCodeFence` returns null even though a damaged opener exists, so `repairFenceStructure`'s `OPENER_RE` scan also misses the surviving opener and falls into the "both missing" branch (inserts opener+closer pair).
- **H1.B** — the surviving opener carries an unexpected tag character that fails `OPENER_RE: /^\s*```\S+\s*$/` (e.g., zero-width whitespace post-tag, BOM, escape sequence).
- **H1.C** — the listener fires before the doc is fully populated (during CM6 initial mount), at which point `doc.lines` is partial and the scan misses the opener.

H1.C is the most likely on reload — `EditorView.updateListener` can fire on mount-time `init` updates while the CM6 doc is hydrating from disk; the scan sees a partial doc.

### Bug 2 — python3 language fallback

`createParentRepairExtension` reads activeSlug via `readLcLanguageFromDoc(update.state) ?? 'python3'` (line 414 of childEditorSync.ts). When the doc is partially hydrated at reload-time, `readLcLanguageFromDoc` may not find `lc-language` in the frontmatter scan (because frontmatter hasn't been parsed yet OR the scan reads beyond the partial state).

Better: read `lc-language` from `app.metadataCache.getFileCache(file).frontmatter['lc-language']` instead of doc text. The metadataCache is hydrated independently and synchronously by Obsidian on file load.

## Why This Doc — Out of Plan 18-02 Scope

Plan 18-02's scope is the `vault.on('modify')` runtime trigger for vim-`dd` / out-of-band edits *during a session*. The new trigger reads activeSlug from `app.metadataCache.getFileCache(file).frontmatter['lc-language']` (NOT from doc text), so the new path does NOT have the python3-fallback bug.

**However**, the existing `createParentRepairExtension` reload-time path is unchanged by Plan 18-02 and the bugs documented here remain.

This was discovered during 18-02 Task 1 live UAT (probe baseline confirmation step). The user explicitly approved deferring the fix per the resume question 2026-05-25 — Phase 18 surfaces this as a regression for follow-up rather than expanding 18-02 scope.

## Recommended Follow-Up

Either:
- **Option A:** New plan 18-05 (gap closure) that fixes `createParentRepairExtension` + `repairFenceStructure` reload-time path. Smaller surface than expanding 18-02. Requires probe to distinguish H1.A / H1.B / H1.C first.
- **Option B:** Defer to Phase 19 / v1.3. Reload-recovery is a corner case (out-of-band edits while Obsidian is closed). User can manually fix the fence on reopen.
- **Option C:** Re-fold into Phase 18 verification step. If verifier flags this as a Phase 18 must-have, plan 18-05 lands before phase completion.

User to decide after Plan 18-02 + 18-01 + 18-03 ship and pass UAT.

## Diagnostic Probe Snippet (capture if pursuing fix)

```javascript
// Run on Phase 17 round-3 baseline with a note that has its `## Code` closer deleted
// out-of-band, then reload Obsidian with that note as the active note.
// Capture the probe output IMMEDIATELY after reload — before clicking the chevron or editing.
(function lcReloadRecoveryProbe() {
  const app = window.app;
  const view = app.workspace.activeLeaf?.view;
  if (!view || !view.file || !view.editor) return console.error('no active markdown view');
  const file = view.file;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const cm = view.editor.cm;
  const doc = cm.state.doc;

  // Walk the doc and tag every fence-marker line with its position + content
  const markers = [];
  for (let i = 1; i <= doc.lines; i++) {
    const t = doc.line(i).text;
    if (/^\s*```/.test(t)) {
      markers.push({ line: i, text: JSON.stringify(t) });
    }
  }

  console.log('=== lc-reload-recovery-probe ===');
  console.log('file.path                 :', file.path);
  console.log('fm.lc-language (cache)    :', fm['lc-language']);
  console.log('fence markers in doc      :', markers.length);
  console.log('marker details            :', markers);
  console.log('doc.lines                 :', doc.lines);
  console.log('cm has updated extensions :', !!cm.state.config);
  console.log('=== end ===');
})();
```

What to look for:
- If `marker details` shows TWO openers (both with language tags) AND ONE closer, repair inserted a duplicate fence — confirms Bug 1.
- If the first marker text is `\`\`\`python3` while `fm.lc-language: c`, confirms Bug 2.
