// tests/ai/helpers/aiStreamModal-mocks.ts
//
// Phase 08 Plan 03 Task 2 — shared mock helpers for AIStreamModal tests.
//
// Provides:
//   - setupModalMocks(): vi.mock('obsidian') with a real-shape Modal class
//     that exposes contentEl + titleEl as inspectable HTMLElement DOM nodes,
//     plus an instrumented MarkdownRenderer.render that records call args so
//     tests can assert "render was called with the full buffer".
//   - makeStreamHandle(): builds a controlled AsyncIterable<string> the test
//     drives via push() / end() — used to simulate a streamText result's
//     textStream consumption from inside the modal's for-await loop.
//   - makeAIClient({ invokeStream, addCost? }): minimal AIClient stub
//     accepting just the methods AIStreamModal touches (invokeStream + addCost).
//   - getRenderCallCount() / getLastRenderArgs(): introspection helpers for
//     assertions about debounce + flush behavior.
//
// vitest's vi.mock factory must be hoisted; the helper exports
// `setupModalMocks()` that the calling test imports + invokes at module
// scope BEFORE any other import of AIStreamModal.

import { vi } from 'vitest';

interface RenderCall {
  app: unknown;
  markdown: string;
  el: HTMLElement;
  sourcePath: string;
  component: unknown;
}

const renderCalls: RenderCall[] = [];

export function getRenderCallCount(): number {
  return renderCalls.length;
}

export function getLastRenderArgs(): RenderCall | undefined {
  return renderCalls[renderCalls.length - 1];
}

export function clearRenderCalls(): void {
  renderCalls.length = 0;
}

/**
 * Hoisted obsidian mock — Modal + MarkdownRenderer + Component shapes
 * AIStreamModal touches. Mirrors `tests/ai/disclosure.test.ts:40-72` plus
 * a render-instrumented MarkdownRenderer.render that records call args
 * into the module-level `renderCalls` array.
 */
export function setupModalMocks(): void {
  vi.mock('obsidian', async () => {
    const actual = await import('../../helpers/obsidian-stub');

    function attachObsidianHelpers(el: HTMLElement): void {
      const elAny = el as unknown as {
        setText: (t: string) => void;
        addClass: (c: string) => void;
        createEl: (tag: string, opts?: { text?: string; cls?: string }) => HTMLElement;
        createDiv: (opts?: { cls?: string }) => HTMLElement;
        empty: () => void;
      };
      elAny.setText = function (this: HTMLElement, t: string): void {
        this.textContent = t;
      };
      elAny.addClass = function (this: HTMLElement, c: string): void {
        this.classList.add(c);
      };
      elAny.createEl = function (
        this: HTMLElement,
        tag: string,
        opts?: { text?: string; cls?: string },
      ): HTMLElement {
        const child = document.createElement(tag);
        if (opts?.text !== undefined) child.textContent = opts.text;
        if (opts?.cls) child.className = opts.cls;
        attachObsidianHelpers(child);
        this.appendChild(child);
        return child;
      };
      elAny.createDiv = function (
        this: HTMLElement,
        opts?: { cls?: string },
      ): HTMLElement {
        const child = document.createElement('div');
        if (opts?.cls) child.className = opts.cls;
        attachObsidianHelpers(child);
        this.appendChild(child);
        return child;
      };
      elAny.empty = function (this: HTMLElement): void {
        while (this.firstChild) this.removeChild(this.firstChild);
      };
    }

    class Modal {
      public app: unknown;
      public contentEl: HTMLElement;
      public titleEl: HTMLElement;
      constructor(app: unknown) {
        this.app = app;
        this.contentEl = document.createElement('div');
        this.titleEl = document.createElement('div');
        attachObsidianHelpers(this.contentEl);
        attachObsidianHelpers(this.titleEl);
      }
      open(): void {}
      close(): void {
        const maybeClose = (this as unknown as { onClose?: () => void }).onClose;
        if (typeof maybeClose === 'function') maybeClose.call(this);
      }
    }

    class Component {
      load(): void {}
      unload(): void {}
      addChild<T>(c: T): T { return c; }
    }

    const MarkdownRenderer = {
      async render(
        app: unknown,
        markdown: string,
        el: HTMLElement,
        sourcePath: string,
        component: unknown,
      ): Promise<void> {
        renderCalls.push({ app, markdown, el, sourcePath, component });
        // Render the markdown as a single text node so the body has *some*
        // content for tests that inspect bodyEl.textContent. Tests that
        // assert "first chunk replaces Thinking…" can simply check that
        // the .leetcode-ai-stream-thinking child is gone after a chunk.
        const node = document.createElement('div');
        node.className = 'lc-test-rendered-markdown';
        node.textContent = markdown;
        el.appendChild(node);
      },
    };

    return {
      ...actual,
      Modal,
      Component,
      MarkdownRenderer,
    };
  });
}

