// Phase 5.3 (POLISH-09 / D-06..D-12) — Edit-Mode language chevron DOM builder.
//
// Renders the `[chevron-down {Language}]` chevron + 8-item dropdown that Phase 5.1's
// CodeActionsWidget mounts as the LEFT-aligned prefix in the `## Code` fence
// button row. Click-on-different-language calls `plugin.switchLanguage(file, slug)`
// which the LeetCodePlugin implementation (src/main.ts) wires to the atomic
// CM6 dispatch + processFrontMatter sequence (UI-SPEC §"Dropdown item click").
//
// CSP compliance (CLAUDE.md store-policy mandate):
//   - DOM built via `doc.createElement` + `textContent` exclusively
//   - No raw-HTML assignment, no inline script tags, no dynamic eval
//   - All Document access via the `doc` parameter (popout-window safe;
//     `obsidianmd/prefer-active-doc` lint rule); never reaches for the global doc
//
// Behavior contract (UI-SPEC §"Chevron click → dropdown open" + §"Dropdown
// item click → language switch"):
//   - Click chevron toggles dropdown; aria-expanded mirrors visibility
//   - Click on current language item is a no-op (no fetch, no dispatch, no Notice)
//   - Click on different language item calls plugin.switchLanguage(file, slug)
//   - Esc / outside-click dismisses the dropdown
//   - No `title` attribute (UI-SPEC §Copywriting "zero hover tooltip")
//
// G-DROPDOWN-CLIPPED portal pattern (Plan 05.3-08):
//   - The dropdown DOM node is portaled into `doc.body` while open, NOT left as
//     a descendant of the chevron `wrapper`. Reason: the chevron block widget
//     mounts inside CM6's `cm-content`, which sets `contain: paint`. CSS
//     containment of type `paint` clips ALL descendants outside the cm-content
//     box AND breaks hit-testing on those descendants regardless of z-index or
//     isolation. Plan 07's z-index: 9999 + isolation: isolate did NOT fix this;
//     `contain: paint` overrides stacking-order hit-test rules.
//   - openDropdown(): doc.body.appendChild(dropdown), then position via
//     button.getBoundingClientRect() with position: fixed inline style.
//   - closeDropdown(): symmetric detach (dropdown.remove()) + listener teardown.
//   - Outside-click dismissal checks BOTH wrapper.contains(target) AND
//     dropdown.contains(target) since the dropdown is no longer a descendant
//     of wrapper.
//   - Window scroll (capture phase) + resize listeners reposition the dropdown
//     while open; both detach on close (no listener leaks).

import type { Plugin, TFile } from 'obsidian';
import { setIcon } from 'obsidian';
import {
  LC_LANG_DISPLAY_LABELS,
  LC_CHEVRON_LANG_ORDER,
} from '../solve/languages';
import type { CodeBlockButtonRowHost } from './codeBlockButtonRow';

/**
 * Plugin host contract. Adds the chevron-specific switchLanguage method on top
 * of CodeBlockButtonRowHost. LeetCodePlugin satisfies this — switchLanguage is
 * implemented in src/main.ts (Task 3) as a wrapper around switchFenceLanguage.
 */
export interface LanguageChevronHost extends CodeBlockButtonRowHost {
  switchLanguage(file: TFile, newSlug: string): Promise<void>;
}

/**
 * Build the chevron DOM (button + dropdown) for the active fence's language.
 *
 * @param doc          The owning Document (use `view.dom.ownerDocument`,
 *                     never the renderer's global doc — popout-window safety).
 * @param plugin       Plugin satisfying the chevron host contract.
 * @param file         The active note's TFile (passed through to switchLanguage).
 * @param currentSlug  The note's current `lc-language` slug (e.g. 'python3').
 *                     Used for the chevron label, the .is-current marker on
 *                     the matching dropdown item, and the same-slug-no-op gate.
 * @returns A wrapper `<span>` containing the chevron button + dropdown div.
 */
