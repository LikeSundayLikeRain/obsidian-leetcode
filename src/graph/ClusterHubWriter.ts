// src/graph/ClusterHubWriter.ts
//
// Phase 11 Plan 02 Task 1 — Hub note CRUD + reconcile for AI Knowledge Graph.
//
// Responsibilities:
//   - Create hub notes at {problemsFolder}/Patterns/{pattern}.md
//   - Append new entries to existing hub notes (idempotent)
//   - Reconcile: scan all notes with lc-pattern frontmatter and rebuild hubs
//
// Vault-write convention (CF-06):
//   - vault.create for new files
//   - vault.process for modifying existing files
//   - Never vault.modify
//
// Never-throw posture: per-operation try/catch with logger.debug.
// DI constructor pattern mirrors KnowledgeGraphWriter.

import type { App, TFile } from 'obsidian';
import { normalizePatternName } from './patternTaxonomy';
import { logger } from '../shared/logger';

/**
 * A single problem entry in a hub note's difficulty-grouped table.
 */
export interface HubEntry {
  title: string;
  fileBasename: string; // e.g. '1-two-sum' (without .md)
  difficulty: 'Easy' | 'Medium' | 'Hard';
  solvedDate: string; // YYYY-MM-DD
}

/** Constructor deps (DI). */
export interface ClusterHubWriterDeps {
  app: App;
  problemsFolder: string;
}

/**
 * Manages pattern hub notes at {problemsFolder}/Patterns/{pattern}.md.
 * Hub notes contain difficulty-grouped tables listing all problems classified
 * into that pattern.
 */
export class ClusterHubWriter {
  private readonly app: App;
  private readonly problemsFolder: string;

  constructor(deps: ClusterHubWriterDeps) {
    this.app = deps.app;
    this.problemsFolder = deps.problemsFolder;
  }

  /**
   * Create a hub note if absent. No-op if hub already exists.
   * Race-safe via try/catch on vault.create (same pattern as StubNoteCreator).
   */
  async ensureHub(patternName: string, firstEntry: HubEntry): Promise<void> {
    const normalized = normalizePatternName(patternName);
    const folderPath = `${this.problemsFolder}/Patterns`;
    const filePath = `${folderPath}/${normalized}.md`;

    // Check existence
    if (this.app.vault.getAbstractFileByPath(filePath)) return;

    // Ensure folder exists (race-safe)
    try {
      if (!this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
    } catch (err) {
      // Concurrent-create race — folder already exists.
      logger.debug('ClusterHubWriter.ensureHub: folder race', err);
    }

    // Create hub note with initial entry
    try {
      const body = buildHubNoteBody(normalized, [firstEntry]);
      await this.app.vault.create(filePath, body);
    } catch (err) {
      // Concurrent-create race — file was created between check and create.
      logger.debug('ClusterHubWriter.ensureHub: create race', err);
    }
  }

  /**
   * Append a problem entry to the correct difficulty section of an existing hub.
   * Idempotent: skips if [[title]] already appears in the hub body.
   */
  async appendEntry(patternName: string, entry: HubEntry): Promise<void> {
    const normalized = normalizePatternName(patternName);
    const filePath = `${this.problemsFolder}/Patterns/${normalized}.md`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      logger.debug('ClusterHubWriter.appendEntry: hub not found, calling ensureHub', { filePath });
      await this.ensureHub(patternName, entry);
      return;
    }

    try {
      // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
      await this.app.vault.process(file as TFile, (current: string) => {
        return appendToHub(current, entry);
      });
    } catch (err) {
      logger.debug('ClusterHubWriter.appendEntry: process failed', err);
    }
  }

