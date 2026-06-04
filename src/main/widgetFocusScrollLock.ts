import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';

/**
 * Phase 22 -- BRAT issue #1 (brat-widget-enter-flicker).
 *
 * Symptom: typing in a widget while parent is scrolled to the bottom of an
 * empty `## Notes` section, pressing Enter causes the parent note to flicker.
 *
 * Root cause (confirmed by DevTools probe):
 *   When the embedded child EditorView grows by one line on Enter, Obsidian /
 *   CM6's measure-cycle write phase performs scroll-preservation by bumping
 *   the parent's `scrollDOM.scrollTop` by one parent line-height (~21px).
 *   Stack frame: `e.measure (app.js:1:475061) -> app.js:1:476856`. In the
 *   precondition (empty Notes body + scroll-at-bottom + focus inside widget)
 *   the bump is visible as a flicker.
 *
 * Fix strategy:
 *   1. Patch `Element.prototype.scrollTop` once at plugin load with a setter
 *      that absorbs writes when the target carries `data-lc-scroll-lock="1"`
 *      AND the global lock counter is > 0.
 *   2. A ViewPlugin instance maintains a sticky-focus state per parent
 *      EditorView via document-level focusin / focusout capture listeners
 *      (with a 100ms grace timer to absorb transient blurs during measure
 *      cycles -- see investigation notes).
 *   3. On focusin into a widget, increment the lock counter and tag the
 *      parent's scrollDOM. On focusout (after grace), decrement and clear
 *      the tag.
 *   4. CM6 may replace `view.scrollDOM` during heavy re-layouts; re-tag on
 *      every `update()` while focused so the data attribute survives DOM
 *      replacement.
 *
 * Earlier attempts:
 *   - Round 1: child-side `EditorView.scrollHandler` + `focus({preventScroll:true})`.
 *     Wrong layer -- the bump originates in the parent's measure cycle, not
 *     from the child's cursor scrollIntoView.
 *   - Round 2: `overflow-anchor: none` CSS. Wrong mechanism -- browser
 *     anchoring runs without firing scroll events; we observed explicit JS
 *     scrollTop writes.
 *   - Round 3: parent-scope ViewPlugin with `requestMeasure`-based revert
 *     gated on `document.activeElement`. Probe showed focus is temporarily
 *     OUTSIDE the widget at the moment the bump fires, so the gate let it
 *     through.
 *   - Round 4: per-instance scrollTop accessor on `view.scrollDOM`. Probe
 *     showed CM6 replaces the scrollDOM element during heavy re-layouts,
 *     dropping the per-instance descriptor.
 */

const LOCK_ATTR = 'data-lc-scroll-lock';
const LOCK_VALUE = '1';

let prototypePatchInstalled = false;
let originalScrollTopSetter: ((this: Element, v: number) => void) | null = null;
let originalScrollTopGetter: ((this: Element) => number) | null = null;
let activeLockCount = 0;

function installPrototypePatch(): void {
  if (prototypePatchInstalled) return;
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  if (!desc || !desc.get || !desc.set) return;
  originalScrollTopGetter = desc.get;
  originalScrollTopSetter = desc.set;
  Object.defineProperty(Element.prototype, 'scrollTop', {
    get(this: Element) {
      return originalScrollTopGetter!.call(this);
    },
    set(this: Element, v: number) {
      if (
        activeLockCount > 0 &&
        this instanceof HTMLElement &&
        this.getAttribute(LOCK_ATTR) === LOCK_VALUE
      ) {
        return;
      }
      originalScrollTopSetter!.call(this, v);
    },
    configurable: true,
  });
  prototypePatchInstalled = true;
}

export const widgetFocusScrollLock = ViewPlugin.fromClass(
  class implements PluginValue {
    private readonly view: EditorView;
    private widgetFocused = false;
    private blurGraceTimer: number | null = null;
    private readonly onFocusIn: (e: FocusEvent) => void;
    private readonly onFocusOut: (e: FocusEvent) => void;

    constructor(view: EditorView) {
      this.view = view;
      installPrototypePatch();

      this.onFocusIn = (e: FocusEvent) => {
        const tgt = e.target;
        if (!(tgt instanceof HTMLElement)) return;
        if (!tgt.closest('.lc-nested-editor')) return;
        if (!view.dom.contains(tgt)) return;
        if (this.blurGraceTimer !== null) {
          window.clearTimeout(this.blurGraceTimer);
          this.blurGraceTimer = null;
        }
        if (!this.widgetFocused) {
          this.widgetFocused = true;
          activeLockCount += 1;
        }
        view.scrollDOM.setAttribute(LOCK_ATTR, LOCK_VALUE);
      };

      this.onFocusOut = (e: FocusEvent) => {
        const tgt = e.target;
        if (!(tgt instanceof HTMLElement)) return;
        if (!tgt.closest('.lc-nested-editor')) return;
        if (this.blurGraceTimer !== null) {
          window.clearTimeout(this.blurGraceTimer);
        }
        this.blurGraceTimer = window.setTimeout(() => {
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            active.closest('.lc-nested-editor') &&
            view.dom.contains(active)
          ) {
            this.blurGraceTimer = null;
            return;
          }
          if (this.widgetFocused) {
            this.widgetFocused = false;
            activeLockCount = Math.max(0, activeLockCount - 1);
          }
          view.scrollDOM.removeAttribute(LOCK_ATTR);
          this.blurGraceTimer = null;
        }, 100);
      };

      document.addEventListener('focusin', this.onFocusIn, true);
      document.addEventListener('focusout', this.onFocusOut, true);
    }

    update(_update: ViewUpdate): void {
      if (this.widgetFocused && this.view.scrollDOM.getAttribute(LOCK_ATTR) !== LOCK_VALUE) {
        this.view.scrollDOM.setAttribute(LOCK_ATTR, LOCK_VALUE);
      }
    }

    destroy(): void {
      document.removeEventListener('focusin', this.onFocusIn, true);
      document.removeEventListener('focusout', this.onFocusOut, true);
      if (this.widgetFocused) {
        activeLockCount = Math.max(0, activeLockCount - 1);
        this.widgetFocused = false;
      }
      this.view.scrollDOM.removeAttribute(LOCK_ATTR);
      if (this.blurGraceTimer !== null) {
        window.clearTimeout(this.blurGraceTimer);
        this.blurGraceTimer = null;
      }
    }
  }
);
