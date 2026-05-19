// tests/graph/patternClusterEngine.test.ts
//
// Phase 11 Plan 02 Task 2 — TDD tests for PatternClusterEngine + OtherPatternModal.
// Target: src/graph/PatternClusterEngine.ts, src/graph/OtherPatternModal.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { PatternClusterEngine } from '../../src/graph/PatternClusterEngine';
import type { ClassifyResult } from '../../src/graph/PatternClusterEngine';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeAIClient(responseText = '{"pattern":"Two Pointers","variants":[],"lookAhead":[]}') {
  return {
    invoke: vi.fn(async () => ({
      text: responseText,
      usdCost: 0,
      usage: { promptTokens: 100, completionTokens: 50 },
    })),
  };
}

function makeSettings(overrides: Record<string, unknown> = {}) {
  const knownSlugs = (overrides.knownSlugs as string[] | undefined) ?? ['two-sum', '3sum', 'valid-anagram'];
  return {
    getAutoAIKnowledgeGraph: vi.fn(() => overrides.autoAIKG !== false),
    getActiveAIProvider: vi.fn(() => 'activeProvider' in overrides ? overrides.activeProvider : 'openai'),
    getFeatureFlags: vi.fn(() => ({ lookAheadEdges: overrides.lookAheadEdges ?? false })),
    getProblemDetail: vi.fn((slug: string) => {
      return knownSlugs.includes(slug) ? { slug, title: slug } : null;
    }),
    getProblemIndex: vi.fn(() => ({ problems: knownSlugs.map((s) => ({ slug: s })) })),
    addCostLedger: vi.fn(async () => {}),
    getProblemsFolder: vi.fn(() => 'LeetCode'),
  };
}

function makeHubWriter() {
  return {
    ensureHub: vi.fn(async () => {}),
    appendEntry: vi.fn(async () => {}),
  };
}

function makeMockFile(path = 'LeetCode/two-sum.md', basename = 'Two Sum') {
  return { path, basename, name: `${basename}.md`, extension: 'md' };
}

// ── PatternClusterEngine Tests ────────────────────────────────────────────────

