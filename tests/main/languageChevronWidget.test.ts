// Phase 5.3 (POLISH-09 / D-06..D-12) — chevron DOM render + interaction coverage.
// Asserts UI-SPEC §"Dropdown item click → language switch" + §Copywriting Contract:
//   - Chevron renders `▼ {DisplayLabel}` from LC_LANG_DISPLAY_LABELS
//   - Click toggles dropdown via style.display + aria-expanded
//   - Click on different language item invokes plugin.switchLanguage(file, slug) once
//   - Click on currently-selected language item is a no-op (no fetch, no dispatch, no Notice)
//   - 8 dropdown items in LC_CHEVRON_LANG_ORDER
//
// Phase 5.3 Plan 08 (G-DROPDOWN-CLIPPED) — portal-pattern coverage:
//   - Dropdown is portaled to document.body when open (NOT a wrapper descendant)
//   - position: fixed + top/left from button.getBoundingClientRect()
//   - Window scroll/resize listeners attach on open and detach on close
//   - Outside-click handler dismisses on body click outside both wrapper + dropdown
//   - Existing tests use document-level dropdown queries (no wrapper.querySelector)
//     because the dropdown lives elsewhere in the DOM after portal.

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { buildLanguageChevron } from '../../src/main/languageChevronWidget';
import { LC_CHEVRON_LANG_ORDER } from '../../src/solve/languages';
import { createFakePlugin } from '../solve/mocks/fakeWorkspace';
import type { TFile } from 'obsidian';

type HostPlugin = Parameters<typeof buildLanguageChevron>[1];

function makeHost(switchLanguage = vi.fn()): {
  plugin: HostPlugin;
  switchLanguage: ReturnType<typeof vi.fn>;
} {
  const plugin = createFakePlugin() as unknown as Record<string, unknown>;
  plugin.runFromActive = vi.fn();
  plugin.submitFromActive = vi.fn();
  plugin.switchLanguage = switchLanguage;
  return {
    plugin: plugin as unknown as HostPlugin,
    switchLanguage,
  };
}

const FAKE_FILE = { path: 'LeetCode/0001-two-sum.md' } as unknown as TFile;

// G-DROPDOWN-CLIPPED — the dropdown is portaled to document.body when open
// (NOT a wrapper descendant). Tests must query at document-level. This helper
// returns the singleton dropdown if one exists in the document tree.
function findDropdown(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(
    'div.leetcode-language-chevron-dropdown',
  );
}

// Cleanup: ensure no stray body-portaled dropdowns leak across tests. Each
// test that opens the dropdown is expected to close it explicitly, but this
// safety net catches any oversight to avoid cross-test pollution.
afterEach(() => {
  document
    .querySelectorAll('div.leetcode-language-chevron-dropdown')
    .forEach((el) => el.remove());
  document
    .querySelectorAll('span.leetcode-language-chevron-wrapper')
    .forEach((el) => el.remove());
});

