---
phase: 1
slug: plugin-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (Wave 0 installs) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npm test && npm run lint && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds (unit + lint + typecheck) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npm test && npm run lint && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green + manual desktop-Obsidian smoke checklist complete
- **Max feedback latency:** 30 seconds (unit tests); manual smokes are explicit gates, not sampling

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 1-01-01 | 01 | 0 | FND-01, FND-02 | static | `cat manifest.json \| jq '.isDesktopOnly'` == `true` | ⬜ |
| 1-01-02 | 01 | 0 | FND-01 | static | `cat manifest.json \| jq '.minAppVersion'` matches `1.5.0+` | ⬜ |
| 1-01-03 | 01 | 0 | FND-01 | build | `npm run build` exits 0, `main.js` exists | ⬜ |
| 1-01-04 | 01 | 0 | FND-03 | lint | `npm run lint` exits 0 | ⬜ |
| 1-01-05 | 01 | 0 | — | typecheck | `npx tsc --noEmit` exits 0 | ⬜ |
| 1-02-01 | 02 | 1 | FND-04, CF-01 | unit | `npx vitest run requestUrlFetcher.test.ts` | ⬜ |
| 1-02-02 | 02 | 1 | BROWSE-05, D-12 | unit | `npx vitest run throttle.test.ts` (20 tokens/10s + max 2) | ⬜ |
| 1-02-03 | 02 | 1 | FND-04 | grep | `grep -rn "fetch(\\|axios" src/` returns 0 | ⬜ |
| 1-02-04 | 02 | 1 | AUTH-04 | unit | `npx vitest run sessionExpiry.test.ts` | ⬜ |
| 1-03-01 | 03 | 2 | AUTH-01, AUTH-02, CF-06 | grep | Electron `require` only in `src/auth/BrowserWindowLogin.ts` | ⬜ |
| 1-03-02 | 03 | 2 | AUTH-03 | manual | Paste cookie flow accepts valid session — desktop smoke | ⬜ |
| 1-03-03 | 03 | 2 | AUTH-05 | unit | `npx vitest run authService.test.ts` (logout clears store) | ⬜ |
| 1-03-04 | 03 | 2 | AUTH-06, CF-03 | grep | `grep -rn "console.log" src/auth` returns 0; no cookie in log calls | ⬜ |
| 1-04-01 | 04 | 2 | — | unit | `npx vitest run settingsStore.test.ts` | ⬜ |
| 1-05-01 | 05 | 3 | BROWSE-01 | manual | Ribbon icon + command palette both open browser — desktop smoke | ⬜ |
| 1-05-02 | 05 | 3 | BROWSE-02 | unit | `npx vitest run problemListService.test.ts` (paged + TTL) | ⬜ |
| 1-05-03 | 05 | 3 | BROWSE-03 | unit | `npx vitest run problemSearch.test.ts` (title + id filter) | ⬜ |
| 1-05-04 | 05 | 3 | BROWSE-04 | unit | `npx vitest run problemFilter.test.ts` (difficulty + status) | ⬜ |
| 1-05-05 | 05 | 3 | FND-05 | manual | Enable/disable plugin 3× without crash — desktop smoke | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` + `tsconfig.json` + `esbuild.config.mjs` + `manifest.json` (sample-plugin baseline)
- [ ] `vitest.config.ts` — vitest 4.1.5 installed, `src/**/*.test.ts` discovered
- [ ] `eslint.config.mts` — `eslint-plugin-obsidianmd` recommended config wired
- [ ] `tests/setup.ts` — mock `obsidian` + `electron` imports for unit tests
- [ ] Stubs for each REQ-ID in the table above (skeleton `.test.ts` files written before implementation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plugin loads in desktop Obsidian 1.5+ without crashes | FND-01, FND-05 | Requires a live Obsidian instance; no headless Electron harness in v1 | Copy `main.js` + `manifest.json` to `<vault>/.obsidian/plugins/obsidian-leetcode/`, enable plugin, reload 3×, inspect devtools console for errors |
| BrowserWindow login captures cookies | AUTH-01, AUTH-02 | `BrowserWindow` requires live Electron renderer with `persist:leetcode` partition | Click "Log in via embedded window" in settings, complete LC login, verify window closes automatically and `Status: Logged in as <user>` appears |
| Cookie-paste fallback persists across reload | AUTH-03 | Full path requires real Obsidian reload cycle | Paste valid `LEETCODE_SESSION` + `csrftoken` in settings, reload Obsidian, verify still logged in |
| Session-expiry re-auth prompt | AUTH-04 | Requires expired LC session — cannot reliably unit-simulate | Manually invalidate `LEETCODE_SESSION` in `data.json`, open browser, verify `Notice` with "Log in" button appears |
| Problem browser paints 3,300+ rows without freezing | BROWSE-01, BROWSE-02 | UI jank is subjective; visible only in a real Obsidian render loop | Open browser, scroll 3,300 rows end-to-end, verify no frame drops, no Obsidian freeze, memory stays flat |
| Plugin absent from mobile plugin list | FND-02 | Requires Obsidian mobile build | Load plugin folder into mobile vault via sync, verify plugin not listed |
| Throttle UX — silent queue | BROWSE-05, D-13 | Footer spinner `⋯ Fetching from LeetCode…` shows only when queue depth > 0 for > 2s | Trigger 30 rapid calls, verify spinner appears after 2s, disappears when queue drains, no `Notice` spam |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest config, ESLint config, test stubs)
- [ ] No watch-mode flags in any task command (all tests run once-and-exit)
- [ ] Feedback latency < 30s for unit suite
- [ ] Manual smoke checklist embedded in `/gsd-verify-work` UAT
- [ ] `nyquist_compliant: true` set in frontmatter after planner verifies per-task coverage

**Approval:** pending
