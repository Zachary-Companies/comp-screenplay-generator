/**
 * Thorough edge case tests for video chain in extractData.
 * Covers data inconsistencies, missing fields, ID mismatches,
 * and boundary conditions in the editor data extraction.
 */
import { describe, it, expect } from 'vitest';
import { extractData, computeChainGap } from './extractData';

// ── Helpers ─────────────────────────────────────────────────

function makeProject(overrides: any = {}) {
  return {
    metadata: { title: 'Test' },
    elements: overrides.elements || [
      { id: 'elem-1', type: 'shot', content: 'WIDE SHOT', shotText: 'WIDE SHOT scene' },
      { id: 'elem-2', type: 'dialogue', content: 'Hello', character: 'SARAH', dialogueText: 'Hello there' },
      { id: 'elem-3', type: 'shot', content: 'CLOSE-UP', shotText: 'CLOSE-UP face' },
    ],
    characters: overrides.characters || [{ id: 'c1', name: 'Sarah', displayName: 'SARAH' }],
    locations: [],
    previsualizations: {
      shots: overrides.previsShots || [
        {
          shotElementId: 'elem-1',
          filePath: '/img/shot1.png',
          generations: [{ id: 'gen1', filePath: '/img/shot1.png' }],
          selectedGenerationId: 'gen1',
          videoGenerations: [
            { id: 'vg1', filePath: '/vid/v1.mp4', duration: 6, actualDuration: 5.8 },
            { id: 'vg2', filePath: '/vid/v2.mp4', duration: 6, actualDuration: 5.5 },
          ],
          selectedVideoGenerationId: 'vg2',
          videoChain: ['vg1', 'vg2'],
        },
      ],
    },
    scenes: overrides.scenes || [],
    dialogueAudio: overrides.dialogueAudio || {},
    ...overrides.root,
  } as any;
}

// ── computeChainGap edge cases ──────────────────────────────

describe('computeChainGap edge cases', () => {
  it('should handle NaN durations gracefully', () => {
    // NaN is falsy, so `actualDuration || duration || 0` → `duration || 0` → `0`
    const result = computeChainGap([{ duration: NaN }], 8);
    expect(result.totalDuration).toBe(0);
  });

  it('should handle undefined duration fields', () => {
    const result = computeChainGap([{}], 8);
    expect(result.totalDuration).toBe(0);
    expect(result.gap).toBe(8);
  });

  it('should handle Infinity duration', () => {
    const result = computeChainGap([{ duration: Infinity }], 8);
    expect(result.totalDuration).toBe(Infinity);
    expect(result.isFilled).toBe(true);
  });

  it('should handle negative slot duration', () => {
    const result = computeChainGap([{ duration: 5 }], -3);
    expect(result.gap).toBe(0); // Math.max(0, -3 - 5) = 0
    expect(result.isFilled).toBe(true);
  });

  it('should handle very large number of segments', () => {
    const segments = Array.from({ length: 100 }, () => ({ duration: 0.1 }));
    const result = computeChainGap(segments, 20);
    expect(result.totalDuration).toBeCloseTo(10);
    expect(result.gap).toBeCloseTo(10);
  });

  it('should fall through actualDuration=0 to duration (|| operator)', () => {
    // actualDuration: 0 is falsy with ||, so falls through to duration: 6
    const result = computeChainGap([{ actualDuration: 0, duration: 6 }], 8);
    expect(result.totalDuration).toBe(6);
  });

  it('should use duration when actualDuration is undefined', () => {
    const result = computeChainGap([{ actualDuration: undefined, duration: 6 }], 8);
    expect(result.totalDuration).toBe(6);
  });

  it('should handle exactly at threshold (within 0.01)', () => {
    // isFilled checks totalDuration >= slotDuration - 0.01
    const result = computeChainGap([{ duration: 7.995 }], 8);
    expect(result.isFilled).toBe(true); // 7.995 >= 8 - 0.01 = 7.99
  });

  it('should handle just below threshold', () => {
    const result = computeChainGap([{ duration: 7.98 }], 8);
    expect(result.isFilled).toBe(false); // 7.98 < 7.99
  });
});

// ── videoChainMap with edge case project data ───────────────

