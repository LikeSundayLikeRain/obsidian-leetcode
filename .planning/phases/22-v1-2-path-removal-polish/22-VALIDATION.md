---
phase: 22
slug: v1-2-path-removal-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- <filter>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60-90 seconds full suite |

Supplementary gates:

| Gate | Command | Pass criterion |
|------|---------|----------------|
| Bundle size | `node scripts/check-bundle-size.mjs` | `main.js` < 1,706,000 B (v1.2 baseline hard cap; soft warn 1,500,000) |
| Lint | `npm run lint` | `eslint-plugin-obsidianmd` passes; zero `innerHTML` in `src/widget/` |
| Type check | `npm run build` (esbuild + tsc) | Clean compile |
| Grep ratchets | `grep -r 'useInlineWidget\\|useNestedEditor' src/` / `grep -r "userEvent: 'leetcode\\." src/` | Zero matches post-cutover |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (full — repo is fast enough; no quick subset reliably covers cutover deletions).
- **After every plan wave:** Full suite + `npm run build` + `npm run lint` + `node scripts/check-bundle-size.mjs`.
- **Before `/gsd-verify-work`:** Full suite + bundle-size gate + lint MUST be green; grep ratchets MUST return zero.
- **Max feedback latency:** ~90 seconds (full suite).

---

## Per-Task Verification Map

> Task IDs follow the `{phase}-{plan}-{task}` convention. Per CONTEXT D-cutover-01 the cutover is sub-step staged; each sub-step maps to ≥1 task in Plan 22-01.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-A | 01 | 1 | POLISH-01 | — | `useInlineWidget` default flips ON; mutual-exclusion Notice inverts so 1.2.x carry-over `data.json` forces v1.3 | unit + behavior | `npm test -- SettingsStore` && manual dev-vault | ✅ existing | ⬜ pending |
| 22-01-B | 01 | 1 | POLISH-01, POLISH-05 | — | 1-day dev-vault dogfood with default-ON: open, solve, run, submit, AI debug, language switch, vim toggle, theme swap — all green | manual UAT | dev-vault checklist documented in 22-VERIFICATION.md | manual | ⬜ pending |
| 22-01-C | 01 | 2 | DELETE-01..05 | — | 5 v1.2 source files deleted; `npm run build` clean; full suite green | structural | `npm test` && `npm run build` && `ls src/main/childEditorSync.ts 2>&1 \| grep -c 'No such'` | ✅ existing | ⬜ pending |
| 22-01-D | 01 | 2 | DELETE-07 | — | 8+ dead test files deleted (per RESEARCH §14 audit, list expands at task start); full suite green | structural | `npm test` && `ls tests/main/childEditorSync.test.ts 2>&1 \| grep -c 'No such'` | ✅ existing | ⬜ pending |
| 22-01-E | 01 | 3 | DELETE-06, DELETE-08, PROTECT-03 | — | `src/main.ts` unwired (~800 LOC); `useInlineWidget`/`useNestedEditor` grep returns 0; `'leetcode.*'` userEvent grep returns 0; CLAUDE.md `## Conventions` paragraphs deleted | structural + grep ratchet | `npm test` && `npm run build` && `! grep -rn 'useInlineWidget\\\|useNestedEditor' src/` && `! grep -rn \"userEvent: 'leetcode\\.\" src/` | ✅ existing | ⬜ pending |
| 22-02-01 | 02 | 4 | (carryover sc-7) | — | Vim-Tab marker: probe `Vim.handleKey(cm5, '<Tab>', 'mapping')`; if updates marker → ship fix; else defer with backlog issue | unit + manual | `npm test -- WidgetController` + dev-vault vim probe documented in 22-VERIFICATION.md | ✅ existing | ⬜ pending |
| 22-02-02 | 02 | 4 | (carryover sc-8) | — | Widget hover border suppressed; focus-ring + cursor-marker styles unchanged | manual visual | dev-vault hover/focus screenshot pair in 22-VERIFICATION.md | manual | ⬜ pending |
| 22-02-03 | 02 | 4 | (carryover sc-9) | — | `.leetcode-code-actions` font is `var(--font-text)`, not monospace | manual visual | dev-vault before/after screenshot in 22-VERIFICATION.md | manual | ⬜ pending |
| 22-03-01 | 03 | 5 | POLISH-02 | — | Bundle hard cap at 1,706,000 B; CI script fails on regression | structural CI gate | `node scripts/check-bundle-size.mjs && echo PASS` | ✅ existing (lower threshold) | ⬜ pending |
| 22-03-02 | 03 | 5 | POLISH-03 | — | `npm run lint` clean; `grep -rn 'innerHTML' src/widget/` returns 0 active assignments | static analysis | `npm run lint && ! grep -rn 'innerHTML' src/widget/` | ✅ existing | ⬜ pending |
| 22-03-03 | 03 | 5 | THEME-05 | — | 5 themes (Minimal, Things, Catppuccin, Anuppuccin, Atom) side-by-side vs v1.2 baseline; no regression | manual UAT | dev-vault checklist + screenshot pairs in 22-VERIFICATION.md | manual | ⬜ pending |
| 22-03-04 | 03 | 5 | POLISH-04 | — | README v1.3 architecture overview, migration docs, Cmd-Z/Cmd-F scoping notes added | doc inspection | `grep -c 'v1.3' README.md && grep -c 'autoMigrateOnOpen' README.md` | ✅ existing | ⬜ pending |
| 22-03-05 | 03 | 5 | POLISH-04, DELETE-08 | — | CLAUDE.md `## Architecture` v1.3 sketch added (~5-10 lines); obsolete `## Conventions` paragraphs already gone (Plan 22-01) | doc inspection | `grep -c 'widget' CLAUDE.md && ! grep -c \"'leetcode\\.\\*' userEvent\" CLAUDE.md` | ✅ existing | ⬜ pending |
| 22-03-06 | 03 | 5 | POLISH-04, POLISH-06 | — | `manifest.json` + `package.json` bumped to 1.3.0-beta.1 (BRAT) then 1.3.0 (GA) | structural | `jq -r .version manifest.json` matches expected | ✅ existing | ⬜ pending |
| 22-03-07 | 03 | 6 | POLISH-06 | — | BRAT alpha tag pushed; 7-day dogfood; no P0/P1 issues filed; plugin-store re-review submission filed | manual UAT | release artifacts checklist + tag verification + GitHub Issues review in 22-VERIFICATION.md | manual | ⬜ pending |
| 22-03-08 | 03 | 5 | VIM-03 | — | VIM-03 marked "Resolved by Phase 20 live-reconfigure" in REQUIREMENTS.md traceability (no banner shipped per L7) | doc inspection | `grep -c 'Resolved by Phase 20' .planning/REQUIREMENTS.md` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** Plan 22-01 alone has 5 sub-steps each with automated coverage; no 3-consecutive-task gap without automated verify. Plan 22-02 polish items are inherently visual but each has a documented dev-vault probe; the unit-test fallback for D-polish-01 (vim-Tab) keeps continuity. Plan 22-03 mixes structural (1, 2, 4, 5, 6, 8) and manual (3, 7) — every manual task is sandwiched between structural gates.

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — already in tree
- [x] `scripts/check-bundle-size.mjs` — already in tree (per RESEARCH §6 Specific Findings); thresholds need lowering in Plan 22-03 task 22-03-01
- [x] `npm run lint` — already configured with `eslint-plugin-obsidianmd`
- [x] Full vitest suite — 1,713 tests baseline (will drop to 1,705ish after dead-test deletions in 22-01-D)

