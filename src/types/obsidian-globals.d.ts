// Ambient declarations for Obsidian's runtime-injected globals. The
// `obsidian` npm package documents these on `Window`/`Document`-shaped
// helpers but does not declare them on `globalThis`, so reads at the
// top-level of source modules need their types written down somewhere.
//
// Type fidelity matches Obsidian's own surface: `activeDocument` is a
// `Document` augmented with the `createEl` / `createDiv` / `createSpan` /
// `createFragment` helpers; `activeWindow` is the `Window` that hosts that
// document.

interface DomCreateOptions {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  type?: string;
  href?: string;
  prepend?: boolean;
  placeholder?: string;
  value?: string;
}

interface DomCreateHelpers {
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: DomCreateOptions,
  ): HTMLElementTagNameMap[K];
  createEl(tag: string, options?: DomCreateOptions): HTMLElement;
  createDiv(options?: DomCreateOptions | string): HTMLDivElement;
  createSpan(options?: DomCreateOptions | string): HTMLSpanElement;
  createFragment(): DocumentFragment;
}

declare global {
  // Polyfilled by Obsidian on Document; happy-dom is shimmed in tests/helpers/setup.ts.
  interface Document {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: DomCreateOptions,
    ): HTMLElementTagNameMap[K];
    createEl(tag: string, options?: DomCreateOptions): HTMLElement;
    createDiv(options?: DomCreateOptions | string): HTMLDivElement;
    createSpan(options?: DomCreateOptions | string): HTMLSpanElement;
    createFragment(): DocumentFragment;
  }

  // Same shorthand helpers exist on every Element so chained `parent.createDiv(...)`
  // compiles. Obsidian also exposes `el.empty()` / `el.addClass()` / etc.
  interface HTMLElement extends DomCreateHelpers {
    empty(): void;
    addClass(...cls: string[]): void;
    removeClass(...cls: string[]): void;
    setText(text: string): void;
    setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
  }

  // Obsidian assigns these on the global so plugins can reach the
  // currently-focused window/document (popout-window safe). Their identifiers
  // appear in eslint-plugin-obsidianmd's globals list; we declare them as
  // const bindings rather than augmenting `globalThis` so that bare reads
  // don't fall through to `unknown`.
  const activeDocument: Document;
  // The active window is the same Window prototype the host runs the plugin
  // in; it carries the standard Window members we need (setTimeout,
  // navigator, HTMLElement, ...) so we keep the type as `Window`.
  const activeWindow: Window;
}

export {};
