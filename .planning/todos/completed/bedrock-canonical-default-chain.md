---
created: 2026-05-17
source: phase 08.1 post-execution discussion
priority: gap-closure
target: phase 08.2
resolves_phase: 08.2
---

# Bedrock canonical default-chain + credential_process auto-refresh

## Why

Phase 08.1 shipped `awsCredentials.ts` (in-plugin INI parser) because
`@aws-sdk/credential-providers` does not bundle in the Obsidian renderer
(esbuild fails with 9 unresolved `node:*` imports — Phase 08.1 RESEARCH §Pitfall 5).
The hand-roll covers the smallest functional surface: env vars first, then
`~/.aws/credentials [default]` static keys.

That hand-roll DRIFTS from the canonical AWS chain in three concrete ways:
1. Hardcodes `[default]` — ignores `AWS_PROFILE` / `AWS_DEFAULT_PROFILE`.
2. Reads only `~/.aws/credentials` — never reads `~/.aws/config`.
3. Never honors `AWS_SHARED_CREDENTIALS_FILE` / `AWS_CONFIG_FILE` overrides.

A user with `export AWS_PROFILE=work` would expect the plugin to read `[work]` —
silently reading `[default]` is the everyday-user surprise this phase closes.

Additionally, modern AWS profile setups frequently use `credential_process` to
delegate credential resolution to an external helper (`aws-vault`, `awsume`,
corporate token brokers, `aws sso login` wrappers). These helpers issue
TEMPORARY credentials with an `Expiration` field, requiring auto-refresh.

## Canonical AWS resolution order (target parity)

