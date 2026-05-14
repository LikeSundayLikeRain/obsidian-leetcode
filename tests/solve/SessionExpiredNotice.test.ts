// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-02 D-21 — the existing session-expiry Notice gains a
// clickable `Log in` action. Copy (CF-04) stays LOCKED:
// `LeetCode session expired. Log in again.` — only the interaction changes.
// Turns green when Plan 03 ships `showSessionExpiredNotice(onLogin)` as a
// helper in src/solve/SessionExpiredNotice.ts (or equivalent location).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture every Notice construction so we can assert on the DocumentFragment
// contents + the timeout argument. The real Notice hides itself on .hide();
// our fake exposes a spy so the sequence (click → hide → login) is assertable.
interface CapturedNotice {
  message: DocumentFragment | string;
  timeout: number | undefined;
  messageEl: HTMLElement;
  hide: ReturnType<typeof vi.fn>;
}
const capturedNotices: CapturedNotice[] = [];

vi.mock('obsidian', () => {
  class Notice {
    messageEl: HTMLElement;
    hide: ReturnType<typeof vi.fn>;
    constructor(
      public readonly message: DocumentFragment | string,
      public readonly timeout?: number,
    ) {
      this.messageEl = document.createElement('div');
      if (message instanceof DocumentFragment) {
        // Real Obsidian appends the DocumentFragment into the notice container.
        this.messageEl.appendChild(message);
      } else {
        this.messageEl.textContent = message;
      }
      this.hide = vi.fn();
      capturedNotices.push({
        message,
        timeout,
        messageEl: this.messageEl,
        hide: this.hide,
      });
    }
  }
  return { Notice };
});

describe('Phase 5 SessionExpiredNotice (D-21 + CF-04)', () => {
  beforeEach(() => {
    capturedNotices.length = 0;
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('constructs Notice(frag, 0) containing CF-04 copy + a Log in button', async () => {
    // CF-04 LOCKED: `LeetCode session expired. Log in again.`
    // D-21: timeout 0 (manual dismissal) with a DocumentFragment body so the
    // action button can be interactive — Notice's string-message overload
    // doesn't allow embedded click targets.
    const mod = (await import('../../src/solve/SessionExpiredNotice')) as unknown as {
      showSessionExpiredNotice?: (login: () => void) => { hide(): void };
    };
    expect(typeof mod.showSessionExpiredNotice).toBe('function');

    const login = vi.fn();
    mod.showSessionExpiredNotice!(login);

    expect(capturedNotices).toHaveLength(1);
    const notice = capturedNotices[0]!;
    expect(notice.message).toBeInstanceOf(DocumentFragment);
    expect(notice.timeout).toBe(0);

    const root = notice.messageEl;
    // CF-04 copy — appears verbatim somewhere in the fragment.
    expect(root.textContent).toContain('LeetCode session expired. Log in again.');

    const button = root.querySelector('button.leetcode-notice-action.mod-cta');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('Log in');
  });

  it('clicking the Log in button invokes the provided login callback', async () => {
    const mod = (await import('../../src/solve/SessionExpiredNotice')) as unknown as {
      showSessionExpiredNotice?: (login: () => void) => { hide(): void };
    };
    expect(typeof mod.showSessionExpiredNotice).toBe('function');

    const login = vi.fn();
    mod.showSessionExpiredNotice!(login);
    const notice = capturedNotices[0]!;
    const button = notice.messageEl.querySelector(
      'button.leetcode-notice-action.mod-cta',
    );
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('clicking the Log in button calls notice.hide() BEFORE invoking login (sequence)', async () => {
    const mod = (await import('../../src/solve/SessionExpiredNotice')) as unknown as {
      showSessionExpiredNotice?: (login: () => void) => { hide(): void };
    };
    expect(typeof mod.showSessionExpiredNotice).toBe('function');

    const sequence: string[] = [];
    const login = vi.fn(() => {
      sequence.push('login');
    });
    mod.showSessionExpiredNotice!(login);
    const notice = capturedNotices[0]!;
    notice.hide.mockImplementation(() => {
      sequence.push('hide');
    });
    const button = notice.messageEl.querySelector(
      'button.leetcode-notice-action.mod-cta',
    );
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    expect(sequence).toEqual(['hide', 'login']);
  });
});
