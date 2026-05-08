// src/notes/NoteWriter.ts
// Row-click orchestrator for Phase 2.
//
// Public surface: `openProblem(slug, initialStatus?)` — one verb. Internally branches on:
//   - does the note exist?
//   - is the detail cached, and is it fresh?
//   - did the network fetch succeed?
//
// The optional `initialStatus` 2nd arg is the caller's hint about the user's
// current LC submission status for this problem (GAP-2a). It uses the
// IndexedProblem.status internal vocabulary ('solved'|'attempted'|'untouched');
// the mapping to the on-disk `lc-status` vocabulary is owned by NoteTemplate's
// `mapStatusDisplay`. The D-04 non-downgrade guard in `applyFrontmatter`
// protects an existing 'accepted' from being clobbered on re-open.
//
// Decision references:
//   D-01 body layout (two headings: ## Problem, ## Notes)
//   D-10 frontmatter union merge (applyFrontmatter owns this)
//   D-11 reveal-first, 7-day TTL, background refresh
//   D-12 silent offline (log debug only; no Notice on refresh failure)
//   D-13 new-note fetch failure: Notice + abort, no partial file
//   D-14 DetailCacheEntry schema (id, title, difficulty, url, contentHtml, topicSlugs, …)
//   D-16 unpadded `{id}-{slug}.md` filename via buildNotePath
//   D-18 lazy LeetCode.base ship on first problem open
//   D-22 no mutating body writes — all body writes via vault.process;
//        all frontmatter via processFrontMatter
//
// TFile narrowing: this module uses a duck-type check (`typeof extension === 'string'`)
// on the result of `vault.getAbstractFileByPath`, NOT `instanceof TFile`. Rationale:
// unit tests mock Obsidian's Vault with plain file-shaped objects that do not pass
// `instanceof TFile`. Duck-typing works identically for the real TFile class and the
// mocked shape (both have `.path` and `.extension` string fields).

import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { isSessionExpired } from '../api/LeetCodeClient';
import { logger } from '../shared/logger';
import {
  applyFrontmatter,
  buildFrontmatterInput,
  buildNoteBody,
  buildNotePath,
  mapStatusDisplay,
} from './NoteTemplate';
import { htmlToMarkdown } from './htmlToMarkdown';
import { rewriteProblemSection } from './HeadingRegion';
import { ensureLeetcodeBase } from './BaseFile';
import type { DetailCacheEntry } from './types';

/** D-11 / D-14: 7 days between forced background refreshes. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Structural client shape. Plan 04's LeetCodeClient.getProblemDetail implements this.
 * Kept structural so tests can pass a bare `{ getProblemDetail: vi.fn(...) }` object
 * without constructing the full LC client.
 */
export interface NoteWriterClient {
  getProblemDetail(slug: string): Promise<NoteWriterDetail | null>;
}

/**
 * Structural detail shape. Mirrors LeetCodeProblemDetail from Plan 04 — kept
 * local here so NoteWriter doesn't import from `src/api/` for a type (the
 * runtime import is only `isSessionExpired`).
 */
export interface NoteWriterDetail {
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  topicTags?: Array<{ name: string; slug: string }>;
  exampleTestcases?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
}

/**
 * Structural settings shape. Plan 04's SettingsStore getters/setters implement this.
 */
export interface NoteWriterSettings {
  getProblemsFolder(): string;
  getDefaultLanguage(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
  setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>;
}

/** Minimal file-like shape the mocked Vault returns; real Obsidian returns TFile. */
interface FileLike {
  path: string;
  extension?: unknown;
}

function isFileLike(v: unknown): v is FileLike {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { extension?: unknown }).extension === 'string' &&
    typeof (v as { path?: unknown }).path === 'string'
  );
}

export class NoteWriter {
  constructor(
    private readonly app: App,
    private readonly client: NoteWriterClient,
    private readonly settings: NoteWriterSettings,
  ) {}

  async openProblem(
    slug: string,
    initialStatus?: 'solved' | 'attempted' | 'untouched',
  ): Promise<void> {
    const folder = this.settings.getProblemsFolder();
    const cached = this.settings.getProblemDetail(slug);

    // Re-open path (D-11): existing file + cached detail → reveal first, optionally background-refresh.
    const existingPath = cached ? buildNotePath(folder, cached.id, slug) : null;
    const existingFile = existingPath
      ? this.app.vault.getAbstractFileByPath(existingPath)
      : null;

    if (existingFile && isFileLike(existingFile)) {
      // Reveal immediately — no await on any network (D-11).
      await this.app.workspace.openLinkText(existingFile.path, '', false);
      // D-18: opportunistic ship of LeetCode.base if missing (no throw on failure).
      await ensureLeetcodeBase(this.app, folder).catch((err) => {
        logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
      });
      // D-11/D-12: background-refresh if cache is stale; silent on failure.
      const now = Date.now();
      const cacheStale = !cached || (now - cached.fetchedAt) > CACHE_TTL_MS;
      if (cacheStale) {
        // fire-and-forget — swallow any rejection at the boundary (D-12).
        void this.backgroundRefresh(existingFile as unknown as TFile, slug).catch((err) => {
          logger.debug('notes.backgroundRefresh: swallowed failure', err);
        });
      }
      return;
    }

    // New-note path (D-13): fetch detail, then write.
    let detail: NoteWriterDetail | null;
    try {
      detail = await this.client.getProblemDetail(slug);
    } catch (err) {
      // Session-expiry takes precedence — mirror Phase 1's Shared Pattern C copy.
      const maybeResp = (typeof err === 'object' && err !== null)
        ? (err as { response?: unknown }).response
        : undefined;
      if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
        new Notice('LeetCode session expired. Log in again.', 8000);
        return;
      }
      // Generic network failure (D-13): Notice + abort, no partial file.
      new Notice(`Couldn't fetch ${slug}. Check your connection.`, 4000);
      return;
    }

