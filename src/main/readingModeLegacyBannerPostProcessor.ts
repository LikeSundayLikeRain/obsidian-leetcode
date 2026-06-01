// PHASE_22_DELETE_WITH_V1_2_PATH — this module is part of the v1.2 → v1.3 migration scaffolding and must be deleted mechanically when Phase 22 retires the v1.2 read path.
//
// Phase 21 Plan 21-10 — Reading-mode legacy-banner discovery post-processor.
//
// Closes UAT Gap 3 (21-HUMAN-UAT.md Test 4a, severity=major). The existing
// `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` at
// `src/main.ts:~1060` is tag-bound: it only fires for fences whose tag IS
// LITERALLY ` ```leetcode-solve `. v1.2-shaped notes carrying ` ```java `,
// ` ```python `, etc. are rendered by Obsidian's default markdown processor
// and therefore never reach `leetCodeBlockProcessor` — making
// `mountLegacyFenceBanner('manual-prompt')` structurally unreachable in
// Reading mode when `autoMigrateOnOpen=OFF`.
//
// This module fills that gap by registering a NON-tag-bound
// `registerMarkdownPostProcessor` that walks the rendered DOM, gates on the
// parent note's frontmatter + plugin settings + `isMigrationCandidate`,
// locates the rendered code-block element under `## Code` whose `language-`
// class corresponds to a recognized LC `langSlug`, and replaces it with the
// `mountLegacyFenceBanner(host, source, file, plugin, 'manual-prompt')` UX.
//
// PHASE 22 RETIREMENT: this module is v1.2-only scaffolding. The header
// comment above contains the literal token `PHASE_22_DELETE_WITH_V1_2_PATH`
// so a Phase 22 cleanup script can grep for it and mechanically delete this
// file along with its wiring in src/main.ts.
//
// Section-context detection strategy:
//   - Preferred: `ctx.getSectionInfo(element)?.text` + `lineStart`. Walk the
//     section text upward from `lineStart` to find the nearest preceding
//     `## ` heading; render banner iff that heading text matches
//     `/^\s*##\s+Code\s*$/`.
//   - Fallback (when getSectionInfo returns null — common in embed contexts):
//     Render banner only when `element` contains EXACTLY ONE matched
//     langSlug code block. The single-fence case is the dominant common
//     case for v1.2 LC notes (the note's only `code-block-recognized` fence
//     under ## Code), and `isMigrationCandidate` already gated on the full
//     note text containing a valid v1.2 fence under ## Code, so the
//     fallback is sound.
//
// Source extraction: `code.textContent ?? ''` (byte-equality with the fence
// body for downstream banner mount).
//
// Async-safety: the post-processor callback is async (vault.cachedRead is
// async). Obsidian's post-processor contract supports async callbacks; the
// rendered DOM commit is delayed until the promise resolves. The whole body
// is wrapped in try/catch — on any throw, log at debug and leave the
// rendered DOM untouched (Pattern S-05 silent-on-failure).
//
// No new write paths in this module. The only DOM mutation is
// `pre.replaceWith(host)`, after which `mountLegacyFenceBanner` appends its
// children to `host`. The banner's [Migrate now] click handler delegates to
// the canonical `migrateLegacyFenceIfNeeded` migrator — same write path as
// Plan 21-01.

import type {
  App,
  MarkdownPostProcessorContext,
  Plugin,
  TFile,
} from 'obsidian';
import { TFile as TFileRuntime } from 'obsidian';
import { isMigrationCandidate } from '../widget/fenceMigrator';
import { mountLegacyFenceBanner } from '../widget/legacyFenceBanner';
import { LC_LANG_SLUGS, resolveLangSlug } from '../solve/languages';
import { logger } from '../shared/logger';

