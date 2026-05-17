---
title: Add AWS Bedrock as a first-class AI provider
captured: 2026-05-16
resolves_phase: 08.1
tags: [phase-08.1, ai, providers, bedrock, polish]
references:
  - .planning/phases/07-ai-provider-foundation/07-CONTEXT.md (provider list)
  - .planning/phases/07-ai-provider-foundation/07-RESEARCH.md (Vercel AI SDK provider matrix)
  - .planning/phases/08-ai-debug/08-02-SUMMARY.md (per-provider streamText/generateText pattern)
  - src/ai/types.ts (AIProvider union — needs widening)
  - src/ai/providers/anthropic.ts (closest analog for the new bedrock.ts adapter)
  - src/settings/SettingsTab.ts (renderAIProviderForm — needs new branch for Bedrock)
---

# Add AWS Bedrock as a first-class AI provider

Phase 07 scoped the provider matrix to Anthropic / OpenAI / OpenRouter / Ollama / Custom (OpenAI-compatible). User has access to Anthropic Claude only via AWS Bedrock (no direct anthropic.com key). Current workaround is to run a local OpenAI-compatible proxy in front of Bedrock (litellm or aws-samples/bedrock-access-gateway), which works but is friction every dev session.

## What Phase 08.1 should ship

Add Bedrock as a first-class provider, mirroring the existing 4-provider pattern.

### Code changes

1. **`src/ai/providers/bedrock.ts`** — new adapter, mirrors `anthropic.ts` shape:
   - `streamBedrock(cfg, fetcher, prompt, signal): StreamTextResult` — wraps `streamText({ model: bedrock(modelId), ... })`
   - `invokeBedrockBuffered(cfg, fetcher, prompt, signal): Promise<{text, usage?}>` — wraps `generateText`
   - `probeBedrock(cfg, fetcher): Promise<ProbeResult>` — single-token probe
   - Uses `@ai-sdk/amazon-bedrock@4.0.107` (already on npm; tested with `ai@6.x`)

2. **`src/ai/providers/index.ts`** — extend `resolveAdapter` exhaustive switch with `case 'bedrock': return { ... }`. Re-export the new helpers.

3. **`src/ai/types.ts`** — widen `AIProvider` union:
   ```typescript
   export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom' | 'bedrock';
   ```
   Add `prettyName` case: `case 'bedrock': return 'AWS Bedrock';`

4. **`src/settings/SettingsTab.ts`**:
   - Add dropdown option in the active-provider list: `.addOption('bedrock', 'AWS Bedrock')`
   - Add a `renderAIProviderForm` branch for `'bedrock'`:
     - **Region** (text input, default `us-east-1`)
     - **Model ID** (text input, e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0` or `us.anthropic.claude-haiku-4-5-...`)
     - **Auth method** (dropdown):
       - `default-credential-chain` — AWS SDK reads `~/.aws/credentials`, env vars, EC2 instance role, etc.
       - `access-key` — explicit access key + secret key fields (less recommended)
       - `sso-profile` — name a profile from `~/.aws/credentials` to use
     - **Test connection** button (delegates to shared probe path)
   - All copy LOCKED VERBATIM in a Phase 08.1 UI-SPEC update.

5. **`src/settings/settingsTypes.ts`** (or wherever `AIProviderConfig` lives) — extend `AIProviderConfigByProvider` with `bedrock: { region, modelId, authMethod, accessKeyId?, secretAccessKey?, ssoProfile? }`. Run schema-migration shape for existing data.json (defaults).

6. **`src/settings/settingsTab.tests.ts`** + **`tests/ai/providers/bedrock.test.ts`** — extend coverage.

7. **Bundle ceiling check** — `@ai-sdk/amazon-bedrock` adds ~50–80 KB. Re-run `npm run build && npm run check:bundle-size`. If we hit the 1.2 MB ceiling, this becomes another Rule 3 bump (mirrors Phase 07-03 + Phase 08-02 precedent), but expectation is we still have headroom (current measurement: 996 KB; 1.2 MB ceiling = 200 KB headroom).

8. **README.md** — update "Network use" disclosure to mention Bedrock and AWS endpoints.

### Auth model — open questions for the discuss-phase

- **Default credential chain (recommended):** Plugin reads no AWS keys — relies on the user having `aws sso login` run, or `AWS_ACCESS_KEY_ID` env vars set when launching Obsidian. Cleanest, no plugin storage of long-lived secrets. Works on macOS/Windows/Linux. Test: `aws sts get-caller-identity` from the Electron context returns the user.
- **Explicit access keys:** plugin stores `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` in `data.json` (already encrypted at rest the same way as the existing API keys are stored — i.e., not at all; same posture). Lower friction but worse security posture (long-lived keys in vault config).
- **SSO profile:** plugin stores a profile name (string), then at request time does `aws sts assume-role` or reads `~/.aws/credentials` for that profile. Best for corporate AWS users with SSO, but Electron's Node context needs to be able to invoke the AWS SDK credential resolver — confirmation needed during research.

### Bundle / packaging notes

- `@ai-sdk/amazon-bedrock` peer-depends on `@aws-sdk/client-bedrock-runtime`. The full AWS SDK is enormous (~500 KB+); confirm the AI SDK only pulls in `client-bedrock-runtime` (one client) and not the umbrella package. Bundle measurement during research is mandatory.
- esbuild has historically had issues tree-shaking the AWS SDK — research whether `@ai-sdk/amazon-bedrock` is bundle-friendly or whether we need to mark `@aws-sdk/*` as external (which would require Obsidian to provide them — it doesn't, so we'd need a different strategy: vendor only the bedrock-runtime shapes, use raw `requestUrl` HTTP calls against the Bedrock REST API, and bypass the AWS SDK entirely).

### Trigger / when to do this

- **NOT before Phase 08 ships.** Phase 08 must be UAT-validated against ANY provider first (the user will use a litellm/proxy workaround for Test 1 — live MarkdownRenderer flicker check — to avoid blocking Phase 08).
- **NOT bundled into Phase 09.** Phase 09 (AI ACed Review) already has a large surface (write to `## AI Review`, ledger cap enforcement). Mixing in a new provider widens review/security gates and dilutes focus.
- **Right slot:** Phase 08.1 — a small polish phase between Phase 08 completion and Phase 09 start. Estimated scope: ~250 LoC + 2 PR rounds. ~1–2 hours of research + planning, ~3 hours of execution.

## Notes

- This becomes the first user-visible provider with a credential model that can't be reduced to "paste API key here." Settings UI will be more complex than the existing 4 providers.
- AWS regions are an additional first-class config field — Anthropic/OpenAI/etc. have a single global endpoint; Bedrock needs region routing per request.
- Cross-region inference (the `us.anthropic.claude-...` model IDs) routes via the user's chosen region but accesses regional model availability — note this in the Model ID field's help text.
- Once Bedrock lands, Phase 09's AI Review and Phase 11's KG features inherit it for free (the `AIClient.invoke` / `invokeStream` seam is provider-agnostic; only adapter resolution changes).
