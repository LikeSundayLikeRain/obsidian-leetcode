// src/contest/ContestFinalizer.ts
// Phase 10 Plan 06 stub — minimal interface so Plan 07 wiring compiles.
// Plan 06 will implement the full logic (note creation, summary writing,
// #revisit tagging). This stub satisfies the import contract from main.ts.
//
// Contract (from 10-07-PLAN.md interfaces):
//   finalizeContest(args) → Promise<string> (path to summary note)

import type { App } from 'obsidian';
import type { ContestSession } from './types';
import type { SettingsStore } from '../settings/SettingsStore';
import type { NoteWriter } from '../notes/NoteWriter';

export interface FinalizeContestArgs {
  session: ContestSession;
  aborted: boolean;
  app: App;
  settings: SettingsStore;
  noteWriter: NoteWriter;
}

/**
 * Finalize a contest session: write problem notes for all attempted problems,
 * create the summary note, and apply #revisit tags to missed problems.
 *
 * @returns Path to the created summary note.
 */
export async function finalizeContest(args: FinalizeContestArgs): Promise<string> {
  // Stub — Plan 06 will implement the full logic.
  // For now, return a placeholder path derived from the session slug.
  const folder = args.settings.getProblemsFolder();
  const date = new Date().toISOString().slice(0, 10);
  return `${folder}/Contests/${date}-${args.session.contestSlug}.md`;
}
