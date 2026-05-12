#!/usr/bin/env bash
# scripts/check-bundle-size.sh
#
# Phase 5.3 D-09 / D-15 — hard bundle-size gate.
#
# Runs:
#   - after every `npm run build`
#   - as gate 12 extension in `prerelease-check.sh`
#   - on CI (future)
#
# Fails if main.js > 250 KB. Warns at 200 KB.
# (Cap tightened per Phase 5.3 Plan 04 Task 2 / RESEARCH §Q7. Post-revert
# baseline is ~155 KB, leaving ~95 KB of headroom for Phase 5.3 polish +
# future minor phases. Old 700/600 cap was sized for the failed
# language-pack landing at 520 KB; leaving it that loose meant any future
# regression up to 4.5x current size silently passed — the cap ceased to
# be a regression gate. New cap catches >=60% bloat regressions.)
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$ROOT/main.js"

if [ ! -f "$MAIN" ]; then
  echo "BUNDLE CHECK FAIL: main.js missing — run 'npm run build' first" >&2
  exit 1
fi

MAIN_BYTES=$(wc -c < "$MAIN" | tr -d ' ')
MAIN_KB=$((MAIN_BYTES / 1024))
LIMIT_BYTES=$((250 * 1024))
WARN_BYTES=$((200 * 1024))

if [ "$MAIN_BYTES" -gt "$LIMIT_BYTES" ]; then
  echo "BUNDLE CHECK FAIL: main.js is ${MAIN_KB} KB (>250 KB ceiling; chevron+remap baseline ~155 KB; Phase 5.3 Plan 04 escalation required)" >&2
  exit 1
fi
if [ "$MAIN_BYTES" -gt "$WARN_BYTES" ]; then
  echo "BUNDLE CHECK WARN: main.js is ${MAIN_KB} KB (>200 KB soft warning; ceiling 250 KB)"
fi
echo "BUNDLE CHECK OK: main.js ${MAIN_KB} KB within budget"
