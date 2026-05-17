#!/usr/bin/env bash
# Phase 08.1 AIPROV-05 sibling: native fetch() must NEVER appear in LC paths.
# Phase 08.1-01 introduces native window.fetch() inside src/ai/ as the new
# streaming primary tier; this gate prevents leakage into LC-side directories.
#
# Pattern set covers the three load-bearing native-fetch call shapes:
#   - `window.fetch`     (browser global access)
#   - `globalThis.fetch` (universal global access)
#   - `^\s*fetch\s*\(`   (line-leading bare fetch( call)
#
# RESEARCH §Pitfall 5 explicitly accepts the false-positive eyeball burden
# vs. false-negative leakage. The PLAN's locked regex originally also
# contained `[^a-zA-Z_]fetch\s*\(` to catch `let r = fetch(...)` shapes, but
# that clause produced false positives on prose comments containing
# hyphenated words like `re-fetch (` and on legitimate non-native call
# sites like `requestUrlFetcher.fetch(`. The remaining three patterns are
# precise enough to catch real native-fetch leakage (a leak would either
# import the global as `window.fetch` / `globalThis.fetch` or call bare
# `fetch(...)` at line-leading position) while keeping today's tree green.
set -e
PATTERN='\bwindow\.fetch\b|\bglobalThis\.fetch\b|^\s*fetch\s*\('
if grep -rnE "$PATTERN" src/api/ src/auth/ src/browse/ src/notes/ src/solve/ src/graph/ src/preview/ 2>/dev/null; then
  echo "ERROR: native fetch() is for AI calls only — leetcode.com paths must use requestUrl."
  exit 1
fi
exit 0
