// src/graph/KnowledgeGraphWriter.ts
//
// Phase 4 Plan 03 — on-Accepted knowledge-graph writer. Single entry point:
// KnowledgeGraphWriter.onAccepted(ctx, terminal). Invoked from main.ts's
// submitFromActive command lambda after classifyStatus confirms AC
// (D-08 + D-23 gate; CF-18 single source of truth).
//
// Pipeline (D-09 "one atomic-per-concern pass"):
//   1. Frontmatter write — fileManager.processFrontMatter. Flips lc-status
//      to 'accepted', writes lc-solved-date + lc-runtime-ms + lc-memory-mb
//      + lc-language, union-merges lc/{topic-slug} tags. Always fires on AC.
//      (GRAPH-02, D-10, D-11.)
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
import { logger } from '../shared/logger';
import type { SubmitCheckResponse } from '../solve/types';
import type { DetailCacheEntry } from '../settings/SettingsStore';

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
}

export class KnowledgeGraphWriter {
  private readonly app: App;
  private readonly settings: KnowledgeGraphSettings;

  constructor(deps: KnowledgeGraphWriterDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
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
    // topicTags presence drives both the tags contribution AND the
    // ## Techniques block. Pre-Phase-4 cache entries have topicSlugs but
    // no topicTags (Pitfall 10) — we still fire step 1 but fall back to an
    // empty tag contribution.
    const topicTags = Array.isArray(detail?.topicTags) ? detail.topicTags : [];
    // Tag contribution: use topicSlugs (always present post-Phase-2) for the
    // `lc/{slug}` frontmatter tags. When detail is absent entirely, contribute
    // nothing — step 1 still updates the 5 solve-time fields.
    const topicSlugs = Array.isArray(detail?.topicSlugs) ? detail.topicSlugs : [];
    const tagContribution = topicSlugs.map((slug) => `lc/${slug}`);

    // Step 1 — frontmatter write (GRAPH-02, D-09, D-11). Always fires on AC.
    try {
      const runtimeMs = parseRuntimeMs(terminal.status_runtime);
      const memoryMb = parseMemoryMb(terminal.status_memory);
      const language = typeof terminal.lang === 'string' && terminal.lang.length > 0
        ? terminal.lang
        : 'unknown';
      const solvedAt = new Date();  // captured for retry-safety (pure helper downstream).
      await applySolveTimeFrontmatter(this.app, ctx.file, {
        solvedAt,
        runtimeMs,
        memoryMb,
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
    try {
      await this.app.vault.process(ctx.file, (current) =>
        mergeTechniquesSection(current, topicTags),
      );
    } catch (err) {
      logger.debug('graph.onAccepted: step 2 body write failed', err);
      // Continue to stub creation even if body write failed — the stubs are
      // valuable on their own and next-AC retry of step 2 will still find
      // the same topicTags.
    }

    // Step 3 — stub technique-note creation (GRAPH-04, D-09, D-18, D-19).
    // Non-atomic per-stub loop; per-stub failures are silent so one disk-full
    // error doesn't block the rest. D-15: folder = {problemsFolder}/Techniques.
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

// ── parse helpers (D-10) ──────────────────────────────────────────────────

/** Parse LC's runtime display string into milliseconds. Examples:
 *    "12 ms" → 12
 *    "N/A"   → undefined (AC runs rarely return this, but guard anyway)
 *    ""      → undefined
 *    undefined → undefined
 */
function parseRuntimeMs(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const match = /^(\d+)\s*ms/i.exec(raw.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse LC's memory display string into megabytes. Examples:
 *    "14.2 MB" → 14.2
 *    "47.4 MB" → 47.4
 *    "N/A"     → undefined
 *    ""        → undefined
 */
function parseMemoryMb(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const match = /^(\d+(?:\.\d+)?)\s*mb/i.exec(raw.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}
