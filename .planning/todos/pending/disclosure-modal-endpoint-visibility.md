---
created: 2026-05-17
source: phase 08.1 UAT (Test 4)
priority: minor-ux
target: v1.2
---

# Disclosure modal — endpoint URL visibility is a design question

## Symptom

Phase 08.1 UAT Test 4: user confirmed the Bedrock region substitution function
works internally (`getDisplayBaseUrl(provider, cfg)` produces the correct
regional endpoint string), but flagged a UX concern:
- The endpoint URL did not appear visibly in the disclosure modal during the user's UAT.
- User is unsure whether the URL should be displayed at all.

This is a polish question, not a regression — Phase 07's disclosure posture
explicitly chose to surface the endpoint URL for transparency (so users see
exactly where their data is going).

## What ships in Phase 08.1

- `src/ai/displayBaseUrl.ts` — substitutes `cfg.region` into
  `https://bedrock-runtime.{region}.amazonaws.com` (Bedrock-specific).
- `src/ai/disclosure.ts:168` — modal renders
  `Active provider: ${prettyName(provider)} — ${getDisplayBaseUrl(provider, cfg)}`.

## Two interpretations of the symptom

1. **The line renders but is visually buried** in the modal layout (small text,
   off-screen on small windows, or styled in a way that doesn't catch the eye).
   → v1.2 fix: surface the endpoint more prominently OR add a "Network destination"
   subsection.
2. **The user wants the option to hide the URL** (less screen real estate for
   technical detail; show only the provider name).
   → v1.2 fix: collapse the URL behind a "show details" toggle, OR move it to a
   per-provider Settings preview rather than the per-call disclosure.

## Why locked for v1.1

Phase 07's disclosure design (CONTEXT decision D + the AI-disclosure flow)
locked endpoint-visibility as a transparency invariant. Changing it now would
contradict Phase 07's intent. Phase 08.1 only EXTENDED the existing flow with
Bedrock; it did not modify disclosure layout.

## Possible v1.2 directions (pick one or layer)

1. **Visual emphasis** — make the endpoint URL line stand out (monospace, badge
   styling, or a "Network destination:" label).
2. **Detail toggle** — `▶ Show technical details` collapses the URL by default;
   click to expand. Keeps transparency without dominating the modal.
3. **Audit log surface** — keep the URL out of the per-call modal; surface it
   in a separate "AI Network Activity" log or Settings preview that users can
   review on demand.
4. **Status quo + screenshot in the bug report** — confirm whether the URL
   actually rendered in the user's UAT before designing a fix.

Recommendation: option 4 first (gather evidence — was the line rendering?), then
option 1 or 2 if the issue is "rendering but buried" / "rendering and unwanted".

## Acceptance

- User can identify what URL their data goes to (transparency invariant
  preserved).
- Modal layout doesn't feel dominated by technical detail.
- No regression on the existing 4 providers' disclosure flow.

## Notes

- Substitution function `getDisplayBaseUrl` is unit-tested in
  `tests/ai/disclosure.bedrock.test.ts`.
- All 5 providers' base URLs flow through the same helper — any change here
  is multi-provider.
