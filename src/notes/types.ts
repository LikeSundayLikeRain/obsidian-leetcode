// src/notes/types.ts
// Barrel for notes-module types.
// DetailCacheEntry lives canonically in SettingsStore (data.json ownership),
// re-exported here so notes code imports from a single place.
export type { DetailCacheEntry } from '../settings/SettingsStore';
