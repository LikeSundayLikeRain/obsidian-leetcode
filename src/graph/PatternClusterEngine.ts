// src/graph/PatternClusterEngine.ts
//
// Phase 11 Plan 02 Task 2 — AI classification orchestration for Knowledge Graph.
//
// Responsibilities:
//   - Gate on autoAIKnowledgeGraph + activeAIProvider
//   - Persistence check: skip classification when lc-pattern already set
//   - Convert problem HTML to markdown (turndown)
//   - Assemble prompt via buildKgPrompt
//   - Invoke AIClient (non-streaming, disclosure gate fires automatically)
//   - Parse response via parseKgResponse
//   - Handle OTHER pattern (prompt user once via OtherPatternModal)
//   - Write lc-pattern frontmatter
//   - Rewrite ## Techniques via mergeTechniquesSectionAI
//   - Write ## Related Variants (cross-cluster only, D-14)
//   - Hub note: ensureHub + appendEntry
//   - Cost tracking via addCostLedger
//
// DI constructor pattern (mirrors KnowledgeGraphWriter). Never-throw posture.
// LC-isolation: only imports from ../ai/AIClient (type), ../ai/types (type),
// ./buildKgPrompt, ./parseKgResponse, ./mergeTechniquesSection,
// ./mergeRelatedVariantsSection, ./ClusterHubWriter, ./patternTaxonomy.
// Does NOT import the AI HTTP layer — lc-isolation test enforces this boundary.

import type { App, TFile } from 'obsidian';
import type { AIClient } from '../ai/AIClient';
import type { AIRequest } from '../ai/types';
import { buildKgPrompt } from './buildKgPrompt';
import { parseKgResponse } from './parseKgResponse';
import type { KgClassification } from './parseKgResponse';
import { mergeTechniquesSectionAI } from './mergeTechniquesSection';
import { mergeRelatedVariantsSection } from './mergeRelatedVariantsSection';
import type { ClusterHubWriter, HubEntry } from './ClusterHubWriter';
import { normalizePatternName } from './patternTaxonomy';
import { logger } from '../shared/logger';
import TurndownService from 'turndown';

/**
 * Result of a classification call.
 */
export interface ClassifyResult {
  pattern: string;
  variants: Array<{ slug: string; reason: string }>;
  lookAhead: Array<{ slug: string; reason: string }>;
}

/**
 * Settings facade for PatternClusterEngine. Matches the SettingsStore methods
 * used by this engine.
 */
export interface PatternClusterEngineSettings {
  getAutoAIKnowledgeGraph(): boolean;
  getActiveAIProvider(): unknown | null;
  getFeatureFlags(): { lookAheadEdges: boolean };
  getProblemDetail(slug: string): unknown | null;
  getProblemIndex(): { problems: Array<{ slug: string }> } | null;
  addCostLedger(usd: number): Promise<void>;
  getProblemsFolder(): string;
}

/**
 * Function type for showing the OTHER pattern modal.
 * In production this opens OtherPatternModal; in tests it's a vi.fn mock.
 */
export type ShowOtherModalFn = (problemTitle: string) => Promise<string>;

/** Constructor deps (DI). */
export interface PatternClusterEngineDeps {
  app: App;
  aiClient: AIClient;
  settings: PatternClusterEngineSettings;
  hubWriter: ClusterHubWriter;
  /** Optional modal factory for testability. Defaults to OtherPatternModal. */
  showOtherModal?: ShowOtherModalFn;
}

/**
 * AI classification orchestration engine. Transforms an AI classification
 * response into vault-persisted knowledge graph edges.
 */
export class PatternClusterEngine {
  private readonly app: App;
  private readonly aiClient: AIClient;
  private readonly settings: PatternClusterEngineSettings;
  private readonly hubWriter: ClusterHubWriter;
  private readonly showOtherModal: ShowOtherModalFn;
  private readonly turndown: TurndownService;

  constructor(deps: PatternClusterEngineDeps) {
    this.app = deps.app;
    this.aiClient = deps.aiClient;
    this.settings = deps.settings;
    this.hubWriter = deps.hubWriter;
    this.showOtherModal = deps.showOtherModal ?? this.defaultShowOtherModal.bind(this);
    this.turndown = new TurndownService();
  }

  /**
   * Default modal factory — production path. Opens OtherPatternModal and
   * awaits the user's choice.
   */
  private async defaultShowOtherModal(problemTitle: string): Promise<string> {
    // Dynamic import to avoid circular dependency issues in tests
    const { OtherPatternModal } = await import('./OtherPatternModal');
    const modal = new OtherPatternModal(this.app, problemTitle);
    modal.open();
    return modal.waitForResult();
  }

