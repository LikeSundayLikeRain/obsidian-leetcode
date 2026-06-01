# Phase 16: Language Packs & Switching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 16-Language Packs & Switching
**Areas discussed:** Go & Rust language pack sourcing; Per-language indent unit & Tab character; Bracket auto-close approach; Compartment scope + switch plumbing

---

## Go & Rust language pack sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| lang-rust + legacy-modes Go | `@codemirror/lang-rust` (Lezer, full indent/highlight/match), `StreamLanguage.define(go)` from `@codemirror/legacy-modes`. ~50–80 KB total. | ✓ |
| legacy-modes for both Go and Rust | StreamLanguage for both. ~10–20 KB. Rust loses syntax-tree indent and bracket-match precision. | |
| lang-rust + plaintext Go | Rust full pack; Go plaintext fallback. Smallest Rust-aware add but Go visibly second-class. | |

**User's choice:** lang-rust + legacy-modes Go (Recommended)
**Notes:** Bundle ceiling already raised to ~1.5 MB in STATE.md; the ~50–80 KB add is within the accepted budget. No official `@codemirror/lang-go` exists, so legacy-modes is the only viable path for Go without going to a heavyweight WASM grammar.

---

## Per-language indent unit & Tab character

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-code per-language defaults | Static map: python3/java/cpp/c/rust = 4, js/ts = 2, go = real tab. No settings UI. | |
| Hard-code defaults + 1 global override | Same per-language defaults plus `indentSizeOverride: 'auto' \| 2 \| 4 \| 8` in settings. | ✓ |
| 4 spaces everywhere | Simplest; ignores conventions. JS/TS odd; Go violates gofmt. | |

**User's choice:** Hard-code defaults + 1 global override
**Notes:** Override applies to all languages **except** Go, which always uses tab regardless of the override (gofmt is non-negotiable). Default value `'auto'` means the per-language map applies as-is. The effective indent value is recomputed inside the language Compartment on every switch.

---

## Bracket auto-close approach

| Option | Description | Selected |
|--------|-------------|----------|
| Stock closeBrackets() + skip BRACKET-05 | Add `@codemirror/autocomplete` as direct dep; use stock `closeBrackets()` reading per-language `languageData`. Defer triple-backtick template literals (BRACKET-05). | ✓ |
| Stock closeBrackets() + custom triple-backtick handler | Same baseline plus a JS/TS-only keymap entry for ``` → ``` ```. Covers BRACKET-05 fully but adds 20 lines of custom code. | |
| Custom pair-insertion only | Skip closeBrackets entirely; build pair logic by hand. Maximum control, maximum maintenance. | |

**User's choice:** Stock closeBrackets() + skip BRACKET-05 for now (Recommended)
**Notes:** BRACKET-05 deferred — LC's test surface doesn't exercise template literals; re-evaluate in v1.3 if user-reported. REQUIREMENTS.md will be updated during planning to mark BRACKET-05 as Deferred. BRACKET-02 (markdown `*`/`_` suppression) is structurally satisfied because the child editor has no markdown LanguageSupport — but a regression test must verify the property.

---

## Compartment scope + switch plumbing

### Sub-question 1 — Compartment scope

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic bundle | LanguageSupport + indentUnit + commentTokens + closeBrackets — all in one Compartment, switched together. | ✓ |
| Just LanguageSupport | Smaller change but indent stays at 4 spaces, Cmd-/ has to derive comment syntax separately. | |
| Two compartments | Split: language vs. behavior. Two reconfigure calls; same end state. | |

**User's choice:** Atomic bundle (Recommended)
**Notes:** Matches success criteria 3 ("indent rules and comment syntax update immediately") and 4 (per-language Cmd-/ syntax). Single reconfigure dispatch; visibly instantaneous on chevron flip.

### Sub-question 2 — Switch plumbing

| Option | Description | Selected |
|--------|-------------|----------|
| P2 — Chevron handler dispatches into registry | Extend `switchFenceLanguage` in `src/main.ts` to look up child via registry and dispatch reconfigure effect on it. | ✓ |
| P1 — Child listens to parent's languageRefreshEffect via updateListener | Decoupled but more indirect; listener has to live in a shared place. | |
| P3 — New shared childLanguageRefreshEffect | Symmetric but adds a new effect type for one consumer. | |

**User's choice:** P2 — Chevron handler dispatches into registry (Recommended)
**Notes:** Mirrors how the parent's `languageRefreshEffect` is dispatched today — least new machinery. The reconfigure dispatch carries `userEvent: 'leetcode.lang-switch'` so the child-sync extension does NOT propagate it as a content change.

---

## Claude's Discretion

- Implementation file layout — language Compartment in `childEditorFactory.ts` vs. new `src/main/childEditorLanguage.ts`. Prefer separate file if the per-language extension builder grows past ~50 lines.
- Exact import path for legacy-modes Go (`@codemirror/legacy-modes/mode/go` vs main export) — whichever esbuild handles cleanly.
- Whether `closeBracketsKeymap` is included once at the top level or rebuilt with each Compartment reconfigure. Top-level recommended (keymap doesn't depend on language data).
- Test layout — fixture-driven table per requirement vs. per-language file. Aim for one parameterized test file per requirement.
- Bundle-size measurement — record a build comparison commit as a verification artifact (recommended) vs. note in verification report only.

---

## Deferred Ideas

- **BRACKET-05 (triple-backtick template literals)** — Not on LC's test surface; CM6 stock doesn't cover it. Re-mark in REQUIREMENTS.md as Deferred. Re-evaluate v1.3.
- **Theme-aware syntax highlighting** — Carried from Phase 15. Defer to Phase 17 polish; independent of language-pack work.
- **External `lc-language` frontmatter edit reactivity** — Out of scope v1.2; chevron is the documented entry point. Phase 17 candidate if user-visible.
- **Vim mode support** — Carried from Phase 15. Phase 17 polish.
- **Modular panel layout (LC-web-style)** — Carried from Phase 15. v1.3+ milestone.