export function buildLanguageChevron(
  doc: Document,
  plugin: Plugin & LanguageChevronHost,
  file: TFile,
  currentSlug: string,
): HTMLElement {
  const wrapper = doc.createElement('span');
  wrapper.className = 'leetcode-language-chevron-wrapper';

  // Chevron button — Lucide `chevron-down` icon span + label span sibling.
  // Phase 5.4 D-12b: literal Unicode down-triangle glyph swapped for setIcon('chevron-down')
  // so the chevron button reads as a select-input pill (matches FilterModal's
  // `.lc-fm__picker` shape). The icon and label live in separate child spans so
  // CSS can size/color them independently and tests can assert each surface.
  const button = doc.createElement('button');
  button.className = 'leetcode-language-chevron';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  // Icon-host span — setIcon mounts a Lucide SVG into this element.
  // CSP-safe: setIcon is Obsidian's sanctioned API (no innerHTML on our side).
  const iconSpan = doc.createElement('span');
  iconSpan.className = 'leetcode-language-chevron-icon';
  setIcon(iconSpan, 'chevron-down');
  button.appendChild(iconSpan);
  // Label span — textContent (NOT raw-HTML assignment) per CLAUDE.md store-policy.
  const labelSpan = doc.createElement('span');
  labelSpan.className = 'leetcode-language-chevron-label';
  labelSpan.textContent = LC_LANG_DISPLAY_LABELS[currentSlug] ?? currentSlug;
  button.appendChild(labelSpan);
  // Note: NO `title` attribute (UI-SPEC §Copywriting "Tooltip / hover hint: zero").
  wrapper.appendChild(button);

  // Dropdown popover — initially hidden via .is-hidden CSS class.
  const dropdown = doc.createElement('div');
  dropdown.className = 'leetcode-language-chevron-dropdown is-hidden';
  dropdown.setAttribute('role', 'listbox');

  // Outside-click handler — capture-phase listener attached to `doc` only
  // while the dropdown is open. Self-detaches when the dropdown closes.
  let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  // C6 — Esc dismissal — document-level keydown listener parallel to
  // outsideClickHandler. The button-level keydown handler at the bottom of
  // this function only fires when focus is on the chevron BUTTON; once the
  // dropdown opens and the user moves the mouse away, focus may shift and
  // Esc never reaches the button listener. The doc-level handler covers
  // every focus location while the dropdown is open and self-removes on close.
  let escKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  // G-DROPDOWN-CLIPPED — window-level scroll/resize handler that recomputes
  // the body-portaled dropdown's coordinates so it stays anchored to the
  // chevron button as the user scrolls or resizes the Obsidian window.
  // Native addEventListener (NOT plugin.registerDomEvent) is used because the
  // listener lifecycle is open-close-cycle scoped, not plugin-lifecycle scoped.
  let repositionHandler: (() => void) | null = null;

  // G-DROPDOWN-CLIPPED (Task 2) — Position the body-portaled dropdown directly
  // below the chevron button using viewport-relative coordinates from
  // button.getBoundingClientRect(). `position: fixed` is immune to scroll
  // containers' transforms (cm-scroller, etc.) so the dropdown lands exactly
  // under the button regardless of which scroll parent owns the chevron.
  // Top offset is 4px (UI-SPEC §Spacing `xs` token) — the same margin-top the
  // CSS rule `.leetcode-language-chevron-dropdown` set under the descendant
  // attach pattern.
  const positionDropdown = (): void => {
    const rect = button.getBoundingClientRect();
    // position:fixed is set via .leetcode-language-chevron-dropdown CSS rule.
    // top/left ARE dynamic per scroll/resize; setCssProps avoids the lint rule
    // against direct style assignment by routing through CSSStyleDeclaration's
    // setProperty (Obsidian-recommended for runtime-computed values).
    dropdown.style.setProperty('top', `${rect.bottom + 4}px`);
    dropdown.style.setProperty('left', `${rect.left}px`);
  };

  const closeDropdown = (): void => {
    dropdown.classList.add('is-hidden');
    button.setAttribute('aria-expanded', 'false');
    // G-DROPDOWN-CLIPPED — detach the body-portaled dropdown. Idempotent: a
    // second close call is a no-op because dropdown.parentElement will be null
    // after the first remove(). Guard with parent-presence check so we don't
    // throw if the dropdown was already detached (e.g., widget destroyed
    // mid-open).
    if (dropdown.parentElement === doc.body) {
      dropdown.remove();
    }
    if (outsideClickHandler) {
      doc.removeEventListener('click', outsideClickHandler, true);
      outsideClickHandler = null;
    }
    // C6 — remove the doc-level Esc handler so it doesn't leak across
    // open/close cycles or fire after the dropdown is already closed.
    if (escKeyHandler) {
      doc.removeEventListener('keydown', escKeyHandler, true);
      escKeyHandler = null;
    }
    // G-DROPDOWN-CLIPPED — remove scroll (capture phase) + resize listeners
    // and null out the closure reference so they don't leak across open/close
    // cycles. Capture phase MUST be passed to removeEventListener so it
    // matches the addEventListener signature in openDropdown().
    if (repositionHandler) {
      window.removeEventListener('scroll', repositionHandler, true);
      window.removeEventListener('resize', repositionHandler);
      repositionHandler = null;
    }
  };

  const openDropdown = (): void => {
    // G-DROPDOWN-CLIPPED — portal attach. The dropdown lives on doc.body
    // while open so it escapes the cm-content paint container's clip + hit
    // test boundary. Position is set in Task 2 via positionDropdown().
    doc.body.appendChild(dropdown);
    dropdown.classList.remove('is-hidden');
    button.setAttribute('aria-expanded', 'true');
    // G-DROPDOWN-CLIPPED — set viewport-relative coordinates AFTER display:block
    // so getBoundingClientRect on the dropdown (if ever needed) would return
    // real values. Reading from `button` is safe any time the button is mounted.
    positionDropdown();
    // G-DROPDOWN-CLIPPED — attach scroll + resize listeners that recompute
    // the dropdown position so it tracks the chevron button as the editor
    // scrolls or the window resizes. Capture phase (`true`) for scroll so we
    // hear scroll events from nested scroll containers (e.g., cm-scroller)
    // even though those events do NOT bubble. Bubble phase for resize is
    // sufficient since resize fires only on window.
    repositionHandler = (): void => positionDropdown();
    window.addEventListener('scroll', repositionHandler, true);
    window.addEventListener('resize', repositionHandler);
    // The outside-click listener is attached synchronously (no setTimeout /
    // queueMicrotask). The click that OPENED the dropdown doesn't fire it
    // because, by the time the click bubbles to `doc`, the chevron button is
    // already inside `wrapper.contains(target)` (see guard below) — so the
    // open-click is treated as INSIDE and skipped. Any refactor that narrows
    // or moves the `wrapper.contains(target)` guard MUST defer this attach
    // (e.g. via `queueMicrotask`) to avoid an instant-close race.
    outsideClickHandler = (e: MouseEvent): void => {
      const target = e.target;
      // G-DROPDOWN-CLIPPED — dropdown is now portaled to doc.body (NOT a
      // descendant of wrapper), so the outside-click guard must check BOTH
      // wrapper.contains(target) AND dropdown.contains(target). Without the
      // dropdown.contains check, clicking a language item would satisfy
      // !wrapper.contains(target) and fire closeDropdown() in the capture
      // phase BEFORE the per-item click handler runs, racing with item
      // selection. Both Node.contains() calls work across DOM-tree fragments.
      if (
        target instanceof Node &&
        !wrapper.contains(target) &&
        !dropdown.contains(target)
      ) {
        closeDropdown();
      }
    };
    // Capture phase so we beat any nested click handler that might
    // stopPropagation() (matches UI-SPEC §Pitfall 7-equivalent posture).
    doc.addEventListener('click', outsideClickHandler, true);

    // C6 — Esc dismissal regardless of focus location. Capture-phase keydown
    // listener on `doc` so the dropdown closes whether focus is on the
    // chevron button, on a dropdown item, or anywhere else in the document.
    escKeyHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown();
      }
    };
    doc.addEventListener('keydown', escKeyHandler, true);
  };

  for (const slug of LC_CHEVRON_LANG_ORDER) {
    const item = doc.createElement('button');
    item.className = 'leetcode-language-chevron-item';
    item.setAttribute('role', 'option');
    const itemLabel = LC_LANG_DISPLAY_LABELS[slug] ?? slug;
    item.textContent = itemLabel;
    if (slug === currentSlug) {
      item.classList.add('is-current');
    }
    item.addEventListener('click', (e) => {
      // CM6 selection-bleed prevention (RESEARCH §Pitfall 3 from Phase 5.1).
      e.preventDefault();
      e.stopPropagation();
      // Close the dropdown FIRST (UI-SPEC §"Dropdown item click" Step 1 —
      // instant close gives the user tactile confirmation of selection
      // even before any async work resolves).
      closeDropdown();
      // No-op when the user picks the current language (UI-SPEC §"State machine"
      // — "click current language item → back to CLOSED, no further action").
      if (slug !== currentSlug) {
        void plugin.switchLanguage(file, slug);
      }
    });
    dropdown.appendChild(item);
  }

  // G-DROPDOWN-CLIPPED — dropdown is NOT appended to wrapper. It is portaled
  // to doc.body in openDropdown() and detached in closeDropdown() so it lives
  // outside the cm-content paint container.

  // G-CLICK-THROUGH — pointerdown stopPropagation. CM6's caret-positioning
  // runs on `pointerdown` (which fires BEFORE the per-item `click` handlers),
  // so the per-item `click`-time preventDefault/stopPropagation is too late
  // to keep the caret from jumping. `pointerdown` covers mouse + touch + pen
  // in one listener (Obsidian/CM6 v6 dispatches pointerdown before mousedown).
  //
  // The wrapper listener catches pointerdown on the chevron BUTTON. The
  // dropdown listener catches pointerdown on every dropdown ITEM. The two
  // listeners are needed because the dropdown is portaled to doc.body
  // (G-DROPDOWN-CLIPPED) so it is no longer a wrapper descendant — a single
  // wrapper-level listener would miss item events.
  const stopPointerdown = (e: PointerEvent | Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  wrapper.addEventListener('pointerdown', stopPointerdown);
  dropdown.addEventListener('pointerdown', stopPointerdown);

  // Chevron button toggles dropdown.
  button.addEventListener('click', (e) => {
    // Same selection-bleed prevention as the dropdown items.
    e.preventDefault();
    e.stopPropagation();
    if (dropdown.classList.contains('is-hidden')) {
      openDropdown();
    } else {
      closeDropdown();
    }
  });

  // Esc dismissal — minimal keyboard support per UI-SPEC §Accessibility.
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dropdown.classList.contains('is-hidden')) {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
    }
  });

  return wrapper;
}
