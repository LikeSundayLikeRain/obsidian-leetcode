// src/graph/KnowledgeGraphWriter.ts
//
// Phase 4 Plan 03 — on-Accepted knowledge-graph writer. Single entry point:
// KnowledgeGraphWriter.onAccepted(ctx, terminal). Invoked from main.ts's
// submitFromActive command lambda after classifyStatus confirms AC
// (D-08 + D-23 gate; CF-18 single source of truth).
//
// Pipeline (D-09 "one atomic-per-concern pass"):
//   1. Frontmatter write — fileManager.processFrontMatter. Flips lc-status
//      to 'accepted', writes lc-solved-date + lc-language, union-merges
//      lc/{topic-slug} tags. Always fires on AC.
//      (GRAPH-02, D-10, D-11; Phase 5.3 D-01/D-02 narrowed the on-AC
//      frontmatter surface — runtime/memory display reads fresh from LC
//      GraphQL.)
//   2. ## Techniques body write — vault.process driven by the
//      mergeTechniquesSection pure transform (Plan 04-02). Gated by
//      autoBacklinksEnabled (D-20) AND topicTags-present (Pitfall 10).
//   3. Stub technique-note loop — createStubIfMissing per topicTag.
//      Gated same as step 2. Silent per-stub failures (D-19) so step 2's
//      ## Techniques block stays durable.
//
// Gating matrix:
//   terminal.status_code !== 10 (AC)       → entire pipeline short-circuits
//   detail.topicTags undefined/empty       → step 1 fires lc/{slug} tags if
//                                            topicSlugs present; steps 2+3
//                                            skip (no names to build links
//                                            from; Pitfall 10 keeps writer
//                                            safe against pre-Phase-4 caches)
//   settings.getAutoBacklinksEnabled()
//     === false                            → step 1 fires; steps 2+3 skip
//                                            (D-20: tags are lightweight
//                                            graph fuel, user's opt-out is
//                                            about folder clutter)
//   detail absent from cache               → only step 1 fires with the
//                                            solve-time fields + an empty
//                                            tag contribution (can happen
//                                            if note was opened pre-Phase-2
//                                            D-14 cache population)
//
// Structural DI — accepts `{ app, settings }`. Tests pass in the
// fakeKnowledgeGraphDeps shape; production wiring in main.ts passes the
// real `App` + `SettingsStore`. The settings facade needs exactly these
// methods:
//   getProblemDetail(slug) → DetailCacheEntry | null
//   getAutoBacklinksEnabled() → boolean
//   getTechniquesFolder() → string
//
// Forbidden inside this module (CF-06):
//   - vault.modify — grep gate enforces. We use vault.process for body,
//     fileManager.processFrontMatter for frontmatter, vault.create for
//     new stubs (via StubNoteCreator).
//   - New Notice() — on-AC write is invisible-by-design (CF-19). Errors are
//     logged at debug level; VerdictModal already surfaces 'Accepted'.

import type { App, TFile } from 'obsidian';
import { classifyStatus } from '../solve/statusMap';
import { applySolveTimeFrontmatter } from '../notes/NoteTemplate';
import { mergeTechniquesSection } from './mergeTechniquesSection';
import { ensureTechniquesFolder, createStubIfMissing } from './StubNoteCreator';
import { buildTechniqueStubBody, buildTechniqueFilename } from '../notes/NoteTemplate';
import { extractFirstFencedBlock } from '../solve/codeExtractor';
import { logger } from '../shared/logger';
import type { SubmitCheckResponse } from '../solve/types';
import type { DetailCacheEntry } from '../settings/SettingsStore';
import type { PatternClusterEngine } from './PatternClusterEngine';
import type { ClusterHubWriter } from './ClusterHubWriter';

/** The Phase-3 submission context fragments the writer needs. Intentionally
 *  minimal — the writer doesn't pull in ProblemContext's full shape so tests
 *  can stand up a plain object literal with just `file`, `slug`, `title`. */
export interface KnowledgeGraphContext {
  file: TFile;
  slug: string;
  title: string;
}

/** Structural settings facade (matches FakeKnowledgeGraphSettings in the test
 *  mocks + SettingsStore in production). */
export interface KnowledgeGraphSettings {
  getProblemDetail(slug: string): DetailCacheEntry | null;
  getAutoBacklinksEnabled(): boolean;
  getTechniquesFolder(): string;
}

