---
created: 2026-05-17
source: phase 08.1 UAT (Test 3)
priority: minor-ux
target: v1.2
---

# Bedrock auth-mode switch — preserve-on-switch is undesired UX

## Symptom

In Settings → AI → AWS Bedrock, switching the Auth method dropdown silently retains
secrets entered under the previous mode. User flagged in Phase 08.1 UAT Test 3:
the locked behavior (Pitfall 10 — preserve to prevent silent secret loss) feels
counterintuitive.

## Current behavior (locked in Phase 08.1)

- `sanitizeBedrockProviderConfig` (`src/settings/SettingsStore.ts:393-400`) preserves
  all 4 secret fields verbatim regardless of `authMethod`.
- `SettingsTab.renderAIProviderForm` `case 'bedrock'` only changes which secret rows
  RENDER, never which fields are STORED.
- Designed to prevent the failure mode where a user accidentally toggles `authMethod`
  and loses entered keys without warning.

## Why locked for v1.1

Phase 08.1 CONTEXT.md decision B + Pitfall 10 mitigation explicitly chose preserve-
on-switch. Changing it now contradicts the locked decision. UAT Test 3 confirmed
the behavior matches spec; the UX concern is a v1.2 polish.

## Possible v1.2 directions (pick one or layer)

1. **Visual badge** — show an "Other modes have stored secrets (default-chain / sso-profile / api-key)"
   badge under the dropdown so users see what's preserved without exposing the values.
2. **Explicit "Clear" button** per mode — never auto-clear on switch, but give the user
   a 1-click way to drop the unused mode's secrets.
3. **Confirmation dialog** when switching modes if the destination mode has stored
   secrets — "Use stored keys for X, or clear and re-enter?"
4. **Status quo + better helper text** under the dropdown explaining the preserve
   behavior (cheapest fix; doesn't change the model).

Recommendation: option 1 (visual badge) is the cheapest path that addresses the
"what's stored that I can't see?" concern without breaking the safety invariant.

## Acceptance

- User can see at a glance whether other auth modes have secrets stored.
- No silent loss of entered secrets on mode switch.
- No new way to leak secrets via the disclosure modal or logs.

## Notes

- Logger redaction already covers all 4 secret fields regardless of auth mode
  (`src/shared/logger.ts:29,89` — Phase 08.1 Plan 02 Task 1 PHASE F).
- `data.json` storage is plain-text per AIPROV-02 (locked v1.0 D-13 / D-14 posture).