  /**
   * On-Accepted entry point. Safe to call on every AC — gates, persistence
   * checks, and never-throw posture ensure correctness.
   *
   * @param file        — the TFile of the accepted note
   * @param slug        — LC problem slug
   * @param problemHtml — raw HTML problem statement
   * @param code        — user's accepted solution code
   * @param language    — fence info-string ('python3', 'java', etc.)
   */
  async onAccepted(
    file: TFile,
    slug: string,
    problemHtml: string,
    code: string,
    language: string,
  ): Promise<void> {
    // Gate 1: auto AI KG toggle
    if (!this.settings.getAutoAIKnowledgeGraph()) {
      logger.debug('PatternClusterEngine.onAccepted: autoAIKG disabled');
      return;
    }

    // Gate 2: active AI provider configured
    if (this.settings.getActiveAIProvider() === null) {
      logger.debug('PatternClusterEngine.onAccepted: no active AI provider');
      return;
    }

    // Persistence check (AIKG-01): if lc-pattern already set, skip classification
    const existingCache = this.app.metadataCache.getFileCache(file);
    const existingPattern = existingCache?.frontmatter?.['lc-pattern'] as string | undefined;
    if (existingPattern && existingPattern.length > 0) {
      logger.debug('PatternClusterEngine.onAccepted: lc-pattern already set, skipping classification', {
        pattern: existingPattern,
      });
      // Ensure Techniques section reflects the persisted pattern (idempotent)
      try {
        await this.app.vault.process(file, (body) => mergeTechniquesSectionAI(body, existingPattern));
      } catch (err) {
        logger.debug('PatternClusterEngine.onAccepted: techniques rewrite on re-AC failed', err);
      }
      // Still update hub (re-add after reconcile may have cleared it)
      await this.updateHub(file, existingPattern);
      return;
    }

    // Convert HTML to markdown
    let problemMd: string;
    try {
      problemMd = this.turndown.turndown(problemHtml);
    } catch (err) {
      logger.debug('PatternClusterEngine.onAccepted: turndown failed', err);
      return;
    }

    // Assemble prompt
    const prompt = buildKgPrompt({ problemMd, code, language });
    logger.debug('PatternClusterEngine.onAccepted: prompt', { prompt });

    // Invoke AI
    let responseText: string;
    let usage: { inputTokens?: number; outputTokens?: number } | undefined;
    try {
      const req: AIRequest = { prompt, maxTokens: 500, stream: false };
      const response = await this.aiClient.invoke(req);
      responseText = response.text;
      usage = response.usage;
      logger.debug('PatternClusterEngine.onAccepted: AI response', { responseText });
    } catch (err) {
      logger.debug('PatternClusterEngine.onAccepted: AI invoke failed', err);
      return;
    }

    // Cost accounting
    try {
      // Rough cost estimate: use token counts if available
      // Approximate at $0.01 per 1K tokens (conservative estimate)
      const tokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
      const cost = tokens > 0 ? (tokens / 1000) * 0.01 : 0;
      await this.settings.addCostLedger(cost);
    } catch (err) {
      logger.debug('PatternClusterEngine.onAccepted: cost ledger failed', err);
    }

    // Parse response
    const parsed: KgClassification = parseKgResponse(responseText);

    // OTHER handling (AIKG-01): prompt user once
    // Note: parseKgResponse normalizes 'OTHER' to 'Other' via normalizePatternName.
    // Compare case-insensitively to catch both forms.
    let patternName = parsed.pattern;
    if (patternName.toUpperCase() === 'OTHER') {
      try {
        const basename = (file as unknown as { basename: string }).basename;
        patternName = await this.showOtherModal(basename);
      } catch (err) {
        logger.debug('PatternClusterEngine.onAccepted: OTHER modal failed', err);
        patternName = 'OTHER';
      }
    }

    // Write lc-pattern frontmatter
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm['lc-pattern'] = patternName;
      });
    } catch (err) {
      logger.debug('PatternClusterEngine.onAccepted: frontmatter write failed', err);
    }

    // Write Techniques section via vault.process
    try {
      await this.app.vault.process(file, (body: string) => {
        return mergeTechniquesSectionAI(body, patternName);
      });
    } catch (err) {
      logger.debug('PatternClusterEngine.onAccepted: techniques write failed', err);
    }

    logger.debug('PatternClusterEngine.onAccepted: parsed response', {
      pattern: parsed.pattern,
      variants: parsed.variants,
      lookAhead: parsed.lookAhead,
    });

    // Build a slug set from the problem index for fast validation
    const index = this.settings.getProblemIndex();
    const knownSlugs = new Set(index?.problems.map((p) => p.slug) ?? []);

    // Validate variants: keep only known slugs + cross-cluster (D-14)
    const validVariants = parsed.variants.filter((v) => {
      return knownSlugs.has(v.slug);
    }).slice(0, 2);

    // Validate lookAhead: only if feature flag is on + known slugs
    let validLookAhead: Array<{ slug: string; reason: string }> = [];
    if (this.settings.getFeatureFlags().lookAheadEdges) {
      validLookAhead = parsed.lookAhead.filter((v) => {
        return knownSlugs.has(v.slug);
      }).slice(0, 2);
    }

    // Combine and write Related Variants (only if any exist)
    const combinedVariants = [...validVariants, ...validLookAhead];
    if (combinedVariants.length > 0) {
      try {
        await this.app.vault.process(file, (body: string) => {
          return mergeRelatedVariantsSection(body, combinedVariants);
        });
      } catch (err) {
        logger.debug('PatternClusterEngine.onAccepted: related variants write failed', err);
      }
    }

    // Hub note update
    await this.updateHub(file, patternName);
  }

  /**
   * Update the hub note for the given pattern. Creates hub if needed, appends entry.
   */
  private async updateHub(file: TFile, patternName: string): Promise<void> {
    try {
      const cache = this.app.metadataCache.getFileCache(file);
      const difficulty = (cache?.frontmatter?.['lc-difficulty'] as string) ?? 'Medium';
      const normalizedDiff = normalizeDifficulty(difficulty);
      const basename = (file as unknown as { basename: string }).basename;
      const today = new Date().toISOString().slice(0, 10);

      const entry: HubEntry = {
        title: basename,
        difficulty: normalizedDiff,
        solvedDate: today,
      };

      await this.hubWriter.ensureHub(patternName, entry);
      await this.hubWriter.appendEntry(patternName, entry);
    } catch (err) {
      logger.debug('PatternClusterEngine.onAccepted: hub update failed', err);
    }
  }
}

/**
 * Normalize difficulty string to the canonical union type.
 */
function normalizeDifficulty(d: string): 'Easy' | 'Medium' | 'Hard' {
  const lower = d.toLowerCase();
  if (lower === 'easy') return 'Easy';
  if (lower === 'hard') return 'Hard';
  return 'Medium';
}