describe('buildLanguageChevron DOM render', () => {
  // Phase 5.4 D-12b — chevron glyph swaps from literal Unicode `▼` to a
  // Lucide `chevron-down` icon span sibling of the label span. Tests now
  // assert the (label-span text + icon-span presence) shape rather than
  // the literal `▼ {label}` textContent. RED until Plan 04 ships the swap.
  it('renders Python 3 label + icon-child when currentSlug = python3 (G-PYTHON-LABEL disambiguation; D-12b)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');

    expect(wrapper.classList.contains('leetcode-language-chevron-wrapper')).toBe(true);
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    expect(button).not.toBeNull();
    const labelSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-label');
    expect(labelSpan?.textContent).toBe('Python 3');
    const iconSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-icon');
    expect(iconSpan).not.toBeNull();
  });

  it('renders Java label + icon-child when currentSlug = java (D-12b)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'java');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    const labelSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-label');
    expect(labelSpan?.textContent).toBe('Java');
    const iconSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-icon');
    expect(iconSpan).not.toBeNull();
  });

  it('renders C++ label + icon-child when currentSlug = cpp (D-12b)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'cpp');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    const labelSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-label');
    expect(labelSpan?.textContent).toBe('C++');
    const iconSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-icon');
    expect(iconSpan).not.toBeNull();
  });

  it('passes through unknown slug as raw label-span text + icon-child (no LC_LANG_DISPLAY_LABELS entry; D-12b)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'xyz');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    const labelSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-label');
    expect(labelSpan?.textContent).toBe('xyz');
    const iconSpan = button!.querySelector<HTMLSpanElement>('.leetcode-language-chevron-icon');
    expect(iconSpan).not.toBeNull();
  });

  it('button has aria-haspopup=listbox and aria-expanded=false initially', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });

  it('button does NOT have a title attribute (UI-SPEC §Copywriting "zero hover tooltip")', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.hasAttribute('title')).toBe(false);
  });

  it('dropdown is initially detached and has display=none + role=listbox once opened', () => {
    // G-DROPDOWN-CLIPPED — before open, the dropdown is not in the DOM at all
    // (portal pattern: only attached to body during open). After open, the
    // dropdown is in document.body with display=block. Closing detaches it.
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    // Initially detached — querySelector across document returns null.
    expect(findDropdown()).toBeNull();

    // Open: dropdown attaches to document.body.
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();
    const dropdown = findDropdown();
    expect(dropdown).not.toBeNull();
    expect(dropdown!.classList.contains('is-hidden')).toBe(false);
    expect(dropdown!.getAttribute('role')).toBe('listbox');

    // Cleanup.
    button!.click();
  });

  it('dropdown lists exactly 8 items in LC_CHEVRON_LANG_ORDER with role=option', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();
    const dropdown = findDropdown()!;
    const items = dropdown.querySelectorAll<HTMLButtonElement>(
      'button.leetcode-language-chevron-item',
    );

    expect(items.length).toBe(8);
    expect(items.length).toBe(LC_CHEVRON_LANG_ORDER.length);
    items.forEach((item) => expect(item.getAttribute('role')).toBe('option'));

    button!.click();
  });

  it('marks the currently-selected language item with .is-current', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'java');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();
    const dropdown = findDropdown()!;
    const items = Array.from(
      dropdown.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    // G-PYTHON-LABEL: python3 dropdown item now reads 'Python 3' (was 'Python').
    const pythonItem = items.find((it) => it.textContent === 'Python 3');

    expect(javaItem).toBeDefined();
    expect(javaItem!.classList.contains('is-current')).toBe(true);
    expect(pythonItem).toBeDefined();
    expect(pythonItem!.classList.contains('is-current')).toBe(false);

    button!.click();
  });
});

describe('buildLanguageChevron click toggles dropdown', () => {
  it('first click attaches dropdown to body with display=block; second click detaches', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(findDropdown()).toBeNull();
    button!.click();
    const dropdown = findDropdown();
    expect(dropdown).not.toBeNull();
    expect(dropdown!.classList.contains('is-hidden')).toBe(false);
    button!.click();
    // After close: dropdown detached from body.
    expect(findDropdown()).toBeNull();
  });

  it('updates aria-expanded matching dropdown visibility', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    expect(button!.getAttribute('aria-expanded')).toBe('false');
    button!.click();
    expect(button!.getAttribute('aria-expanded')).toBe('true');
    button!.click();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('buildLanguageChevron item click', () => {
  it('clicking a different language item invokes plugin.switchLanguage(file, slug) once', () => {
    const { plugin, switchLanguage } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    // Open dropdown first.
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();

    const dropdown = findDropdown()!;
    const items = Array.from(
      dropdown.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    expect(javaItem).toBeDefined();
    javaItem!.click();

    expect(switchLanguage).toHaveBeenCalledTimes(1);
    expect(switchLanguage).toHaveBeenCalledWith(FAKE_FILE, 'java');
  });

  it('clicking the currently-selected language is a no-op (no switchLanguage call)', () => {
    const { plugin, switchLanguage } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'java');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();

    const dropdown = findDropdown()!;
    const items = Array.from(
      dropdown.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    expect(javaItem).toBeDefined();
    expect(javaItem!.classList.contains('is-current')).toBe(true);
    javaItem!.click();

    expect(switchLanguage).not.toHaveBeenCalled();

    // Dropdown still closes (no spurious side effect — UI-SPEC §"State machine").
    expect(findDropdown()).toBeNull();
  });

  it('item click closes the dropdown (instant feedback per UI-SPEC §State machine)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();
    let dropdown = findDropdown();
    expect(dropdown).not.toBeNull();
    expect(dropdown!.classList.contains('is-hidden')).toBe(false);

    const items = Array.from(
      dropdown!.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    javaItem!.click();

    // Post-close: dropdown detached from body.
    dropdown = findDropdown();
    expect(dropdown).toBeNull();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });
});

// Phase 5.3 Plan 05 (gap-closure) — C6 Esc dismissal regression coverage.
describe('Esc dismissal (C6)', () => {
  it('Esc on document closes the dropdown regardless of focus location', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    // Open the dropdown via button click.
    button!.click();
    const dropdown = findDropdown();
    expect(dropdown).not.toBeNull();
    expect(dropdown!.classList.contains('is-hidden')).toBe(false);
    expect(button!.getAttribute('aria-expanded')).toBe('true');

    // Dispatch Escape on document (NOT on the button — focus may have moved).
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);

    // Post-close: dropdown detached from body.
    expect(findDropdown()).toBeNull();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc handler is removed when dropdown closes (no leak across open/close cycles)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');

    // Open then close via re-clicking the button (toggle close).
    button!.click();
    expect(findDropdown()).not.toBeNull();
    button!.click(); // toggle close
    expect(findDropdown()).toBeNull();
    expect(button!.getAttribute('aria-expanded')).toBe('false');

    // Now dispatch Escape on document — no observable change (handler removed).
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);

    // aria-expanded stays 'false'; no dropdown attached.
    expect(findDropdown()).toBeNull();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });
});

