#!/usr/bin/env node
// scripts/check-bundle-size.mjs
//
// Phase 06 FOUND-02 — platform-portable bundle-size gate (replaces the
// legacy bash version, whose `du`/`wc -c` invocations were GNU-only and
// silently failed on macOS / Windows runners). See 06-RESEARCH.md
// §Pitfall 6.
//
// Thresholds:
//   HARD_LIMIT = 1_000_000 bytes — exit 1 (fails CI)
//   SOFT_WARN  =   900_000 bytes — exit 0 with stderr WARN
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
// Invoked from `npm run check:bundle-size` and from the Phase 06 GitHub
// Actions workflow at .github/workflows/ci.yml.
import fs from 'node:fs';

const HARD_LIMIT = 1_000_000;
const SOFT_WARN = 900_000;
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
