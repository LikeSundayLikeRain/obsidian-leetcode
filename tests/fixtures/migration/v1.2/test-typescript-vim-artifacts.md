---
lc-slug: test-typescript-vim-artifacts
lc-title: Typescript Vim Artifacts
lc-difficulty: Medium
lc-language: typescript
---

## Problem

Body lines have trailing whitespace (vim-mode artifacts).

## Code

```typescript
function solve(): number {  
    return 1;  
}
```

## Notes

T-21-bytes stress: body trailing whitespace must round-trip byte-exact.
