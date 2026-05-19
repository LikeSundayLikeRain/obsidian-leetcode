---
phase: 12-polish-plugin-store-resubmission
plan: 05
subsystem: release
tags: [version-bump, readme-audit, network-disclosure, release-prep]
dependency_graph:
  requires: [12-01, 12-02, 12-03, 12-04]
  provides: [v1.1.0 release artifacts]
  affects: [manifest.json, package.json, versions.json, README.md]
tech_stack:
  added: []
  patterns: [version-bump, network-disclosure-audit]
key_files:
  created: []
  modified:
    - manifest.json
    - package.json
    - versions.json
    - README.md
decisions:
  - "Cost expectations rewritten with per-feature breakdown (Debug, Review, KG classification, Contest Analysis) and per-AC estimate ($0.01-0.05)"
  - "Provider pricing page links added for Anthropic, OpenAI, OpenRouter, AWS Bedrock"
  - "Contest API operations documented under existing leetcode.com bullet (same domain, same session)"
metrics:
  duration: "3m 1s"
  completed: "2026-05-19"
  tasks: 2
  files: 4
---

# Phase 12 Plan 05: Version Bump + README Network/Cost Audit Summary

**One-liner:** Version bump to 1.1.0 with full README network/cost disclosure covering all v1.1 AI features and Contest API operations.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Version bump + README network/cost audit | 71766d4 | manifest.json, package.json, versions.json, README.md |
| 2 | Release validation checkpoint | auto-approved | (verification only) |

## Changes Made

### D-13: Version Bump
- `manifest.json` version: `1.0.1` -> `1.1.0` (minAppVersion unchanged at `1.10.0`)
- `package.json` version: `1.0.1` -> `1.1.0`
- `versions.json`: added `"1.1.0": "1.10.0"` entry

### D-14: README Network/Cost Audit
- Added "Contest API operations" to the leetcode.com bullet (contest list via graphql, contest ranking/detail via `/contest/`)
- Rewrote Cost expectations section with per-feature breakdown:
  - AI Debug (~1 streaming call per debug session)
  - AI Review (~1 call per accepted solution)
  - AI Knowledge Graph classification (~1 call per AC'd problem)
  - AI Contest Analysis (~1 call per completed contest)
- Added typical per-AC cost estimate: ~$0.01-0.05 depending on provider/model
- Added provider pricing page links (Anthropic, OpenAI, OpenRouter, AWS Bedrock)
- Verified all 6 AI base URLs present: api.anthropic.com, api.openai.com, openrouter.ai, localhost:11434, custom endpoint, bedrock-runtime.{region}.amazonaws.com

### D-15: Release Validation
- Bundle size: 1,210,791 bytes (~1.15 MB) - under 1.2 MB ceiling
- README network-use tests: 17/17 passing
- Build: clean (tsc + esbuild production)
- Lint: pre-existing Phase 10/11 errors only; no new errors from this plan

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| manifest.json version = 1.1.0 | PASS |
| manifest.json minAppVersion = 1.10.0 | PASS |
| package.json version = 1.1.0 | PASS |
| versions.json 1.1.0 -> 1.10.0 | PASS |
| README mentions bedrock-runtime | PASS |
| README mentions Contest API | PASS |
| README mentions all 5 AI providers + Bedrock | PASS |
| Cost expectations per-AC estimate | PASS |
| vitest readme-network-use (17 tests) | PASS |
| npm run build | PASS |
| Bundle size < 1.2 MB | PASS (1.15 MB) |

## Known Stubs

None.

## Self-Check: PASSED
