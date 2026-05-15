# Phase 07: AI Provider Foundation — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 13 new + 4 modified
**Analogs found:** 11 / 13 with strong matches; 2 net-new (provider SDK wrappers, pricing constants)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/ai/AIClient.ts` (new) | facade | request-response (+ future stream) | `src/api/LeetCodeClient.ts` | exact (facade + injected adapter) |
| `src/ai/obsidianFetch.ts` (new) | adapter | request-response / streaming | `src/api/requestUrlFetcher.ts` | exact (Fetch-API ↔ requestUrl bridge) |
| `src/ai/types.ts` (new) | types | n/a | `src/auth/types.ts` + `src/browse/types.ts` | role-match (small, plain interfaces) |
| `src/ai/disclosure.ts` (new) | modal + shared copy const | one-shot acknowledgement | `src/auth/CookiePasteModal.ts` + `src/solve/VerdictModal.ts` | exact (Modal class precedent) |
| `src/ai/pricing.ts` (new) | constants table | pure lookup | (none — net new) | no analog |
| `src/ai/providers/anthropic.ts` (new) | SDK wrapper | request-response | (none — net new SDK pattern) | no analog (use RESEARCH §Pattern 3) |
| `src/ai/providers/openai.ts` (new) | SDK wrapper | request-response | (none — net new SDK pattern) | no analog (use RESEARCH §Pattern 3) |
| `src/ai/providers/openaiCompatible.ts` (new) | SDK wrapper | request-response | (none — net new SDK pattern) | no analog (use RESEARCH §Pattern 3) |
| `src/ai/providers/ollama.ts` (new) | SDK wrapper | request-response | (none — net new SDK pattern) | no analog (use RESEARCH §Pattern 3) |
| `src/ai/providers/index.ts` (new, optional barrel — `resolveAdapter`) | dispatch table | n/a | `src/api/LeetCodeClient.ts` (overload signature pattern) | partial |
| `src/settings/SettingsStore.ts` (modify — add fields + getters/setters) | store | CRUD (PluginData) | self (existing `previewClickBehavior` shape-guard) | exact (extend in place) |
| `src/settings/SettingsTab.ts` (modify — add AI section between Preview & Knowledge graph) | settings UI | event-driven (DOM) | self (`Preview` and `Knowledge graph` sections at `:184-236`) | exact (extend in place) |
| `src/main.ts` (modify — wire AIClient construction + 3 palette commands) | plugin lifecycle | event-driven | self (`onload` step pattern + `addCommand` block at `:255-405`) | exact (extend in place) |
| `src/shared/logger.ts` (modify — extend REDACT + SECRET_VALUE_PATTERN) | utility | redaction | self (existing patterns at `:12, :17`) | exact (extend in place) |
| `README.md` (modify — Network use enumeration + Cost expectations stub) | docs | n/a | self (existing `## Network usage` at `:64-68`) | exact (extend in place) |
| `tests/ai/*.test.ts` (~20 new files) | tests | unit | existing `tests/api/*` and `tests/settings/*` | role-match |
| `scripts/check-no-obsidianfetch-in-lc.sh` (new) | regression grep gate | n/a | (none — net new) | no analog |

---

## Pattern Assignments

### `src/ai/AIClient.ts` (facade, request-response)

**Analog:** `src/api/LeetCodeClient.ts`

**Imports pattern** (LeetCodeClient.ts:1-9 — header comment + minimal imports):

```typescript
// src/ai/AIClient.ts
// Thin facade over @ai-sdk/* providers. All AI HTTP flows through
// `obsidianFetch(mode)` injected at adapter construction. leetcode.com
// calls NEVER touch this module — they remain on
// installRequestUrlFetcher's path (CONTEXT canonical_refs invariant).
import type { SettingsStore } from '../settings/SettingsStore';
import type { AIProvider, ProviderConfig, AIRequest, AIResponse, ProbeResult } from './types';
import { obsidianFetch } from './obsidianFetch';
import { resolveAdapter } from './providers';
```

**Class shape — single facade with constructor-injected dependencies** (LeetCodeClient.ts:42-57):

```typescript
export class LeetCodeClient {
  public lc!: InstanceType<typeof LeetCode>;
  private settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.settings = settings;
    // construct an UNAUTHENTICATED baseline synchronously so the .lc field
    // is never undefined. If cookies exist, the caller MUST await
    // reauthenticate() to bind the credential.
    this.lc = new LeetCode();
  }
```

Mirror for AIClient: ctor takes `SettingsStore`, stores it, no eager network. Adapter resolution happens inside `probe()` / `invoke()` so the active provider lookup is always live (never stale).

**Public method signatures** — mirror LeetCodeClient's "method per use case" shape (`fetchUsername`, `getProblemDetail`):

```typescript
async probe(provider: AIProvider): Promise<ProbeResult> { ... }
async invoke(req: AIRequest): Promise<AIResponse> { ... }
async addCost(usd: number): Promise<void> { ... }
async clearActiveKey(): Promise<void> { ... }
```

**Error-handling discipline** (LeetCodeClient.ts:74-86 — never-throw display path; LeetCodeClient.ts:107-128 — re-throw for branch-able callers): Probe NEVER throws (returns `{ ok: false, errorMessage }`). Invoke RE-THROWS so feature-layer callers in Phase 08/09 can branch on disclosure-cancel vs network error vs cost-cap exceeded. Document the divergence in JSDoc the same way LeetCodeClient.ts:107-128 does.

---

### `src/ai/obsidianFetch.ts` (adapter, request-response / streaming)

