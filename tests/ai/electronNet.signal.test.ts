// tests/ai/electronNet.signal.test.ts
//
// Phase 08 Plan 02 Task 2 — Assumption A1 enforcement (RESEARCH §"Assumptions
// Log"). Validates that the electronNetStub helper honors `init.signal`:
//
//   - Pre-aborted signal short-circuits to AbortError before any data flows.
//   - Aborting mid-stream causes the ReadableStream's reader to error.
//   - Buffered-mode pre-resolve abort rejects the fetch promise.
//
// Mocks the helper itself (not real electron) — the helper is what 08-03's
// AIStreamModal tests rely on. This file is the contract test for
// tests/helpers/electronNetStub.ts.

import { describe, it, expect } from 'vitest';
import { createMockElectronNet } from '../helpers/electronNetStub';

describe('Phase 08 electronNetStub — init.signal honoring', () => {
  it('pre-aborted signal rejects the fetch call with AbortError', async () => {
    const mock = createMockElectronNet({ bufferedText: 'hello', delayMs: 50 });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(mock.fetch('https://example.com', { signal: ctrl.signal })).rejects.toMatchObject(
      { name: 'AbortError' },
    );
  });

  it('streaming response emits 5 chunks then closes when signal stays open', async () => {
    const mock = createMockElectronNet({
      responseChunks: ['c1', 'c2', 'c3', 'c4', 'c5'],
      delayMs: 5,
    });
    const ctrl = new AbortController();
    const res = await mock.fetch('https://example.com', { signal: ctrl.signal });
    expect(res.ok).toBe(true);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    expect(chunks).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('aborting mid-stream causes the reader to error with AbortError', async () => {
    const mock = createMockElectronNet({
      responseChunks: ['c1', 'c2', 'c3', 'c4', 'c5'],
      delayMs: 50,
    });
    const ctrl = new AbortController();
    const res = await mock.fetch('https://example.com', { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const collected: string[] = [];

    // Read 2 chunks
    const r1 = await reader.read();
    if (!r1.done) collected.push(decoder.decode(r1.value));
    const r2 = await reader.read();
    if (!r2.done) collected.push(decoder.decode(r2.value));
    expect(collected).toEqual(['c1', 'c2']);

    // Abort. The next read MUST reject with an AbortError-shaped error.
    ctrl.abort();
    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('buffered mode resolves with the configured text after delay', async () => {
    const mock = createMockElectronNet({ bufferedText: 'buffered-hello', delayMs: 10 });
    const ctrl = new AbortController();
    const res = await mock.fetch('https://example.com', { signal: ctrl.signal });
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe('buffered-hello');
  });

  it('aborting during buffered-mode delay rejects with AbortError', async () => {
    const mock = createMockElectronNet({ bufferedText: 'never-arrives', delayMs: 100 });
    const ctrl = new AbortController();
    const promise = mock.fetch('https://example.com', { signal: ctrl.signal });
    window.setTimeout(() => ctrl.abort(), 10);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