// Phase 5.3 Plan 05 (gap-closure) — G-CLICK-THROUGH dropdown caret bleed prevention.
describe('Click-through prevention (G-CLICK-THROUGH)', () => {
  it('pointerdown on dropdown item does NOT propagate to document (CM6 caret stays)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    // Open dropdown.
    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();

    // Document-level pointerdown spy. CM6 attaches its caret-positioning
    // handler at the document/editor-root level; if our wrapper-level capture
    // listener works, the document-level spy must NOT fire.
    const docSpy = vi.fn();
    document.addEventListener('pointerdown', docSpy);

    const dropdown = findDropdown()!;
    const items = Array.from(
      dropdown.querySelectorAll<HTMLButtonElement>('button.leetcode-language-chevron-item'),
    );
    const javaItem = items.find((it) => it.textContent === 'Java');
    expect(javaItem).toBeDefined();

    // happy-dom may not fully implement PointerEvent; fall back to a generic
    // bubbling Event with the same propagation semantics for this assertion.
    let pointerEvent: Event;
    try {
      pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    } catch {
      pointerEvent = new Event('pointerdown', { bubbles: true, cancelable: true });
    }
    javaItem!.dispatchEvent(pointerEvent);

    expect(docSpy).not.toHaveBeenCalled();

    document.removeEventListener('pointerdown', docSpy);
  });

  it('pointerdown on chevron button does NOT propagate to document', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const docSpy = vi.fn();
    document.addEventListener('pointerdown', docSpy);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    let pointerEvent: Event;
    try {
      pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    } catch {
      pointerEvent = new Event('pointerdown', { bubbles: true, cancelable: true });
    }
    button!.dispatchEvent(pointerEvent);

    expect(docSpy).not.toHaveBeenCalled();

    document.removeEventListener('pointerdown', docSpy);
  });
});