/**
 * Build a controlled AsyncIterable<string> the test drives via push()/end().
 * Mirrors the streamText `result.textStream` shape that the modal consumes
 * via `for await (const chunk of textStream)`.
 *
 * Methods are arrow-function-typed (NOT method shorthand) so destructuring
 * (`const { push, end } = makeStreamHandle()`) doesn't trip
 * `@typescript-eslint/unbound-method`.
 */
export interface StreamHandle {
  // eslint-disable-next-line no-undef -- AsyncIterable is a TS lib type
  iterator: AsyncIterable<string>;
  push: (chunk: string) => void;
  end: () => void;
  abort: (reason?: Error) => void;
  getUsage: () => { inputTokens?: number; outputTokens?: number } | undefined;
}

export function makeStreamHandle(): StreamHandle {
  const queue: string[] = [];
  let ended = false;
  let aborted: Error | null = null;
  const waiters: Array<{
    resolve: (v: IteratorResult<string>) => void;
    reject: (e: Error) => void;
  }> = [];

  const next = (): Promise<IteratorResult<string>> =>
    new Promise((resolve, reject) => {
      if (aborted) {
        reject(aborted);
        return;
      }
      if (queue.length > 0) {
        resolve({ value: queue.shift()!, done: false });
        return;
      }
      if (ended) {
        resolve({ value: undefined, done: true });
        return;
      }
      waiters.push({ resolve, reject });
    });

  const push = (chunk: string): void => {
    const w = waiters.shift();
    if (w) {
      w.resolve({ value: chunk, done: false });
    } else {
      queue.push(chunk);
    }
  };

  const end = (): void => {
    ended = true;
    while (waiters.length > 0) {
      const w = waiters.shift()!;
      w.resolve({ value: undefined, done: true });
    }
  };

  const abort = (reason?: Error): void => {
    const err = reason ?? new Error('aborted');
    aborted = err;
    while (waiters.length > 0) {
      const w = waiters.shift()!;
      w.reject(err);
    }
  };

  const getUsage = (): { inputTokens?: number; outputTokens?: number } => ({
    inputTokens: 100,
    outputTokens: 200,
  });

  return {
    iterator: {
      // eslint-disable-next-line no-undef -- AsyncIterator is a TS lib type
      [Symbol.asyncIterator](): AsyncIterator<string> {
        return { next };
      },
    },
    push,
    end,
    abort,
    getUsage,
  };
}

export interface AIClientLike {
  invokeStream: ReturnType<typeof vi.fn>;
  addCost: ReturnType<typeof vi.fn>;
}

export function makeAIClient(
  overrides: Partial<{
    invokeStream: ReturnType<typeof vi.fn>;
    addCost: ReturnType<typeof vi.fn>;
  }> = {},
): AIClientLike {
  return {
    invokeStream: overrides.invokeStream ?? vi.fn(),
    addCost: overrides.addCost ?? vi.fn().mockResolvedValue(undefined),
  };
}