/** Constructor deps (DI). */
export interface KnowledgeGraphWriterDeps {
  app: App;
  settings: KnowledgeGraphSettings;
  /** Phase 11 — AI pattern classification engine. Optional so existing tests
   *  (which don't supply it) continue to pass without changes. */
  patternClusterEngine?: PatternClusterEngine;
  /** Phase 11 — hub note writer for reconcile operations. Optional for the
   *  same DI-compatibility reason. */
  hubWriter?: ClusterHubWriter;
}

export class KnowledgeGraphWriter {
  private readonly app: App;
  private readonly settings: KnowledgeGraphSettings;
  /** Phase 11 — injected after AIClient construction in main.ts onload. */
  private patternClusterEngine?: PatternClusterEngine;
  /** Phase 11 — injected after AIClient construction in main.ts onload. */
  private hubWriter?: ClusterHubWriter;

  constructor(deps: KnowledgeGraphWriterDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
    this.patternClusterEngine = deps.patternClusterEngine;
    this.hubWriter = deps.hubWriter;
  }

  /** Late-bind the PatternClusterEngine (constructed after AIClient). */
  setPatternClusterEngine(engine: PatternClusterEngine): void {
    this.patternClusterEngine = engine;
  }

  /** Late-bind the ClusterHubWriter (constructed after AIClient). */
  setHubWriter(writer: ClusterHubWriter): void {
    this.hubWriter = writer;
  }

