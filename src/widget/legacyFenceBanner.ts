// src/widget/legacyFenceBanner.ts
//
// Phase 21 Plan 21-02 Task 2 — v1.2 → v1.3 migration banner. Three render
// branches per `mode`:
//   - 'manual-prompt'    Banner with "This note uses the v1.2 format." +
//                        [Migrate now] button + read-only <pre><code> of
//                        source. Used when autoMigrateOnOpen=OFF (D-auto-02).
//   - 'auto-migrating'   Banner only with "Migrating note to v1.3 format..."
//                        — no button, no read-only. Live Preview bridge
//                        during the migration window so the user never sees
//                        a 'no widget' transitional state (D-trigger-01).
//   - 'read-only-legacy' Static <pre><code> only — no banner. Reserved.
//
// Pattern S-07 — no innerHTML. createEl with text option (XSS-safe);
// happy-dom fallback to document.createElement + textContent (mirrors
// renderStaticFallback in src/widget/codeBlockProcessor.ts:42-69).
//
// CR-04 (Plan 21-07) — defensive `pre.createEl` chain in renderReadOnly +
// top-level try/catch wrap on mountLegacyFenceBanner with logger.debug +
// host.textContent fallback. Banner DOM never throws into the editor render
// cycle, even in non-Obsidian environments (test runners, iframes, popup
// windows where Obsidian's HTMLElement.prototype patches haven't fired).

import type { App, TFile } from 'obsidian';
import { migrateLegacyFenceIfNeeded } from './fenceMigrator';
import { logger } from '../shared/logger';

type CreateElFn = (
  tag: string,
  opts?: { text?: string; cls?: string },
) => HTMLElement;

interface BannerPlugin {
  app: App;
  settings: { getDefaultLanguage?(): string };
}

export type LegacyBannerMode =
  | 'auto-migrating'
  | 'manual-prompt'
  | 'read-only-legacy';

/**
 * Mount the migration banner into `host` per `mode`. Empties `host` first
 * so re-calls don't double-render. Click handler on [Migrate now] dispatches
 * `migrateLegacyFenceIfNeeded` with `force: true` (bypasses autoMigrateOnOpen
 * setting per D-auto-02); on success vault.on('modify') re-fires the post-
 * processor and the v1.3 widget mount path replaces this banner.
 */
export function mountLegacyFenceBanner(
  host: HTMLElement,
  source: string,
  file: TFile,
  plugin: BannerPlugin,
  mode: LegacyBannerMode,
): void {
  // CR-04 (Plan 21-07) — top-level try/catch around the entire mount body.
  // Any throw from empty(host), mk(...), renderReadOnly(...), or addEventListener
  // is logged at debug level and the host receives a plain-text source rendering
  // so the editor render cycle never breaks. The inner try around
  // host.textContent = source is paranoid (host could be detached or have a
  // non-writable textContent in degenerate test/iframe scenarios) — silently
  // swallow to guarantee no throw escapes.
  try {
    empty(host);
    if (mode === 'read-only-legacy') {
      renderReadOnly(host, source);
      return;
    }
    const banner = mk(host, 'div', {
      cls: `leetcode-migration-banner leetcode-migration-banner--${mode}`,
    });
    if (mode === 'auto-migrating') {
      mk(banner, 'p', {
        text: 'Migrating note to v1.3 format...',
        cls: 'leetcode-migration-banner__copy',
      });
      return;
    }
    // mode === 'manual-prompt'
    mk(banner, 'p', {
      text: 'This note uses the v1.2 format.',
      cls: 'leetcode-migration-banner__copy',
    });
    const button = mk(banner, 'button', {
      text: 'Migrate now',
      cls: 'leetcode-migration-banner__cta',
    }) as HTMLButtonElement;
    button.addEventListener('click', () => {
      void runMigrate(plugin, file);
    });
    renderReadOnly(host, source);
  } catch (err) {
    logger.debug('migration.legacyFenceBanner: mount failed', err);
    try {
      host.textContent = source;
    } catch {
      // host may be detached or have a non-writable textContent — defensive.
    }
  }
}

/** Click handler. Pattern S-05 silent-on-failure: log debug + leave banner
 *  mounted; user can retry via the command palette. */
async function runMigrate(plugin: BannerPlugin, file: TFile): Promise<void> {
  try {
    await migrateLegacyFenceIfNeeded(plugin.app, file, {
      force: true,
      autoMigrateOnOpen: true,
      defaultLanguage: plugin.settings.getDefaultLanguage?.() ?? 'python3',
    });
  } catch (err) {
    logger.debug('migration.legacyFenceBanner: click handler non-fatal failure', err);
  }
}

/** Render `<pre><code>{source}</code></pre>` via createEl + text option;
 *  happy-dom path uses document.createElement + textContent.
 *
 *  CR-04 (Plan 21-07) — defensive check on the chained createEl. When the
 *  outer host.createEl returns a `pre` element whose own `createEl` helper
 *  is undefined (non-Obsidian environments — test runners / iframes /
 *  popup windows where Obsidian's HTMLElement.prototype patches haven't
 *  fired), the chained call would throw `TypeError: Cannot read properties
 *  of undefined`. We extract `preCe` via optional chaining; if it's a
 *  function, invoke it; else fall through to `pre.textContent = source`
 *  so the source bytes are still rendered as plain text (no `<code>`
 *  wrapper but no throw either). */
function renderReadOnly(host: HTMLElement, source: string): void {
  const ce = (host as unknown as { createEl?: CreateElFn }).createEl;
  if (typeof ce === 'function') {
    const pre = ce.call(host, 'pre');
    const preCe = (pre as unknown as { createEl?: CreateElFn })?.createEl;
    if (typeof preCe === 'function') {
      preCe.call(pre, 'code', { text: source });
      return;
    }
    pre.textContent = source;
    return;
  }
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = source;
  pre.appendChild(code);
  host.appendChild(pre);
}

/** Empty `host` of all children — Obsidian `el.empty()` first, happy-dom
 *  loop fallback. */
function empty(host: HTMLElement): void {
  const fn = (host as unknown as { empty?: () => void }).empty;
  if (typeof fn === 'function') {
    fn.call(host);
    return;
  }
  while (host.firstChild) host.removeChild(host.firstChild);
}

/** createEl helper — Obsidian path when available, otherwise document
 *  helpers. NEVER assigns innerHTML. */
function mk(
  host: HTMLElement,
  tag: string,
  opts: { text?: string; cls?: string },
): HTMLElement {
  const ce = (host as unknown as { createEl?: CreateElFn }).createEl;
  if (typeof ce === 'function') return ce.call(host, tag, opts);
  const el = document.createElement(tag);
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.cls !== undefined) {
    for (const c of opts.cls.split(/\s+/).filter(Boolean)) el.classList.add(c);
  }
  host.appendChild(el);
  return el;
}
