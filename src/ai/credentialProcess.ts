// src/ai/credentialProcess.ts
//
// Phase 08.2 Plan 01 — credential_process command parser + spawnSync runner +
// cache with concurrent coalescing.
//
// Stub for Task 1 (full implementation in Task 2).

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export function parseCommandLine(_s: string): { command: string; args: string[] } {
  throw new Error('Not implemented — Task 2');
}

/**
 * Synchronous cache-check + spawn for credential_process.
 * Called by resolveAwsCredentials (which is synchronous).
 * Uses spawnSync internally — the sync nature is by design.
 */
export function getCachedOrRefreshSync(
  _profileName: string,
  _credentialProcessValue: string,
): ResolvedCredentials {
  throw new Error('Not implemented — Task 2');
}

/**
 * Async wrapper around getCachedOrRefreshSync for concurrent coalescing.
 * External callers that need Promise-based access use this.
 */
export async function getCachedOrRefresh(
  profileName: string,
  credentialProcessValue: string,
): Promise<ResolvedCredentials> {
  return getCachedOrRefreshSync(profileName, credentialProcessValue);
}

export function clearCredentialProcessCache(): void {
  // no-op stub — Task 2
}
