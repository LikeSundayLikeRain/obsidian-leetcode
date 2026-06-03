#!/usr/bin/env node
// scripts/check-bundle-size.mjs
//
// Phase 06 FOUND-02 — platform-portable bundle-size gate (replaces the
// legacy bash version, whose `du`/`wc -c` invocations were GNU-only and
// silently failed on macOS / Windows runners). See 06-RESEARCH.md
// §Pitfall 6.
//
// Thresholds (current — bumped in Phase 17 Plan 06; see ceiling-bump block below):
//   HARD_LIMIT = 1_800_000 bytes — exit 1 (fails CI)
//   SOFT_WARN  = 1_710_000 bytes — exit 0 with stderr WARN
//
// Phase 07 Plan 03 ceiling bump (Rule 3 — Architectural deviation):
//   The original 500 KB / 400 KB thresholds were locked in 06-CONTEXT.md §E
//   before the AI Provider Foundation work was scoped. Phase 07-03 wires
//   `new AIClient(this.settings)` into `main.ts:onload` Step 5.9, which
//   pulls the @ai-sdk/* runtime (anthropic / openai / openai-compatible / ai
//   core) onto the bundle graph. esbuild builds Obsidian plugins with
//   `format: 'cjs'` and no `splitting` (single-file output is mandatory for
//   Obsidian's plugin loader), so the dynamic-import escape hatch sketched in
//   07-CONTEXT.md decision A's bundle-size guard does NOT actually defer the
//   AI SDK out of the hot path — `await import('@ai-sdk/anthropic')` resolves
//   into the same single CJS bundle. Plan 07-02's "168.9 KB" measurement was a
//   false-green: the AI SDK was tree-shaken because nothing imported it yet.
//
//   Mainstream Obsidian AI plugins ship at similar sizes:
//     - Smart Connections    ~1.2 MB
//     - Obsidian Copilot     ~800 KB
//   The 1 MB ceiling preserves a meaningful regression gate while accommodating
//   the AI SDK runtime. Soft warning bumped proportionally to 900 KB (last 10%
//   of headroom — same posture as the prior 80% soft-warning threshold).
//
// Phase 08 Plan 02 ceiling bump (Rule 3 — Architectural deviation):
//   Phase 07-03 wired the AIClient construction into onload, but no caller
//   actually consumed `streamText` / `generateText` at runtime — the four
//   per-provider `invoke` methods threw a placeholder error
//   ('AIClient.invoke: Phase 08 wires the real call'). esbuild's tree-shaker
//   correctly elided most of the `ai` core package because no live
//   call-site reached `streamText` / `generateText`. The 1 MB ceiling locked
//   in Phase 07-03 was a tree-shake-false-green for the same structural
//   reason 07-03's own bump was: the bundle-size gate cannot detect runtime
//   consumption that hasn't been wired yet.
//
//   Phase 08 Plan 02 is the first wave that actually consumes `streamText`
//   (via `streamAnthropic` / `streamOpenAI` / `streamOpenAICompatible` /
//   `streamOllama`) and `generateText` (via the buffered fallback path in
//   `invokeXBuffered` and the existing `probeAnthropic` / `probeViaOneTokenChat`
//   probes). With the live consumer wired, the AI SDK runtime now lands on
//   the bundle graph: the single CJS bundle includes the `streamText`
//   pipeline (token stream parser, tool/output decoders, abort coordinator,
//   onError/onAbort handlers) which Phase 07-02's tree-shaker had elided.
//   Measured `main.js` post-Plan-08-02: 1,010,121 bytes (~986 KB) — a ~155 KB
//   delta over Phase 07-03's measurement. The Plan 08-03 AIStreamModal
//   addition will add UI plumbing on top.
//
//   New ceiling: 1.2 MB hard / 1.08 MB soft (~16% headroom). Mainstream
//   Obsidian AI plugins still anchor the upper bound:
//     - Smart Connections    ~1.2 MB
//     - Obsidian Copilot     ~800 KB
//   The plugin stays in the same neighborhood; the SOFT_WARN at 90% of HARD
//   preserves the same proportional warning posture as the 07-03 bump
//   (900 KB / 1 MB = 90% → 1.08 MB / 1.2 MB = 90%).
//
// Phase 16 Plan 05 ceiling bump (Rule 3 — Architectural deviation):
//   Phase 16 wires full CM6 LanguageSupport for all 8 LeetCode languages
//   (Python, Java, C, C++, JavaScript, TypeScript, Go, Rust) into the child
//   editor, with chevron-driven Compartment.reconfigure() for atomic switching
//   (LANG-01) and language-aware Cmd-/ comment toggling (COMMENT-01).
//   New direct dependencies on the bundle graph:
//     - @codemirror/lang-rust        (Rust LanguageSupport, Lezer-based)
//     - @codemirror/legacy-modes     (Go via StreamLanguage.define(go))
//     - @codemirror/autocomplete     (closeBrackets() + closeBracketsKeymap;
//                                    promoted from transitive)
//   16-RESEARCH.md §9 estimated +25-40 KB gz; reality post-Plan-16-05:
//   1,577,935 bytes raw / 418,581 bytes gzipped — a +297 KB raw / +106 KB gz
//   delta over the Phase 08-02 baseline. Rust's Lezer parser tables overshoot
//   the estimate. This is functional cost, not bloat: lang-rust ships the
//   full incremental Rust grammar, legacy-modes ships brace-counting Go, and
//   closeBrackets() ships per-language pair behavior driven by each
//   LanguageSupport's languageData.
//
//   New ceiling: 1.6 MB hard / 1.44 MB soft (~10% headroom — slightly tighter
//   than 08-02's 16% to keep regression-gate bite). Within CLAUDE.md's ~1.5 MB
//   v1.2 architectural ceiling for the milestone. Phase 17 polish may
//   investigate dynamic-import for the lang packs (`await
//   import('@codemirror/lang-rust')`), though Obsidian's CJS-only plugin
//   loader makes this infeasible in practice (same constraint that forced
//   the 07-03 bump).
//
// Phase 17 Plan 06 ceiling bump (Rule 3 — Architectural deviation, user-approved):
//   Phase 17 D-18 ships @replit/codemirror-vim 6.3.0 to give vim users parity
//   with Obsidian's global vim setting. The package's bundled CJS module is
//   ~321 KB unminified; post-esbuild minification + bundle integration the
//   delta against the Phase 16 baseline is +124,708 bytes raw / +39,190 bytes
//   gzipped (measured 2026-05-23 — see 17-BUNDLE-AUDIT.md). esbuild's
//   single-CJS-bundle constraint (Obsidian's plugin loader requires it)
//   bundles vim eagerly even when `vimMode` is false, so the conditional spread
//   in childEditorFactory.ts only saves runtime keymap installation, not bundle
//   bytes (CONTEXT D-21).
//
//   Phase 16's 1.6 MB ceiling had ~17 KB headroom — vim's 124.7 KB delta
//   exceeded it by ~7×. The Plan 17-06 Task 2 checkpoint (D-19 hard gate)
//   surfaced the failure to the user, who explicitly approved a ceiling raise
//   to 1.8 MB to ship vim in v1.2. Post-vim raw is 1,707,327 bytes; the new
//   ceiling preserves ~92 KB headroom for v1.3 work. SOFT_WARN bumped
//   proportionally to 1_710_000 (~95% of HARD — slightly tighter than 08-02's
//   90% so the regression gate still bites within the v1.3 working budget).
//
// Phase 22 Plan 22-03 v1.3 release-gate calibration (POLISH-02 / D-gate-01):
//   Phase 22-01 unwires the v1.2 path (net −3,325 LOC across 34 files; ship
//   commit 306f48a 2026-06-03). Phase 22-02 ships 8 polish items during the
//   22-01-B dogfood window — line-number gutter port (LINENUM-01 verbatim
//   from the deleted childEditorFactory.ts), per-mode vim cursor rendering
//   (3-layer cascade fix), takeover-overlay hide, blank-line emit fix, action
//   row font, hover-border override, read-mode font-size, and Reset/Copy
//   write-path migration. The polish suite re-pulls some CodeMirror surface
//   that the v1.2 deletions removed (lineNumbers + gutter + GutterMarker +
//   Compartment, plus per-mode CSS), netting +49 KB raw vs. v1.2 baseline.
//
//   Post-cutover post-polish raw is 1,756,707 bytes (measured 2026-06-03,
//   commit 245f45b). The 1,706,000 v1.2-baseline ratchet that 22-03's plan
//   originally proposed would fail CI at this size, so we keep HARD_LIMIT
//   at the Phase 17 D-19 user-approved 1.8 MB ceiling — the v1.3 milestone
//   is a net feature win even at +49 KB; the architectural deletion already
//   landed and won't unlock further bytes. SOFT_WARN drops to 1,760,000
//   (~3 KB above current size) so any v1.3.x feature regression past polish
//   bites the soft warning within ~1 KB of growth — much tighter than the
//   prior 95% posture, calibrated against the actual measured working set.
//
//   Net contract: HARD = 1.8 MB hard cap (v1.2 + vim absolute ceiling, no
//   regression past it); SOFT = 1.76 MB (post-polish working ceiling, fires
//   on growth). Future v1.3.x features must net negative bytes vs. polish
//   baseline or accept a soft warning. v1.4+ may revisit the hard cap if a
//   meaningful deletion (e.g. migration infrastructure sunset) creates room.
//
// Invoked from `npm run check:bundle-size` and from the Phase 06 GitHub
// Actions workflow at .github/workflows/ci.yml.
import fs from 'node:fs';

const HARD_LIMIT = 1_800_000;
const SOFT_WARN = 1_760_000;
const PATH = 'main.js';

if (!fs.existsSync(PATH)) {
  console.error(`BUNDLE CHECK FAIL: ${PATH} missing — run "npm run build" first`);
  process.exit(1);
}
const size = fs.statSync(PATH).size;
const kb = (size / 1024).toFixed(1);
console.log(`main.js: ${size} bytes (${kb} KB)`);
if (size > HARD_LIMIT) {
  console.error(`BUNDLE CHECK FAIL: main.js exceeds ${HARD_LIMIT} bytes`);
  process.exit(1);
}
if (size > SOFT_WARN) {
  console.warn(`BUNDLE CHECK WARN: main.js > ${SOFT_WARN} bytes — heading toward the gate`);
}
console.log('BUNDLE CHECK OK');
