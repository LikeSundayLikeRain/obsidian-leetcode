// tests/helpers/obsidian-stub.ts
// Minimal runtime stub for the `obsidian` package so Vitest can resolve
// `import { Notice } from 'obsidian'` (and friends) from source modules.
//
// The real `obsidian` npm package ships types ONLY (`main: ""`) — it has no
// runtime entry, which is why Vite fails with "Failed to resolve entry for
// package obsidian" when a source file statically imports a runtime value
// (e.g. `Notice`, `TFile`) from it.
//
// Tests that actually EXERCISE Notice / TFile behavior still use `vi.mock`
// to substitute richer fakes (see re-open-silent-offline.test.ts,
// new-note-fetch-failure.test.ts). This stub just makes `import` resolution
// succeed so tests that never touch Notice can still run.
//
// Wired into vitest.config.ts via `resolve.alias`.

export class Notice {
  constructor(public readonly message: string, public readonly timeout?: number) {
    // no-op; tests that care about Notice behavior replace this class via vi.mock.
  }
}

// TFile is used purely as a type in our source today, but we export a class
// stub anyway so `import { TFile }` resolves and `instanceof TFile` doesn't
// crash (it simply returns false for mocked plain-object files).
export class TFile {
  path!: string;
  name!: string;
  extension!: string;
  parent!: unknown;
}

export class TFolder {
  path!: string;
  name!: string;
  children!: unknown[];
}

// requestUrl is used by src/api/requestUrlFetcher.ts; tests that hit that path
// (fetcher-install.test.ts) override this via vi.mock.
export const requestUrl = async (_arg: unknown): Promise<unknown> => {
  throw new Error('obsidian-stub: requestUrl called without a test-level vi.mock');
};

// Plugin / PluginSettingTab / Modal / Setting / WorkspaceLeaf / App /
// MarkdownView — all used as type imports in source today. Exporting class
// stubs keeps `import { X }` resolution happy for future tests that might
// import concrete values.
export class Plugin {}
export class PluginSettingTab {}
export class Modal {}
export class Setting {}
export class WorkspaceLeaf {}
export class App {}
export class MarkdownView {}
export class ItemView {}
export class FileManager {}
export class Vault {}
export class Workspace {}