**Analog:** `src/api/requestUrlFetcher.ts`

**Imports pattern** (requestUrlFetcher.ts:16):

```typescript
// src/ai/obsidianFetch.ts
// Single HTTP seam for ALL AI provider calls. mode='stream' →
// electron.net.fetch; mode='request' → requestUrl bridge. INVARIANT:
// leetcode.com NEVER goes through this function — see scripts/check-no-
// obsidianfetch-in-lc.sh grep gate.
import { requestUrl } from 'obsidian';
```

**The bridge core — requestUrl ↔ Fetch-API Response** (requestUrlFetcher.ts:50-80 — verbatim shape to copy):

```typescript
const shim = async (input: unknown, init?: FetchInit): Promise<Response> => {
  await throttle.acquire();
  try {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const res = await requestUrl({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers,
      body: init?.body,
      throw: false, // IMPORTANT: let the library see 4xx/5xx for error parsing.
    });
    // ... 429 branch ...
    return new Response(res.text, {
      status: res.status,
      statusText: '',
      headers: res.headers as HeadersInit,
    });
  } finally {
    throttle.release();
  }
};
```

**Phase 07 deviations from this shape:**
- **No throttle** — AI providers each have their own rate budgets; per CONTEXT `<deferred>` rate-limit awareness is Phase 08 territory. Drop the `throttle.acquire()` / `release()` pair.
- **No 429 special-casing** — the AI SDK normalizes provider 4xx/5xx via its own error class; let it through (per RESEARCH Pitfall 4).
- **Add stream branch** — when `mode === 'stream'`, return a Fetch-API function that calls `electron.net.fetch` directly (RESEARCH §Pattern 2 + Code Examples Example 1).
- **`credentials: 'omit'` mandatory** — RESEARCH Security threat #6: prevents `electron.net.fetch` from carrying default-session cookies (e.g. leetcode.com cookies) to AI hosts. Add this to every fetch call in BOTH branches.

**Factory pattern** (RESEARCH §Pattern 2 + obsidianFetch closure shape):

```typescript
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function obsidianFetch(mode: 'stream' | 'request'): FetchFn {
  if (mode === 'stream') { /* electron.net.fetch branch */ }
  return /* requestUrl bridge — closure over the captured mode */;
}
```

The "factory returning a closure" shape mirrors the way `installRequestUrlFetcher()` returns nothing but mutates module state — but for AI adapters we want a per-call factory return so the AI SDK's `fetch:` option is fed a fresh, mode-locked function each time `AIClient.invoke()` runs.

---

### `src/ai/types.ts` (types — small plain interfaces)

**Analog:** `src/auth/types.ts` + `src/browse/types.ts`

**Imports pattern** — none required (pure type declarations).

**Shape pattern** (auth/types.ts:1-4 — minimal no-runtime export):

```typescript
export interface AuthCookies {
  LEETCODE_SESSION: string;
  csrftoken: string;
}
```

**For Phase 07** (combine the simple-interface posture of auth/types.ts with the union-literal posture of `IndexedProblem.diff` at browse/types.ts:6):

```typescript
// src/ai/types.ts
export type AIProvider =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  disclosureAcknowledged: boolean;
}

export interface AIRequest { /* prompt, stream?, etc — Phase 08 expands */ }
export interface AIResponse { /* text, usage, ... — Phase 08 expands */ }

export interface ProbeResult {
  ok: boolean;
  modelCount?: number | null; // null when provider has no list endpoint (Anthropic)
  errorMessage?: string;       // truncated to 200 chars (CONTEXT decision E)
}

export interface AICostLedger {
  date: string;     // 'YYYY-MM-DD' local
  usdToday: number;
}
```