const SLUG_SENTINEL = '__sentinel__';
const H2_CODE_RE = /^\s*##\s+Code\s*$/;
const H2_ANY_RE = /^\s*##\s+\S/;
const LANGUAGE_CLASS_RE = /^language-([A-Za-z0-9_+#-]+)$/;

interface BannerHost {
  app: App & {
    vault: App['vault'] & {
      getAbstractFileByPath(path: string): unknown;
      cachedRead(file: TFile): Promise<string>;
    };
  };
  settings: {
    getUseInlineWidget(): boolean;
    getAutoMigrateOnOpen(): boolean;
    getDefaultLanguage(): string;
  };
}

/**
 * Register a Reading-mode markdown post-processor that surfaces the
 * legacy-fence migration banner on v1.2-shaped LC notes when
 * `useInlineWidget=ON` AND `autoMigrateOnOpen=OFF`.
 *
 * No-op for: non-LC notes, v1.3 already-migrated notes, notes whose first
 * fence under ## Code is unrecognized (e.g. ```text), notes with
 * `useInlineWidget=OFF` (master gate honored), notes with
 * `autoMigrateOnOpen=ON` (auto path takes precedence — D-trigger-01).
 */
export function registerLegacyBannerPostProcessor(
  plugin: Plugin & BannerHost,
): void {
  plugin.registerMarkdownPostProcessor(async (element, ctx) => {
    try {
      await processBlock(plugin, element, ctx);
    } catch (err) {
      // Pattern S-05 silent-on-failure. Reading mode renders the legacy
      // <pre><code> as Obsidian's default — no banner, no crash.
      logger.debug(
        'migration.readingModeLegacyBannerPostProcessor: non-fatal failure',
        err,
      );
    }
  });
}

/** Inner pipeline. Wrapped in try/catch by the registered handler. */
async function processBlock(
  plugin: Plugin & BannerHost,
  element: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  // Step 1 — resolve TFile via getAbstractFileByPath. Bail (no-op) if not
  // a TFile (e.g. broken path, missing file, or returned TFolder).
  const fileLike = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(fileLike instanceof TFileRuntime)) return;
  const file: TFile = fileLike;

  // Step 2 — read frontmatter; bail if lc-slug missing/empty.
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const lcSlug = fm?.['lc-slug'];
  if (typeof lcSlug !== 'string' || lcSlug.length === 0) return;

  // Step 3 — master gate.
  if (plugin.settings.getUseInlineWidget() !== true) return;

  // Step 4 — mode gate. autoMigrateOnOpen=ON → auto-path owns the migration;
  // banner does NOT shadow it.
  if (plugin.settings.getAutoMigrateOnOpen() === true) return;

  // Step 5 — read full note text. cachedRead is the safe Reading-mode-context
  // primitive (does NOT trigger metadata refresh; mirrors codeBlockProcessor.ts
  // pattern).
  const text = await plugin.app.vault.cachedRead(file);

  // Step 6 — predicate gate. isMigrationCandidate enforces the 5-clause
  // strict-match contract (D-edge-01).
  if (!isMigrationCandidate(text, fm)) return;

  // Step 7 — locate target <pre><code> under the rendered DOM. We collect
  // ALL `<pre><code>` children of `element` that have a `language-{slug}`
  // class whose slug resolves to a recognized LC langSlug. Take the FIRST
  // match.
  const candidates: Array<{ pre: HTMLElement; code: HTMLElement; slug: string }> = [];
  const codeNodes = element.querySelectorAll('pre > code');
  for (const codeNode of Array.from(codeNodes)) {
    const slug = extractLangSlug(codeNode as HTMLElement);
    if (slug === null) continue;
    const resolved = resolveLangSlug(slug, SLUG_SENTINEL);
    if (resolved === SLUG_SENTINEL) continue;
    if (!LC_LANG_SLUGS.has(resolved)) continue;
    const preNode = (codeNode as HTMLElement).parentElement;
    if (!preNode || preNode.tagName !== 'PRE') continue;
    candidates.push({
      pre: preNode,
      code: codeNode as HTMLElement,
      slug: resolved,
    });
  }
  if (candidates.length === 0) return;

  // Step 8 — verify the matched code block is logically inside ## Code.
  // Preferred path: ctx.getSectionInfo gives us the source-line span of the
  // section that produced THIS rendered element; walk lines upward from
  // `lineStart` to find the nearest preceding `## ` heading. When the
  // heading text is "Code", the block is in scope. When the nearest
  // heading is anything else (## Notes, ## Problem, etc.), the block is a
  // user-authored example — out of scope.
  //
  // Fallback: when getSectionInfo returns null (embed contexts, certain
  // detached-render paths), render the banner only when `element` contains
  // EXACTLY ONE matched candidate. The single-fence case is the dominant
  // common case and isMigrationCandidate already verified that the note
  // contains a valid v1.2 fence under ## Code at the source level.
  const info = ctx.getSectionInfo(element);
  let target = candidates[0]!;
  if (info) {
    if (!isUnderCodeHeading(info.text, info.lineStart)) return;
  } else {
    // Fallback: require exactly one candidate.
    if (candidates.length !== 1) return;
  }

  // Step 9 — extract source byte-equally; build host wrapper; replace pre
  // with host; mount banner. mountLegacyFenceBanner is a sibling concern
  // (Plan 21-02 Task 2) — DO NOT inline its DOM construction here.
  const source = target.code.textContent ?? '';
  // Use the rendered element's ownerDocument so popout-window contexts
  // (Obsidian's "Open in new window") get the correct Document. The
  // ownerDocument lookup is guaranteed correct in popout windows because
  // it's pulled from the rendered DOM node Obsidian gave us, which itself
  // lives in the popout-window's document tree.
  const ownerDoc = target.pre.ownerDocument;
  const host = ownerDoc.createElement('div');
  host.classList.add('leetcode-migration-banner-host');
  target.pre.replaceWith(host);
  mountLegacyFenceBanner(host, source, file, plugin as never, 'manual-prompt');
}

/** Read `code.className` and return the first `language-{slug}` slug, or
 *  null when none present. */
function extractLangSlug(code: HTMLElement): string | null {
  const cls = code.className ?? '';
  const tokens = cls.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const m = LANGUAGE_CLASS_RE.exec(tok);
    if (m && m[1]) return m[1].toLowerCase();
  }
  return null;
}

/** Walk lines upward from `lineStart` looking for the nearest preceding
 *  `## ` heading; return true iff that heading is exactly `## Code`. */
function isUnderCodeHeading(sectionText: string, lineStart: number): boolean {
  const lines = sectionText.split(/\r?\n/);
  const start = Math.min(lineStart, lines.length - 1);
  for (let i = start; i >= 0; i--) {
    const line = lines[i] ?? '';
    if (H2_CODE_RE.test(line)) return true;
    if (H2_ANY_RE.test(line)) return false;
  }
  return false;
}
