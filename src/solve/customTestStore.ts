// src/solve/customTestStore.ts
//
// Phase 3 — vault wrappers + object-shape facade around the pure CaseRegion
// transforms. CustomTestModal (this plan) and Plan 07 wiring consume this
// module; CaseRegion.ts stays zero-I/O and string-in/string-out.
//
// Two surfaces:
//   1. readCases / writeCases  — pure { input }[] facade over CaseRegion
//      (delegates to the pure transforms; keeps the in-memory model identical
//      to the modal's tab state)
//   2. readCasesFromVault / writeCasesToVault — async vault wrappers that
//      read/write the problem note via vault.read / vault.process (CF-06
//      compliance — vault.process only; never the banned mutator API)
//
// Purity note: readCases / writeCases are pure string-in/string-out; safe
// inside the vault.process callback (which may be retried on conflict).

import type { App, TFile } from 'obsidian';
import {
  readCases as readCasesRaw,
  writeCases as writeCasesRaw,
} from './CaseRegion';
import { logger } from '../shared/logger';

export interface CustomTestCase {
  input: string;
}

// ── Pure facade ───────────────────────────────────────────────────────────

/** Parse the `## Custom Tests` section into an object-shape case list. */
export function readCases(body: string): CustomTestCase[] {
  return readCasesRaw(body).map((input) => ({ input }));
}

/** Render the `## Custom Tests` section from an object-shape case list. */
export function writeCases(body: string, cases: CustomTestCase[]): string {
  return writeCasesRaw(body, cases.map((c) => c.input));
}

// ── Vault wrappers ────────────────────────────────────────────────────────

/**
 * Read the current cases from a problem note. Silent on read failure
 * (returns []) — caller (CustomTestModal) treats missing cases as "first
 * open" and seeds from exampleTestcases instead.
 */
export async function readCasesFromVault(
  app: App,
  file: TFile,
): Promise<CustomTestCase[]> {
  try {
    const body = await app.vault.read(file);
    return readCases(body);
  } catch (err) {
    logger.debug('solve.customTestStore.read: non-fatal failure', err);
    return [];
  }
}

/**
 * Persist cases to the problem note via vault.process (atomic, retry-safe).
 * Throws on write failure — caller (CustomTestModal.onClose) logs at debug
 * and swallows. Idempotent: writing the same cases twice produces identical
 * file content.
 */
export async function writeCasesToVault(
  app: App,
  file: TFile,
  cases: CustomTestCase[],
): Promise<void> {
  await app.vault.process(file, (current) => writeCases(current, cases));
}
