// src/solve/SessionExpiredNotice.ts
//
// Phase 5 Wave 2 (D-21) — DocumentFragment-based session-expired Notice.
// Corrected per RESEARCH §Pitfall 1: `Notice.addAction` does NOT exist in
// obsidian@1.12.3. The correct way to render an interactive Notice is to
// construct a DocumentFragment and hand it to `new Notice(frag, timeoutMs)` —
// Obsidian appends the fragment into the notice container and every
// descendant stays interactive for the notice's lifetime.
//
// D-21 locks three behaviours, each exercised by tests/solve/SessionExpiredNotice.test.ts:
//   1. Fragment text contains the CF-04 LOCKED copy verbatim:
//        "LeetCode session expired. Log in again."
//   2. Fragment carries a `<button class="leetcode-notice-action mod-cta">Log in</button>`
//      (`mod-cta` is reserved for auth CTAs per UI-SPEC §Color rule #2 — D-21
//      is the single exception; every other polish button stays neutral).
//   3. Clicking the button calls `notice.hide()` BEFORE `login()` so the
//      sticky notice dismisses first (prevents a second notice from stacking
//      on top if login() itself errors and the caller fires another one).
//
// Notice timeout is `0` (sticky) per Pitfall 7: auto-dismiss would hide the
// action affordance before the user has a chance to click it. The user MUST
// click Log in (which hides the notice) or click the notice's native close
// button to dismiss.
//
// Surface-agnostic by design (T-05-03-01 mitigation): the helper accepts a
// `login` callback rather than calling `AuthService.login()` directly. This
// forces the caller to pass the vetted BrowserWindow flow through explicit
// dependency injection — the helper itself never reaches into global plugin
// state and cannot be abused to open arbitrary URLs.

import { Notice } from 'obsidian';

/** Show the D-21 sticky Notice with a Log in button. Returns the `Notice`
 *  instance so callers who need to dismiss it programmatically (e.g. tests,
 *  or a follow-up auth event) can do so. The helper itself does not retain
 *  a reference — once the button is clicked the notice hides itself and is
 *  garbage-collectable. */
export function showSessionExpiredNotice(
  login: () => void | Promise<void>,
): Notice {
  // We use standard DOM methods (`document.createDocumentFragment`,
  // `document.createElement`) rather than Obsidian's createFragment / createEl
  // helpers because happy-dom (the test runtime) does not polyfill the latter
  // on DocumentFragment. Standard DOM methods produce byte-identical fragments
  // and survive both runtimes. The obsidianmd/prefer-create-el rule doesn't
  // account for the test-runtime constraint; suppressed inline.
  // eslint-disable-next-line obsidianmd/prefer-create-el, obsidianmd/prefer-active-doc -- happy-dom lacks createFragment polyfill
  const frag = document.createDocumentFragment();
  // CF-04 LOCKED copy — do NOT paraphrase. A trailing space separates copy
  // from the Log in button in the sticky notice. "LeetCode" is a proper-noun
  // brand name so the sentence-case lint is suppressed.
  // eslint-disable-next-line obsidianmd/prefer-create-el, obsidianmd/prefer-active-doc -- happy-dom lacks createEl polyfill on fragments
  const copy = document.createElement('span');
  // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC LOCKED: "LeetCode" proper-noun brand name (CF-04)
  copy.textContent = 'LeetCode session expired. Log in again.';
  frag.appendChild(copy);

  // eslint-disable-next-line obsidianmd/prefer-create-el, obsidianmd/prefer-active-doc -- happy-dom lacks createEl polyfill on fragments
  const spacer = document.createElement('span');
  spacer.textContent = ' ';
  frag.appendChild(spacer);

  // eslint-disable-next-line obsidianmd/prefer-create-el, obsidianmd/prefer-active-doc -- happy-dom lacks createEl polyfill on fragments
  const btn = document.createElement('button');
  btn.className = 'leetcode-notice-action mod-cta';
  btn.textContent = 'Log in';
  frag.appendChild(btn);

  // timeout: 0 → sticky (Pitfall 7). User MUST click Log in or close manually.
  const notice = new Notice(frag, 0);
  btn.addEventListener('click', () => {
    // Sequence matters (D-21 Test 3): hide() FIRST so the sticky notice is
    // gone before login() opens the BrowserWindow flow. Any rejection from
    // login() is swallowed here — the Notice helper is not responsible for
    // surfacing auth-flow errors; that is AuthService's job.
    notice.hide();
    void Promise.resolve(login()).catch(() => undefined);
  });
  return notice;
}
