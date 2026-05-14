---
phase: 05-polish-ship
plan: 07
status: deferred
date: 2026-05-13
---

# Plan 07 — GitHub Release (deferred)

## Status

**DEFERRED** at the time of Phase 05 execution.

Plan 07 was the version-bump + GitHub release step (POLISH-06). It was held back because Phase 05 surfaced the edit-mode inline-buttons ship-blocker (UAT item 4 / Gap G1), which the user judged ship-blocking ("this is not a shipable version"). The release step requires a known-shippable artifact, so it was deferred until follow-up phases addressed the gap.

## Resolution

The ship-blocker was addressed across Phases 05.1 → 05.5:
- **05.1** edit-mode-inline-buttons → resolved G1 (CodeActionsWidget block widget)
- **05.2** pre-ship-ux-polish → final polish pass
- **05.3** language-aware-editor → chevron + atomic dispatch
- **05.4** run-verdict-ux-button-polish → final UI polish
- **05.5** section-locking-for-lc-slug-notes → structural integrity

The plugin is now ship-quality. Plan 07's contents (version bump in `manifest.json`, `package.json`, `versions.json`; main.js build artifact; GitHub release with main.js + manifest.json + styles.css attached) can be executed manually whenever the user is ready to publish v1.0.

## Outstanding work (when ready to ship)

```bash
# Verify current state
cat manifest.json | grep version
cat package.json | grep version

# Bump to v1.0.0 (or whichever target)
# Edit manifest.json, package.json, versions.json

# Build production
npm run build

# Tag + push
git tag 1.0.0
git push origin 1.0.0

# Create GitHub release (gh CLI authenticated)
gh release create 1.0.0 \
  main.js manifest.json styles.css \
  --title "v1.0.0" --notes "Initial release"
```

Then submit PR to `obsidianmd/obsidian-releases` adding the plugin entry to `community-plugins.json`.

---

**Resolution note (2026-05-13):** Created retroactively to close out Phase 05's plans_executed gap (6/7 → 7/7). The actual release work is documented but unexecuted; this file marks it as a known deferred step rather than a missing-summary defect.