    if (!detail || !detail.content) {
      // LC returned null → treat as not-found (or session expired flattened to null).
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
      new Notice(`LeetCode problem not found: ${slug}.`, 4000);
      return;
    }

    // Build + persist the cache entry.
    const newEntry = toDetailCacheEntry(detail);
    await this.settings.setProblemDetail(slug, newEntry);

    // Ensure folder exists before vault.create (D-22 + Pitfall 3).
    const trimmedFolder = folder.replace(/[\\/]+$/, '');
    if (!this.app.vault.getAbstractFileByPath(trimmedFolder)) {
      await this.app.vault.createFolder(trimmedFolder);
    }

    // Create the file with body; frontmatter comes on a separate pass via processFrontMatter.
    const filePath = buildNotePath(folder, newEntry.id, slug);
    const body = buildNoteBody({ problemMarkdown: htmlToMarkdown(newEntry.contentHtml) });
    const file = await this.app.vault.create(filePath, body);

    if (!isFileLike(file)) {
      // Extremely defensive — vault.create should always return a file-shaped value.
      // If a patched environment returns something else, warn rather than crash.
      logger.warn('notes.openProblem: vault.create returned unexpected shape', { filePath });
    }

    // Metadata-cache-race guard (RESEARCH.md Open Q2): yield a tick so Obsidian
    // indexes the newly-created file before processFrontMatter reads it, then
    // retry once after 50ms if the first call throws (slower Obsidian startup).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      await applyFrontmatter(
        this.app,
        file as unknown as TFile,
        buildFrontmatterInput(
          newEntry,
          this.settings.getDefaultLanguage(),
          mapStatusDisplay(initialStatus),
        ),
      );
    } catch (err) {
      logger.debug('notes.openProblem: applyFrontmatter first attempt threw — retrying after 50ms', err);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      await applyFrontmatter(
        this.app,
        file as unknown as TFile,
        buildFrontmatterInput(
          newEntry,
          this.settings.getDefaultLanguage(),
          mapStatusDisplay(initialStatus),
        ),
      );
    }

    // D-18 lazy ship — opportunistic, non-fatal.
    await ensureLeetcodeBase(this.app, folder).catch((err) => {
      logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
    });

    // Reveal the newly-created note.
    await this.app.workspace.openLinkText((file as unknown as FileLike).path, '', false);
  }

  /**
   * Background refresh for an existing note. Silent on every failure (D-12).
   * Callback inside vault.process is pure — safe for Obsidian's retry-on-conflict
   * behavior (Pitfall 4).
   */
  private async backgroundRefresh(file: TFile, slug: string): Promise<void> {
    const detail = await this.client.getProblemDetail(slug);
    if (!detail || !detail.content) return;   // silent; no Notice per D-12
    const entry = toDetailCacheEntry(detail);
    await this.settings.setProblemDetail(slug, entry);

    const freshMarkdown = htmlToMarkdown(entry.contentHtml);
    // Body rewrite — vault.process is atomic; rewriteProblemSection is pure.
    await this.app.vault.process(file, (current) => rewriteProblemSection(current, freshMarkdown));
    // Frontmatter update — same pass, union-merge semantics inside applyFrontmatter.
    await applyFrontmatter(
      this.app,
      file,
      buildFrontmatterInput(entry, this.settings.getDefaultLanguage()),
    );
  }
}

/** Map LC's detail shape into the on-disk cache entry. */
function toDetailCacheEntry(raw: NoteWriterDetail): DetailCacheEntry {
  return {
    fetchedAt: Date.now(),
    id: Number(raw.questionFrontendId) || 0,
    title: raw.title,
    difficulty: raw.difficulty,
    url: `https://leetcode.com/problems/${raw.titleSlug}/`,
    contentHtml: raw.content ?? '',
    topicSlugs: Array.isArray(raw.topicTags)
      ? raw.topicTags.map((t) => String(t?.slug ?? '')).filter((s) => s.length > 0)
      : [],
    exampleTestcases: raw.exampleTestcases,
    codeSnippets: raw.codeSnippets,
  };
}
