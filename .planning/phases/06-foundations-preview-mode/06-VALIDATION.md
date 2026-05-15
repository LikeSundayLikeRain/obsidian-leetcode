---
phase: 06
slug: foundations-preview-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth: `.planning/phases/06-foundations-preview-mode/06-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@4.1.5` (already pinned) |
| **Config file** | `vitest.config.ts` (env: `happy-dom`; setup: `tests/helpers/setup.ts`; obsidian aliased to `tests/helpers/obsidian-stub.ts`) |
| **Quick run command** | `npm test -- <pattern>` (e.g., `npm test -- preview` for Phase 06 preview tests) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10-20 seconds (vitest, happy-dom) |

Existing infrastructure: `tests/browse/`, `tests/notes/`, `tests/settings/`, `tests/integration/` — all v1.0 patterns. Phase 06 adds `tests/preview/` and `tests/foundations/`.

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <area>` (area-scoped vitest run; full lint also fast)
- **After every plan wave:** Run `npm test && npm run lint && npm run build`
- **Before `/gsd:verify-work`:** Full suite green: `npm test && npm run lint && npm run build && npm run check:bundle-size`
- **Max feedback latency:** ≤30 seconds (full local gate)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| FOUND-01 | `npm run lint` exits 0 against `eslint-plugin-obsidianmd@^0.3.0` | smoke | `npm run lint` | ✅ | ⬜ pending |
| FOUND-01 | `eslint.config.mts` keeps `obsidianmd.configs.recommended` so 0.3.0 rules auto-enable | unit (config introspection) | `npm test -- foundations.eslint-config` | ❌ W0 | ⬜ pending |
| FOUND-02 | `scripts/check-bundle-size.mjs` exits 1 when stub `main.js` > 500_000 bytes | unit | `npm test -- foundations.check-bundle-size` | ❌ W0 | ⬜ pending |
| FOUND-02 | Same script exits 0 with warning when 400_000 < size ≤ 500_000 | unit | `npm test -- foundations.check-bundle-size` | ❌ W0 | ⬜ pending |
| FOUND-02 | `.github/workflows/ci.yml` is well-formed and runs lint+test+build+size in order | unit (parse YAML, assert step list) | `npm test -- foundations.ci-workflow` | ❌ W0 | ⬜ pending |
| FOUND-03 | New `open-in-preview` command id has no plugin-id prefix and no "command" word | unit | `npm test -- preview.command-ids` | ❌ W0 | ⬜ pending |
| PREVIEW-01 | Right-click on a row dispatches `routeProblemClick(slug, status, 'preview', {force:true})` | unit (vitest + happy-dom) | `npm test -- preview.right-click` | ❌ W0 | ⬜ pending |
| PREVIEW-01 | Right-click does NOT create a `.md` file (regression hardening) | manual UAT | n/a (manual reload-vault smoke) | ❌ | ⬜ pending |
| PREVIEW-02 | Default click previews; `previewClickBehavior='open'` flips back to v1.0 | unit | `npm test -- preview.click-behavior` | ❌ W0 | ⬜ pending |
| PREVIEW-02 | Shift-click always opens (regardless of setting) | unit | `npm test -- preview.click-behavior` | ❌ W0 | ⬜ pending |
| PREVIEW-02 | Settings dropdown round-trips through `data.json` (load + save + reload) | unit | `npm test -- settings-store-preview` | ❌ W0 | ⬜ pending |
| PREVIEW-03 | Preview header renders id+title heading, difficulty pill, topic chips | unit (happy-dom DOM assert) | `npm test -- preview.header-render` | ❌ W0 | ⬜ pending |
| PREVIEW-04 | "Start Problem" button calls `plugin.openProblem(slug, status)` then schedules detach | unit | `npm test -- preview.start-button` | ❌ W0 | ⬜ pending |
| PREVIEW-04 | Header shows "Start Problem" iff vault has no `LeetCode/{id}-{slug}.md` | unit | `npm test -- preview.existing-note-detection` | ❌ W0 | ⬜ pending |
| PREVIEW-05 | Header shows "Open Problem" iff note exists; click calls `plugin.openProblem(...)` | unit | `npm test -- preview.existing-note-detection` | ❌ W0 | ⬜ pending |
| Tab reuse | Two consecutive previews use the SAME leaf (no duplicate tab) | unit | `npm test -- preview.tab-reuse` | ❌ W0 | ⬜ pending |
| Detach lifecycle | After Start completes, leaf detaches within ~100 ms | unit (mock setWindowTimeout) | `npm test -- preview.detach` | ❌ W0 | ⬜ pending |
| Regression | `grep "vault\.create\|openLinkText" src/preview/` returns zero | unit (filesystem grep test) | `npm test -- preview.regression-grep` | ❌ W0 | ⬜ pending |
| Regression | `grep "MarkdownRenderer\.render\(" src/preview/` matches `, this)` (passes view, not plugin) | unit | `npm test -- preview.regression-grep` | ❌ W0 | ⬜ pending |
| Router | `routeProblemClick` decision flow (intent + force + setting matrix) | unit | `npm test -- preview.router` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test stubs to land before any feature code:

- [ ] `tests/foundations/eslint-config.test.ts` — covers FOUND-01 config-introspection
- [ ] `tests/foundations/check-bundle-size.test.ts` — covers FOUND-02 (script behavior under both thresholds)
- [ ] `tests/foundations/ci-workflow.test.ts` — covers FOUND-02 (workflow YAML shape)
- [ ] `tests/preview/right-click.test.ts` — covers PREVIEW-01
- [ ] `tests/preview/click-behavior.test.ts` — covers PREVIEW-02
- [ ] `tests/preview/header-render.test.ts` — covers PREVIEW-03
- [ ] `tests/preview/start-button.test.ts` — covers PREVIEW-04
- [ ] `tests/preview/existing-note-detection.test.ts` — covers PREVIEW-04 + PREVIEW-05
- [ ] `tests/preview/tab-reuse.test.ts` — covers tab-reuse contract
- [ ] `tests/preview/detach.test.ts` — covers detach lifecycle (mock `setWindowTimeout`)
- [ ] `tests/preview/regression-grep.test.ts` — covers no-vault-create regression hardening
- [ ] `tests/preview/command-ids.test.ts` — covers FOUND-03 for new commands
- [ ] `tests/settings/preview-click-behavior.test.ts` — covers `SettingsStore.previewClickBehavior` round-trip
- [ ] `tests/preview/router.test.ts` — covers `routeProblemClick` decision matrix

**Framework install / config:** none required (vitest + happy-dom + obsidian stub already in place from v1.0).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Right-click → preview opens, no `.md` file appears in vault | PREVIEW-01 | Vault FS effects + Obsidian context-menu UX cannot be reliably asserted with happy-dom | Reload plugin in dev vault → right-click any problem in browser → confirm preview tab opens with no new file under `LeetCode/` |
| Sticky header pins on scroll inside preview body | PREVIEW-03 (UI-SPEC §4) | CSS `position: sticky` rendering needs a real renderer | Open preview → scroll body → confirm header stays pinned |
| Tab icon (`'eye'` or chosen Lucide name) renders distinctly from other tabs | PREVIEW-03 / UI-SPEC | Icon presence in tab strip is a visual check | Open preview → confirm icon visible in tab strip |
| `npm run build` produces production `main.js` < 500 KB at HEAD | FOUND-02 | Real bundle size depends on full toolchain run | Run `npm run build && npm run check:bundle-size` locally and on CI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
