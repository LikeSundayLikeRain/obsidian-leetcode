// src/contest/ContestFinalizer.ts
// Phase 10 Plan 06 — Contest finalization: batch note creation, summary note,
// and #revisit tagging for missed problems.
//
// Called on contest end (finish, abort, or timer expiry). Transforms ephemeral
// contest state (PluginData) into permanent vault artifacts:
//   1. Problem notes in {folder}/Contests/{slug}/ subfolder
//   2. Summary note at {folder}/Contests/{date}-{slug}.md
//   3. #revisit tags on missed problems
//
// Decision references:
//   D-09: ephemeral code buffers (PluginData) until contest end
//   D-12: lc-contest-id frontmatter on problem notes
//   D-13: merge strategy (AC overwrites ## Code; non-AC skips existing)
//   D-14: rich summary frontmatter
//   D-15: summary note location
//   D-17: summary body (## Results table + ## Notes)
//   D-18: #revisit on missed problems (CONTEST-08)
//
// Threat mitigation:
//   T-10-10: contestSlug validated against /^(weekly|biweekly)-contest-\d+$/
//
// Conventions:
//   - vault.process for body writes (never vault.modify)
//   - processFrontMatter for all frontmatter mutations
//   - vault.create for new files

import type { App, TFile } from 'obsidian';
import { codeBlockFor, CODE_HEADING_LINE } from '../notes/NoteTemplate';
import type { ContestSession, ContestProblemState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Structural port for settings access. Matches SettingsStore's public surface. */
export interface ContestFinalizerSettings {
  getProblemsFolder(): string;
  getProblemDetail(slug: string): { id: number; title: string } | null;
}

/** Structural port for NoteWriter (only openOrCreateProblemNote needed). */
export interface ContestFinalizerNoteWriter {
  // Not used directly — we create notes ourselves for contest subfolder placement
}

/** Arguments for the finalization function. */
export interface FinalizeContestArgs {
  session: ContestSession;
  aborted: boolean;
  app: App;
  settings: ContestFinalizerSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slug validation (T-10-10)
// ─────────────────────────────────────────────────────────────────────────────

const CONTEST_SLUG_RE = /^(weekly|biweekly)-contest-\d+$/;

function validateContestSlug(slug: string): string {
  if (!CONTEST_SLUG_RE.test(slug)) {
    throw new Error(`Invalid contest slug: "${slug}" — must match (weekly|biweekly)-contest-\\d+`);
  }
  return slug;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map numeric difficulty (1/2/3) to display word. */
function difficultyWord(d: number): string {
  if (d === 1) return 'Easy';
  if (d === 2) return 'Medium';
  if (d === 3) return 'Hard';
  return 'Unknown';
}

/** Format milliseconds as "Xm Ys". */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

/** Format epoch ms relative to session start as "Xm Ys". */
function formatSolveTime(solvedAt: number, startedAt: number): string {
  const elapsed = solvedAt - startedAt;
  return formatDuration(Math.max(0, elapsed));
}

/** Compute total elapsed solving time (excludes paused time). */
export function computeElapsedMs(session: ContestSession): number {
  const now = session.isPaused ? (session.pausedAt ?? Date.now()) : Date.now();
  const elapsed = now - session.startedAt - session.pausedDuration;
  // Cap at configured duration
  return Math.min(Math.max(0, elapsed), session.duration * 1000);
}

/** Format a date string from epoch. */
function formatDate(epoch: number): string {
  const d = new Date(epoch);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// rewriteCodeSection — pure string transform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the `## Code` heading and replace the FIRST fenced code block after it
 * with the new code. If no `## Code` heading exists, appends one.
 *
 * Pure function — safe for vault.process callback.
 */
export function rewriteCodeSection(body: string, code: string, language: string): string {
  const lines = body.split('\n');
  const codeHeadingIdx = lines.findIndex((l) => l === CODE_HEADING_LINE);

  const newBlock = codeBlockFor(language, code);

  if (codeHeadingIdx === -1) {
    // No ## Code heading — append at end
    return body.trimEnd() + '\n\n' + CODE_HEADING_LINE + '\n' + newBlock + '\n';
  }

  // Find the first fenced code block after ## Code
  let fenceStart = -1;
  let fenceEnd = -1;
  for (let i = codeHeadingIdx + 1; i < lines.length; i++) {
    // Stop if we hit another H2
    if (/^## /.test(lines[i]!) && i !== codeHeadingIdx) break;
    if (fenceStart === -1 && /^```/.test(lines[i]!)) {
      fenceStart = i;
    } else if (fenceStart !== -1 && /^```\s*$/.test(lines[i]!)) {
      fenceEnd = i;
      break;
    }
  }

  if (fenceStart !== -1 && fenceEnd !== -1) {
    // Replace the existing fence
    const before = lines.slice(0, fenceStart);
    const after = lines.slice(fenceEnd + 1);
    return [...before, newBlock, ...after].join('\n');
  }

  // No fence found after ## Code — insert one right after the heading
  const before = lines.slice(0, codeHeadingIdx + 1);
  const after = lines.slice(codeHeadingIdx + 1);
  return [...before, newBlock, ...after].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSummaryBody — pure function for testability
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildSummaryBodyArgs {
  session: ContestSession;
  aborted: boolean;
  totalElapsedMs: number;
}

/**
 * Build the Markdown body for the contest summary note.
 * Pure function — no I/O, no side effects.
 */
export function buildSummaryBody(args: BuildSummaryBodyArgs): string {
  const { session, aborted, totalElapsedMs } = args;
  const lines: string[] = [];

  // H1: Contest title
  lines.push(`# ${session.contestTitle}`);
  lines.push('');

  // Aborted marker
  if (aborted) {
    const remainingMs = session.duration * 1000 - totalElapsedMs;
    const remainingTotalSec = Math.max(0, Math.round(remainingMs / 1000));
    const remainingMM = Math.floor(remainingTotalSec / 60);
    const remainingSS = remainingTotalSec % 60;
    const mmStr = String(remainingMM).padStart(2, '0');
    const ssStr = String(remainingSS).padStart(2, '0');
    lines.push(`**(aborted at ${mmStr}:${ssStr} remaining)**`);
    lines.push('');
  }

  // Score + duration
  const scored = session.problems
    .filter((p) => p.verdict === 'accepted')
    .reduce((sum, p) => sum + p.credit, 0);
  const total = session.problems.reduce((sum, p) => sum + p.credit, 0);
  const solvedCount = session.problems.filter((p) => p.verdict === 'accepted').length;

  lines.push(`**Score:** ${scored}/${total} (${solvedCount}/${session.problems.length} solved)`);
  lines.push('');
  lines.push(`**Duration:** ${formatDuration(totalElapsedMs)}`);
  lines.push('');

  // ## Results table
  lines.push('## Results');
  lines.push('');
  lines.push('| Problem | Difficulty | Verdict | Time | Points |');
  lines.push('| ------- | ---------- | ------- | ---- | ------ |');

  for (const p of session.problems) {
    const link = `[[${p.slug}]]`;
    const diff = difficultyWord(p.difficulty);
    const verdict = p.verdict === 'accepted' ? 'Accepted'
      : p.verdict === 'attempted' ? 'Attempted'
      : 'Unsolved';
    const time = p.solvedAt ? formatSolveTime(p.solvedAt, session.startedAt) : '—';
    const points = p.verdict === 'accepted' ? String(p.credit) : '0';
    lines.push(`| ${link} | ${diff} | ${verdict} | ${time} | ${points} |`);
  }

  lines.push('');

  // ## Notes (empty — user fills)
  lines.push('## Notes');
  lines.push('');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main finalization function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finalize a contest session: batch-create problem notes, write summary note,
 * and tag missed problems with #revisit.
 *
 * @returns The path to the summary note (for Notice display in callers).
 */
export async function finalizeContest(args: FinalizeContestArgs): Promise<string> {
  const { session, aborted, app, settings } = args;

  // T-10-10: validate slug before path interpolation
  const safeSlug = validateContestSlug(session.contestSlug);

  // 1. Compute actual solving duration
  const totalElapsedMs = computeElapsedMs(session);

  // 2. Determine paths
  const folder = settings.getProblemsFolder().replace(/[\\/]+$/, '');
  const contestSubfolder = `${folder}/Contests/${safeSlug}`;

  // Ensure Contests/ and contest subfolder exist
  const contestsFolder = `${folder}/Contests`;
  await ensureFolder(app, contestsFolder);
  await ensureFolder(app, contestSubfolder);

  // 3. Process each problem with code
  const createdFiles: Map<string, TFile> = new Map();

  for (const problem of session.problems) {
    if (problem.code === '') continue; // skip problems with no code

    const detail = settings.getProblemDetail(problem.slug);
    if (!detail) continue; // defensive — should have been cached on start

    const notePath = `${contestSubfolder}/${detail.id}-${problem.slug}.md`;

    // Check for existing file at contest subfolder path
    let existingFile = app.vault.getAbstractFileByPath(notePath) as TFile | null;

    // Also check at normal problems folder path
    if (!existingFile) {
      const normalPath = `${folder}/${detail.id}-${problem.slug}.md`;
      existingFile = app.vault.getAbstractFileByPath(normalPath) as TFile | null;
    }

    if (existingFile) {
      // D-13 merge strategy
      if (problem.verdict === 'accepted') {
        // AC: overwrite ## Code section
        await app.vault.process(existingFile, (body) =>
          rewriteCodeSection(body, problem.code, problem.language),
        );
        // Apply lc-contest-id frontmatter
        await app.fileManager.processFrontMatter(existingFile, (fm: Record<string, unknown>) => {
          fm['lc-contest-id'] = safeSlug;
        });
        createdFiles.set(problem.slug, existingFile);
      }
      // Non-AC on existing file: DO NOT touch (D-13)
      // But still track for #revisit tagging
      createdFiles.set(problem.slug, existingFile);
    } else {
      // Create new note
      const body = buildContestProblemBody(problem);
      const file = await app.vault.create(notePath, body) as TFile;
      // Apply frontmatter
      await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm['lc-contest-id'] = safeSlug;
      });
      createdFiles.set(problem.slug, file);
    }
  }

  // 4. Tag missed problems with #revisit (CONTEST-08)
  for (const problem of session.problems) {
    if (problem.verdict === 'accepted') continue;

    const file = createdFiles.get(problem.slug);
    if (!file) continue;

    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      const tags = Array.isArray(fm.tags)
        ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      if (!tags.includes('revisit')) {
        tags.push('revisit');
      }
      fm.tags = tags;
    });
  }

  // 5. Write summary note
  const dateStr = formatDate(session.startedAt);
  const summaryPath = `${contestsFolder}/${dateStr}-${safeSlug}.md`;

  const summaryBody = buildSummaryBody({ session, aborted, totalElapsedMs });
  const summaryFile = await app.vault.create(summaryPath, summaryBody) as TFile;

  // Apply summary frontmatter (D-14)
  const scored = session.problems
    .filter((p) => p.verdict === 'accepted')
    .reduce((sum, p) => sum + p.credit, 0);
  const solvedCount = session.problems.filter((p) => p.verdict === 'accepted').length;

  await app.fileManager.processFrontMatter(summaryFile, (fm: Record<string, unknown>) => {
    fm['lc-contest-id'] = safeSlug;
    fm['lc-contest-type'] = session.contestType;
    fm['date'] = dateStr;
    fm['duration'] = Math.round(totalElapsedMs / 1000);
    fm['score'] = scored;
    fm['solved-count'] = solvedCount;
    fm['problems'] = session.problems.map((p) => p.slug);
  });

  // 6. Return summary note path
  return summaryPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal problem note body for contest-created notes. */
function buildContestProblemBody(problem: ContestProblemState): string {
  const codeBlock = codeBlockFor(problem.language, problem.code);
  return `## Problem\n\n\n\n${CODE_HEADING_LINE}\n${codeBlock}\n\n## Notes\n\n`;
}

/** Ensure a folder exists in the vault; handle "already exists" gracefully. */
async function ensureFolder(app: App, path: string): Promise<void> {
  if (app.vault.getAbstractFileByPath(path)) return;
  try {
    await app.vault.createFolder(path);
  } catch {
    // Folder may have been created concurrently — swallow EEXIST-like errors
  }
}
