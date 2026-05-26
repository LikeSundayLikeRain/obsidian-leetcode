## Build Under Test

Commit: 94f7a0e (v1.2 ship gate — Phase 18 plans 01/02/03 + review fixes + tab dedup)
Date: 2026-05-26
Branch: gsd/v1.2-code-editor-experience

## Bundle Size

| Metric | Value |
|--------|-------|
| Raw `main.js` | 1,716,872 bytes |
| Gzipped `main.js` | 462,012 bytes |
| Hard ceiling (D-19) | 1,800,000 bytes |
| Headroom | 83,128 bytes (4.8%) |

## Phase 18 Delta

| Build | Size (raw) |
|-------|-----------|
| Pre-Phase 18 (commit 95e421c) | 1,710,225 bytes |
| Post-Phase 18 (commit 94f7a0e) | 1,716,872 bytes |
| **Delta** | **+6,647 bytes** |

Phase 18 additions:
- `createVimIsolationExtension` ViewPlugin (Insert-mode Scope isolation + Esc capture + mode class toggle): ~3 KB
- `createRelativeLineNumberGutter` + `RelativeLineNumberMarker`: ~1.5 KB
- `registerVaultModifyRepairTrigger` (vault.on listener + gates): ~1.5 KB
- `nestedEditorRebuildEffect` StateEffect + file-open repair hook: ~0.5 KB
- CSS cursor layer rules: ~0.2 KB

## Hard-Gate Verdict

**PASS** — 1,716,872 < 1,800,000 bytes. Phase 18 added +6,647 bytes raw (+0.39%), well within the 1.8 MB ceiling established in CONTEXT D-19. The bundle raised from the 1,707,327 bytes post-vim-package (Phase 17 D-19 measurement) to the current figure primarily from the vim isolation ViewPlugin and relative line number gutter.

## Build Command

```
npm run build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

Exit code: 0 (clean, no type errors).

## Test Suite

1,722 tests pass / 6 skipped. Zero failures.
