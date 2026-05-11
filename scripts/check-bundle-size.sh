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
# Fails if main.js > 700 KB. Warns at 600 KB.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$ROOT/main.js"

if [ ! -f "$MAIN" ]; then
  echo "BUNDLE CHECK FAIL: main.js missing — run 'npm run build' first" >&2
  exit 1
fi

MAIN_BYTES=$(wc -c < "$MAIN" | tr -d ' ')
MAIN_KB=$((MAIN_BYTES / 1024))
LIMIT_BYTES=$((700 * 1024))
WARN_BYTES=$((600 * 1024))

if [ "$MAIN_BYTES" -gt "$LIMIT_BYTES" ]; then
  echo "BUNDLE CHECK FAIL: main.js is ${MAIN_KB} KB (>700 KB ceiling; D-09 escalation required)" >&2
  exit 1
fi
if [ "$MAIN_BYTES" -gt "$WARN_BYTES" ]; then
  echo "BUNDLE CHECK WARN: main.js is ${MAIN_KB} KB (>600 KB soft warning; ceiling 700 KB)"
fi
echo "BUNDLE CHECK OK: main.js ${MAIN_KB} KB within budget"
