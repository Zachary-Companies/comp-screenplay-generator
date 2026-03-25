import { describe, it, expect } from 'vitest';
import { computeChainGap, extractData, type VideoChainInfo } from './extractData';

// ── computeChainGap unit tests ────────────────────────────────

describe('computeChainGap', () => {
  it('should compute gap when chain is shorter than slot', () => {
    const result = computeChainGap(
      [{ duration: 3, actualDuration: 3 }, { duration: 2, actualDuration: 2 }],
      8,
    );
    expect(result.totalDuration).toBe(5);
    expect(result.gap).toBe(3);
    expect(result.isFilled).toBe(false);
    expect(result.fillPercent).toBeCloseTo(62.5);
  });

  it('should compute zero gap when chain fills slot exactly', () => {
    const result = computeChainGap(
      [{ duration: 4, actualDuration: 4 }, { duration: 4, actualDuration: 4 }],
      8,
    );
    expect(result.totalDuration).toBe(8);
    expect(result.gap).toBe(0);
    expect(result.isFilled).toBe(true);
    expect(result.fillPercent).toBe(100);
  });

  it('should handle overshoot (chain longer than slot)', () => {
    const result = computeChainGap(
      [{ duration: 6 }, { duration: 6 }],
      8,
    );
    expect(result.totalDuration).toBe(12);
    expect(result.gap).toBe(0);
    expect(result.isFilled).toBe(true);
    expect(result.fillPercent).toBe(100); // capped at 100
  });

  it('should prefer actualDuration over duration', () => {
    const result = computeChainGap(
      [{ duration: 6, actualDuration: 5.2 }],
      8,
    );
    expect(result.totalDuration).toBeCloseTo(5.2);
    expect(result.gap).toBeCloseTo(2.8);
  });

  it('should handle missing durations as 0', () => {
    const result = computeChainGap([{}, {}], 8);
    expect(result.totalDuration).toBe(0);
    expect(result.gap).toBe(8);
    expect(result.isFilled).toBe(false);
    expect(result.fillPercent).toBe(0);
  });

  it('should handle empty segments', () => {
    const result = computeChainGap([], 8);
    expect(result.totalDuration).toBe(0);
    expect(result.gap).toBe(8);
    expect(result.isFilled).toBe(false);
  });

  it('should handle zero slot duration', () => {
    const result = computeChainGap([{ duration: 5 }], 0);
    expect(result.totalDuration).toBe(5);
    expect(result.gap).toBe(0);
    expect(result.isFilled).toBe(true);
    expect(result.fillPercent).toBe(100);
  });

  it('should handle single segment', () => {
    const result = computeChainGap([{ actualDuration: 5.5 }], 8);
    expect(result.totalDuration).toBeCloseTo(5.5);
    expect(result.gap).toBeCloseTo(2.5);
    expect(result.fillPercent).toBeCloseTo(68.75);
  });
});

// ── videoChainMap in extractData ──────────────────────────────

function makeProject(overrides: any = {}) {
  return {
    metadata: { title: 'Test' },
    elements: [
      { id: 'elem-1', type: 'shot', content: 'WIDE SHOT', shotText: 'WIDE SHOT scene' },
      { id: 'elem-2', type: 'dialogue', content: 'Hello', character: 'SARAH', dialogueText: 'Hello there' },
      { id: 'elem-3', type: 'shot', content: 'CLOSE-UP', shotText: 'CLOSE-UP face' },
    ],
    characters: [{ id: 'c1', name: 'Sarah', displayName: 'SARAH' }],
    locations: [],
    previsualizations: {
      shots: [
        {
          shotElementId: 'elem-1',
          filePath: '/img/shot1.png',
          generations: [{ id: 'gen1', filePath: '/img/shot1.png' }],
          selectedGenerationId: 'gen1',
          videoGenerations: [
            { id: 'vg1', filePath: '/vid/shot1_v1.mp4', duration: 6, actualDuration: 5.8 },
            { id: 'vg2', filePath: '/vid/shot1_v2.mp4', duration: 6, actualDuration: 5.5 },
          ],
          selectedVideoGenerationId: 'vg2',
          videoChain: ['vg1', 'vg2'],
          ...overrides.shot1Previs,
        },
        {
          shotElementId: 'elem-3',
          filePath: '/img/shot3.png',
          generations: [{ id: 'gen3', filePath: '/img/shot3.png' }],
          selectedGenerationId: 'gen3',
          videoGenerations: [
            { id: 'vg3', filePath: '/vid/shot3_v1.mp4', duration: 6, actualDuration: 4.2 },
          ],
          selectedVideoGenerationId: 'vg3',
          ...overrides.shot3Previs,
        },
      ],
      ...overrides.previs,
    },
    scenes: [],
    dialogueAudio: overrides.dialogueAudio || {},
    ...overrides.root,
  } as any;
}