  /**
   * On-AC pipeline entry point. Safe to call with ANY terminal verdict —
   * the D-23 gate short-circuits when the status_code isn't Accepted.
   *
   * Invariants:
   *   - Never throws — per-stage try/catch swallows non-AC failures so a
   *     successful submit never ends in an error-toast cascade. Errors are
   *     logged at debug level.
   *   - Idempotent on re-AC: D-24 intentionally overwrites runtime/memory
   *     with the latest values.
   *   - ## Code is NEVER touched (GRAPH-01 revised, D-01). The writer has
   *     no code-rewrite path — step 2 is a body write that only touches
   *     the ## Techniques region via mergeTechniquesSection.
   */
  async onAccepted(ctx: KnowledgeGraphContext, terminal: SubmitCheckResponse): Promise<void> {
    // D-23 / CF-18 gate — only fire on Accepted.
    const info = classifyStatus(terminal.status_code, terminal.status_msg);
    if (info.kind !== 'ac') {
      logger.debug('graph.onAccepted: non-AC verdict, skipping pipeline', {
        kind: info.kind,
        status_code: terminal.status_code,
      });
      return;
    }

    const detail = this.settings.getProblemDetail(ctx.slug);
    // Tag contribution: use topicSlugs (always present post-Phase-2) for the
    // `lc/{slug}` frontmatter tags. When detail is absent entirely, contribute
    // nothing — step 1 still updates the 5 solve-time fields.
    const topicSlugs = Array.isArray(detail?.topicSlugs) ? detail.topicSlugs : [];
    const tagContribution = topicSlugs.map((slug) => `lc/${slug}`);
    // topicTags drives both ## Techniques body AND stub creation. Pre-Phase-4
    // cache entries have topicSlugs but no topicTags. Rather than skip steps
    // 2+3 for every existing user's problem cache (Pitfall 10 original rule),
    // derive {name, slug} from topicSlugs when topicTags is absent/empty —
    // slug→Title-Case mirrors LC's own display convention ('hash-table' →
    // 'Hash Table'). Fresh Phase-4 caches still use the authoritative LC
    // topicTags (with LC's canonical name string) when present.
    const cachedTopicTags = Array.isArray(detail?.topicTags) ? detail.topicTags : [];
    const topicTags = cachedTopicTags.length > 0
      ? cachedTopicTags
      : topicSlugs.map((slug) => ({ slug, name: slugToTagName(slug) }));

    // Step 1 — frontmatter write (GRAPH-02, D-09, D-11). Always fires on AC.
    // Phase 5.3 D-01/D-02: runtime/memory parsing + passing removed; display
    // path uses fresh LC GraphQL via SubmissionDetailModal.runtimeDisplay.
    try {
      const language = typeof terminal.lang === 'string' && terminal.lang.length > 0
        ? terminal.lang
        : 'unknown';
      await applySolveTimeFrontmatter(this.app, ctx.file, {
        language,
        currentPassTags: tagContribution,
      });
    } catch (err) {
      // Frontmatter failure is unusual (processFrontMatter is atomic). Debug
      // log and continue — step 2 may still succeed and the next AC can
      // retry step 1.
      logger.debug('graph.onAccepted: step 1 frontmatter write failed', err);
    }

    // D-20 opt-out: skip steps 2+3 (`## Techniques` body + stubs) when the
    // user has turned auto-backlinks off. Step 1 (tags + 5 solve-time fields)
    // already fired — lightweight graph fuel stays on (D-20 rationale).
    if (!this.settings.getAutoBacklinksEnabled()) {
      logger.debug('graph.onAccepted: autoBacklinksEnabled=false, skipping body + stubs');
      return;
    }

    // Pitfall 10 — no topicTags in cache → no name source for wikilinks.
    // Skip body + stubs; step 1 already handled the tags contribution using
    // topicSlugs so the graph isn't empty.
    if (topicTags.length === 0) {
      logger.debug('graph.onAccepted: detail.topicTags empty/missing, skipping body + stubs');
      return;
    }

    // Step 2 — ## Techniques body write (GRAPH-03, D-09, D-13). Pure transform
    // inside a vault.process callback so it's retry-safe (CF-06).
    // Phase 11: Skip when patternClusterEngine is present — the AI path
    // (Step 2.5) handles Techniques via mergeTechniquesSectionAI instead.
    if (!this.patternClusterEngine) {
      try {
        await this.app.vault.process(ctx.file, (current) =>
          mergeTechniquesSection(current, topicTags),
        );
      } catch (err) {
        logger.debug('graph.onAccepted: step 2 body write failed', err);
      }
    }

    // Step 2.5 — Phase 11 AI pattern classification (D-01 inline blocking).
    // When patternClusterEngine is present, classify the accepted solution into
    // an algorithmic pattern. Awaited (not fire-and-forget) so hub writes are
    // sequenced correctly. On success, Step 3 stubs are skipped (hub notes
    // replace technique stubs). When absent (legacy path), stubs still fire.
    let classificationRan = false;
    if (this.patternClusterEngine) {
      try {
        const problemHtml = this.settings.getProblemDetail(ctx.slug)?.contentHtml ?? '';
        // Read current file body to extract the code fence content.
        const body = await this.app.vault.cachedRead(ctx.file);
        const extracted = extractFirstFencedBlock(body);
        const code = extracted?.code ?? '';
        const language = typeof terminal.lang === 'string' && terminal.lang.length > 0
          ? terminal.lang
          : 'unknown';
        await this.patternClusterEngine.onAccepted(ctx.file, ctx.slug, problemHtml, code, language);
        classificationRan = true;
      } catch (err) {
        logger.debug('graph.onAccepted: step 2.5 AI classification failed', err);
      }
    }

    // Step 2.6 — D-07 mechanism 2: background full reconcile after each AC.
    // Fire-and-forget (NOT awaited) — catches drift from the incremental append
    // without blocking the AC flow. Fires regardless of whether classification
    // succeeded or failed (hub state may still need reconciliation from prior
    // incremental appends).
    if (this.hubWriter) {
      void this.hubWriter.reconcile().catch((e) =>
        logger.debug('graph.onAccepted: background reconcile failed', e),
      );
    }

    // Step 3 — stub technique-note creation (GRAPH-04, D-09, D-18, D-19).
    // When patternClusterEngine is present AND classification ran, skip stubs —
    // hub notes replace technique stubs as the cross-problem linkage mechanism.
    // When patternClusterEngine is absent (legacy path), stubs still fire.
    if (!classificationRan) {
      const techniquesFolder = this.settings.getTechniquesFolder();
      try {
        await ensureTechniquesFolder(this.app, techniquesFolder);
      } catch (err) {
        // Folder create is itself silent-on-race, but defense-in-depth.
        logger.debug('graph.onAccepted: ensureTechniquesFolder failed', err);
      }

      for (const tag of topicTags) {
        try {
          const filename = buildTechniqueFilename(tag.name);
          const path = `${techniquesFolder.replace(/[\\/]+$/, '')}/${filename}`;
          const body = buildTechniqueStubBody(tag.slug, tag.name);
          await createStubIfMissing(this.app, path, body);
        } catch (err) {
          // D-19: per-stub failure is silent. The ## Techniques wikilink remains
          // dangling (correct — Obsidian shows unresolved-link styling). Next AC
          // retries the check.
          logger.debug('graph.onAccepted: step 3 stub create failed', { tag, err });
        }
      }
    }
  }
}


// Phase 5.3 D-01/D-02: solve-time runtime/memory parse helpers + frontmatter
// writes were removed. Display reads runtime/memory fresh from LC GraphQL
// via SubmissionDetailModal.

/** Turn an LC topic slug into a display name that matches LC's own convention
 *  ('hash-table' → 'Hash Table'). Used as a fallback for pre-Phase-4 cache
 *  entries that have topicSlugs but no topicTags. Kept local to avoid a
 *  cross-module dependency on FilterModal's formatter. */
function slugToTagName(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length === 0 ? '' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
