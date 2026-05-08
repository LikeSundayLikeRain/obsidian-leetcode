#!/usr/bin/env bash
# scripts/grep-no-vault-modify.sh
# Fail if vault.modify() appears in files that own problem-note writes.
# Aligned with STATE.md "All vault writes via vault.process() + processFrontMatter() only"
# and CONTEXT.md D-22.
set -euo pipefail
matches=0
for d in src/notes/ src/browse/; do
  if [ -d "$d" ]; then
    if grep -rE "vault\.modify\s*\(" "$d" --include='*.ts'; then
      matches=1
    fi
  fi
done
if [ "$matches" -eq 1 ]; then
  echo "ERROR: vault.modify() is forbidden in src/notes/ and src/browse/ — use vault.process() instead."
  exit 1
fi
echo "OK: no vault.modify() calls in src/notes/ or src/browse/"
exit 0
