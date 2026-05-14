---
phase: 03
slug: run-submit
status: verified
threats_open: 0
asvs_level: 2
created: 2026-05-08
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| plugin → leetcode.com | All Phase 3 REST traffic (interpret_solution, submit, check) over HTTPS | `LEETCODE_SESSION`, `csrftoken`, typed solution code, custom test input |
| leetcode.com → plugin | LC JSON payload: compile_error, runtime_error, std_output, expected_output, status_code | User-controlled text; rendered via `setText`/`createEl`, never `innerHTML` |
| developer → fixture capture script | Live capture uses author's LC session; fixtures enter the repo | LC response JSON — redacted before commit |
| frontmatter (lc-slug) → REST URL path | `lc-slug` interpolates into `/problems/{slug}/submit/` | Shape-guarded `/^[a-z0-9-]+$/` at command entry (T-03-05-01) |
| cookies (SettingsStore) → REST headers | Read per-call; never cached at module scope | Session + CSRF |
| LC response payload (unknown verdict) → UnknownVerdictError → modal | Unredacted raw payload held in memory for copy-to-clipboard | Logger redacts before `navigator.clipboard.writeText` (T-03-06-02) |
| active MarkdownView editor content → orchestrator | User code serialized as JSON body; never rendered as HTML | Solution code |
| clipboard writes (Copy error / payload / failing testcase) | Data leaves the plugin | Redacted for unknown-verdict payloads |
| polling timers → plugin.registerInterval | Every timer handle flows to Obsidian's unload-cleanup registry | Closure state only |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01-01 | Information Disclosure | Fixture JSONs in `tests/solve/fixtures/` | mitigate | `grep -rE 'csrftoken=\|LEETCODE_SESSION=\|sessionid=' tests/solve/fixtures/` returns 0; README mandates `logger.redact` + manual `jq` review before commit | closed |
| T-03-01-02 | Information Disclosure | Debug logs from redirect spike | mitigate | No `console.log` in `src/api/requestUrlFetcher.ts`; `src/shared/logger.ts` redact gate intact | closed |
| T-03-01-03 | Tampering | Fake fetcher mis-imported into prod | accept | Test helpers under `tests/solve/mocks/`; separate compile units; low practical risk | closed |
| T-03-01-04 | Denial of Service | Live fixture capture floods LC judge | accept | Developer captures ~8 submissions manually; LC's own rate limiting governs; outside plugin attack surface | closed |
| T-03-02-01 | Input Validation | `extractFirstFencedBlock` on 10 MB+ note | accept | Regex is O(n) line-scan; V8 handles 10 MB in ~50 ms; user unlikely to hit | closed |
| T-03-02-02 | Tampering | LC-sourced starter code written to vault | accept | Inserted as fenced code block; never `eval`'d; rendered by Obsidian markdown pipeline | closed |
| T-03-02-03 | Information Disclosure | `logger.debug(err)` leaks session/csrf in error object | mitigate | `src/shared/logger.ts:59-71` redacts `session\|csrf\|cookie\|token` on every log method | closed |
| T-03-02-04 | Tampering | `forceInjectCodeSection` erases user code | accept | Intended contract per D-07; user explicitly invokes "Insert starter code"; Plan 07 smoke test A.6 verifies | closed |
| T-03-03-01 | Tampering | `activeThrottle` singleton leak across unload | accept | Phase 1 teardown already handles; Plan 03 adds no new surface | closed |
| T-03-03-02 | Information Disclosure | `UnknownVerdictError.payload` unredacted in memory | mitigate | `VerdictModal.renderUnknown` → `logger.redact` before `navigator.clipboard.writeText` | closed |
| T-03-03-03 | Input Validation | SettingsStore accepts malformed `internalQuestionId` | mitigate | `src/settings/SettingsStore.ts:196` — `typeof d.internalQuestionId !== 'string' return false` | closed |
| T-03-03-04 | Authentication | `throttledRequestUrl` bypasses authHeaders | accept | Helper is low-level; `src/solve/leetcodeRest.ts` `authHeaders` is applied uniformly by every REST function | closed |
| T-03-04-01 | Information Disclosure | Cookie header sent to non-LC host | mitigate | `src/solve/leetcodeRest.ts:33` — `BASE_URL='https://leetcode.com'` literal; all three endpoint URLs template-interpolate it | closed |
| T-03-04-02 | Information Disclosure | Error message echoes cookie | mitigate | `src/solve/leetcodeRest.ts:108,141,167` — `res.text.slice(0, 200)` body-only; logger redacts if stack is logged | closed |
| T-03-04-03 | Tampering | HTTPS MITM | mitigate | `BASE_URL` HTTPS-only; no http fallback; Obsidian `requestUrl` honors OS trust store | closed |
| T-03-04-04 | Authentication | CSRF token drift mid-session | accept | Rare; 403 triggers Phase 1 re-auth; per-call cookie read propagates fresh values | closed |
| T-03-04-05 | Input Validation | LC returns unknown `status_code` | mitigate | `submitFromActive` in `src/main.ts` classifies via `classifyStatus`; on `kind==='unknown'` throws `UnknownVerdictError(terminal)`; caught branch renders via `modal.renderVerdict` which routes to `renderUnknownVerdict` (D-15 copy-payload view) | closed |
| T-03-04-06 | Information Disclosure | Redirect exposes login HTML | accept | `assertNotSessionExpired` catches via status + HTML sniff; worst case: login HTML body truncated in thrown Error; no credential material | closed |
| T-03-05-01 | Input Validation | Malicious `lc-slug` injects path segments into REST URL | mitigate | `src/main.ts` — `SLUG_RE=/^[a-z0-9-]+$/` + `isValidSlug(v)` guard applied at all 5 command `editorCheckCallback` sites + `getActiveProblemContext()` + `refreshProblem` before any slug reaches `leetcodeRest.ts` | closed |
| T-03-05-02 | Denial of Service | Infinite polling via abort+re-submit | accept | D-24 single-flight + `MAX_WALLCLOCK_MS=60000` + `MAX_CONSECUTIVE_ERRORS=3`; user-initiated re-submit governed by LC rate limits | closed |
| T-03-05-03 | Information Disclosure | `logger.warn('unexpected error', err)` leaks stack | mitigate | `src/shared/logger.ts` redact regex applies to Error stacks; no credential values reach logger | closed |
| T-03-05-04 | Tampering | Stale cookies mid-rotation → 403 | accept | Per-call cookie read via `settings.getAuthCookies()`; D-27 no auto-retry; user re-invokes after Notice | closed |
| T-03-05-05 | Race Condition | Abort flag flipped after `check()` resolves | mitigate | `src/solve/pollingOrchestrator.ts:140,159,175,205` — `abortSignal.aborted` checked at 4 locations (≥3 required) | closed |
| T-03-05-06 | Resource Leak | Polling timers survive unload | mitigate | `registerInterval` 8 call sites in `pollingOrchestrator.ts` + 2 in `submissionOrchestrator.ts`; Obsidian cancels on unload | closed |
| T-03-06-01 | Tampering | LC `<script>` in `std_output` → XSS | mitigate | `src/solve/VerdictModal.ts` + `verdictModalRenderer.ts` all DOM via `createEl()`/`createDiv()`; 0 `innerHTML` matches in `src/solve/` | closed |
| T-03-06-02 | Information Disclosure | Copy-payload exposes cookie artifacts | mitigate | `VerdictModal.renderUnknown` routes clipboard path through logger redaction before `navigator.clipboard.writeText` | closed |
| T-03-06-03 | Information Disclosure | CE/RE error text copied to clipboard | accept | Error text is user's own code output; no credential surface | closed |
| T-03-06-04 | Input Validation | 1 MB+ paste into custom test textarea | accept | Obsidian textarea handles native; LC's 20 KB `data_input` limit errors server-side | closed |
| T-03-06-05 | Tampering | User pastes `### Case N` directly, confusing parser | accept | `CaseRegion` parses by order not numeric value; round-trip renumbers | closed |
| T-03-06-06 | Reliability | Unknown `status_code` silent discard | mitigate | `verdictModalRenderer.ts:77-78` routes `kind==='unknown'` to `renderUnknownVerdict` with copy-payload view | closed |
| T-03-07-01 | Spoofing | Command id collision with another plugin | accept | Command ids (`run-sample`, `run-custom`, `submit`, `insert-starter-code`, `cancel-submission`) lack explicit `leetcode-*` prefix, but Obsidian auto-namespaces every command as `{plugin-id}:{command-id}`. Per [Obsidian developer docs](https://docs.obsidian.md/Plugins/User+interface/Commands), collisions are structurally impossible at the palette level. Plan-time `leetcode-*` prefix was redundant belt-and-suspenders; residual risk is zero | closed |
| T-03-07-02 | Information Disclosure | Logs `typed_code` or `data_input` verbatim | mitigate | `grep 'logger\.' src/solve/ \| grep 'typed_code\|data_input'` → 0 matches | closed |
| T-03-07-03 | Denial of Service | Rapid invocation bypasses single-flight | accept | `editorCheckCallback` synchronous; single-flight flag checked inside `submit()`; second invocation Notices and aborts | closed |
| T-03-07-04 | Tampering | `### Case N` in unrelated note accidentally parsed | accept | Parser only fires when `## Custom Tests` heading present; user notes untouched | closed |
| T-03-07-05 | Information Disclosure | Bundle inlines fixture JSONs | mitigate | esbuild bundles `src/` only; `tests/` excluded; `grep 'accepted\.json\|_fixture_note' dist/main.js` → 0 matches | closed |
| T-03-07-06 | Authentication | Dev hot-reload cookie leak | accept | Dev-vault risk only; shipped plugin reloads via user-initiated restart | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-01-03 | Fake fetcher in prod via mis-import — test/prod compile units are separate; low practical risk | Plan author | 2026-05-08 |
| AR-03-02 | T-03-01-04 | Live fixture capture rate — 8 manual captures; LC rate-limits the judge itself | Plan author | 2026-05-08 |
| AR-03-03 | T-03-02-01 | 10 MB+ note DoS — V8 regex O(n) handles it in ~50 ms; user unlikely to hit | Plan author | 2026-05-08 |
| AR-03-04 | T-03-02-02 | LC starter code to vault — text content only, never eval'd; markdown render | Plan author | 2026-05-08 |
| AR-03-05 | T-03-02-04 | `forceInjectCodeSection` unconditional replace — per D-07 user invokes explicitly | Plan author | 2026-05-08 |
| AR-03-06 | T-03-03-01 | `activeThrottle` singleton — Phase 1 teardown covers | Plan author | 2026-05-08 |
| AR-03-07 | T-03-03-04 | `throttledRequestUrl` bypass — caller responsibility; Plan 04 uniform `authHeaders` | Plan author | 2026-05-08 |
| AR-03-08 | T-03-04-04 | CSRF rotation — rare; 403 triggers re-auth; user re-invokes | Plan author | 2026-05-08 |
| AR-03-09 | T-03-04-06 | Login-HTML in Error message — truncated to 200 chars; no credential material | Plan author | 2026-05-08 |
| AR-03-10 | T-03-05-02 | Abort-then-resubmit — D-24 single-flight + 60 s cap + 3-error cap; LC governs | Plan author | 2026-05-08 |
| AR-03-11 | T-03-05-04 | Stale cookies 403 — D-27 no auto-retry; per-call cookie read; user re-invokes | Plan author | 2026-05-08 |
| AR-03-12 | T-03-06-03 | CE/RE copy — user's own code output; no credential surface | Plan author | 2026-05-08 |
| AR-03-13 | T-03-06-04 | 1 MB+ custom input — LC 20 KB server-side limit errors cleanly | Plan author | 2026-05-08 |
| AR-03-14 | T-03-06-05 | Hand-pasted `### Case N` — parser is order-based, renumbers on write-back | Plan author | 2026-05-08 |
| AR-03-15 | T-03-07-01 | Command id prefix — Obsidian auto-namespaces every command as `{plugin-id}:{command-id}`, making palette-level collision structurally impossible. Explicit `leetcode-*` prefix was redundant belt-and-suspenders | User (moxu) | 2026-05-08 |
| AR-03-16 | T-03-07-03 | Rapid invocation race — flag is checked inside `submit()`; second invocation exits with Notice | Plan author | 2026-05-08 |
| AR-03-17 | T-03-07-04 | `### Case N` in unrelated notes — parser gated by `## Custom Tests` presence | Plan author | 2026-05-08 |
| AR-03-18 | T-03-07-06 | Dev hot-reload cookie leak — dev-vault risk only; out of plugin mitigation scope | Plan author | 2026-05-08 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-08 | 36 | 33 | 3 | gsd-security-auditor (sonnet) |
| 2026-05-08 | 36 | 36 | 0 | gsd-secure-phase (post-remediation) |

### Remediation commits

- **T-03-05-01 (slug injection):** `src/main.ts` — added `SLUG_RE=/^[a-z0-9-]+$/` + `isValidSlug` helper; replaced 5 `typeof slug === 'string'` guards at command `editorCheckCallback` sites + `getActiveProblemContext()` + `refreshProblem` path
- **T-03-04-05 (unknown verdict):** `src/main.ts` — `submitFromActive` now classifies terminal via `classifyStatus`; on `kind==='unknown'` throws `UnknownVerdictError(terminal)`; catch branch routes to `modal.renderVerdict` which invokes `renderUnknownVerdict` (D-15 copy-payload view)
- **T-03-07-01 (command id prefix):** accepted — Obsidian `{plugin-id}:{command-id}` auto-namespacing makes explicit prefix redundant; documented in AR-03-15

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-08