*Phase 22 has no new framework or test-infrastructure requirements. Existing infrastructure covers all phase requirements except the manual UAT gates which by definition cannot be automated.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 1-day post-flip dogfood (open/solve/run/submit/AI/lang-switch/vim/theme) | POLISH-01, POLISH-05 | Real-vault behavior on fresh-install default-ON cannot be reliably exercised in headless vitest | After 22-01 sub-step A commit, deploy to dev vault, work through dogfood checklist on 5 different LC notes; document each in 22-VERIFICATION.md |
| Vim-Tab cursor-marker visual probe | (carryover sc-7) | Marker is a CM5-adapter visual artifact; vitest can't observe pixel-level cursor renderings | Open vim-enabled note, press `i` to enter Insert mode, press Tab; observe whether the block-cursor marker tracks the inserted character; document outcome and choose ship-fix vs defer |
| Widget hover border absent | (carryover sc-8) | CSS `:hover` is a runtime visual state, not testable headless | Open widget in dev vault; mouse over it; confirm no border appears; pair screenshot vs pre-fix |
| Action row font is text (not monospace) | (carryover sc-9) | Font-family computed style depends on Obsidian theme + cascade | Open widget action row; visually confirm chevron + buttons render in text font; pair screenshot vs pre-fix |
| 5 themes regression check (Minimal, Things, Catppuccin, Anuppuccin, Atom) | THEME-05 | Theme regressions are pixel-level and theme-dependent; no automated visual-diff harness in Phase 22 (deferred to v1.4+) | Install each theme in dev vault; open representative LC note (problem-open + solved + AC'd note with `## AI Review`); capture screenshot at consistent zoom + window size; compare side-by-side vs v1.2 baseline (regenerated by `git checkout` of the v1.2 ship commit per CONTEXT "Claude's Discretion → THEME-05 baseline regeneration") |
| BRAT 7-day dogfood + plugin-store re-review filing | POLISH-06 | Real-user vault behavior + plugin-store reviewer feedback are external systems | Tag `1.3.0-beta.1`, push to GitHub, attach release artifacts; install via BRAT in dev vault for 7 days; watch GitHub Issues for P0/P1; on pass, tag `1.3.0` and file plugin-store re-review per Obsidian community-plugins.json process |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (where automatable)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (verified above — manual tasks are bracketed by structural gates)
- [ ] Wave 0 covers all MISSING references (none — existing infrastructure suffices)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter (set by gsd-executor at first wave 0 completion or skipped here since no Wave 0 needed)

**Approval:** pending
