import { describe, it, expect } from 'vitest';
import {
  buildDialogueDurationMap,
  computeSlotDuration,
  computeVideoGapInfo,
} from './computeSlotDuration';

describe('buildDialogueDurationMap', () => {
  it('should build map from dialogue audio assets', () => {
    const map = buildDialogueDurationMap([
      { type: 'dialogue-audio', filePath: '/a.mp3', metadata: { dialogueElementId: 'elem-1', duration: 2.5 } },
      { type: 'dialogue-audio', filePath: '/b.mp3', metadata: { dialogueElementId: 'elem-2', duration: 3.1 } },
    ]);
    expect(map['elem-1']).toBe(2.5);
    expect(map['elem-2']).toBe(3.1);
  });

  it('should skip entries without duration', () => {
    const map = buildDialogueDurationMap([
      { metadata: { dialogueElementId: 'elem-1' } },
      { metadata: { dialogueElementId: 'elem-2', duration: 0 } },
      { metadata: { dialogueElementId: 'elem-3', duration: -1 } },
    ]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('should handle undefined/null input', () => {
    expect(buildDialogueDurationMap(undefined)).toEqual({});
    expect(buildDialogueDurationMap([] as any)).toEqual({});
  });
});

describe('computeSlotDuration', () => {
  const durMap = { 'd1': 2.0, 'd2': 3.0, 'd3': 1.5 };

  it('should sum dialogue durations + gap for each', () => {
    const elems = [
      { id: 'd1', type: 'dialogue' },
      { id: 'd2', type: 'dialogue' },
    ];
    // (2.0 + 0.15) + (3.0 + 0.15) = 5.3
    expect(computeSlotDuration(elems, durMap)).toBeCloseTo(5.3);
  });

  it('should ignore non-dialogue elements', () => {
    const elems = [
      { id: 'd1', type: 'dialogue' },
      { id: 'a1', type: 'action' },
      { id: 'd2', type: 'dialogue' },
    ];
    // Only d1 and d2 count: (2.0 + 0.15) + (3.0 + 0.15) = 5.3
    expect(computeSlotDuration(elems, durMap)).toBeCloseTo(5.3);
  });

  it('should return 0 when no dialogue has audio', () => {
    const elems = [
      { id: 'x1', type: 'dialogue' }, // not in durMap
      { id: 'a1', type: 'action' },
    ];
    expect(computeSlotDuration(elems, durMap)).toBe(0);
  });

  it('should enforce minimum duration', () => {
    const elems = [{ id: 'd4', type: 'dialogue' }];
    const shortMap = { 'd4': 0.1 };
    // 0.1 + 0.15 = 0.25, but min is 0.5
    expect(computeSlotDuration(elems, shortMap)).toBe(0.5);
  });

  it('should return 0 for empty content elements', () => {
    expect(computeSlotDuration([], durMap)).toBe(0);
  });

  it('should skip dialogues without matching audio', () => {
    const elems = [
      { id: 'd1', type: 'dialogue' }, // has audio (2.0)
      { id: 'noaudio', type: 'dialogue' }, // no audio
    ];
    // Only d1: 2.0 + 0.15 = 2.15
    expect(computeSlotDuration(elems, durMap)).toBeCloseTo(2.15);
  });
});

describe('computeVideoGapInfo', () => {
  const vGens = [
    { id: 'v1', duration: 6, actualDuration: 5.8 },
    { id: 'v2', duration: 6, actualDuration: 5.5 },
    { id: 'v3', duration: 6, actualDuration: 4.2 },
  ];

  it('should compute gap for chain', () => {
    const info = computeVideoGapInfo(vGens, ['v1', 'v2'], undefined, 15);
    expect(info.totalVideoDur).toBeCloseTo(11.3); // 5.8 + 5.5
    expect(info.gap).toBeCloseTo(3.7);
    expect(info.isFilled).toBe(false);
    expect(info.chainLength).toBe(2);
  });

  it('should compute gap for single selected video', () => {
    const info = computeVideoGapInfo(vGens, undefined, 'v3', 8);
    expect(info.totalVideoDur).toBeCloseTo(4.2);
    expect(info.gap).toBeCloseTo(3.8);
    expect(info.isFilled).toBe(false);
    expect(info.chainLength).toBe(1);
  });

  it('should use latest video when no selection', () => {
    const info = computeVideoGapInfo(vGens, undefined, undefined, 8);
    expect(info.totalVideoDur).toBeCloseTo(4.2); // v3 is latest
    expect(info.chainLength).toBe(1);
  });

  it('should show filled when chain >= slot', () => {
    const info = computeVideoGapInfo(vGens, ['v1', 'v2', 'v3'], undefined, 10);
    expect(info.totalVideoDur).toBeCloseTo(15.5); // 5.8 + 5.5 + 4.2
    expect(info.gap).toBe(0);
    expect(info.isFilled).toBe(true);
    expect(info.fillPercent).toBe(100);
  });

  it('should handle zero slot duration', () => {
    const info = computeVideoGapInfo(vGens, ['v1'], undefined, 0);
    expect(info.gap).toBe(0);
    expect(info.isFilled).toBe(true);
    expect(info.fillPercent).toBe(100);
  });

  it('should handle no video generations', () => {
    const info = computeVideoGapInfo(undefined, undefined, undefined, 8);
    expect(info.totalVideoDur).toBe(0);
    expect(info.gap).toBe(8);
    expect(info.isFilled).toBe(false);
    expect(info.chainLength).toBe(0);
  });

  it('should skip invalid chain IDs', () => {
    const info = computeVideoGapInfo(vGens, ['v1', 'nonexistent', 'v2'], undefined, 15);
    expect(info.totalVideoDur).toBeCloseTo(11.3); // only v1 + v2
    expect(info.chainLength).toBe(2);
  });

  it('should prefer actualDuration over duration', () => {
    const gens = [{ id: 'v1', duration: 6, actualDuration: 4.8 }];
    const info = computeVideoGapInfo(gens, ['v1'], undefined, 8);
    expect(info.totalVideoDur).toBeCloseTo(4.8);
  });

  it('should fall back to duration when no actualDuration', () => {
    const gens = [{ id: 'v1', duration: 6 }];
    const info = computeVideoGapInfo(gens, ['v1'], undefined, 8);
    expect(info.totalVideoDur).toBe(6);
  });
});