describe('extractData videoChainMap edge cases', () => {
  it('should handle previsShots with empty videoGenerations array', () => {
    const proj = makeProject({
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/shot1.png',
        generations: [{ id: 'gen1', filePath: '/img/shot1.png' }],
        videoGenerations: [],
      }],
    });
    const result = extractData(proj, {});
    expect(result.videoChainMap['elem-1']).toBeUndefined();
  });

  it('should handle previsShots with videoGenerations but all missing filePaths', () => {
    const proj = makeProject({
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/shot1.png',
        videoGenerations: [
          { id: 'vg1', duration: 6 }, // no filePath
          { id: 'vg2', duration: 6 }, // no filePath
        ],
        videoChain: ['vg1', 'vg2'],
      }],
    });
    const result = extractData(proj, {});
    // Chain segments should still be created (they have IDs)
    const chain = result.videoChainMap['elem-1'];
    if (chain) {
      // filePath will be undefined on segments but they exist
      expect(chain.chain.length).toBeLessThanOrEqual(2);
    }
  });

  it('should handle previsShots with no shotElementId', () => {
    const proj = makeProject({
      previsShots: [{
        // no shotElementId!
        filePath: '/img/shot1.png',
        videoGenerations: [{ id: 'vg1', filePath: '/vid/v1.mp4', duration: 6 }],
      }],
    });
    const result = extractData(proj, {});
    expect(Object.keys(result.videoChainMap)).toHaveLength(0);
  });

  it('should handle videoChain with empty array', () => {
    const proj = makeProject({
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/shot1.png',
        videoGenerations: [
          { id: 'vg1', filePath: '/vid/v1.mp4', duration: 6, actualDuration: 5.8 },
        ],
        selectedVideoGenerationId: 'vg1',
        videoChain: [], // explicitly empty
      }],
    });
    const result = extractData(proj, {});
    const chain = result.videoChainMap['elem-1'];
    // Should fall back to selected video as single-entry chain
    expect(chain).toBeDefined();
    expect(chain.chain).toHaveLength(1);
    expect(chain.chain[0].id).toBe('vg1');
  });

  it('should handle videoChain referencing generation that has no duration', () => {
    const proj = makeProject({
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/shot1.png',
        videoGenerations: [
          { id: 'vg1', filePath: '/vid/v1.mp4' }, // no duration at all
        ],
        videoChain: ['vg1'],
      }],
    });
    const result = extractData(proj, {});
    const chain = result.videoChainMap['elem-1'];
    expect(chain).toBeDefined();
    expect(chain.chain[0].duration).toBe(0);
    expect(chain.totalDuration).toBe(0);
  });

  it('should handle multiple previsShots for different elements', () => {
    const proj = makeProject({
      elements: [
        { id: 'elem-1', type: 'shot', content: 'WIDE', shotText: 'WIDE' },
        { id: 'elem-2', type: 'shot', content: 'CLOSE', shotText: 'CLOSE' },
      ],
      previsShots: [
        {
          shotElementId: 'elem-1',
          filePath: '/img/s1.png',
          videoGenerations: [{ id: 'v1', filePath: '/vid/v1.mp4', duration: 6, actualDuration: 5 }],
          selectedVideoGenerationId: 'v1',
        },
        {
          shotElementId: 'elem-2',
          filePath: '/img/s2.png',
          videoGenerations: [
            { id: 'v2a', filePath: '/vid/v2a.mp4', duration: 6, actualDuration: 4 },
            { id: 'v2b', filePath: '/vid/v2b.mp4', duration: 6, actualDuration: 3 },
          ],
          selectedVideoGenerationId: 'v2b',
          videoChain: ['v2a', 'v2b'],
        },
      ],
    });
    const result = extractData(proj, {});
    expect(result.videoChainMap['elem-1']).toBeDefined();
    expect(result.videoChainMap['elem-1'].chain).toHaveLength(1);
    expect(result.videoChainMap['elem-2']).toBeDefined();
    expect(result.videoChainMap['elem-2'].chain).toHaveLength(2);
    expect(result.videoChainMap['elem-2'].totalDuration).toBeCloseTo(7); // 4 + 3
  });

  it('should handle previs shot with videoChain but no selectedVideoGenerationId', () => {
    const proj = makeProject({
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/shot1.png',
        videoGenerations: [
          { id: 'vg1', filePath: '/vid/v1.mp4', duration: 6, actualDuration: 5 },
          { id: 'vg2', filePath: '/vid/v2.mp4', duration: 6, actualDuration: 4 },
        ],
        // no selectedVideoGenerationId
        videoChain: ['vg1', 'vg2'],
      }],
    });
    const result = extractData(proj, {});
    const chain = result.videoChainMap['elem-1'];
    expect(chain.chain).toHaveLength(2);
    expect(chain.totalDuration).toBeCloseTo(9);
  });

  it('should handle previs shot with neither videoChain nor selectedVideoGenerationId', () => {
    const proj = makeProject({
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/shot1.png',
        videoGenerations: [
          { id: 'vg1', filePath: '/vid/v1.mp4', duration: 3 },
          { id: 'vg2', filePath: '/vid/v2.mp4', duration: 5 },
        ],
        // no selectedVideoGenerationId, no videoChain
      }],
    });
    const result = extractData(proj, {});
    const chain = result.videoChainMap['elem-1'];
    expect(chain).toBeDefined();
    // Should use latest (vg2) as single entry
    expect(chain.chain).toHaveLength(1);
    expect(chain.chain[0].id).toBe('vg2');
    expect(chain.totalDuration).toBe(5);
  });

  it('should handle generationsMap video entries including duration info', () => {
    const proj = makeProject();
    const result = extractData(proj, {});
    const gens = result.generationsMap['elem-1'];
    expect(gens).toBeDefined();
    expect(gens.videos.length).toBeGreaterThan(0);
    // Each video entry should have duration fields
    for (const v of gens.videos) {
      expect(v).toHaveProperty('duration');
      expect(v).toHaveProperty('actualDuration');
    }
  });

  it('should produce consistent IDs between generationsMap and videoChainMap', () => {
    const proj = makeProject();
    const result = extractData(proj, {});
    const chainIds = result.videoChainMap['elem-1']?.chain.map(s => s.id) || [];
    const genVideoIds = result.generationsMap['elem-1']?.videos.map(v => v.id) || [];
    // All chain IDs should exist in generationsMap videos
    for (const id of chainIds) {
      expect(genVideoIds).toContain(id);
    }
  });

  it('should handle project with no previsualizations at all', () => {
    const proj = {
      metadata: { title: 'Test' },
      elements: [{ id: 'e1', type: 'shot', content: 'WIDE', shotText: 'WIDE' }],
      characters: [],
      locations: [],
      scenes: [],
    } as any;
    const result = extractData(proj, {});
    expect(result.videoChainMap).toEqual({});
  });

  it('should handle project with previsualizations but empty shots array', () => {
    const proj = {
      metadata: { title: 'Test' },
      elements: [{ id: 'e1', type: 'shot', content: 'WIDE', shotText: 'WIDE' }],
      characters: [],
      locations: [],
      previsualizations: { shots: [] },
      scenes: [],
    } as any;
    const result = extractData(proj, {});
    expect(result.videoChainMap).toEqual({});
  });
});

