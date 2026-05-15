#!/usr/bin/env node
// scripts/check-bundle-size.mjs
//
// Phase 06 FOUND-02 — platform-portable bundle-size gate (replaces the
// legacy bash version, whose `du`/`wc -c` invocations were GNU-only and
// silently failed on macOS / Windows runners). See 06-RESEARCH.md
// §Pitfall 6.
//
// Thresholds locked in 06-CONTEXT.md §E:
//   HARD_LIMIT = 500_000 bytes — exit 1 (fails CI)
//   SOFT_WARN  = 400_000 bytes — exit 0 with stderr WARN
//
// Invoked from `npm run check:bundle-size` and from the Phase 06 GitHub
// Actions workflow at .github/workflows/ci.yml.
import fs from 'node:fs';

const HARD_LIMIT = 500_000;
const SOFT_WARN = 400_000;
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
