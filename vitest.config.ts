import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // Phase 3 Plan 06: happy-dom provides the global `document` / `HTMLElement`
    // that the verdict-modal renderer tests need. Happy-dom is a superset of
    // Node's global surface for our purposes, so Node-environment tests from
    // earlier phases continue to work unchanged.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'main.js', 'dist'],
    reporters: ['default'],
    setupFiles: ['./tests/helpers/setup.ts'],
  },
  resolve: {
    alias: {
      // `obsidian` npm package ships types only (main: "") — no runtime entry.
      // Route source-level `import { Notice } from 'obsidian'` (and friends) to
      // a minimal class-shape stub so Vitest can resolve the import. Tests that
      // need real behavior override individual exports via `vi.mock('obsidian', …)`.
      obsidian: fileURLToPath(new URL('./tests/helpers/obsidian-stub.ts', import.meta.url)),
    },
  },
});
