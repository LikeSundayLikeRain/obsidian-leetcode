// Vitest setup. Wires Obsidian's runtime-injected `activeDocument` and
// `activeWindow` globals onto happy-dom's `window` so source modules that
// reference them at lint-clean call sites resolve at runtime in unit tests.
// Production code routes through these for popout-window safety; tests
// mirror the API rather than diverging onto bare `globalThis.document` /
// `setTimeout` paths. We also polyfill Obsidian's DOM helpers (createDiv,
// createSpan, createEl) on the document and HTMLElement prototype so source
// modules can call them without runtime-pathway divergence between
// production and tests.
const g = window as unknown as {
  document?: Document;
  window?: Window;
  activeDocument?: Document;
  activeWindow?: Window;
};
if (g.document && !g.activeDocument) {
  g.activeDocument = g.document;
}
if (g.window && !g.activeWindow) {
  g.activeWindow = g.window;
}

interface DomHelperHost {
  createElement(tag: string): HTMLElement;
  appendChild?: (node: Node) => Node;
  ownerDocument?: Document;
}

interface CreateElOptions {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string>;
  type?: string;
  href?: string;
  title?: string;
  placeholder?: string;
  value?: string;
}

function applyOptions(el: HTMLElement, options?: CreateElOptions | string): void {
  if (!options) return;
  if (typeof options === 'string') {
    // String shorthand — Obsidian treats a bare string as className.
    el.className = options;
    return;
  }
  if (options.cls) {
    if (Array.isArray(options.cls)) el.className = options.cls.join(' ');
    else el.className = options.cls;
  }
  if (typeof options.text === 'string') el.textContent = options.text;
  if (options.attr) {
    for (const [k, v] of Object.entries(options.attr)) el.setAttribute(k, v);
  }
  if (typeof options.type === 'string') el.setAttribute('type', options.type);
  if (typeof options.href === 'string') el.setAttribute('href', options.href);
  if (typeof options.title === 'string') el.setAttribute('title', options.title);
  if (typeof options.placeholder === 'string') {
    el.setAttribute('placeholder', options.placeholder);
  }
  if (typeof options.value === 'string') el.setAttribute('value', options.value);
}

function installHelpers(
  target: DomHelperHost & Record<string, unknown>,
  doc: Document,
  autoAppend: boolean,
): void {
  if (typeof target.createDiv !== 'function') {
    target.createDiv = function (this: DomHelperHost, options?: CreateElOptions): HTMLElement {
      const el = doc.createElement('div');
      applyOptions(el, options);
      if (autoAppend && typeof this.appendChild === 'function') this.appendChild(el);
      return el;
    } as unknown;
  }
  if (typeof target.createSpan !== 'function') {
    target.createSpan = function (this: DomHelperHost, options?: CreateElOptions): HTMLElement {
      const el = doc.createElement('span');
      applyOptions(el, options);
      if (autoAppend && typeof this.appendChild === 'function') this.appendChild(el);
      return el;
    } as unknown;
  }
  if (typeof target.createEl !== 'function') {
    target.createEl = function (this: DomHelperHost, tag: string, options?: CreateElOptions): HTMLElement {
      const el = doc.createElement(tag);
      applyOptions(el, options);
      if (autoAppend && typeof this.appendChild === 'function') this.appendChild(el);
      return el;
    } as unknown;
  }
  // Phase 06 Plan 03 — polyfill `empty()`, `addClass()`, `removeClass()`,
  // `setText()`, `setAttribute helpers` so production source modules that
  // call them (e.g. ProblemBrowserView, ProblemPreviewView) can run under
  // happy-dom in unit tests without case-by-case mocking. Production
  // Obsidian ships these as runtime extensions on HTMLElement.prototype.
  if (typeof target.empty !== 'function') {
    target.empty = function (this: HTMLElement): void {
      while (this.firstChild) this.removeChild(this.firstChild);
    } as unknown;
  }
  if (typeof target.addClass !== 'function') {
    target.addClass = function (this: HTMLElement, ...classes: string[]): void {
      // Obsidian accepts multiple classes; happy-dom's classList.add does too.
      this.classList.add(...classes);
    } as unknown;
  }
  if (typeof target.removeClass !== 'function') {
    target.removeClass = function (this: HTMLElement, ...classes: string[]): void {
      this.classList.remove(...classes);
    } as unknown;
  }
  if (typeof target.setText !== 'function') {
    target.setText = function (this: HTMLElement, text: string): void {
      this.textContent = text;
    } as unknown;
  }
  if (typeof target.setCssStyles !== 'function') {
    target.setCssStyles = function (
      this: HTMLElement,
      styles: Record<string, string>,
    ): void {
      for (const [k, v] of Object.entries(styles)) {
        this.style.setProperty(k, v);
      }
    } as unknown;
  }
}

if (g.document) {
  const doc = g.document;
  // Document helpers do NOT auto-append (real Obsidian doesn't either —
  // appending to the document root is the caller's responsibility).
  installHelpers(doc as unknown as DomHelperHost & Record<string, unknown>, doc, false);
  // HTMLElement helpers DO auto-append to the receiver (matches the
  // production `parent.createDiv(...)` semantics).
  installHelpers(
    (g.window as unknown as { HTMLElement: { prototype: HTMLElement } }).HTMLElement
      .prototype as unknown as DomHelperHost & Record<string, unknown>,
    doc,
    true,
  );
  // Document also exposes `createFragment`. The native `createDocumentFragment`
  // is what happy-dom ships; alias it onto `createFragment` so source modules
  // calling `activeDocument.createFragment()` resolve.
  const docMaybe = doc as unknown as { createFragment?: () => DocumentFragment };
  if (typeof docMaybe.createFragment !== 'function') {
    docMaybe.createFragment = () => doc.createDocumentFragment();
  }
}