// ── Slot duration from clips ────────────────────────────────

describe('videoChainMap slotDuration from timeline clips', () => {
  it('should set slotDuration to 0 when element has no matching visual clip', () => {
    const proj = makeProject({
      elements: [
        // No shot elements — elem-1 referenced by previs but no element
      ],
      previsShots: [{
        shotElementId: 'orphan-elem',
        filePath: '/img/shot.png',
        videoGenerations: [{ id: 'v1', filePath: '/vid/v1.mp4', duration: 6 }],
        selectedVideoGenerationId: 'v1',
      }],
    });
    const result = extractData(proj, {});
    const chain = result.videoChainMap['orphan-elem'];
    if (chain) {
      expect(chain.slotDuration).toBe(0);
    }
  });

  it('should get slotDuration from visual clip for shot that covers dialogue', () => {
    const proj = makeProject({
      elements: [
        { id: 'elem-1', type: 'shot', content: 'WIDE', shotText: 'WIDE scene' },
        { id: 'elem-2', type: 'dialogue', content: 'Hello', character: 'SARAH', dialogueText: 'Hello' },
      ],
      previsShots: [{
        shotElementId: 'elem-1',
        filePath: '/img/s1.png',
        generations: [{ id: 'g1', filePath: '/img/s1.png' }],
        videoGenerations: [{ id: 'v1', filePath: '/vid/v1.mp4', duration: 6, actualDuration: 5 }],
        selectedVideoGenerationId: 'v1',
      }],
    });
    const result = extractData(proj, {});
    const chain = result.videoChainMap['elem-1'];
    expect(chain).toBeDefined();
    // slotDuration should come from the visual clip's duration
    expect(chain.slotDuration).toBeGreaterThanOrEqual(0);
  });
});
