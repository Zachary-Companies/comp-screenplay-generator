/**
 * Edge case tests for computeSlotDuration, computeVideoGapInfo, and buildDialogueDurationMap.
 * Covers error cases, boundary conditions, and data inconsistencies
 * that can occur in the screenplay view.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDialogueDurationMap,
  computeSlotDuration,
  computeVideoGapInfo,
} from './computeSlotDuration';

// ── buildDialogueDurationMap edge cases ─────────────────────

describe('buildDialogueDurationMap edge cases', () => {
  it('should handle null metadata', () => {
    const map = buildDialogueDurationMap([{ metadata: null } as any]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('should handle missing dialogueElementId', () => {
    const map = buildDialogueDurationMap([
      { metadata: { duration: 2.0 } } as any,
    ]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('should handle NaN duration', () => {
    const map = buildDialogueDurationMap([
      { metadata: { dialogueElementId: 'e1', duration: NaN } } as any,
    ]);
    expect(map['e1']).toBeUndefined();
  });

  it('should handle Infinity duration', () => {
    const map = buildDialogueDurationMap([
      { metadata: { dialogueElementId: 'e1', duration: Infinity } } as any,
    ]);
    // Infinity > 0 is true, so it would be included — verify behavior
    expect(map['e1']).toBe(Infinity);
  });

  it('should handle string duration (type coercion)', () => {
    const map = buildDialogueDurationMap([
      { metadata: { dialogueElementId: 'e1', duration: '2.5' as any } } as any,
    ]);
    // typeof '2.5' !== 'number', so should be skipped
    expect(map['e1']).toBeUndefined();
  });

  it('should handle duplicate dialogueElementIds (last wins)', () => {
    const map = buildDialogueDurationMap([
      { metadata: { dialogueElementId: 'e1', duration: 2.0 } },
      { metadata: { dialogueElementId: 'e1', duration: 3.0 } },
    ]);
    expect(map['e1']).toBe(3.0);
  });

  it('should handle empty assets array', () => {
    expect(buildDialogueDurationMap([])).toEqual({});
  });

  it('should handle assets with null entries', () => {
    const map = buildDialogueDurationMap([null, undefined, { metadata: { dialogueElementId: 'e1', duration: 1.0 } }] as any);
    expect(map['e1']).toBe(1.0);
  });
});

// ── computeSlotDuration edge cases ──────────────────────────

describe('computeSlotDuration edge cases', () => {
  it('should handle dialogue with zero duration in map', () => {
    // duration === 0 is not > 0, so should be skipped
    const result = computeSlotDuration(
      [{ id: 'd1', type: 'dialogue' }],
      { d1: 0 }
    );
    expect(result).toBe(0); // no valid audio
  });

  it('should handle very small durations that sum below minimum', () => {
    const result = computeSlotDuration(
      [{ id: 'd1', type: 'dialogue' }],
      { d1: 0.01 }
    );
    // 0.01 + 0.15 = 0.16, below minimum 0.5
    expect(result).toBe(0.5);
  });

  it('should handle many short dialogues', () => {
    const elems = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, type: 'dialogue' }));
    const durMap: Record<string, number> = {};
    elems.forEach(e => { durMap[e.id] = 0.5; });
    // 20 * (0.5 + 0.15) = 13.0
    const result = computeSlotDuration(elems, durMap);
    expect(result).toBeCloseTo(13.0);
  });

  it('should handle mixed dialogue with and without audio', () => {
    const elems = [
      { id: 'd1', type: 'dialogue' }, // has audio
      { id: 'd2', type: 'dialogue' }, // no audio
      { id: 'd3', type: 'dialogue' }, // has audio
    ];
    const durMap = { d1: 2.0, d3: 1.5 };
    // (2.0 + 0.15) + (1.5 + 0.15) = 3.8
    expect(computeSlotDuration(elems, durMap)).toBeCloseTo(3.8);
  });

  it('should handle content with only action elements', () => {
    const result = computeSlotDuration(
      [{ id: 'a1', type: 'action' }, { id: 'a2', type: 'transition' }],
      {}
    );
    expect(result).toBe(0);
  });

  it('should handle content with subtitle type', () => {
    const result = computeSlotDuration(
      [{ id: 's1', type: 'subtitle' }],
      { s1: 2.0 }
    );
    expect(result).toBe(0); // subtitles are not dialogue
  });

  it('should handle negative duration in map (safety)', () => {
    // Negative durations should not be included (they fail dur > 0 in buildDialogueDurationMap)
    // But if somehow they get in the map directly:
    const result = computeSlotDuration(
      [{ id: 'd1', type: 'dialogue' }],
      { d1: -1.0 }
    );
    // -1.0 > 0 is false, so skipped → result = 0
    expect(result).toBe(0);
  });

  it('should handle very long dialogue durations', () => {
    const result = computeSlotDuration(
      [{ id: 'd1', type: 'dialogue' }],
      { d1: 300 } // 5 minutes
    );
    expect(result).toBeCloseTo(300.15);
  });
});

// ── computeVideoGapInfo edge cases ──────────────────────────

describe('computeVideoGapInfo edge cases', () => {
  it('should handle empty videoGenerations array', () => {
    const info = computeVideoGapInfo([], undefined, undefined, 8);
    expect(info.totalVideoDur).toBe(0);
    expect(info.chainLength).toBe(0);
    expect(info.gap).toBe(8);
    expect(info.isFilled).toBe(false);
  });

  it('should handle chain with all invalid IDs', () => {
    const info = computeVideoGapInfo(
      [{ id: 'v1', duration: 6 }],
      ['invalid1', 'invalid2'],
      undefined,
      8
    );
    expect(info.totalVideoDur).toBe(0);
    expect(info.chainLength).toBe(0);
  });

  it('should handle chain with duplicate IDs', () => {
    const gens = [{ id: 'v1', duration: 3, actualDuration: 3 }];
    const info = computeVideoGapInfo(gens, ['v1', 'v1', 'v1'], undefined, 10);
    // Each resolves to the same gen, so 3 * 3 = 9
    expect(info.totalVideoDur).toBeCloseTo(9);
    expect(info.chainLength).toBe(3);
    expect(info.gap).toBeCloseTo(1);
  });

  it('should handle selectedVideoGenerationId that does not exist', () => {
    const gens = [
      { id: 'v1', duration: 3 },
      { id: 'v2', duration: 4 },
    ];
    const info = computeVideoGapInfo(gens, undefined, 'nonexistent', 8);
    // find returns undefined → chainGens = [] (does NOT fall back to latest)
    expect(info.totalVideoDur).toBe(0);
    expect(info.chainLength).toBe(0);
  });

  it('should handle video generation with zero duration', () => {
    const info = computeVideoGapInfo(
      [{ id: 'v1', duration: 0 }],
      ['v1'],
      undefined,
      8
    );
    expect(info.totalVideoDur).toBe(0);
    expect(info.gap).toBe(8);
  });

  it('should handle video generation with only actualDuration (no duration)', () => {
    const info = computeVideoGapInfo(
      [{ id: 'v1', actualDuration: 5.5 }],
      ['v1'],
      undefined,
      8
    );
    expect(info.totalVideoDur).toBeCloseTo(5.5);
  });

  it('should handle negative slot duration', () => {
    const info = computeVideoGapInfo(
      [{ id: 'v1', duration: 6 }],
      ['v1'],
      undefined,
      -5
    );
    expect(info.gap).toBe(0);
    expect(info.isFilled).toBe(true);
  });

  it('should handle very small slot duration (near zero)', () => {
    const info = computeVideoGapInfo(
      [{ id: 'v1', duration: 6 }],
      ['v1'],
      undefined,
      0.001
    );
    expect(info.isFilled).toBe(true);
    expect(info.fillPercent).toBe(100);
  });

  it('should handle chain selection with selectedVideoGenerationId falling back to latest', () => {
    // No chain, no selection → latest
    const info = computeVideoGapInfo(
      [{ id: 'v1', duration: 2 }, { id: 'v2', duration: 4 }, { id: 'v3', duration: 6 }],
      undefined, // no chain
      undefined, // no selection
      10
    );
    expect(info.totalVideoDur).toBe(6); // v3 is latest
    expect(info.chainLength).toBe(1);
  });

  it('should handle mixed chain with actualDuration and no duration', () => {
    const gens = [
      { id: 'v1', actualDuration: 3.2 },
      { id: 'v2', duration: 4 },
      { id: 'v3' }, // no duration at all
    ];
    const info = computeVideoGapInfo(gens as any, ['v1', 'v2', 'v3'], undefined, 10);
    expect(info.totalVideoDur).toBeCloseTo(7.2); // 3.2 + 4 + 0
    expect(info.chainLength).toBe(3);
  });
});
