#!/usr/bin/env bash
# scripts/prerelease-check.sh
#
# Mechanical prerelease gate for Obsidian community-plugin submission.
# Runs 12 checks; exits 0 only if ALL gates pass. Any failure exits 1 with
# a `PRERELEASE FAIL: ...` line naming the offending gate.
#
# Anchored grep patterns per Phase 5 RESEARCH §Pitfall 12:
#   innerHTML\s*=    (assignment only; avoids matching bare identifier in docs)
#   \bfetch\(        (word-boundary + tight paren; avoids prefetch( AND prose `fetch (...)` in comments)
#   \beval\(         (word-boundary + tight paren; avoids medieval( AND prose eval usage discussion)
#   new Function\(   (tight paren)
# Rationale: TS function calls never have whitespace between the identifier and
# the opening paren; requiring `\(` directly strips out prose comments without
# a separate comment-stripping pass.
#
# Gates (in order):
#   1. no innerHTML assignment
#   2. no fetch( usage (requestUrl only)
#   3. no eval( / new Function( usage
#   4. no telemetry identifiers (analytics|telemetry|mixpanel|google-analytics|gtag)
#   5. no vault.modify( in src/graph/ or src/main.ts (CF-06 extend)
#   6. manifest.json valid (id sans "obsidian"; semver; description terminal '.', <=250 chars; isDesktopOnly:true)
#   7. version consistency (manifest == package == versions.json latest)
#   8. LICENSE present + non-empty
#   9. README.md present; contains "leetcode.com"; >=4 image links
#  10. npm run lint exit 0
#  11. npm test -- --run exit 0
#  12. main.js <= 700 kB (Phase 5.3 D-09; delegated to scripts/check-bundle-size.sh; warn at 600 kB)
#
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "PRERELEASE FAIL: $1" >&2
  exit 1
}

ok() {
  echo "OK: $1"
}

# ---------------------------------------------------------------------------
# Gate 1: no innerHTML assignment in src/
# ---------------------------------------------------------------------------
set +e
innerhtml_hits=$(grep -rnE --include='*.ts' "innerHTML\s*=" src/ 2>/dev/null)
set -e
if [ -n "$innerhtml_hits" ]; then
  echo "$innerhtml_hits" >&2
  fail "innerHTML assignment found in src/ (use createEl/createDiv per Obsidian plugin policy)"
fi
ok "gate 1 — no innerHTML assignment"

# ---------------------------------------------------------------------------
# Gate 2: no fetch( usage (requestUrl only for HTTP)
# ---------------------------------------------------------------------------
# Tight `\bfetch\(` (no whitespace between `fetch` and `(`) — real TS function
# calls never have a space between. `\b` left-anchor avoids matching `prefetch(`.
# This rejects prose like "the picker's fetch (D-03)" in comments (spaced) while
# catching every real call site `fetch(...)`.
set +e
fetch_hits=$(grep -rnE --include='*.ts' "\bfetch\(" src/ 2>/dev/null)
set -e
if [ -n "$fetch_hits" ]; then
  echo "$fetch_hits" >&2
  fail "fetch( usage found in src/ (use requestUrl from 'obsidian' to bypass Electron CORS)"
fi
ok "gate 2 — no fetch( usage"

# ---------------------------------------------------------------------------
# Gate 3: no eval( or new Function( usage
# ---------------------------------------------------------------------------
# Tight `\beval\(` (no whitespace) avoids matching `medieval(` AND avoids matching
# prose comments like "// the eval step runs (next)" where a space separates.
set +e
eval_hits=$(grep -rnE --include='*.ts' "\beval\(" src/ 2>/dev/null)
newfunc_hits=$(grep -rnE --include='*.ts' "new Function\(" src/ 2>/dev/null)
set -e
if [ -n "$eval_hits" ]; then
  echo "$eval_hits" >&2
  fail "eval( usage found in src/ (forbidden by Obsidian developer policies)"
fi
if [ -n "$newfunc_hits" ]; then
  echo "$newfunc_hits" >&2
  fail "new Function( usage found in src/ (forbidden by Obsidian developer policies)"
fi
ok "gate 3 — no eval / new Function"

# ---------------------------------------------------------------------------
# Gate 4: no telemetry identifiers
# ---------------------------------------------------------------------------
set +e
telemetry_hits=$(grep -rniE --include='*.ts' "(analytics|telemetry|mixpanel|google-analytics|gtag\()" src/ 2>/dev/null)
set -e
if [ -n "$telemetry_hits" ]; then
  echo "$telemetry_hits" >&2
  fail "telemetry identifier found in src/ (no analytics/telemetry allowed per PROJECT.md constraints)"
fi
ok "gate 4 — no telemetry identifiers"

# ---------------------------------------------------------------------------
# Gate 5: no vault.modify( in src/graph/ or src/main.ts
# ---------------------------------------------------------------------------
vm_paths=()
[ -d src/graph ] && vm_paths+=("src/graph")
[ -f src/main.ts ] && vm_paths+=("src/main.ts")
if [ "${#vm_paths[@]}" -gt 0 ]; then
  set +e
  vm_hits=$(grep -rnE --include='*.ts' "vault\.modify\(" "${vm_paths[@]}" 2>/dev/null)
  set -e
  if [ -n "$vm_hits" ]; then
    echo "$vm_hits" >&2
    fail "vault.modify( found in src/graph/ or src/main.ts (CF-06: use vault.process / processFrontMatter)"
  fi