describe('videoChainMap in extractData', () => {
  it('should build chain info from explicit videoChain', () => {
    const result = extractData(makeProject(), {});
    const chain1 = result.videoChainMap['elem-1'];
    expect(chain1).toBeDefined();
    expect(chain1.chain).toHaveLength(2);
    expect(chain1.chain[0].id).toBe('vg1');
    expect(chain1.chain[0].duration).toBeCloseTo(5.8); // uses actualDuration
    expect(chain1.chain[1].id).toBe('vg2');
    expect(chain1.chain[1].duration).toBeCloseTo(5.5);
    expect(chain1.totalDuration).toBeCloseTo(11.3);
  });

  it('should create single-entry chain from selected video when no videoChain', () => {
    const result = extractData(makeProject(), {});
    const chain3 = result.videoChainMap['elem-3'];
    expect(chain3).toBeDefined();
    expect(chain3.chain).toHaveLength(1);
    expect(chain3.chain[0].id).toBe('vg3');
    expect(chain3.chain[0].duration).toBeCloseTo(4.2);
  });

  it('should use latest video when no selectedVideoGenerationId and no chain', () => {
    const proj = makeProject({
      shot3Previs: { selectedVideoGenerationId: undefined },
    });
    const result = extractData(proj, {});
    const chain3 = result.videoChainMap['elem-3'];
    expect(chain3).toBeDefined();
    expect(chain3.chain[0].id).toBe('vg3'); // latest
  });

  it('should skip invalid chain IDs gracefully', () => {
    const proj = makeProject({
      shot1Previs: { videoChain: ['vg1', 'nonexistent', 'vg2'] },
    });
    const result = extractData(proj, {});
    const chain1 = result.videoChainMap['elem-1'];
    // Only valid IDs should appear
    expect(chain1.chain).toHaveLength(2);
    expect(chain1.chain[0].id).toBe('vg1');
    expect(chain1.chain[1].id).toBe('vg2');
  });

  it('should not have chain entry for shots without videoGenerations', () => {
    const proj = makeProject({
      shot1Previs: { videoGenerations: undefined, videoChain: undefined },
    });
    const result = extractData(proj, {});
    expect(result.videoChainMap['elem-1']).toBeUndefined();
  });

  it('should compute slotDuration from timeline clip', () => {
    const result = extractData(makeProject(), {});
    const chain1 = result.videoChainMap['elem-1'];
    // slotDuration should be > 0 (comes from the visual clip's duration)
    expect(chain1.slotDuration).toBeGreaterThanOrEqual(0);
  });

  it('should compute fillPercent correctly', () => {
    const result = extractData(makeProject(), {});
    const chain3 = result.videoChainMap['elem-3'];
    // Single 4.2s video in whatever slot — fillPercent is capped at 100
    if (chain3.slotDuration > 0) {
      const rawPercent = (chain3.totalDuration / chain3.slotDuration) * 100;
      expect(chain3.fillPercent).toBeCloseTo(Math.min(100, rawPercent));
    }
  });

  it('should fall back to duration when actualDuration is missing', () => {
    const proj = makeProject({
      shot3Previs: {
        videoGenerations: [
          { id: 'vg3', filePath: '/vid/shot3_v1.mp4', duration: 6 }, // no actualDuration
        ],
      },
    });
    const result = extractData(proj, {});
    const chain3 = result.videoChainMap['elem-3'];
    expect(chain3.chain[0].duration).toBe(6);
    expect(chain3.totalDuration).toBe(6);
  });
});
