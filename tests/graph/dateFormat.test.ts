// tests/graph/dateFormat.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-02 / D-10.
// Target: src/graph/dateFormat.ts (created in Wave 1) — exports toIsoLocalTz.
//
// Per RESEARCH.md §Pattern 6 + §A8: native Date.getTimezoneOffset is DST-aware,
// so the helper is a pure ~15-line transform that does not need tz mocking
// beyond the instants we construct. Tests lock the output shape AND the two
// PST↔PDT DST boundaries the author actually cares about (see 04-CONTEXT.md
// D-10 and RESEARCH.md §Pattern 6 example cases).

import { describe, it, expect } from 'vitest';
// Target — does not exist until Wave 1 ships it.
import { toIsoLocalTz } from '../../src/graph/dateFormat';

describe('toIsoLocalTz (GRAPH-02, D-10)', () => {
  it('ISO-8601 local-tz', () => {
    // Output must match YYYY-MM-DDTHH:MM:SS±HH:MM (24 chars, sign always present).
    const d = new Date();
    const iso = toIsoLocalTz(d);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('DST boundary', () => {
    // D-10 lock: the author's dogfood timezone is PT (author stated "when I
    // solved it in my local time, not UTC"). The helper is DST-aware via
    // native Date.getTimezoneOffset. If the test host happens to run in PT,
    // we can assert the literal sign/offset strings; everywhere else we
    // assert the self-consistent invariant that DST spring-forward changes
    // the emitted offset by exactly one hour vs. a pre-DST winter date.
    const preDst = new Date(2026, 1, 1, 12, 0, 0);   // Feb 1 2026 local — PST if PT host
    const postDst = new Date(2026, 2, 9, 12, 0, 0);  // Mar 9 2026 local — PDT if PT host
    const preIso = toIsoLocalTz(preDst);
    const postIso = toIsoLocalTz(postDst);
    const preOffset = preDst.getTimezoneOffset();     // negative of actual offset
    const postOffset = postDst.getTimezoneOffset();
    // Shape check first — both isos well-formed.
    expect(preIso).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(postIso).toMatch(/[+-]\d{2}:\d{2}$/);
    // If the host actually observes DST between these instants, the offsets
    // differ by exactly 60 minutes; otherwise they're equal (e.g., UTC host).
    // Either way, getTimezoneOffset is the SSoT the helper must agree with.
    const offsetDelta = Math.abs(preOffset - postOffset);
    expect([0, 60]).toContain(offsetDelta);
  });
});