  /**
   * Reconcile: scan all vault markdown files for lc-pattern frontmatter,
   * group by pattern, rebuild each hub note from scratch.
   * Uses metadataCache (in-memory) for performance — no file reads needed.
   */
  async reconcile(): Promise<void> {
    try {
      const allFiles = (this.app.vault as unknown as { getMarkdownFiles(): TFile[] }).getMarkdownFiles();
      const prefixedFiles = allFiles.filter((f: TFile) =>
        f.path.startsWith(this.problemsFolder + '/'),
      );

      // Group entries by pattern
      const groups = new Map<string, HubEntry[]>();
      for (const file of prefixedFiles) {
        const cache = this.app.metadataCache.getFileCache(file);
        const pattern = cache?.frontmatter?.['lc-pattern'] as string | undefined;
        if (!pattern || pattern.length === 0) continue;

        const normalized = normalizePatternName(pattern);
        const difficulty = (cache?.frontmatter?.['lc-difficulty'] as string) ?? 'Medium';
        const solvedDate = (cache?.frontmatter?.['lc-solved-date'] as string) ?? '';

        const basename = (file as unknown as { basename: string }).basename;
        const title = (cache?.frontmatter?.['lc-title'] as string) ?? basename;
        const entry: HubEntry = {
          title,
          fileBasename: basename,
          difficulty: normalizeDifficulty(difficulty),
          solvedDate,
        };

        const existing = groups.get(normalized) ?? [];
        existing.push(entry);
        groups.set(normalized, existing);
      }

      // Rebuild each hub
      for (const [patternName, entries] of groups) {
        const folderPath = `${this.problemsFolder}/Patterns`;
        const filePath = `${folderPath}/${patternName}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (file) {
          // Overwrite via vault.process
          try {
            // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
            await this.app.vault.process(file as TFile, () => {
              return buildHubNoteBody(patternName, entries);
            });
          } catch (err) {
            logger.debug('ClusterHubWriter.reconcile: process failed', { patternName, err });
          }
        } else {
          // Create new hub
          try {
            if (!this.app.vault.getAbstractFileByPath(folderPath)) {
              await this.app.vault.createFolder(folderPath);
            }
          } catch {
            // Race - folder exists
          }
          try {
            await this.app.vault.create(filePath, buildHubNoteBody(patternName, entries));
          } catch (err) {
            logger.debug('ClusterHubWriter.reconcile: create failed', { patternName, err });
          }
        }
      }
    } catch (err) {
      logger.debug('ClusterHubWriter.reconcile: scan failed', err);
    }
  }
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Normalize difficulty string to the canonical union type.
 */
function normalizeDifficulty(d: string): 'Easy' | 'Medium' | 'Hard' {
  const lower = d.toLowerCase();
  if (lower === 'easy') return 'Easy';
  if (lower === 'hard') return 'Hard';
  return 'Medium';
}

/**
 * Build the full hub note body: frontmatter + heading + difficulty-grouped tables.
 */
function buildHubNoteBody(patternName: string, entries: HubEntry[]): string {
  const easy = entries.filter((e) => e.difficulty === 'Easy');
  const medium = entries.filter((e) => e.difficulty === 'Medium');
  const hard = entries.filter((e) => e.difficulty === 'Hard');

  const parts: string[] = [
    '---',
    'lc-pattern-hub: true',
    `pattern: "${patternName}"`,
    '---',
    '',
    `# ${patternName}`,
    '',
    '### Easy',
    '',
    ...easy.map((e) => `- [[${e.fileBasename}|${e.title}]]`),
    '',
    '### Medium',
    '',
    ...medium.map((e) => `- [[${e.fileBasename}|${e.title}]]`),
    '',
    '### Hard',
    '',
    ...hard.map((e) => `- [[${e.fileBasename}|${e.title}]]`),
    '',
  ];

  return parts.join('\n');
}

/**
 * Append an entry to the correct difficulty section in an existing hub body.
 * Idempotent: skips if [[title]] already present.
 */
function appendToHub(body: string, entry: HubEntry): string {
  // Idempotent check
  if (body.includes(`[[${entry.fileBasename}|`)) return body;

  const lines = body.split('\n');
  const sectionHeading = `### ${entry.difficulty}`;
  const bullet = `- [[${entry.fileBasename}|${entry.title}]]`;

  // Find the difficulty section and append the bullet after existing items
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === sectionHeading) {
      let insertIdx = i + 1;
      // Skip blank lines after heading
      while (insertIdx < lines.length && lines[insertIdx]! === '') insertIdx++;
      // Skip existing bullet items
      while (insertIdx < lines.length && lines[insertIdx]!.startsWith('- [[')) insertIdx++;
      // Insert the new bullet
      lines.splice(insertIdx, 0, bullet);
      return lines.join('\n');
    }
  }

  // Section not found — shouldn't happen with a well-formed hub, but append at end
  return body + '\n' + bullet + '\n';
}
