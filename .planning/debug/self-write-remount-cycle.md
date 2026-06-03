---
status: diagnosed
trigger: "Phase 20 UAT carry-over from Phase 19: typing in LP widget loses focus + cursor + vim state after the 400ms debouncedWriter flush. One-way sync persists data correctly, but the ViewPlugin remounts the widget on every self-write."
created: 2026-05-29T00:00:00Z
updated: 2026-05-29T00:00:00Z
---

## Current Focus

hypothesis: "Phase 19's documented hypothesis is CONFIRMED — but with a more precise mechanism than 'eq() returns false because sourceHash differs.' The widget's eq() correctly compares (file, fenceIndex, sourceHash); the failure is that on a self-write, sourceHash NECESSARILY differs between the pre-flush and post-flush rebuilds, because the parent CM6 doc only changes AFTER the flush propagates back through vault.process. The ViewPlugin update() at liveModeViewPlugin.ts:110-116 has no provenance check — it rebuilds on any docChanged, so the post-flush parent transaction triggers a rebuild whose new sourceHash = djb2(NEW body), while the on-screen widget's sourceHash = djb2(OLD body). eq() returns false → DOM destroyed → widget remount → focus + cursor + vim state lost."
test: "Read the four files involved (liveModeViewPlugin, debouncedWriter, LeetCodeFenceWidget, WidgetController) + main.ts vault.on('modify') wiring."
expecting: "Confirm: (1) ViewPlugin update() has no provenance check / no userEvent gate; (2) debouncedWriter writes through vault.process with no parent-CM6 self-write annotation; (3) eq() compares sourceHash which is built freshly per ViewPlugin rebuild from the post-flush parent doc."
next_action: "Document root cause and return diagnosis."

## Symptoms

expected: "After 400ms debouncedWriter flush in Live Preview, widget retains focus, cursor position, and vim state (Normal/Insert mode preserved). Typing should not be interrupted by widget remount."
actual: "Widget loses focus after the 400ms sync. Vim state (Normal mode, cursor pos) is lost on each flush cycle."
errors: "None reported"
reproduction: "Type any character in a Live Preview widget; observe focus loss after ~400ms (Test 6 in 20-HUMAN-UAT.md, originally surfaced in Phase 19 UAT Test 1)."
started: "Phase 19 (one-way sync introduced); deferred to Phase 20 SYNC-04/SYNC-05."

## Eliminated

- hypothesis: "vault.on('modify') handler is the trigger — perhaps it calls reloadFromDisk on self-writes."
  evidence: "src/main.ts:1098-1183 — the handler correctly suppresses self-writes via selfWriteSuppression.tryConsume() at line 1145; if 'consumed', the handler returns silently (line 1146). Self-writes do NOT pass through reloadFromDisk. The vault.on('modify') decision tree is well-formed."
  timestamp: "2026-05-29 (during investigation)"

- hypothesis: "WidgetType.eq() implementation is buggy — perhaps it always returns false."
  evidence: "src/widget/LeetCodeFenceWidget.ts:66-74 — eq() correctly compares (plugin, file, fenceIndex, sourceHash). Pitfall 19-F was designed deliberately to enable DOM reuse. The implementation is correct; the failure is upstream — sourceHash CHANGES between pre-flush and post-flush rebuilds because the parent doc actually contains different content (OLD body before flush, NEW body after flush)."
  timestamp: "2026-05-29 (during investigation)"

## Evidence

- timestamp: "2026-05-29"
  checked: "src/widget/liveModeViewPlugin.ts:110-116 — ViewPlugin.update() implementation."
  found: |
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        const set = buildLeetCodeFenceRanges(update.view, this.plugin);
        this.decorations = set;
        this.ranges = set;
      }
    }
  implication: "Unconditional rebuild on any update.docChanged. NO provenance check (no transaction.annotation(Transaction.userEvent), no self-write StateEffect, no suppression-map consultation). Every parent CM6 transaction that changes the doc — including the self-write echo from vault.process — triggers buildLeetCodeFenceRanges, which constructs a NEW LeetCodeFenceWidget instance with a fresh sourceHash."

- timestamp: "2026-05-29"
  checked: "src/widget/liveModeViewPlugin.ts:81-90 — sourceHash construction inside buildLeetCodeFenceRanges."
  found: |
    const source = extractFenceBody(view.state, fence);
    ...
    const sourceHash = djb2(source);
    builder.add(from, to, Decoration.replace({
      widget: new LeetCodeFenceWidget(plugin, file, fenceIndex, sourceHash, source),
    }));
  implication: "sourceHash is computed fresh on EVERY ViewPlugin rebuild from the CURRENT parent doc. Before the flush, parent doc has the OLD body (widget edits live in child CM6, never sync to parent). After flush, parent doc has the NEW body. Therefore: pre-flush builds emit djb2(OLD); the post-flush rebuild emits djb2(NEW). They differ by construction whenever the user has typed anything."

- timestamp: "2026-05-29"
  checked: "src/widget/debouncedWriter.ts:189-192 — the actual write call."
  found: |
    await this.app.vault.process(this.file, (body) => {
      postWriteText = rewriteFenceBody(body, expectedFenceIndex, newBody);
      return postWriteText;
    });
  implication: "vault.process writes new body to disk. Obsidian's MarkdownView observes the file write and dispatches a docChange transaction onto the parent CM6 — but with NO 'leetcode.self-write' userEvent, NO StateEffect signaling provenance, and NO Transaction.addToHistory.of(false) marking it as a programmatic write. The parent ViewPlugin's update() cannot distinguish this echo from a genuine user keystroke or external edit."