1. **Env vars** — `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (+ optional `AWS_SESSION_TOKEN`)
2. **Profile resolution** — `AWS_PROFILE` env → `AWS_DEFAULT_PROFILE` env → literal `"default"`
3. **`~/.aws/credentials`** — overridable via `AWS_SHARED_CREDENTIALS_FILE`. Section syntax: bare `[<name>]`.
4. **`~/.aws/config`** — overridable via `AWS_CONFIG_FILE`. Section syntax: `[profile <name>]` (the `default` profile is the bare `[default]` exception).
5. **Profile resolution per section:**
   - `credential_process` directive present? → spawn command, parse v1 JSON, cache + refresh
   - static `aws_access_key_id` + `aws_secret_access_key`? → use directly
   - `source_profile` + `role_arn`? → assume-role chain (**OUT OF SCOPE** — see below)
   - `sso_session` block / `sso_start_url`? → SSO refresh (**OUT OF SCOPE**)

## What ships in 08.2

### Default-chain mode rewrites

- Honor `AWS_PROFILE` / `AWS_DEFAULT_PROFILE` (currently `[default]` is hardcoded).
- Honor `AWS_SHARED_CREDENTIALS_FILE` / `AWS_CONFIG_FILE` overrides.
- Read `~/.aws/config` for profile metadata: `region`, `credential_process`.
- Read `~/.aws/credentials` for static keys (existing path; preserved).
- Resolution merges config + credentials per profile, config wins on `region`,
  credentials wins on static keys (matches AWS CLI v2 behavior).

### `credential_process` runner

- `child_process.spawnSync` via the canonical `nodeRequire` shim
  (mirrors `src/auth/BrowserWindowLogin.ts:nodeRequire`,
  `src/ai/obsidianFetch.ts:loadElectronNet` — already-bundle-safe pattern).
- Parses AWS CLI v1 JSON stdout shape:
  ```json
  {
    "Version": 1,
    "AccessKeyId": "ASIA...",
    "SecretAccessKey": "...",
    "SessionToken": "...",
    "Expiration": "2026-05-17T15:30:00Z"
  }
  ```
- 30-second timeout for hung helper processes.
- In-memory cache keyed by profile name; refresh on `Expiration - 5 min` (matches
  AWS SDK's default skew).
- Cache invalidates on plugin reload (no on-disk persistence — credentials never touch
  `data.json`).
- Stdout NEVER logged (contains live creds). Stderr truncated to 200 chars.

### sso-profile mode (existing) — incidental cleanup

- Same canonical chain; sso-profile becomes a thin alias for "explicit profile name +
  default-chain semantics." User picks the profile, the chain resolves it the same way
  default-chain would with `AWS_PROFILE` set.

### Settings UI helper text

- Under "Default credential chain": "Plugin reads AWS credentials from environment
  variables, `AWS_PROFILE`, and `credential_process` helpers in `~/.aws/credentials` /
  `~/.aws/config`. Run `aws sso login` (or your usual helper) before launching Obsidian
  if your profile uses SSO."
- No new dropdowns or fields.

## Out of scope (explicitly v1.2 or later)

- **`role_arn` + `source_profile` (assume-role chains)** — requires `@aws-sdk/client-sts`
  (~150 KB bundle delta) to call `AssumeRole`. Doable but a separate decision.
- **Inline `sso_session` blocks** — would need `child_process.spawn` for `aws sso login`
  browser auth flow. Plugin can ASSUME the user has already run `aws sso login`
  externally; cannot orchestrate the login itself.
- **EC2 / ECS metadata service** — Obsidian renderer doesn't run on those infrastructures.
- **Container credential-helper IPC** — same.

## Bundle impact

- INI-parser expansion (config-file + override env vars + `[profile X]` syntax): +30 LoC
- `credential_process` runner + cache + refresh logic: +60 LoC
- Tests: +200 LoC
- **Bundle delta:** <1 KB minified (no new npm deps).

## Security posture

- `credential_process` runs arbitrary user-controlled commands from `~/.aws/config`.
  Trust boundary is "user controls their own AWS config" — same as the AWS CLI itself.
- Stdout (containing live credentials) is NEVER logged. Stderr is logged truncated to
  200 chars for diagnostics.
- 30-second timeout prevents hung helpers. Plugin shows a Notice on timeout.
- Logger redaction (`src/shared/logger.ts:29,89`) already covers `accessKeyId`,
  `secretAccessKey`, `sessionToken`, `aws_session_token` — extension may add `Expiration`
  if it ever appears in headers (unlikely; AWS API doesn't expose it on requests).
- No new sensitive fields stored in `data.json` — `credential_process` results live in
  memory only, evicted on plugin reload.

## Open questions for /gsd:discuss-phase 08.2

1. **Cache scope** — per-profile cache, or per-process? If user switches profiles in
  Settings, should the cache for the prior profile be evicted?
2. **Concurrent refresh** — if 5 calls to `getCachedOrRefresh(profile)` race past the
  skew window, do we issue 5 spawns, or coalesce on a single in-flight Promise?
  (Recommendation: coalesce — prevents `aws-vault` MFA prompt 5x.)
3. **Hard-fail vs soft-fail when `credential_process` returns malformed JSON** — should
  probe surface "credential_process returned malformed JSON" in the Notice, or fall
  through to env-var path? Spec says fall-through is wrong (silent surprise); recommend
  hard-fail with truncated stderr.
4. **AWS CLI v2 `Expiration` format edge cases** — JSON spec says ISO 8601, but some
  helpers emit `2026-05-17T15:30:00+00:00` vs `2026-05-17T15:30:00Z`. JS `new Date()`
  handles both; needs a unit test.
5. **Pitfall 10 invariant in this phase** — does adding `credential_process` change the
  preserve-on-mode-switch invariant from Phase 08.1? (Probably not — credential_process
  is a default-chain feature, not a separate auth mode.)

## Acceptance for the phase

- `export AWS_PROFILE=work` reads `[work]` not `[default]`.
- A profile with `credential_process = some-helper --json` calls the helper, caches
  results, refreshes on `Expiration - 5 min`.
- Static `[profile X]` access keys still work (no regression).
- `probeBedrock` continues to never throw; helper errors → `{ ok: false, errorMessage }`.
- Bundle <1 KB delta; under 1.2 MB ceiling.
- Settings UI helper text reflects expanded support.
- All Phase 08.1 tests stay green.
- New tests cover: AWS_PROFILE resolution, AWS_*_FILE override, [profile X] syntax,
  credential_process success path, credential_process timeout, credential_process
  malformed JSON, cache hit, cache refresh on expiration, concurrent refresh coalescing.

## Reference

Phase 08.1 SUMMARY: `.planning/phases/08.1-streaming-transport-fix-bedrock-provider/08.1-02-SUMMARY.md`
Phase 08.1 RESEARCH §Pitfall 5: `@aws-sdk/credential-providers` does NOT bundle.
Phase 08.1 RESEARCH §Pitfall 7: `~/.aws/credentials` filesystem access from Electron renderer.
SDK source `node_modules/@ai-sdk/amazon-bedrock/dist/index.mjs:2215-2281` — `createAmazonBedrock`
credential resolution waterfall: `apiKey` → `credentialProvider` → `accessKeyId/secretAccessKey`.
The `credentialProvider` extension point is what the plugin's resolver feeds into.
