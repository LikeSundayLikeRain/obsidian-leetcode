#!/usr/bin/env bash
# Phase 07 AIPROV-05 invariant: leetcode.com calls NEVER use obsidianFetch.
# Fails CI if any non-AI source file imports the AI fetch adapter.
set -e
if grep -rn "obsidianFetch" src/api/ src/auth/ src/browse/ src/notes/ src/solve/ src/graph/ src/preview/ 2>/dev/null; then
  echo "ERROR: obsidianFetch is for AI calls only — leetcode.com paths must use requestUrl."
  exit 1
fi
exit 0
