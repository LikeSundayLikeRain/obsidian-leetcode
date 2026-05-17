// src/ai/providers/bedrock.ts
//
// Phase 08.1 Plan 02 — AWS Bedrock provider adapter (mirrors anthropic.ts).
// Each provider exports four functions:
//   - createBedrockModel(cfg, fetcher) — SDK construction with auth-method dispatch
//   - probeBedrock(cfg, fetcher) — connectivity probe (1-token chat completion)
//   - streamBedrock(cfg, fetcher, prompt, signal) — Vercel AI SDK streamText
//   - invokeBedrockBuffered(cfg, fetcher, prompt, signal) — generateText
//
// All probe paths NEVER throw (mirrors LeetCodeClient.fetchUsername / probeAnthropic).
// Errors truncated to 200 chars via the shared `extractProviderError` helper
// (S5 shared pattern in 08.1-PATTERNS.md).
//
// Auth-method dispatch happens inside createBedrockModel — cfg.authMethod
// discriminant selects which constructor options are passed into
// createAmazonBedrock(). 'default-chain' and 'sso-profile' READ
// ~/.aws/credentials directly via resolveAwsCredentials (Pitfall 5 in
// 08.1-RESEARCH.md — @aws-sdk/credential-providers cannot bundle in esbuild).
//
// Bedrock CORS posture: AWS does NOT send Access-Control-Allow-Origin from
// `bedrock-runtime.{region}.amazonaws.com` (RESEARCH §Pitfall 1, Assumption
// A4). The new Plan 08.1-01 TIER 1 native fetch will fail with TypeError
// at first call, falling through to TIER 3 buffered (`requestUrl`) — that's
// the working state Phase 08 dogfood validated, accepted per CONTEXT
// decision A.
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { streamText, generateText } from 'ai';
import type { StreamTextResult } from 'ai';
import type { BedrockProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';
import { extractProviderError } from './index';
import { resolveAwsCredentials } from '../awsCredentials';

/**
 * Construct an AI-SDK Bedrock model from the user's `BedrockProviderConfig`.
 * Auth-method dispatch:
 *   - 'default-chain'  → resolveAwsCredentials({ source: 'env-or-default-profile' })
 *   - 'access-keys'    → opts.accessKeyId = cfg.accessKeyId; opts.secretAccessKey = cfg.secretAccessKey
 *   - 'sso-profile'    → resolveAwsCredentials({ source: 'profile', profile: cfg.ssoProfile })
 *   - 'api-key'        → opts.apiKey = cfg.bedrockApiKey (SDK falls back to AWS_BEARER_TOKEN_BEDROCK env)
 *
 * The `fetch` field is the caller-supplied FetchFn (TIER 1 native window.fetch
 * primary inserted by Plan 08.1-01, falling through to obsidianFetch tiers).
 * The AI SDK's `createAmazonBedrock` calls SigV4 internally via aws4fetch.
 */
export function createBedrockModel(cfg: BedrockProviderConfig, fetcher: FetchFn) {
  const opts: Parameters<typeof createAmazonBedrock>[0] = {
    region: cfg.region || 'us-east-1',
    fetch: fetcher,
  };
  switch (cfg.authMethod) {
    case 'default-chain': {
      Object.assign(opts, resolveAwsCredentials({ source: 'env-or-default-profile' }));
      break;
    }
    case 'access-keys': {
      opts.accessKeyId = cfg.accessKeyId;
      opts.secretAccessKey = cfg.secretAccessKey;
      break;
    }
    case 'sso-profile': {
      Object.assign(
        opts,
        resolveAwsCredentials({ source: 'profile', profile: cfg.ssoProfile ?? '' }),
      );
      break;
    }
    case 'api-key': {
      // SDK auto-falls-back to AWS_BEARER_TOKEN_BEDROCK env var when apiKey
      // is unset; passing the cfg field through covers both the
      // user-typed-into-Settings path and the env-var path.
      opts.apiKey = cfg.bedrockApiKey;
      break;
    }
  }
  const provider = createAmazonBedrock(opts);
  return provider(cfg.modelId || 'anthropic.claude-3-5-sonnet-20241022-v2:0');
}

/**
 * Connectivity probe — 1-token chat completion. NEVER throws (S5 shared
 * pattern). Mirrors `probeAnthropic` shape — Bedrock has no public model-list
 * endpoint, so probe is a 1-token chat completion (~$0.0001 / click,
 * comparable to Anthropic).
 */
export async function probeBedrock(
  cfg: BedrockProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  try {
    await generateText({
      model: createBedrockModel(cfg, fetcher),
      prompt: 'ping',
      maxOutputTokens: 1,
    });
    return { ok: true, modelCount: null };
  } catch (err) {
    return { ok: false, errorMessage: extractProviderError(err).slice(0, 200) };
  }
}

/**
 * Streaming live-call path. Synchronous return — `streamText` returns the
 * `StreamTextResult` immediately; the underlying HTTP fires when the consumer
 * iterates `result.textStream`. Caller owns the `AbortController` whose
 * signal forwards into the underlying fetch.
 *
 * NOTE: Bedrock CORS-rejects native fetch (RESEARCH §Pitfall 1). The
 * Plan 08.1-01 TIER 1 dispatch will throw a TypeError synchronously when
 * `resolveAdapter` constructs the SDK provider, falling through to TIER 2
 * (which itself fails on contextIsolation:true) and then TIER 3 buffered.
 * The buffered path uses `invokeBedrockBuffered` below.
 */
export function streamBedrock(
  cfg: BedrockProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): StreamTextResult<Record<string, never>, never> {
  return streamText({
    model: createBedrockModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
}

/**
 * Non-streaming buffered live-call path. Used by the TIER 3 fallback in
 * `AIClient.invokeStream` (Bedrock falls all the way to buffered per CONTEXT
 * decision A). Returns text + usage; cost-USD math happens at the AIClient
 * layer (Phase 09 pricing extension may revisit).
 */
export async function invokeBedrockBuffered(
  cfg: BedrockProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: createBedrockModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
  return {
    text: result.text,
    ...(result.usage
      ? { usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } }
      : {}),
  };
}