describe('PatternClusterEngine', () => {
  it('gates on autoAIKnowledgeGraph setting (returns early when disabled)', async () => {
    const m = makeMockVaultApp({});
    const aiClient = makeAIClient();
    const settings = makeSettings({ autoAIKG: false });
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'class Solution', 'python3');
    expect(aiClient.invoke).not.toHaveBeenCalled();
  });

  it('gates on activeAIProvider (returns early when null)', async () => {
    const m = makeMockVaultApp({});
    const aiClient = makeAIClient();
    const settings = makeSettings({ activeProvider: null });
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'class Solution', 'python3');
    expect(aiClient.invoke).not.toHaveBeenCalled();
  });

  it('skips classification when lc-pattern frontmatter already set (persistence)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-pattern': 'Two Pointers', 'lc-difficulty': 'Easy' });
    const aiClient = makeAIClient();
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'class Solution', 'python3');
    // AI should NOT be called — pattern already set
    expect(aiClient.invoke).not.toHaveBeenCalled();
    // But hub writer should still be called (re-add to hub after reconcile)
    expect(hubWriter.ensureHub).toHaveBeenCalled();
  });

  it('calls AIClient.invoke with buildKgPrompt output', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const aiClient = makeAIClient();
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>Two Sum problem</p>', 'def twoSum()', 'python3');
    expect(aiClient.invoke).toHaveBeenCalledTimes(1);
    const req = (aiClient.invoke as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { prompt: string; maxTokens: number };
    expect(req.prompt).toContain('Two Sum problem');
    expect(req.prompt).toContain('def twoSum()');
    expect(req.prompt).toContain('python3');
    expect(req.maxTokens).toBe(500);
  });

  it('writes lc-pattern frontmatter via processFrontMatter', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const aiClient = makeAIClient('{"pattern":"Two Pointers","variants":[],"lookAhead":[]}');
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    expect(m.spies.processFrontMatter).toHaveBeenCalled();
    const fm = m.getFrontmatter('LeetCode/two-sum.md');
    expect(fm?.['lc-pattern']).toBe('Two Pointers');
  });

  it('calls mergeTechniquesSectionAI via vault.process', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n- [[Hash Table]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const aiClient = makeAIClient('{"pattern":"Two Pointers","variants":[],"lookAhead":[]}');
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    const body = m.getContent('LeetCode/two-sum.md')!;
    expect(body).toContain('- [[Two Pointers]]');
    expect(body).not.toContain('[[Array]]');
    expect(body).not.toContain('[[Hash Table]]');
  });

  it('calls mergeRelatedVariantsSection when cross-cluster variants exist', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const response = JSON.stringify({
      pattern: 'Two Pointers',
      variants: [{ slug: '3sum', reason: 'uses shrinking window on sorted array' }],
      lookAhead: [],
    });
    const aiClient = makeAIClient(response);
    const settings = makeSettings({ knownSlugs: ['3sum', 'two-sum'] });
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    const body = m.getContent('LeetCode/two-sum.md')!;
    expect(body).toContain('## Related Variants');
    expect(body).toContain('[[3sum]]');
  });

  it('drops unknown slugs from variants (validated against getProblemDetail)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const response = JSON.stringify({
      pattern: 'Two Pointers',
      variants: [
        { slug: 'unknown-problem', reason: 'fake' },
        { slug: '3sum', reason: 'real' },
      ],
      lookAhead: [],
    });
    const aiClient = makeAIClient(response);
    const settings = makeSettings({ knownSlugs: ['3sum', 'two-sum'] });
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    const body = m.getContent('LeetCode/two-sum.md')!;
    expect(body).not.toContain('unknown-problem');
    expect(body).toContain('[[3sum]]');
  });

  it('respects featureFlags.lookAheadEdges gate for lookAhead edges', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const response = JSON.stringify({
      pattern: 'Two Pointers',
      variants: [],
      lookAhead: [{ slug: 'valid-anagram', reason: 'good practice' }],
    });
    const aiClient = makeAIClient(response);
    // lookAheadEdges is OFF
    const settings = makeSettings({ lookAheadEdges: false, knownSlugs: ['valid-anagram', 'two-sum'] });
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    const body = m.getContent('LeetCode/two-sum.md')!;
    // With lookAheadEdges off, lookAhead slugs should NOT appear in Related Variants
    expect(body).not.toContain('valid-anagram');
  });

  it('includes lookAhead edges when featureFlags.lookAheadEdges is true', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const response = JSON.stringify({
      pattern: 'Two Pointers',
      variants: [],
      lookAhead: [{ slug: 'valid-anagram', reason: 'good practice' }],
    });
    const aiClient = makeAIClient(response);
    // lookAheadEdges is ON
    const settings = makeSettings({ lookAheadEdges: true, knownSlugs: ['valid-anagram', 'two-sum'] });
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    const body = m.getContent('LeetCode/two-sum.md')!;
    expect(body).toContain('[[valid-anagram]]');
  });

  it('calls addCostLedger after successful invoke', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const aiClient = makeAIClient();
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    expect(settings.addCostLedger).toHaveBeenCalled();
  });

  it('never throws — per-stage try/catch', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const aiClient = {
      invoke: vi.fn(async () => { throw new Error('network error'); }),
    };
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    // Should not throw
    await expect(
      engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3'),
    ).resolves.toBeUndefined();
  });

  it('shows OtherPatternModal when parsed.pattern === OTHER and uses result', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const response = JSON.stringify({
      pattern: 'OTHER',
      variants: [],
      lookAhead: [],
    });
    const aiClient = makeAIClient(response);
    const settings = makeSettings();
    const hubWriter = makeHubWriter();

    // Mock the modal factory to return a chosen pattern name
    const mockModalFactory = vi.fn(async () => 'Segment Tree');

    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
      showOtherModal: mockModalFactory,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');

    // The modal factory should have been called
    expect(mockModalFactory).toHaveBeenCalled();
    // The chosen pattern should be written to frontmatter
    const fm = m.getFrontmatter('LeetCode/two-sum.md');
    expect(fm?.['lc-pattern']).toBe('Segment Tree');
    // Hub should use the user-chosen pattern
    expect(hubWriter.ensureHub).toHaveBeenCalledWith(
      'Segment Tree',
      expect.objectContaining({ title: 'Two Sum' }),
    );
  });

  it('calls hubWriter.ensureHub and appendEntry after classification', async () => {
    const m = makeMockVaultApp({ 'LeetCode/two-sum.md': '# Two Sum\n\n## Techniques\n\n- [[Array]]\n' });
    m.seedFrontmatter('LeetCode/two-sum.md', { 'lc-difficulty': 'Easy' });
    const aiClient = makeAIClient('{"pattern":"Two Pointers","variants":[],"lookAhead":[]}');
    const settings = makeSettings();
    const hubWriter = makeHubWriter();
    const engine = new PatternClusterEngine({
      app: m.app as never,
      aiClient: aiClient as never,
      settings: settings as never,
      hubWriter: hubWriter as never,
    });

    await engine.onAccepted(makeMockFile() as never, 'two-sum', '<p>desc</p>', 'code', 'python3');
    expect(hubWriter.ensureHub).toHaveBeenCalledWith(
      'Two Pointers',
      expect.objectContaining({ title: 'Two Sum', difficulty: 'Easy' }),
    );
    expect(hubWriter.appendEntry).toHaveBeenCalledWith(
      'Two Pointers',
      expect.objectContaining({ title: 'Two Sum', difficulty: 'Easy' }),
    );
  });
});
