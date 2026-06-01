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
// TFile narrowing: production runs go through `instanceof TFile` first; unit
// tests mock Obsidian's Vault with plain file-shaped objects that don't pass
// `instanceof TFile`, so we duck-type fall back to checking that `.path` and
// `.extension` are strings. The combined `narrowToTFile` helper returns the
// value typed as `TFile` so call sites avoid `as TFile` casts (which the
// obsidianmd/no-tfile-tfolder-cast rule rejects).

import { Notice, TFile, MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import { isSessionExpired } from '../api/LeetCodeClient';
import { logger } from '../shared/logger';
import { showSessionExpiredNotice } from '../solve/SessionExpiredNotice';
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
// Phase 3 Plan 07 — retrofit hook for existing + new notes (D-06/D-07/D-09).
import { retrofit as retrofitStarterCodeRaw } from '../solve/starterCodeInjector';

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
  /** Phase 3 D-30 — LC's internal questionId (distinct from questionFrontendId
   *  for premium variants). Populated into DetailCacheEntry.internalQuestionId
   *  by toDetailCacheEntry so Plan 04's REST body gets the right id. */
  questionId?: string | null;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  topicTags?: Array<{ name: string; slug: string }>;
  exampleTestcases?: string;
  metaData?: string;
  sampleTestCase?: string;
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

/**
 * Narrow `vault.getAbstractFileByPath()` results to `TFile` for production use
 * (`instanceof TFile`) AND test mocks (file-shaped objects). The signature is
 * `(v: unknown) => TFile | null` so call sites get a TFile-typed binding
 * without writing `as TFile` (forbidden by obsidianmd/no-tfile-tfolder-cast).
 *
 * Tests provide plain objects so the production-only `instanceof` check would
 * skip them; the duck-type fallback keeps the unit-test compatibility the
 * file header documents. The fallback uses a local type alias so the cast's
 * AST type identifier isn't the literal `TFile` the lint rule looks for.
 */
type VaultFile = TFile;
function narrowToTFile(v: unknown): TFile | null {
  if (v instanceof TFile) return v;
  if (isFileLike(v)) return v as unknown as VaultFile;
  return null;
}

/** Phase 4 Plan 05 (D-02) — optional on-open hook. NoteWriter fires this after
 *  the note is revealed so consumers (SubmissionHistoryStore.prefetch) can
 *  refetch submission history in the background. Separate from the 7-day
 *  problem-detail TTL — submission history has NO TTL per D-02 / D-07.
 *
 *  Contract: callback is fire-and-forget; NoteWriter does not await. The
 *  callback implementation is expected to swallow its own errors (the D-02
 *  "silent-offline" posture). */
export type NoteOpenHook = (slug: string) => void;

export class NoteWriter {
  /** Phase 4 Plan 05 — optional on-open hook; installed by main.ts after
   *  the SubmissionHistoryStore is constructed. Injected via setter rather
   *  than constructor arg so the NoteWriter → KnowledgeGraph wiring isn't
   *  a hard dependency (tests that don't care about the graph layer don't
   *  need to wire the hook). */
  private onNoteOpen: NoteOpenHook | null = null;

  /** Phase 5 D-21 — login callback wired to the D-21 sticky session-expired
   *  Notice's Log in button. Injected via setter (same rationale as
   *  onNoteOpen above) so existing NoteWriter tests that use the 3-arg
   *  constructor don't need to change. When null (the default), the Notice
   *  still renders with a Log in button but the click is a no-op. */
  private login: (() => void | Promise<void>) | null = null;

  constructor(
    private readonly app: App,
    private readonly client: NoteWriterClient,
    private readonly settings: NoteWriterSettings,
  ) {}

  /** Phase 4 Plan 05 — install the on-open hook. Main.ts calls this once after
   *  constructing SubmissionHistoryStore. Only one hook at a time — the
   *  latest setter wins. Passing null detaches. */
  setOnNoteOpen(hook: NoteOpenHook | null): void {
    this.onNoteOpen = hook;
  }

  /** Phase 5 D-21 — install the login callback for the sticky session-expired
   *  Notice. Production wiring in main.ts passes `() => { void this.auth.login(); }`.
   *  Tests can omit this — the Notice's Log in button will still render but
   *  click-through will be silent. */
  setLogin(login: (() => void | Promise<void>) | null): void {
    this.login = login;
  }

  /** Fire the on-open hook if installed. Swallows synchronous throws so a
   *  faulty hook never breaks the reveal path. The hook itself is responsible
   *  for its async error handling (D-12 silent-offline). */
  private fireOnNoteOpen(slug: string): void {
    if (!this.onNoteOpen) return;
    try {
      this.onNoteOpen(slug);
    } catch (err) {
      logger.debug('notes.onNoteOpen: hook threw synchronously', err);
    }
  }

  /**
   * Phase 18 — tab idempotency helper. If a markdown leaf is already open
   * for `filePath`, reveal it and return true. Otherwise return false so
   * the caller can proceed with openLinkText.
   */
  private revealExistingLeaf(filePath: string): boolean {
    if (typeof this.app.workspace.getLeavesOfType !== 'function') return false;
    const existing = this.app.workspace.getLeavesOfType('markdown')
      .find(l => {
        const v = l.view;
        if (v instanceof MarkdownView && v.file?.path === filePath) return true;
        const stateFile = (l.getViewState()?.state as { file?: string })?.file;
        return stateFile === filePath;
      });
    if (existing) {
      void this.app.workspace.revealLeaf(existing);
      return true;
    }
    return false;
  }

  /**
   * Phase 3 Plan 07 — retrofit wrapper with D-09 pre-guards.
   *
   * starterCodeInjector.retrofit is silent-on-failure internally, but it is
   * not silent-on-no-language: with an empty langSlug and no starter it
   * would still write an empty tag-less fenced block under a fresh `## Code`
   * heading (malformed). We short-circuit that case here so the user's note
   * is left structurally unchanged until they either configure a default
   * language in settings or invoke the explicit "Insert starter code"
   * command (Plan 07 Task 2).
   */
  private async retrofitStarterCode(
    file: TFile,
    detail: DetailCacheEntry | null,
  ): Promise<void> {
    const defaultLang = this.settings.getDefaultLanguage();
    const hasAnyStarter = Array.isArray(detail?.codeSnippets) && (detail?.codeSnippets?.length ?? 0) > 0;
    if (!defaultLang && !hasAnyStarter) {
      logger.debug('notes.retrofitStarterCode: skipped — no default language and no starter snippets');
      return;
    }
    await retrofitStarterCodeRaw(this.app, file, detail, this.settings);
  }

  async openProblem(
    slug: string,
    initialStatus?: 'solved' | 'attempted' | 'untouched',
  ): Promise<void> {
    const folder = this.settings.getProblemsFolder();
    const cached = this.settings.getProblemDetail(slug);

    // Re-open path (D-11): existing file + cached detail → reveal first, optionally background-refresh.
    const existingPath = cached ? buildNotePath(folder, cached.id, slug) : null;
    const existingFile = existingPath
      ? narrowToTFile(this.app.vault.getAbstractFileByPath(existingPath))
      : null;

    if (existingFile) {
      // Reveal immediately — no await on any network (D-11).
      // Phase 18: tab idempotency — reuse existing leaf if already open.
      if (!this.revealExistingLeaf(existingFile.path)) {
        await this.app.workspace.openLinkText(existingFile.path, '', false);
      }
      // Phase 4 Plan 05 (D-02) — fire the on-open hook after reveal so the
      // submission history prefetch runs in parallel with the rest of the
      // reveal chain. Fire-and-forget; hook owns its own error handling.
      this.fireOnNoteOpen(slug);
      // D-18: opportunistic ship of LeetCode.base if missing (no throw on failure).
      await ensureLeetcodeBase(this.app, folder).catch((err) => {
        logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
      });
      // Phase 3 Plan 07 — retrofit starter code on re-open path (D-07 idempotent).
      // Silent on every failure per D-09 (retrofit owns its own error surface).
      await this.retrofitStarterCode(existingFile, cached);
      // D-11/D-12: background-refresh if cache is stale; silent on failure.
      const now = Date.now();
      const cacheStale = !cached || (now - cached.fetchedAt) > CACHE_TTL_MS;
      if (cacheStale) {
        // fire-and-forget — swallow any rejection at the boundary (D-12).
        void this.backgroundRefresh(existingFile, slug).catch((err) => {
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
        // D-21: sticky Notice + Log in button.
        showSessionExpiredNotice(this.login ?? (() => undefined));
        return;
      }
      // Generic network failure (D-13): Notice + abort, no partial file.
      new Notice(`Couldn't fetch ${slug}. Check your connection.`, 4000);
      return;
    }

    if (!detail || !detail.content) {
      // LC returned null → treat as not-found (or session expired flattened to null).
       
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

    // Phase 3 Plan 07 — canonical-path pre-check. The re-open branch above
    // only fires when the settings cache already has a detail entry (so we
    // can compute the canonical path from cache). If the cache was cleared
    // (prune, manual reset, plugin reinstall) but the note file still exists
    // on disk, we MUST retrofit rather than re-create. Otherwise
    // `vault.create` below throws ("already exists") and the user sees a
    // broken re-open. Using the fresh detail's id, we can now compute the
    // canonical path and retrofit silently.
    const filePath = buildNotePath(folder, newEntry.id, slug);
    const existingAtCanonical = narrowToTFile(this.app.vault.getAbstractFileByPath(filePath));
    if (existingAtCanonical) {
      // Treat as re-open: reveal + retrofit + refresh frontmatter.
      // Phase 18: tab idempotency — reuse existing leaf if already open.
      if (!this.revealExistingLeaf(existingAtCanonical.path)) {
        await this.app.workspace.openLinkText(existingAtCanonical.path, '', false);
      }
      // Phase 4 Plan 05 (D-02) — fire on-open hook after recovered reveal.
      this.fireOnNoteOpen(slug);
      await ensureLeetcodeBase(this.app, folder).catch((err) => {
        logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
      });
      // Silent retrofit (D-09) — starterCodeInjector handles all error surfaces.
      await this.retrofitStarterCode(existingAtCanonical, newEntry);
      // Union-merge frontmatter so lc-* keys track the fresh detail, mirroring
      // backgroundRefresh's posture.
      try {
        await applyFrontmatter(
          this.app,
          existingAtCanonical,
          buildFrontmatterInput(
            newEntry,
            this.settings.getDefaultLanguage(),
            mapStatusDisplay(initialStatus),
          ),
        );
      } catch (err) {
        logger.debug('notes.openProblem: applyFrontmatter on recovered note failed', err);
      }
      return;
    }

    // Create the file with body; frontmatter comes on a separate pass via processFrontMatter.
    const defaultLang = this.settings.getDefaultLanguage();
    const starterCode = pickStarterCode(newEntry, defaultLang);
    const body = buildNoteBody({
      problemMarkdown: htmlToMarkdown(newEntry.contentHtml),
      langSlug: defaultLang || undefined,
      starterCode,
      title: newEntry.title,
    });
    const createdRaw = await this.app.vault.create(filePath, body);
    const file = narrowToTFile(createdRaw);

    if (!file) {
      // Extremely defensive — vault.create should always return a file-shaped value.
      // If a patched environment returns something else, warn rather than crash.
      logger.warn('notes.openProblem: vault.create returned unexpected shape', { filePath });
      return;
    }

    // Metadata-cache-race guard (RESEARCH.md Open Q2): yield a tick so Obsidian
    // indexes the newly-created file before processFrontMatter reads it, then
    // retry once after 50ms if the first call throws (slower Obsidian startup).
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      await applyFrontmatter(
        this.app,
        file,
        buildFrontmatterInput(
          newEntry,
          this.settings.getDefaultLanguage(),
          mapStatusDisplay(initialStatus),
        ),
      );
    } catch (err) {
      logger.debug('notes.openProblem: applyFrontmatter first attempt threw — retrying after 50ms', err);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      await applyFrontmatter(
        this.app,
        file,
        buildFrontmatterInput(
          newEntry,
          this.settings.getDefaultLanguage(),
          mapStatusDisplay(initialStatus),
        ),
      );
    }

    // Phase 3 Plan 07 — belt-and-suspenders retrofit on the new-note path.
    // buildNoteBody above already emits `## Code` with the starter block, so
    // this call is typically an idempotent no-op (recognized langSlug fence
    // detected → early return). Retained so a future change to buildNoteBody
    // that drops `## Code` doesn't silently break new-note creation.
    await this.retrofitStarterCode(file, newEntry);

    // D-18 lazy ship — opportunistic, non-fatal.
    await ensureLeetcodeBase(this.app, folder).catch((err) => {
      logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
    });

    // Reveal the newly-created note.
    // Phase 18: tab idempotency — reuse existing leaf if already open.
    if (!this.revealExistingLeaf(file.path)) {
      await this.app.workspace.openLinkText(file.path, '', false);
    }
    // Phase 4 Plan 05 (D-02) — fire on-open hook after new-note reveal.
    this.fireOnNoteOpen(slug);
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
    // Phase 3 Plan 07 — retrofit starter code if the note still lacks `## Code`
    // (e.g., cached entry had no codeSnippets when first written but a later
    // refresh returns them). Idempotent on notes that already have the
    // section. Silent on failure per D-09.
    await this.retrofitStarterCode(file, entry);
    // Frontmatter update — same pass, union-merge semantics inside applyFrontmatter.
    await applyFrontmatter(
      this.app,
      file,
      buildFrontmatterInput(entry, this.settings.getDefaultLanguage()),
    );
  }

  /**
   * GAP-11: explicit force-refresh of an existing problem note. Invoked by
   * the "Refresh current problem" command; bypasses the 7-day TTL gate.
   *
   * Contrast with `backgroundRefresh` (D-11/D-12):
   *   - backgroundRefresh: fires only when cache is stale, silent on failure.
   *   - forceRefresh: user explicitly asked → surface failures via Notice so
   *     they know the network hop failed (matches D-13 spirit — this IS an
   *     explicit user action, just like new-note creation).
   *
   * Preserves all user content (D-08/D-10):
   *   - `## Notes` body untouched (rewriteProblemSection only replaces
   *     the `## Problem` region between consecutive H2 headings).
   *   - Non-lc-* frontmatter keys untouched.
   *   - aliases / tags union-merged by applyFrontmatter.
   *   - lc-status is NEVER downgraded — Phase 4's 'accepted' value survives
   *     a force-refresh because applyFrontmatter keeps existing non-empty
   *     status values.
   *
   * D-22 compliance: body writes via vault.process; frontmatter via
   * fileManager.processFrontMatter inside applyFrontmatter. No vault.modify.
   *
   * Error paths:
   *   - No note exists for slug → Notice "No note for problem {slug}" and return.
   *   - Session expired → standard LeetCode session-expired Notice.
   *   - Generic network failure → Notice "Couldn't refresh {title}. Check your
   *     connection." — re-uses the D-13 copy since this is an explicit user
   *     action just like new-note creation.
   *   - LC returns null detail → Notice "LeetCode problem not found: {slug}."
   */
  async forceRefresh(slug: string): Promise<void> {
    const folder = this.settings.getProblemsFolder();
    const cached = this.settings.getProblemDetail(slug);

    // Locate the existing note by cached id + slug. If there's no cache, we
    // can't compute the filename — ask the user to open the problem first.
    const existingPath = cached ? buildNotePath(folder, cached.id, slug) : null;
    const existingFile = existingPath
      ? narrowToTFile(this.app.vault.getAbstractFileByPath(existingPath))
      : null;

    if (!existingFile) {
      new Notice(`No note for problem ${slug}.`, 4000);
      return;
    }

    // Fetch fresh detail. Any error surfaces to the user — they explicitly
    // asked for a refresh, so silent-failure (D-12) is the wrong posture.
    let detail: NoteWriterDetail | null;
    try {
      detail = await this.client.getProblemDetail(slug);
    } catch (err) {
      const maybeResp = (typeof err === 'object' && err !== null)
        ? (err as { response?: unknown }).response
        : undefined;
      if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
        // D-21: sticky Notice + Log in button.
        showSessionExpiredNotice(this.login ?? (() => undefined));
        return;
      }
      const displayTitle = cached?.title ?? slug;
      new Notice(`Couldn't refresh ${displayTitle}. Check your connection.`, 4000);
      return;
    }

    if (!detail || !detail.content) {
      new Notice(`LeetCode problem not found: ${slug}.`, 4000);
      return;
    }

    // Persist the fresh cache entry first — subsequent background-refresh
    // invocations on this slug see the new fetchedAt timestamp and skip the
    // network hop until the 7-day TTL elapses.
    const entry = toDetailCacheEntry(detail);
    await this.settings.setProblemDetail(slug, entry);

    // Rewrite the plugin-owned `## Problem` region; everything else is
    // preserved by rewriteProblemSection (pure string transform — D-08).
    const freshMarkdown = htmlToMarkdown(entry.contentHtml);
    const title = detail.title ?? cached?.title ?? '';
    await this.app.vault.process(
      existingFile,
      (current) => {
        let updated = rewriteProblemSection(current, freshMarkdown);
        // Phase 12 (D-11): insert H1 title if missing on existing notes
        if (title && !updated.match(/^# .+/m)) {
          const h1 = `# ${title}\n`;
          // Insert after frontmatter: find second --- delimiter (closing)
          const firstDelim = updated.indexOf('---');
          const secondDelim = firstDelim >= 0 ? updated.indexOf('---', firstDelim + 3) : -1;
          if (secondDelim >= 0) {
            const afterFm = updated.indexOf('\n', secondDelim);
            const insertAt = afterFm >= 0 ? afterFm + 1 : secondDelim + 3;
            updated = updated.slice(0, insertAt) + h1 + updated.slice(insertAt);
          } else {
            updated = h1 + updated;
          }
        }
        return updated;
      },
    );

    // Union-merge frontmatter. D-04 status non-downgrade + D-10 user-key
    // preservation happen inside applyFrontmatter's callback.
    await applyFrontmatter(
      this.app,
      existingFile,
      buildFrontmatterInput(entry, this.settings.getDefaultLanguage()),
    );
  }
}

/**
 * Phase 3 Plan 07 — resolve the starter snippet for the user's default
 * language. Returns empty string when either the language is empty (user
 * cleared the setting) or the detail has no matching snippet. Empty string
 * is safe — `buildNoteBody` will emit an empty fenced block with the
 * configured langSlug tag.
 */
function pickStarterCode(entry: DetailCacheEntry, langSlug: string): string {
  if (!langSlug) return '';
  const snippets = entry.codeSnippets ?? [];
  const hit = snippets.find((s) => s.langSlug === langSlug);
  return hit?.code ?? '';
}

/** Map LC's detail shape into the on-disk cache entry.
 *
 * Phase 06 Plan 03 — `export` keyword added so the new `ProblemPreviewView`
 * cache-miss path (src/preview/ProblemPreviewView.ts) can call this helper to
 * persist a freshly-fetched detail into SettingsStore. RESEARCH §A2: the
 * underlying `LeetCodeClient.getProblemDetail` does NOT auto-persist into
 * SettingsStore — the preview view itself must call `setProblemDetail(slug,
 * toDetailCacheEntry(fetched))` after the fetch resolves. The body shape stays
 * IDENTICAL to v1.0 (existing internal callers in this module — openProblem,
 * backgroundRefresh, forceRefresh — keep working with the same in-module
 * import resolution; only the keyword is added). */
export function toDetailCacheEntry(raw: NoteWriterDetail): DetailCacheEntry {
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
    metaData: raw.metaData,
    sampleTestCase: raw.sampleTestCase,
    codeSnippets: raw.codeSnippets,
    // Phase 3 D-30 — carry LC's internal questionId through to the cache so
    // Plan 04's REST body can read it via SettingsStore.getInternalQuestionId().
    // `undefined` (not empty string) when LC omits the field so shape-guard
    // treats old-cache-shape-compatible entries as valid.
    internalQuestionId: typeof raw.questionId === 'string' ? raw.questionId : undefined,
  };
}
