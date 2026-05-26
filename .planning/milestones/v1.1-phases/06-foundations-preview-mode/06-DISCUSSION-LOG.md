# Phase 06 Discussion Log

**Phase:** 06 — Foundations + Preview Mode
**Date:** 2026-05-15
**Mode:** discuss (default)

This is a human-readable audit log of the discuss-phase Q&A. Downstream agents read `06-CONTEXT.md` for decisions; this file is for retrospectives.

---

## Areas Selected for Discussion

User chose to discuss all four surfaced gray areas:

1. Upgrader click default + onboarding
2. Preview tab placement & lifecycle
3. Preview body content & UI chrome
4. CI bundle-size gate mechanism

---

## Area 1 — Upgrader click default + onboarding

### Q1.1 — On v1.0 → v1.1 upgrade, what should single-click on a problem do by default?

Options presented:
- (Recommended) Preview for everyone — both new installs and upgraders single-click to preview, with a settings toggle to flip back.
- Preview new, v1.0 for upgraders — split default, detect upgrade by missing v1.1 keys in `data.json`.
- v1.0 behavior for everyone — preview only via right-click.

**User selection:** Preview for everyone.

**Notes:** Cleanest single mental model for the README. README documents the change; the settings toggle is the opt-out. Avoids two-default branching.

### Q1.2 — What does the onboarding modal say / offer?

Options presented:
- Notice + 2 buttons (default = preview; inline "Use v1.0 behavior" sets toggle).
- Notice + dismiss only.
- Status-bar Notice, no modal.

**User selection (freeform):** "no one-time onboarding modal".

**Decision logged:** No onboarding modal of any kind. The README is the only behavior-change communication; the settings toggle is the only opt-out path. Lighter ship surface.

---

## Area 2 — Preview tab placement & lifecycle

### Q2.1 — Where does the preview leaf open?

Options presented:
- (Recommended) New center tab — `workspace.getLeaf('tab')`.
- Replace current tab.
- Right sidebar leaf.

**User selection:** New center tab.

### Q2.2 — When the user clicks a second problem while a preview tab is already open, what happens?

Options presented:
- (Recommended) Reuse existing preview tab — swap content, one preview at a time.
- Open a new preview tab — accumulates.
- Reuse if visible, new if hidden — compromise.

**User selection:** Reuse existing preview tab.

**Notes:** Detection via `workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)`. Re-render body + chips + Start/Open buttons in place.

### Q2.3 — After "Start Problem", what happens to the preview tab?

Options presented:
- (Recommended) Close preview, focus note — `leaf.detach()` after ~100 ms.
- Replace preview content with note.
- Keep preview open alongside note.

**User selection:** Close preview, focus note.

---

## Area 3 — Preview body content & UI chrome

### Q3.1 — What renders inside the preview body?

Options presented:
- (Recommended) Full LC problem content — same content as `## Problem` in a note.
- Statement only, no examples.
- Full content + AI cluster hint placeholder (Phase 11 stub).

**User selection:** Full LC problem content.

**Notes:** Reuses v1.0 turndown HTML→Markdown pipeline; `MarkdownRenderer.render(app, md, body, '', this)` with `this` = the ItemView (satisfies `no-plugin-as-component`).

### Q3.2 — Where do the chrome elements sit?

Options presented:
- (Recommended) Sticky header bar — title + difficulty pill + topic chips + right-aligned Start/Open button; pinned on scroll.
- Title block, no sticky.
- Sticky button only.

**User selection:** Sticky header bar.

### Q3.3 — Should the preview show a "Preview Mode" label/banner?

Options presented:
- No banner, tab title is enough.
- Subtle "Preview" chip in header.
- Full-width info banner.

**User selection (freeform):** "not needed, it's doesn't have the frontmatter stuff, and with the sticky header bar, should be distinguishble enough".

**Decision logged:** No banner, no chip, no label inside the body. Tab title `Preview: {id}. {title}` plus a distinguishing tab icon plus the absence of frontmatter is enough.

---

## Area 4 — CI bundle-size gate mechanism

### Q4.1 — How should the 500 KB bundle gate be enforced?

Options presented:
- (Recommended) GitHub Action + npm script — also bootstraps full CI (no CI exists today).
- Inline in build script.
- Husky pre-push hook only.

**User selection:** GitHub Action + npm script.

### Q4.2 — Should CI also run lint and tests, or just bundle-size?

Options presented:
- (Recommended) Full CI: lint + test + bundle-size.
- Bundle-size only for now.
- Lint + bundle-size, defer tests.

**User selection:** Full CI: lint + test + bundle-size.

### Q4.3 — Where does the bundle-size baseline live?

Options presented:
- (Recommended) Captured as one-line constant in CONTEXT.md / README; threshold hardcoded in script.
- Comment in PR with delta.
- Hard gate only, no tracking.

**User selection:** Captured as one-line constant.

---

## Deferred Ideas (not Phase 06)

- Topic chips clickable → filter ProblemBrowserView by topic.
- Preview's "I have N notes already linked to patterns this problem touches" coverage hint (depends on Phase 11).
- PR-comment automation showing bundle-size delta.
- Pre-push hook for local size check.
- Right-click → "Start Problem (skip preview)" as a separate menu option.
- Tab tooltip showing the LC URL of the previewed problem.

---

## Claude's Discretion (downstream agents may finalize)

- Exact `PluginData` field name for the click-behavior toggle.
- Whether the right-click context menu (PREVIEW-01) is its own plan or folds into the preview-view plan.
- Platform-portable bundle-size check command (GNU `du -b` vs Node `fs.statSync`).
- eslint version co-bump compatibility with `eslint-plugin-obsidianmd@^0.3.0`.
- Cache-miss behavior for preview body rendering (pre-fetch vs placeholder + auto-render).

---

*Discussion log captured: 2026-05-15.*