Naming convention: PascalCase for interfaces; lower-case-string union for the provider enum (matches LC's `'Easy' | 'Medium' | 'Hard'` precedent in browse/types.ts:6).

---

### `src/ai/disclosure.ts` (modal + shared copy const)

**Analog:** `src/auth/CookiePasteModal.ts` (header copy + Setting-based body) + `src/solve/VerdictModal.ts` (rich onOpen + onClose with cleanup)

**Imports pattern** (CookiePasteModal.ts:10):

```typescript
// src/ai/disclosure.ts
import { App, Modal, Notice, Setting } from 'obsidian';
import type { AIProvider, ProviderConfig } from './types';
```

**Shared copy constant — exported for Phase 08/09/11 to extend** (RESEARCH §Pattern 4 + Open Question 8):

```typescript
/** SHARED — Phase 08/09/11 each append a feature-specific bullet to
 *  `willSend` via the constant. Phase 07 ships only the foundation list. */
export const DISCLOSURE_BASE_COPY = {
  willSend: [ /* 4 bullets verbatim from 07-UI-SPEC */ ],
  neverSends: [ /* 4 bullets verbatim from 07-UI-SPEC */ ],
};
```

**Modal class shape** (CookiePasteModal.ts:13-86 — constructor takes `App` + callback, `onOpen` builds DOM via `createEl`/`Setting`, `onClose` empties content):

```typescript
export class AIDisclosureModal extends Modal {
  constructor(
    app: App,
    private provider: AIProvider,
    private cfg: ProviderConfig,
    private onContinue: () => void,
    private onCancel: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-ai-disclosure');
    titleEl.setText(`Heads up: this will send data to ${prettyName(this.provider)}`);
    contentEl.createEl('p', { text: `Active provider: ${prettyName(this.provider)} — ${this.cfg.baseUrl}` });
    // ...createEl('ul') with .createEl('li', { text: ... }) per 07-UI-SPEC
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => { this.onCancel(); this.close(); }))
      .addButton((b) => b.setButtonText('I understand — continue').setCta().onClick(() => { this.onContinue(); this.close(); }));
  }

  onClose(): void { this.contentEl.empty(); }
}
```

**Critical UI contract** (07-UI-SPEC):
- `setCta()` is invoked ONCE for the Continue button. **Grep gate:** the only new `setCta()` invocation in Phase 07 lives in this file. Pre-existing `SettingsTab.ts:86` Log-in CTA is preserved untouched.
- Cancel button stays neutral — NO `setCta()`, NO destructive modifier.
- Esc / overlay-click / X-close ALL behave as Cancel — wire `onClose` to call `onCancel` if not yet acknowledged (mirror `VerdictModal.ts:49-63` "if isPending then onCancel" pattern).
- `addClass(contentEl, 'leetcode-ai-disclosure')` for CSS scoping (mirrors `VerdictModal.ts:71` `addClass(contentEl, 'leetcode-verdict')`).
- DOM built exclusively via `createEl()` / `Setting` — NEVER `innerHTML` (RESEARCH Anti-pattern + project lint).

**Cancel-as-default-on-close pattern** (VerdictModal.ts:49-63 — adapt):

```typescript
private acknowledged = false;
onClose(): void {
  // Esc / overlay click / X without explicit Continue = Cancel semantics.
  if (!this.acknowledged) {
    try { this.onCancel(); } catch { /* ignore */ }
  }
  this.contentEl.empty();
}
```

---

### `src/ai/providers/{anthropic,openai,openaiCompatible,ollama}.ts` (SDK wrappers)

**Analog:** None in current codebase — Phase 07 introduces the AI-SDK adapter pattern.

**Source for the pattern:** RESEARCH §"Architecture Patterns" §Pattern 3 + §"Code Examples" Example 1 + Example 2.

**Per-file uniform shape:**

```typescript
// src/ai/providers/anthropic.ts
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';

export function createAnthropicModel(cfg: ProviderConfig, fetcher: FetchFn) {
  const provider = createAnthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    fetch: fetcher,           // ← obsidianFetch('request' | 'stream')
  });
  return provider(cfg.model || 'claude-haiku-4-5');
}

export async function probeAnthropic(cfg: ProviderConfig, fetcher: FetchFn): Promise<ProbeResult> {
  // Anthropic has NO public models endpoint — 1-token chat is the only probe.
  // ... see RESEARCH §Code Examples Example for the generateText({ maxOutputTokens: 1 }) shape
}
```

**Cross-file rules:**

1. Each file exports exactly two functions: `create{Provider}Model(cfg, fetcher)` and `probe{Provider}(cfg, fetcher)`.
2. The fetcher is **passed in**, never imported — keeps the file SDK-only.
3. `apiKey` defaults: empty for Anthropic/OpenAI/OpenRouter (force user to fill); placeholder `'ollama'` allowed for Ollama (per CONTEXT decision A).
4. `baseURL` resolution: if `cfg.baseUrl` is empty, fall through to the SDK's built-in default. The settings layer pre-fills these (CONTEXT decision C).
5. **No try/catch in `create*Model`** — the SDK constructors are synchronous and don't throw.
6. **All error normalization happens in `probe*`** via the shared `extractFromJson(body)` helper (RESEARCH §Open Question 5).

**The `resolveAdapter(provider, cfg, fetcher)` dispatch** (in `src/ai/providers/index.ts` — barrel + dispatch):

```typescript
export function resolveAdapter(provider: AIProvider, cfg: ProviderConfig, fetcher: FetchFn) {
  switch (provider) {
    case 'anthropic': return { invoke: ..., probe: () => probeAnthropic(cfg, fetcher) };
    case 'openai':    return { invoke: ..., probe: () => probeOpenAI(cfg, fetcher) };
    case 'openrouter':return { invoke: ..., probe: () => probeOpenRouter(cfg, fetcher) };
    case 'ollama':    return { invoke: ..., probe: () => probeOllama(cfg, fetcher) };
    case 'custom':    return { invoke: ..., probe: () => probeCustom(cfg, fetcher) };
  }
}
```

The `switch` exhaustiveness pattern is borrowed from `LeetCodeClient.ts:159-181` `isSessionExpired` overload-dispatch — same discipline of "one branch per known case, no default fall-through".

---

### `src/ai/pricing.ts` (constants table — pure lookup)

**Analog:** None — net-new file. Closest precedent is `LANGUAGE_OPTIONS` at `src/settings/SettingsTab.ts:20-40` (a `Record<string, string>` exported constant).

**Shape pattern** (SettingsTab.ts:20-40 — exported `const` Record + comment block citing source):

```typescript
// src/ai/pricing.ts
// HARDCODED — vendor pricing pages at planning time. README documents
// that these may rot. Phase 09 polishes. Ollama always returns 0.0.
//
// Sources verified 2026-05-15: (see RESEARCH §Code Examples Example 3)

export interface ModelRate { input: number; output: number; }

export const PRICING: Record<string, ModelRate> = {
  'claude-haiku-4-5':            { input: 1e-6, output: 5e-6 },
  'gpt-5-mini':                  { input: 0.25e-6, output: 2e-6 },
  'anthropic/claude-haiku-4.5':  { input: 1e-6, output: 5e-6 },
  'llama3.2':                    { input: 0, output: 0 },
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  return rate.input * usage.inputTokens + rate.output * usage.outputTokens;
}
```

Same comment-header discipline as `SettingsTab.ts:14-19`: cite sources, document the rot caveat, document the safe-default (return 0 for unknown models).

---

### `src/settings/SettingsStore.ts` (modify — add `activeAIProvider`, `providerConfigs`, `aiCostLedger`)

**Analog:** Self — extend the existing `previewClickBehavior` posture (CONTEXT.md decision C — "AI keys must follow the same locked-schema posture as `previewClickBehavior`").

**PluginData extension** (mirror SettingsStore.ts:88-95 `previewClickBehavior` insertion):

```typescript
export interface PluginData {
  // ... existing fields preserved ...
  /** Phase 07 AIPROV-01 — active AI provider; null = not configured. */
  activeAIProvider: AIProvider | null;
  /** Phase 07 AIPROV-01 — per-provider config map (preserves keys when
   *  switching providers). Shape-guard collapses missing/malformed entries
   *  to per-provider defaults. */
  providerConfigs: Record<AIProvider, ProviderConfig>;
  /** Phase 07 decision F — daily cost ledger (scaffold only; no UI). */
  aiCostLedger: AICostLedger;
}
```

**Defaults extension** (mirror DEFAULT_DATA at SettingsStore.ts:117-132):

```typescript
const DEFAULT_PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  anthropic:   { apiKey: '', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5',          disclosureAcknowledged: false },
  openai:      { apiKey: '', baseUrl: 'https://api.openai.com/v1',     model: 'gpt-5-mini',                disclosureAcknowledged: false },
  openrouter:  { apiKey: '', baseUrl: 'https://openrouter.ai/api/v1',  model: 'anthropic/claude-haiku-4.5',disclosureAcknowledged: false },
  ollama:      { apiKey: '', baseUrl: 'http://localhost:11434/v1',     model: 'llama3.2',                  disclosureAcknowledged: false },
  custom:      { apiKey: '', baseUrl: '',                              model: '',                          disclosureAcknowledged: false },
};

const DEFAULT_DATA: PluginData = {
  // ... existing ...
  activeAIProvider: null,
  providerConfigs: DEFAULT_PROVIDER_CONFIGS,
  aiCostLedger: { date: new Date().toISOString().slice(0, 10), usdToday: 0 },
};
```

**Shape-guard pattern — copy from `previewClickBehavior` (SettingsTab.ts:341-342) + `isValidAuthCookies` (SettingsStore.ts:139-143):**

```typescript
function isValidProviderId(v: unknown): v is AIProvider {
  return v === 'anthropic' || v === 'openai' || v === 'openrouter'
      || v === 'ollama' || v === 'custom';
}

function sanitizeProviderConfig(raw: unknown, defaults: ProviderConfig): ProviderConfig {
  if (!raw || typeof raw !== 'object') return defaults;
  const r = raw as Partial<ProviderConfig>;
  return {
    apiKey:   typeof r.apiKey === 'string' ? r.apiKey : '',
    baseUrl:  (typeof r.baseUrl === 'string' && /^https?:\/\//.test(r.baseUrl))
      ? r.baseUrl
      : defaults.baseUrl,
    model:    typeof r.model === 'string' ? r.model : defaults.model,
    disclosureAcknowledged: r.disclosureAcknowledged === true,  // strict-true (mirrors legacyBaseNoticeShown at SettingsStore.ts:320)
  };
}

function sanitizeAICostLedger(raw: unknown): AICostLedger {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw || typeof raw !== 'object') return { date: today, usdToday: 0 };
  const r = raw as Partial<AICostLedger>;
  const date  = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today;
  const usd   = typeof r.usdToday === 'number' && Number.isFinite(r.usdToday) && r.usdToday >= 0 ? r.usdToday : 0;
  return { date, usdToday: usd };
}
```

**Load-time application** (mirror SettingsStore.ts:306-343 — extend the `data: PluginData = { ... }` literal):

```typescript
activeAIProvider: isValidProviderId(raw.activeAIProvider) ? raw.activeAIProvider : null,
providerConfigs: {
  anthropic:  sanitizeProviderConfig((raw.providerConfigs as Record<string, unknown> | undefined)?.anthropic,  DEFAULT_PROVIDER_CONFIGS.anthropic),
  openai:     sanitizeProviderConfig((raw.providerConfigs as Record<string, unknown> | undefined)?.openai,     DEFAULT_PROVIDER_CONFIGS.openai),
  openrouter: sanitizeProviderConfig((raw.providerConfigs as Record<string, unknown> | undefined)?.openrouter, DEFAULT_PROVIDER_CONFIGS.openrouter),
  ollama:     sanitizeProviderConfig((raw.providerConfigs as Record<string, unknown> | undefined)?.ollama,     DEFAULT_PROVIDER_CONFIGS.ollama),
  custom:     sanitizeProviderConfig((raw.providerConfigs as Record<string, unknown> | undefined)?.custom,     DEFAULT_PROVIDER_CONFIGS.custom),
},
aiCostLedger: sanitizeAICostLedger(raw.aiCostLedger),
```

**Getter/setter pattern** (mirror SettingsStore.ts:368-435 — every field gets a `get*` + `set*` pair):

```typescript
getActiveAIProvider(): AIProvider | null { return this.data.activeAIProvider; }
async setActiveAIProvider(p: AIProvider | null): Promise<void> {
  this.data.activeAIProvider = p;
  await this.persist();
}

getProviderConfig(p: AIProvider): ProviderConfig {
  return this.data.providerConfigs[p];
}
async setProviderConfig(p: AIProvider, cfg: ProviderConfig): Promise<void> {
  this.data.providerConfigs[p] = cfg;
  await this.persist();
}

getAICostLedger(): AICostLedger { return this.data.aiCostLedger; }
/** Day-rollover-on-read + add. Phase 07 decision F. No cap enforcement here. */
async addCostLedger(usd: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (this.data.aiCostLedger.date !== today) {
    this.data.aiCostLedger = { date: today, usdToday: 0 };
  }
  this.data.aiCostLedger.usdToday += usd;
  await this.persist();
}
```

**Critical posture** (CONTEXT line 226): every new field MUST ship a shape-guard with a safe-default fallback. Match the strictness of `previewClickBehavior: raw.previewClickBehavior === 'open' ? 'open' : 'preview'` at line 342 — anything that isn't literally a known shape collapses to a safe default.

---

### `src/settings/SettingsTab.ts` (modify — insert AI section between Preview and Knowledge graph)

**Analog:** Self — `Preview` heading at `:184-196` (single-row + dropdown shape) and `Knowledge graph` at `:205-236` (multi-field shape).

**Insertion point:** After line 196 (end of Preview block), before line 198 (Knowledge graph comment). No reorder of existing sections.

**Section heading pattern** (SettingsTab.ts:184 — verbatim shape):

```typescript
new Setting(containerEl).setName('AI').setHeading();
```

**Active-provider dropdown — mirrors Preview click-behavior dropdown** (SettingsTab.ts:186-196):

```typescript
new Setting(containerEl)
  .setName('Active AI provider')
  .setDesc("Pick the provider for AI features. Switching providers preserves keys you've already entered for other providers.")
  .addDropdown((d) => d
    .addOption('',           '— Not configured —')   // null sentinel; convert in onChange
    .addOption('anthropic',  'Anthropic')
    .addOption('openai',     'OpenAI')
    .addOption('openrouter', 'OpenRouter')
    .addOption('ollama',     'Ollama')
    .addOption('custom',     'Custom (OpenAI-compatible)')
    .setValue(this.plugin.settings.getActiveAIProvider() ?? '')
    .onChange(async (v) => {
      const next = v === '' ? null : (v as AIProvider);
      await this.plugin.settings.setActiveAIProvider(next);
      this.display(); // re-render to swap sub-form
    }),
  );
```

**Note** (07-UI-SPEC §"Layout" — read-only base URL): for Anthropic / OpenAI / OpenRouter, render the base URL as `setDesc()` text (read-only), not an `addText()` input. This matches the inferred pattern in `07-UI-SPEC.md:402` ("recommended to render as plain `<code>` text in `setDesc()` for Anthropic/OpenAI/OpenRouter").

**Masked API-key input — mirrors LEETCODE_SESSION pattern** (SettingsTab.ts:106-112 — verbatim shape):

```typescript
new Setting(containerEl)
  .setName('API key')
  .setDesc(`Stored in plain text in data.json on this machine. Never transmitted anywhere except ${prettyName(active)}.`)
  .addText((t) => {
    t.inputEl.type = 'password';
    t.inputEl.addClass('lc-cookie-input');  // reuse existing CSS rule (07-UI-SPEC §Spacing)
    t.setValue(cfg.apiKey)
     .onChange(async (v) => {
       await this.plugin.settings.setProviderConfig(active, { ...cfg, apiKey: v });
     });
  });
```

**Test-connection button — mirrors `Save cookies` neutral button** (SettingsTab.ts:123-144):

```typescript
new Setting(containerEl)
  .addButton((b) => b
    .setButtonText('Test connection')
    // INTENTIONALLY no setCta() — accent reserved for the disclosure modal
    // Continue button only (Phase 07 grep gate).
    .onClick(async () => {
      const provider = this.plugin.settings.getActiveAIProvider();
      if (!provider) { new Notice('Pick an AI provider first.', 3000); return; }
      // ... (Plan 07.04 wires the actual probe call + in-flight debounce per UI-SPEC)
    }),
  );
```

**Color invariant — Phase 1 D-09 grep gate preserved** (SettingsTab.ts:6-9 header comment): exactly one `setCta()` invocation in this file (Login button at `:86`). **The new AI section adds ZERO `setCta()` calls.** The single new-phase `setCta()` lives in `src/ai/disclosure.ts` (Continue button).

**Sub-form gating logic** — when `activeAIProvider === null`, render only the dropdown row; for `'ollama'` omit the API key field; for `'custom'` make the base URL editable. Document the per-provider matrix inline (mirrors the per-language matrix comment at SettingsTab.ts:14-19).

---

### `src/main.ts` (modify — wire AIClient construction + 3 palette commands)

**Analog:** Self — `onload` step block at `:152-310` and `addCommand` call sites at `:255, 279, 296, 336, 354, 373, 391`.

**AIClient construction insertion point** (after Step 5/5.7/5.8 wiring, before Step 6a `registerView`):

```typescript
// Step 5.9 — Phase 07 AI client. Constructed AFTER SettingsStore.load (settings
// are required by AIClient ctor) and BEFORE registerView (so any future
// view that wants AIClient access can grab it from `this.aiClient`).
this.aiClient = new AIClient(this.settings);
```

Field declaration goes alongside the existing `this.client`, `this.auth`, `this.list`, `this.notes`, `this.knowledgeGraph` fields at the top of the class. No `await` needed (ctor is synchronous, no eager network — mirrors LeetCodeClient.ts:46-57).

**addCommand pattern — clean ID, sentence-case name, no plugin-id, no "command" word, no hotkey** (main.ts:255-259 — verbatim shape for the simplest case):

```typescript
this.addCommand({
  id: 'open-problem-browser',
  name: 'Open problem browser',
  callback: () => { void this.activateBrowser(); },
});
```

**Phase 07 commands — mirror this exact shape:**

```typescript
// Plan 07.06 — clear active provider's API key.
this.addCommand({
  id: 'clear-ai-key',
  name: 'Clear AI key',
  callback: () => { void this.clearActiveAIKey(); },
});

// Plan 07.04 — test connection from the palette (mirrors the Settings
// button — both call AIClient.probe(active) with disclosure gate).
this.addCommand({
  id: 'test-ai-connection',
  name: 'Test AI connection',
  callback: () => { void this.testActiveAIConnection(); },
});

// Plan 07.05 — clear all per-provider disclosure flags so the modal
// re-fires on the next AI call. QA escape hatch + paranoia control.
this.addCommand({
  id: 'reset-ai-disclosures',
  name: 'Reset AI provider disclosures',
  callback: () => { void this.resetAIDisclosures(); },
});
```

**Linter rules** (main.ts:264-268 + 297-302 inline comments — same checklist applies to all three):
- ID does NOT contain `'obsidian'`, `'leetcode'`, or `'command'` (passes `obsidianmd/commands/no-plugin-id-in-command-id` + `no-command-in-command-id`).
- Name is sentence-case and does NOT start with the plugin name (Obsidian's command palette adds the prefix).
- NO `hotkeys` field (passes `obsidianmd/commands/no-default-hotkeys`).
- Use `callback` not `editorCheckCallback` — these three are global commands, not editor-scoped (unlike `submit` / `reset-code` / `view-past-submissions` which require `lc-slug` frontmatter).

**Plugin-method delegation** (mirrors how `open-problem-browser` delegates to `this.activateBrowser()` and `submit` delegates to `this.submitFromActive()`): the command body is a one-liner that delegates to a private async method on the plugin class. Keeps `addCommand` blocks readable and the command logic unit-testable.

---

### `src/shared/logger.ts` (modify — extend REDACT + SECRET_VALUE_PATTERN)

**Analog:** Self — existing `REDACT` regex at `:12` and `SECRET_VALUE_PATTERN` at `:17`.

**Existing patterns** (verbatim from logger.ts:12, :17):

```typescript
const REDACT = /session|csrf|cookie|token/i;
const SECRET_VALUE_PATTERN = /\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization)\s*[=:]\s*[^\s;,"'&}\]]+/gi;
```

**Phase 07 extensions** (CONTEXT line 232 + RESEARCH Pitfall 5 — both patterns must cover AI key field names):

```typescript
// Phase 07 AIPROV-02 — extend object-key redaction to cover AI provider
// keys. apiKey covers ProviderConfig.apiKey under any provider name;
// bearer covers Authorization Bearer header values.
const REDACT = /session|csrf|cookie|token|apikey|api_key|bearer/i;

// Phase 07 — extend value-level redaction to cover Authorization headers
// and x-api-key (Anthropic) values that may appear in error stack traces
// or AI SDK request/response logs.
const SECRET_VALUE_PATTERN = /\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization|apikey|api_key|api-key|x-api-key|bearer)\s*[=:]\s*[^\s;,"'&}\]]+/gi;
```

**Test extension** (CONTEXT line 1129): extend existing `tests/shared/logger-redact.test.ts` with cases for:
1. `{ apiKey: 'sk-ant-xyz' }` → `[REDACTED]`
2. `Authorization: Bearer sk-xyz` value-level redaction
3. `{ providerConfigs: { anthropic: { apiKey: 'sk-…' } } }` nested-object redaction (depth-3 walk per logger.ts:23-27)

**Posture note** (logger.ts:1-11 header — re-read on every modification): every level routes through `console.warn` / `console.error` / `console.debug`. Do NOT add new console methods.

---

### `README.md` (modify — Network use enumeration + Cost expectations stub)

**Analog:** Self — existing `## Network usage` section at `:64-68`.

**Current state** (README.md:64-68 — verbatim):

```markdown
## Network usage

This plugin communicates with leetcode.com to fetch problems and submit solutions. No other network endpoints are contacted.

Authentication is handled via an embedded Obsidian `BrowserWindow` that captures your LC session cookie after you sign in. The cookie is stored only in `.obsidian/plugins/leetcode/data.json` on your local machine, is never transmitted anywhere except leetcode.com, and is never logged.
```

**Phase 07 extension** (AIPROV-07 — enumerate every endpoint):

```markdown
## Network usage

This plugin communicates with the following hosts:

- `leetcode.com` — fetch problems, submit solutions, poll verdicts. **All LeetCode traffic** uses Obsidian's built-in `requestUrl`; no other code path touches `leetcode.com`.
- AI provider hosts — only when you have configured an active AI provider in Settings → AI. The plugin contacts at most ONE of these per AI call, depending on your `Active AI provider` selection:
  - `https://api.anthropic.com` — when `Active AI provider = Anthropic`
  - `https://api.openai.com` — when `Active AI provider = OpenAI`
  - `https://openrouter.ai` — when `Active AI provider = OpenRouter`
  - your local Ollama host (default `http://localhost:11434`) — when `Active AI provider = Ollama`
  - your custom OpenAI-compatible endpoint URL — when `Active AI provider = Custom`

No telemetry. No analytics. No other endpoints.

### Authentication

LeetCode authentication is handled via an embedded Obsidian `BrowserWindow` that captures your LC session cookie after you sign in. The cookie is stored only in `.obsidian/plugins/leetcode/data.json` on your local machine, is never transmitted anywhere except `leetcode.com`, and is never logged.

AI provider API keys are stored in plain text in `.obsidian/plugins/leetcode/data.json` on your local machine. Keys are never logged (the plugin's logger redacts every known key field name; see `src/shared/logger.ts`). Keys are transmitted only to the configured provider's endpoint.

### Cost expectations

AI features incur per-call cost charged by your selected provider. Phase 07 introduces no AI feature you can invoke yet (Debug ships in Phase 08, Review in Phase 09, KG classification in Phase 11). The "Test connection" action sends a metadata-only `GET /v1/models` (or `GET /api/tags` for Ollama) for OpenAI / OpenRouter / Custom / Ollama — these are free. For Anthropic, "Test connection" sends a 1-token chat completion (~$0.0001 per click).

Per-feature daily cost cap UI ships in Phase 09. Default model identifiers may rot — when "Test connection" reports `model not found`, update the `Model` field manually. See your provider's pricing page for current rates.
```

**Header pattern** — keep `## Network usage` as the section heading (matches `:64`); add subsection `### Authentication` and `### Cost expectations`. The existing single-paragraph version at `:66-68` is fully replaced with the enumeration table.

**Plugin-store review note** (RESEARCH §Don't Hand-Roll line 656): "Plugin store reviewers compare README claims against grep of source — keep the table accurate-by-hand." A test (`tests/ai/readme-network-use.test.ts`) greps the README for each base URL string at CI time.

---

### Tests — `tests/ai/*.test.ts` (~20 new files)

**Analog:** Existing `tests/api/*.test.ts` and `tests/settings/*.test.ts`.

**Pattern** — vitest unit tests, one behavior per file, mock SDK + fetch via `vi.doMock`. Per CONTEXT plan_hints + RESEARCH §"Phase Requirements → Test Map":

```typescript
// tests/ai/probe-openai.test.ts (representative)
import { vi, expect, test } from 'vitest';
import { probeOpenAI } from '../../src/ai/providers/openai';

test('probeOpenAI sends GET /v1/models with Bearer auth', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: [{ id: 'gpt-5-mini' }] }), { status: 200 })
  );
  const res = await probeOpenAI(
    { apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', disclosureAcknowledged: true },
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.openai.com/v1/models',
    expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer sk-test' } }),
  );
  expect(res).toEqual({ ok: true, modelCount: 1 });
});
```

**Shared fixtures** — new file `tests/ai/helpers/mockProvider.ts` collects SDK + fetch mocks. Pattern mirrors `tests/api/helpers/` if present; otherwise establish it now.

---

### `scripts/check-no-obsidianfetch-in-lc.sh` (regression grep gate)

**Analog:** Existing `scripts/grep-no-vault-modify.sh`-style gates (per RESEARCH §Validation Architecture line 1156).

**Shape** (one-line shell guard):

```bash
#!/usr/bin/env bash
# Phase 07 AIPROV-05 invariant: leetcode.com calls NEVER use obsidianFetch.
# Fails CI if any non-AI source file imports the AI fetch adapter.
set -e
if grep -rn "obsidianFetch" src/api/ src/auth/ src/browse/ src/notes/ src/solve/ src/graph/ src/preview/ 2>/dev/null; then
  echo "ERROR: obsidianFetch is for AI calls only — leetcode.com paths must use requestUrl."
  exit 1
fi
exit 0
```

Wire into `package.json` `scripts.lint` chain so it runs in the existing CI pipeline.

---

## Shared Patterns

### Authentication / Disclosure Gate

**Source:** `src/ai/disclosure.ts` (new, per Plan 07.05)
**Apply to:** Every AIClient public method that issues an HTTP call to a provider host (`probe`, `invoke`).

```typescript
// In AIClient.probe() and .invoke()
async probe(provider: AIProvider): Promise<ProbeResult> {
  const cfg = this.settings.getProviderConfig(provider);
  if (!cfg.disclosureAcknowledged) {
    const ack = await this.requireDisclosure(provider, cfg);
    if (!ack) return { ok: false, errorMessage: 'AI call cancelled' };
  }
  // ... real probe
}
```

The disclosure gate fires **before any HTTP request to the provider's domain** (RESEARCH Pitfall 6 — Test connection IS an AI call subject to disclosure).

---

### Error Handling

**Source for never-throw display path:** `src/api/LeetCodeClient.ts:74-86` (`fetchUsername` — returns null, swallows).
**Source for re-throw branch-able path:** `src/api/LeetCodeClient.ts:107-128` (`getProblemDetail` — re-throws so caller can branch).
**Apply to:** `probe()` follows fetchUsername (never throws — returns `{ ok: false, errorMessage }`). `invoke()` follows getProblemDetail (re-throws — Phase 08 callers branch on disclosure-cancel vs network vs cap).

**Provider-error extraction** (RESEARCH §Open Question 5 — universal best-effort):

```typescript
function extractFromJson(body: string): string {
  try {
    const j = JSON.parse(body);
    return j?.error?.message ?? j?.error ?? j?.message ?? body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}
function extractProviderError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}
```

All vendor errors **truncated at 200 chars total** (CONTEXT decision E + 07-UI-SPEC).

---

### Validation / Shape-Guards

**Source:** `src/settings/SettingsStore.ts:139-293` — every PluginData field has a shape-guard with safe-default fallback.
**Apply to:** Every new AI-related PluginData field (`activeAIProvider`, `providerConfigs`, `aiCostLedger`).

**Posture** (CONTEXT line 226): "anything not-literally-the-known-string falls through to default" — match the strictness of `previewClickBehavior: raw.previewClickBehavior === 'open' ? 'open' : 'preview'` (SettingsStore.ts:342).

---

### Logging / Redaction

**Source:** `src/shared/logger.ts:12, :17` — REDACT regex + SECRET_VALUE_PATTERN.
**Apply to:** Every provider adapter that logs request/response/error context. Logger MUST be extended (per Plan 07.01) BEFORE any provider adapter logs anything. CONTEXT line 232: "non-negotiable for the same posture as the LC cookie."

---

### Modal Construction

**Source:** `src/auth/CookiePasteModal.ts:13-86` (small Modal class with constructor callback) + `src/solve/VerdictModal.ts:34-97` (rich onOpen + Esc-as-cancel onClose).
**Apply to:** `AIDisclosureModal` (the only modal in Phase 07).

**Discipline:**
1. `extends Modal` from `obsidian`.
2. Constructor takes `App` + state + callbacks.
3. `onOpen()` builds DOM via `createEl()` / `Setting` — NEVER `innerHTML`.
4. `onClose()` empties `contentEl` AND fires `onCancel` if not yet acknowledged.
5. `addClass(contentEl, 'leetcode-…')` for CSS scoping.
6. `setCta()` invoked at most once (only Continue button — grep gate at code review).

---

### Palette Command Discipline

**Source:** `src/main.ts:255-259, :279-294, :296-316` — clean-ID pattern from Phase 06 FOUND-03.
**Apply to:** All three new commands (`clear-ai-key`, `test-ai-connection`, `reset-ai-disclosures`).

**Lint rules** (RESEARCH §"Code Examples" + main.ts:264-268 inline comments):
- ID has no `obsidian`, no plugin-id `leetcode`, no `command` substring.
- Name is sentence-case, does NOT start with plugin name.
- No `hotkeys` field.
- Delegate to plugin-instance method (one-liner body).

---

### Plugin Lifecycle / onload Wiring

**Source:** `src/main.ts:152-310` `onload()`.
**Apply to:** AIClient construction (after `SettingsStore.load`, after `LeetCodeClient` construction, before `registerView`).

**Insertion order** (numbered to match existing comments at main.ts:153, :156, :161, :172, :175, :178, :187, :225, :231):

```
Step 1: SettingsStore.load
Step 2: installRequestUrlFetcher          ← LC-only; AIClient does NOT touch this
Step 3: LeetCodeClient construction
Step 4: AuthService
Step 5: ProblemListService
Step 5.5: NoteWriter
Step 5.7: SubmissionHistoryStore + KnowledgeGraphWriter
Step 5.8: EphemeralTabStore
Step 5.9: AIClient                         ← NEW — Phase 07 insertion
Step 6a: registerView
...
```

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason | Reference |
|------|------|-----------|--------|-----------|
| `src/ai/providers/anthropic.ts` | SDK wrapper | request-response | Net-new pattern; no @ai-sdk/* usage exists in v1.0 | RESEARCH §Pattern 3 + Code Examples Example 2 |
| `src/ai/providers/openai.ts` | SDK wrapper | request-response | Same | RESEARCH §Pattern 3 + Example 2 |
| `src/ai/providers/openaiCompatible.ts` | SDK wrapper | request-response | Same | RESEARCH §Pattern 3 + Example 2 |
| `src/ai/providers/ollama.ts` | SDK wrapper | request-response | Same | RESEARCH §Pattern 3 + Example 2 (ollama probe) |
| `src/ai/pricing.ts` | constants table | pure lookup | Net-new — but shape mirrors `LANGUAGE_OPTIONS` | RESEARCH §Code Examples Example 3 |
| `scripts/check-no-obsidianfetch-in-lc.sh` | regression grep gate | n/a | First grep-style script in this project | RESEARCH §Regression Test Spec line 1154 |

---

## Metadata

**Analog search scope:** `src/api/`, `src/settings/`, `src/shared/`, `src/auth/`, `src/solve/`, `src/main.ts`, `README.md`
**Files scanned:** 8 source files + README + tests structure (via Glob/Grep + targeted Read)
**Pattern extraction date:** 2026-05-15

**Key cross-cutting patterns identified:**
1. **Facade + injected adapter** — every external integration in this codebase (LC, AI) uses constructor-injection of the HTTP adapter, never imports the adapter at module scope.
2. **Shape-guards on every PluginData field** — locked-schema posture ("anything malformed collapses to safe default") applies uniformly; 5 new fields in Phase 07 add 5 new shape-guards.
3. **Single setCta grep gate** — `var(--interactive-accent)` is reserved per phase; Phase 07 adds exactly one (`disclosure.ts` Continue button).
4. **Clean command IDs** — Phase 06 FOUND-03 made this a project-wide rule; all 3 new Phase 07 commands follow it.
5. **Logger redaction must precede any provider logging** — Phase 07 Plan 07.01 ships logger extension BEFORE any provider adapter logs anything; non-negotiable.
6. **README network claims are audited at CI time** — README "Network use" section is the source of truth that plugin-store reviewers compare against grep of source.
7. **No `innerHTML` ever** — every modal/UI body uses `createEl()` / `Setting`; enforced by `eslint-plugin-obsidianmd@^0.3.0`.
8. **`obsidianFetch` is for AI ONLY** — the AIPROV-05 invariant is enforced both by a runtime test (mock-spy on `obsidianFetch`) and a CI grep gate (`scripts/check-no-obsidianfetch-in-lc.sh`).