- timestamp: "2026-05-29"
  checked: "src/widget/LeetCodeFenceWidget.ts:66-74 — eq() identity contract."
  found: |
    eq(other: WidgetType): boolean {
      return (
        other instanceof LeetCodeFenceWidget &&
        other.plugin === this.plugin &&
        other.file === this.file &&
        other.fenceIndex === this.fenceIndex &&
        other.sourceHash === this.sourceHash
      );
    }
  implication: "eq() compares sourceHash. When pre-flush widget has djb2(OLD) and post-flush widget has djb2(NEW), they DIFFER → eq returns false → CM6 destroys the old widget DOM and creates a fresh one (calling toDOM → mountLeetCodeWidget → new EditorView, new vim state, new history, new focus) → focus / cursor / vim state lost."

- timestamp: "2026-05-29"
  checked: "src/main.ts:1098-1183 — vault.on('modify') self-write suppression path."
  found: "The modify listener correctly tracks self-writes via selfWriteSuppression.tryConsume(). When 'consumed', the handler returns at line 1146 without calling reloadFromDisk."
  implication: "The selfWriteSuppression map is plumbed correctly for the vault.on('modify') VAULT-layer handler — but it has NO connection to the CM6 ViewPlugin's update() method. The ViewPlugin runs on the parent EditorState's transaction stream, BEFORE (or in parallel with) the vault modify event. The suppression map silences vault.on('modify') reload, but it cannot prevent the parent CM6 transaction itself from firing the ViewPlugin rebuild."

- timestamp: "2026-05-29"
  checked: "Cross-reference Pitfall 19-F design intent at .planning/phases/19-widget-foundation-one-way-sync/19-RESEARCH.md:414-422."
  found: "RESEARCH explicitly anticipates this scenario but assumes eq() identity prevents remount. The unstated assumption: 'sourceHash equal across rebuilds' — which is TRUE for viewport-only updates (no doc change) but FALSE for self-writes (parent doc actually changes content)."
  implication: "Pitfall 19-F mitigation is incomplete. It guards against keystroke-driven parent rebuilds where the source happens to be the same — but the self-write cycle is fundamentally a SOURCE-CHANGED event from the parent CM6's perspective. The fix needs a different mechanism: either a provenance check in update() that skips rebuild when the change is a self-write, OR a way to keep the widget DOM stable when sourceHash transitions match the in-flight typed content."

- timestamp: "2026-05-29"
  checked: "Search src/widget/ for 'leetcode.*' userEvent annotations."
  found: "No 'leetcode.*' userEvent annotations exist in any src/widget/ file. The convention is used in src/main.ts (chevron switch, Reset child dispatch) for the v1.2 sectionLockExtension bypass — but the v1.3 widget write path uses vault.process (vault layer), not a direct CM6 dispatch on the parent."
  implication: "There is no signaling primitive between debouncedWriter.flush() and the ViewPlugin to mark 'this rebuild is a self-write echo, skip it.' The fix needs to introduce one — analogous to (but not necessarily reusing) the 'leetcode.*' userEvent convention."

## Resolution

root_cause: |
  **Phase 19's documented hypothesis is CONFIRMED — with a sharpened mechanism statement.**

  The Live Preview ViewPlugin (src/widget/liveModeViewPlugin.ts:110-116) rebuilds the DecorationSet on every `update.docChanged` with NO provenance check. The widget's WidgetType.eq() correctly enables DOM reuse when source content is identical (Pitfall 19-F mitigation), but on a self-write the source CHANGES from the parent CM6's perspective: pre-flush parent doc holds the OLD body (widget edits live in child CM6 only, never sync to parent), and post-flush vault.process writes the NEW body to disk → Obsidian's MarkdownView dispatches a docChange transaction on the parent CM6 carrying that NEW body. ViewPlugin update() fires, buildLeetCodeFenceRanges extracts source = NEW body from the new parent doc, computes sourceHash = djb2(NEW), constructs a fresh LeetCodeFenceWidget. The on-screen widget was constructed from sourceHash = djb2(OLD). eq() returns false. CM6 destroys the old widget DOM and remounts a fresh EditorView via toDOM → mountLeetCodeWidget — losing focus, cursor position, vim mode state, and undo stack.

  The vault.on('modify') self-write suppression path in src/main.ts:1098-1183 is correct and orthogonal — it suppresses VAULT-layer reload (reloadFromDisk), but it cannot prevent the parent CM6 transaction itself from triggering the ViewPlugin's update() hook. The two layers (CM6 transaction stream vs. vault modify event) have no shared provenance signal in the v1.3 architecture.

  **Why Pitfall 19-F mitigation is incomplete:** It assumed eq() comparison on sourceHash would gate DOM reuse. That works for viewport-only updates (source unchanged) and external-edit-with-same-content races, but a self-write is by definition a SOURCE-CHANGED event — the entire purpose is to write the new body to the parent doc. The mitigation cannot save the widget across its own write cycle.

fix: ""
verification: ""
files_changed: []
