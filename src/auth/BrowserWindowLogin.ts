// src/auth/BrowserWindowLogin.ts
// ONLY file allowed to import electron (D-02, CF-06).
// All other files that need login MUST go through AuthService.
import type { AuthCookies } from './types';

// Minimal cookie shape from Electron's session.cookies.get() — we only need name + value.
export interface ElectronCookieShape {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/**
 * Pure helper — extracts LEETCODE_SESSION + csrftoken from an Electron cookie list.
 * Returns null if either cookie is missing. Exported for unit testing (AUTH-02).
 */
export function extractAuthCookies(cookies: ElectronCookieShape[]): AuthCookies | null {
  const lcSession = cookies.find((c) => c.name === 'LEETCODE_SESSION');
  const csrf = cookies.find((c) => c.name === 'csrftoken');
  if (!lcSession || !csrf) return null;
  return {
    LEETCODE_SESSION: lcSession.value,
    csrftoken: csrf.value,
  };
}

// -----------------------------------------------------------------------------
// Minimal structural types for the subset of Electron API we touch.
// We don't depend on `@types/electron` — Electron is external to the esbuild
// bundle and provided by the Obsidian host. Declaring the shapes we use keeps
// the `require('electron')` call strongly typed and avoids `unsafe` lint
// findings without pulling in the full Electron type package.
// -----------------------------------------------------------------------------
interface ElectronCookiesApi {
  get(filter: { domain?: string }): Promise<ElectronCookieShape[]>;
}
interface ElectronSession {
  cookies: ElectronCookiesApi;
}
interface ElectronWebContents {
  session: ElectronSession;
  on(event: string, listener: () => void): void;
}
interface ElectronBrowserWindow {
  webContents: ElectronWebContents;
  on(event: 'closed', listener: () => void): void;
  loadURL(url: string): Promise<void>;
  close(): void;
}
interface BrowserWindowOptions {
  width?: number;
  height?: number;
  show?: boolean;
  autoHideMenuBar?: boolean;
  webPreferences?: {
    partition?: string;
    nodeIntegration?: boolean;
    contextIsolation?: boolean;
  };
}
type BrowserWindowCtor = new (opts: BrowserWindowOptions) => ElectronBrowserWindow;
interface ElectronModule {
  BrowserWindow: BrowserWindowCtor;
}

/**
 * Opens an Electron BrowserWindow at LC's login page on a named session partition.
 * Polls session cookies on did-navigate and did-navigate-in-page events until both
 * LEETCODE_SESSION and csrftoken are present, then resolves with them.
 * Resolves `null` if the user closes the window without logging in (D-04 silent-cancel).
 *
 * CONTRACT:
 * - D-03: Cookie polling via did-navigate + did-navigate-in-page (dual listener per Pitfall 2).
 * - D-04: Window closed without cookies → resolve(null); caller emits Notice.
 * - Pitfall 3: webPreferences.partition uses a named persisted session to isolate
 *   cookies from other plugins.
 */
export function openLogin(): Promise<AuthCookies | null> {
  const electron = require('electron') as ElectronModule;
  const { BrowserWindow } = electron;

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 980,
      height: 720,
      show: true,
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:leetcode', // D-03 — isolated cookie jar (Pitfall 3)
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    let resolved = false;

    const safeClose = (): void => {
      // The window may already have been destroyed by the OS, a prior close(),
      // or a loadURL failure. Swallow so we never hand a rejected promise
      // back to the auth flow (CR-05).
      try { win.close(); } catch { /* already destroyed — closed event handles state */ }
    };

    // Register the 'closed' handler BEFORE loadURL. If loadURL synchronously
    // tears the window down before returning (rare but possible on invalid
    // URLs in some Electron builds), the silent-cancel path still fires.
    win.on('closed', () => {
      if (!resolved) {
        resolved = true;
        resolve(null); // D-04 silent-cancel
      }
    });

    const tryCapture = async (): Promise<void> => {
      try {
        const cookies = await win.webContents.session.cookies.get({
          domain: '.leetcode.com',
        });
        const extracted = extractAuthCookies(cookies);
        if (extracted && !resolved) {
          resolved = true;
          resolve(extracted);
          safeClose();
        }
      } catch {
        // Ignore transient cookie-get errors; next event will retry.
        // NEVER log the cookie list here — AUTH-06 (cookies never logged).
      }
    };

    win.webContents.on('did-navigate', () => {
      void tryCapture();
    });
    win.webContents.on('did-navigate-in-page', () => {
      void tryCapture();
    }); // SPA route change (Pitfall 2)

    // If loadURL rejects (network down, DNS failure, ERR_CERT_*, etc.) and
    // the window never emits 'closed' on its own, the caller's await would
    // hang forever. Catch, resolve null, and force-close so the auth flow
    // always settles (CR-05).
    win.loadURL('https://leetcode.com/accounts/login/').catch(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
      safeClose();
    });
  });
}