// Phase 5.3 Plan 08 (gap-closure) — G-DROPDOWN-CLIPPED portal-pattern coverage.
// The dropdown is portaled to document.body when open so it escapes the
// cm-content paint container's clip + hit-test boundary. These assertions
// are unit-level (happy-dom doesn't implement CSS containment hit-test rules,
// so the live-smoke checkpoint covers actual hit-testing in the dev vault).
describe('G-DROPDOWN-CLIPPED: portal pattern', () => {
  it('dropdown is a child of document.body when open (not a descendant of wrapper)', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();

    const dropdown = findDropdown();
    expect(dropdown).not.toBeNull();
    expect(dropdown!.parentElement).toBe(document.body);
    expect(wrapper.contains(dropdown)).toBe(false);

    button!.click();
  });

  it('dropdown is removed from document.body when closed', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron');
    button!.click();
    expect(findDropdown()).not.toBeNull();
    button!.click();

    // After close: the dropdown is no longer reachable from document — it has
    // been detached. parentElement should be null, and document-level query
    // returns no match.
    const stale = findDropdown();
    expect(stale).toBeNull();
  });

  // UAT 2026-05-14 — position:fixed migrated from inline style to the
  // .leetcode-language-chevron-dropdown CSS rule (eslint-plugin-obsidianmd
  // no-static-styles-assignment). top/left remain inline (runtime-computed
  // from getBoundingClientRect on every scroll/resize).

  it('dropdown.style.top is set from button.getBoundingClientRect().bottom + 4 when open', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron')!;
    // Stub getBoundingClientRect to return predictable values so the assertion
    // is deterministic regardless of happy-dom's layout-engine fidelity.
    const FAKE_RECT: DOMRect = {
      x: 100,
      y: 200,
      width: 80,
      height: 24,
      top: 200,
      left: 100,
      right: 180,
      bottom: 224,
      toJSON: () => ({}),
    } as DOMRect;
    button.getBoundingClientRect = () => FAKE_RECT;

    button.click();
    const dropdown = findDropdown()!;
    expect(dropdown.style.top).toBe(`${FAKE_RECT.bottom + 4}px`);

    button.click();
  });

  it('dropdown.style.left is set from button.getBoundingClientRect().left when open', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron')!;
    const FAKE_RECT: DOMRect = {
      x: 100,
      y: 200,
      width: 80,
      height: 24,
      top: 200,
      left: 100,
      right: 180,
      bottom: 224,
      toJSON: () => ({}),
    } as DOMRect;
    button.getBoundingClientRect = () => FAKE_RECT;

    button.click();
    const dropdown = findDropdown()!;
    expect(dropdown.style.left).toBe(`${FAKE_RECT.left}px`);

    button.click();
  });

  it('scroll listener on window is registered on open and removed on close', () => {
    // G-DROPDOWN-CLIPPED — scroll/resize listeners reposition the dropdown
    // while open. Both must register on open AND deregister on close, with
    // the SAME handler reference (otherwise removeEventListener would not
    // detach the listener and we'd leak across open/close cycles).
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron')!;
    button.click();

    // Find scroll add invocation. Capture-phase (third arg = true) is the
    // load-bearing flag — without it, scroll events from nested scroll
    // containers (cm-scroller) won't reach the listener.
    const scrollAdds = addSpy.mock.calls.filter((c) => c[0] === 'scroll');
    expect(scrollAdds.length).toBeGreaterThanOrEqual(1);
    const scrollHandler = scrollAdds[0]![1];
    expect(scrollAdds[0]![2]).toBe(true); // capture phase

    const resizeAdds = addSpy.mock.calls.filter((c) => c[0] === 'resize');
    expect(resizeAdds.length).toBeGreaterThanOrEqual(1);

    // Close the dropdown.
    button.click();

    // The same handler reference must be passed to removeEventListener.
    const scrollRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'scroll');
    expect(scrollRemoves.length).toBeGreaterThanOrEqual(1);
    expect(scrollRemoves.some((c) => c[1] === scrollHandler)).toBe(true);

    const resizeRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'resize');
    expect(resizeRemoves.length).toBeGreaterThanOrEqual(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('outside-click on document body (outside both wrapper and dropdown) closes the dropdown', () => {
    const { plugin } = makeHost();
    const { wrapper } = buildLanguageChevron(document, plugin, FAKE_FILE, 'python3');
    document.body.appendChild(wrapper);

    // Add an unrelated outside element to dispatch the click on.
    const outside = document.createElement('div');
    outside.id = 'unrelated-outside';
    document.body.appendChild(outside);

    const button = wrapper.querySelector<HTMLButtonElement>('button.leetcode-language-chevron')!;
    button.click();
    expect(findDropdown()).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    // Dispatch a real click on the unrelated element. Outside-click handler
    // is registered with capture: true, so any bubbling click anywhere in
    // the document tree triggers the capture-phase listener on doc.
    outside.click();

    expect(findDropdown()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    document.body.removeChild(outside);
  });
});