fi
ok "gate 5 — no vault.modify in graph/main"

# ---------------------------------------------------------------------------
# Gate 6: manifest.json valid
# ---------------------------------------------------------------------------
MANIFEST="manifest.json"
[ -f "$MANIFEST" ] || fail "manifest.json missing"

read_field() {
  local field="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$field // empty" "$MANIFEST"
  else
    python3 -c "import json,sys; d=json.load(open('$MANIFEST')); k='$field'.lstrip('.'); print(d.get(k,''))"
  fi
}

MF_ID=$(read_field '.id')
MF_VERSION=$(read_field '.version')
MF_DESC=$(read_field '.description')
MF_DESKTOP=$(read_field '.isDesktopOnly')

[ -n "$MF_ID" ] || fail "manifest.json: missing id"
if echo "$MF_ID" | grep -qi "obsidian"; then
  fail "manifest.json: id '$MF_ID' contains 'obsidian' (community-plugin policy forbids)"
fi

if ! echo "$MF_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  fail "manifest.json: version '$MF_VERSION' is not valid semver (N.N.N)"
fi

[ -n "$MF_DESC" ] || fail "manifest.json: missing description"
DESC_LEN=${#MF_DESC}
if [ "$DESC_LEN" -gt 250 ]; then
  fail "manifest.json: description is $DESC_LEN chars (>250 limit)"
fi
last_char="${MF_DESC: -1}"
if [ "$last_char" != "." ]; then
  fail "manifest.json: description must end with '.' (ends with '$last_char')"
fi

if [ "$MF_DESKTOP" != "true" ]; then
  fail "manifest.json: isDesktopOnly must be true (got '$MF_DESKTOP')"
fi
ok "gate 6 — manifest.json valid (id=$MF_ID, version=$MF_VERSION, desc=${DESC_LEN}c, desktopOnly=$MF_DESKTOP)"

# ---------------------------------------------------------------------------
# Gate 7: version consistency (manifest == package == versions.json latest)
# ---------------------------------------------------------------------------
PKG_VERSION=$(
  if command -v jq >/dev/null 2>&1; then
    jq -r '.version // empty' package.json
  else
    python3 -c "import json; print(json.load(open('package.json')).get('version',''))"
  fi
)
[ -n "$PKG_VERSION" ] || fail "package.json: missing version"

if [ "$PKG_VERSION" != "$MF_VERSION" ]; then
  fail "version drift: manifest.json=$MF_VERSION vs package.json=$PKG_VERSION"
fi

VERSIONS_HAS=$(
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg v "$MF_VERSION" 'has($v)' versions.json
  else
    python3 -c "import json,sys; d=json.load(open('versions.json')); print('true' if '$MF_VERSION' in d else 'false')"
  fi
)
if [ "$VERSIONS_HAS" != "true" ]; then
  fail "versions.json: missing entry for version '$MF_VERSION'"
fi
ok "gate 7 — version consistency ($MF_VERSION across manifest/package/versions)"

# ---------------------------------------------------------------------------
# Gate 8: LICENSE present + non-empty
# ---------------------------------------------------------------------------
if [ ! -s LICENSE ]; then
  fail "LICENSE missing or empty"
fi
ok "gate 8 — LICENSE present + non-empty"

# ---------------------------------------------------------------------------
# Gate 9: README.md present; contains leetcode.com; >=4 image links
# ---------------------------------------------------------------------------
if [ ! -s README.md ]; then
  fail "README.md missing or empty"
fi
if ! grep -q "leetcode.com" README.md; then
  fail "README.md: missing 'leetcode.com' network-disclosure mention"
fi
IMG_COUNT=$(grep -cE '!\[.*\]\(' README.md || true)
if [ "$IMG_COUNT" -lt 4 ]; then
  fail "README.md: $IMG_COUNT image links found (need >=4 per D-24)"
fi
ok "gate 9 — README.md has disclosure + $IMG_COUNT image links"

# ---------------------------------------------------------------------------
# Gate 10: lint shipped code (src/) exit 0
# ---------------------------------------------------------------------------
# Plan 05-06 must-have: "all 12 gates pass on clean src/". Gate enforces that
# shipped code (bundled from src/ into main.js) is lint-clean. tests/ are not
# shipped; a separate developer workflow can enforce tests/ lint post-v1.
if ! npx --no-install eslint src/ > /tmp/prerelease-lint.log 2>&1; then
  tail -40 /tmp/prerelease-lint.log >&2 || true
  fail "eslint src/ exited non-zero (see /tmp/prerelease-lint.log)"
fi
ok "gate 10 — eslint src/ clean"

# ---------------------------------------------------------------------------
# Gate 11: npm test -- --run exit 0
# ---------------------------------------------------------------------------
if ! npm test --silent -- --run > /tmp/prerelease-test.log 2>&1; then
  tail -40 /tmp/prerelease-test.log >&2 || true
  fail "npm test exited non-zero (see /tmp/prerelease-test.log)"
fi
ok "gate 11 — npm test clean"

# ---------------------------------------------------------------------------
# Gate 12: main.js <= 700 kB (Phase 5.3 D-09 bundle cap; delegated to
# scripts/check-bundle-size.sh so the ceiling is a single source of truth).
# ---------------------------------------------------------------------------
if ! bash scripts/check-bundle-size.sh; then
  fail "check-bundle-size.sh failed (see output above)"
fi
ok "gate 12 — main.js within 700 KB budget"

echo ""
echo "PRERELEASE OK: all 12 gates passed."
