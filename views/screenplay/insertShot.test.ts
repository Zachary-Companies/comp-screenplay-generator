/**
 * Tests for insertShotBefore logic and its interaction with extractData.
 * Verifies that inserting a shot element correctly splits content groups
 * and recalculates slot durations.
 */
import { describe, it, expect } from 'vitest';
import { extractData } from '../editor/extractData';
import { buildDialogueDurationMap, computeSlotDuration, computeVideoGapInfo } from './computeSlotDuration';

// ── Insert shot simulation ──────────────────────────────────

/**
 * Simulates the insertShotBefore function from ScreenplayView.
 * Pure function for testing — inserts a new shot element before the target.
 */
function insertShotBefore(
  elements: Array<{ id: string; type: string; [key: string]: any }>,
  beforeElemId: string,
  shotType: string = 'MEDIUM',
): Array<{ id: string; type: string; [key: string]: any }> {
  const elems = [...elements];
  const idx = elems.findIndex(e => e.id === beforeElemId);
  if (idx < 0) return elems; // target not found — return unchanged
  const targetElem = elems[idx];
  const desc = targetElem.content || '';
  const newElem = {
    id: 'shot_new_' + Date.now().toString(36),
    type: 'shot',
    content: `${shotType} — ${desc.slice(0, 80)}`,
    shotText: `${shotType} — ${desc.slice(0, 80)}`,
    frameSize: shotType,
  };
  elems.splice(idx, 0, newElem);
  return elems;
}

// ── Tests ───────────────────────────────────────────────────

describe('insertShotBefore', () => {
  const baseElements = [
    { id: 'e1', type: 'shot', content: 'WIDE SHOT — bedroom' },
    { id: 'e2', type: 'dialogue', content: 'Hello', character: 'SARAH' },
    { id: 'e3', type: 'action', content: 'Sarah leans forward' },
    { id: 'e4', type: 'dialogue', content: 'Tell me more', character: 'DAVID' },
    { id: 'e5', type: 'shot', content: 'CLOSE-UP — face' },
    { id: 'e6', type: 'dialogue', content: 'Once upon a time', character: 'DAVID' },
  ];

  it('should insert shot before an action element', () => {
    const result = insertShotBefore(baseElements, 'e3');
    expect(result.length).toBe(7);
    expect(result[2].type).toBe('shot');
    expect(result[2].content).toContain('MEDIUM');
    expect(result[2].content).toContain('Sarah leans forward');
    // Original e3 should now be at index 3
    expect(result[3].id).toBe('e3');
  });

  it('should insert shot before a dialogue element', () => {
    const result = insertShotBefore(baseElements, 'e4');
    expect(result.length).toBe(7);
    expect(result[3].type).toBe('shot');
    expect(result[3].content).toContain('Tell me more');
  });

  it('should insert shot with custom shot type', () => {
    const result = insertShotBefore(baseElements, 'e3', 'CLOSE-UP');
    expect(result[2].frameSize).toBe('CLOSE-UP');
    expect(result[2].content).toContain('CLOSE-UP');
  });

  it('should return unchanged array when target not found', () => {
    const result = insertShotBefore(baseElements, 'nonexistent');
    expect(result.length).toBe(baseElements.length);
    expect(result).toEqual(baseElements);
  });

  it('should handle inserting before the first element', () => {
    const result = insertShotBefore(baseElements, 'e1');
    expect(result.length).toBe(7);
    expect(result[0].type).toBe('shot');
    expect(result[1].id).toBe('e1');
  });

  it('should handle inserting before the last element', () => {
    const result = insertShotBefore(baseElements, 'e6');
    expect(result.length).toBe(7);
    expect(result[5].type).toBe('shot');
    expect(result[6].id).toBe('e6');
  });

  it('should handle element with empty content', () => {
    const elems = [
      { id: 'e1', type: 'shot', content: 'WIDE' },
      { id: 'e2', type: 'action', content: '' },
    ];
    const result = insertShotBefore(elems, 'e2');
    expect(result[1].content).toBe('MEDIUM — ');
  });
});

// ── Slot duration recalculation after insertion ─────────────

describe('slot duration recalculation after shot insertion', () => {
  it('should split slot duration when shot is inserted between dialogues', () => {
    // Before: Shot1 covers D1, D2, D3
    // After: Shot1 covers D1, NewShot covers D2, D3
    const durMap = { d1: 2.0, d2: 3.0, d3: 1.5 };

    const beforeContent = [
      { id: 'd1', type: 'dialogue' },
      { id: 'd2', type: 'dialogue' },
      { id: 'd3', type: 'dialogue' },
    ];
    const beforeSlot = computeSlotDuration(beforeContent, durMap);
    // (2.0 + 0.15) + (3.0 + 0.15) + (1.5 + 0.15) = 6.95
    expect(beforeSlot).toBeCloseTo(6.95);

    // After inserting shot before d2:
    const shot1Content = [{ id: 'd1', type: 'dialogue' }];
    const newShotContent = [
      { id: 'd2', type: 'dialogue' },
      { id: 'd3', type: 'dialogue' },
    ];
    const shot1Slot = computeSlotDuration(shot1Content, durMap);
    const newShotSlot = computeSlotDuration(newShotContent, durMap);

    // Shot1: 2.0 + 0.15 = 2.15
    expect(shot1Slot).toBeCloseTo(2.15);
    // NewShot: (3.0 + 0.15) + (1.5 + 0.15) = 4.8
    expect(newShotSlot).toBeCloseTo(4.8);
    // Sum should approximate original
    expect(shot1Slot + newShotSlot).toBeCloseTo(beforeSlot);
  });

  it('should handle insertion where no dialogues follow new shot', () => {
    const durMap = { d1: 2.0 };
    // Insert shot before action (no dialogue after)
    const content = [{ id: 'a1', type: 'action' }];
    const slot = computeSlotDuration(content, durMap);
    expect(slot).toBe(0); // no dialogue → unknown slot
  });
});

// ── extractData with modified elements (post-insertion) ─────

describe('extractData after shot insertion', () => {
  it('should create clips for newly inserted shots', () => {
    const elements = [
      { id: 'e1', type: 'shot', content: 'WIDE SHOT', shotText: 'WIDE scene' },
      { id: 'e2', type: 'dialogue', content: 'Hello', character: 'SARAH', characterName: 'SARAH', dialogueText: 'Hello' },
      { id: 'e3', type: 'action', content: 'Sarah reacts' },
      { id: 'e4', type: 'dialogue', content: 'More', character: 'DAVID', characterName: 'DAVID', dialogueText: 'More' },
    ];

    // Insert shot before e3
    const newElements = insertShotBefore(elements, 'e3');
    expect(newElements.length).toBe(5);

    const proj = {
      metadata: { title: 'Test' },
      elements: newElements,
      characters: [{ id: 'c1', name: 'Sarah', displayName: 'SARAH' }],
      locations: [],
      previsualizations: { shots: [] },
      scenes: [],
    } as any;

    const result = extractData(proj, {});

    // Should have clips for both shots + dialogue
    const visualClips = result.clips.filter(c => c.trackId === 'visuals');
    expect(visualClips.length).toBeGreaterThanOrEqual(2); // original + new shot
  });

  it('should not crash with empty elements array', () => {
    const proj = {
      metadata: { title: 'Test' },
      elements: [],
      characters: [],
      locations: [],
      previsualizations: { shots: [] },
      scenes: [],
    } as any;

    const result = extractData(proj, {});
    expect(result.clips).toEqual([]);
    expect(result.videoChainMap).toEqual({});
  });

  it('should handle project with only dialogue elements (no shots)', () => {
    const proj = {
      metadata: { title: 'Test' },
      elements: [
        { id: 'd1', type: 'dialogue', content: 'Hello', character: 'A', dialogueText: 'Hello' },
        { id: 'd2', type: 'dialogue', content: 'World', character: 'B', dialogueText: 'World' },
      ],
      characters: [],
      locations: [],
      previsualizations: { shots: [] },
      scenes: [],
    } as any;

    const result = extractData(proj, {});
    // Should create dialogue clips but no visual clips
    const dialogClips = result.clips.filter(c => c.type === 'dialog');
    expect(dialogClips.length).toBe(2);
    expect(result.videoChainMap).toEqual({});
  });
});

// ── Video gap after shot insertion ──────────────────────────

describe('video gap recalculation after shot insertion', () => {
  it('should show gap when video was enough before split but not after', () => {
    // Before: 1 shot with 6s video covering 6s of dialogue → filled
    // After split: shot1 has 6s video covering 2s → overfilled
    //              shot2 has no video covering 4s → needs video

    const durMap = { d1: 2.0, d2: 4.0 };

    // Before: single shot covers both dialogues
    const beforeContent = [
      { id: 'd1', type: 'dialogue' },
      { id: 'd2', type: 'dialogue' },
    ];
    const beforeSlot = computeSlotDuration(beforeContent, durMap);
    // (2 + 0.15) + (4 + 0.15) = 6.3
    expect(beforeSlot).toBeCloseTo(6.3);

    const gapBefore = computeVideoGapInfo(
      [{ id: 'v1', duration: 6, actualDuration: 6 }],
      ['v1'],
      'v1',
      beforeSlot,
    );
    // 6 < 6.3 - 0.01 = 6.29, so NOT filled
    expect(gapBefore.isFilled).toBe(false);

    // After split: shot1 covers d1 only
    const shot1Slot = computeSlotDuration([{ id: 'd1', type: 'dialogue' }], durMap);
    expect(shot1Slot).toBeCloseTo(2.15);

    const gapShot1 = computeVideoGapInfo(
      [{ id: 'v1', duration: 6, actualDuration: 6 }],
      ['v1'],
      'v1',
      shot1Slot,
    );
    expect(gapShot1.isFilled).toBe(true); // 6 >= 2.15

    // shot2 has NO video
    const shot2Slot = computeSlotDuration([{ id: 'd2', type: 'dialogue' }], durMap);
    expect(shot2Slot).toBeCloseTo(4.15);

    const gapShot2 = computeVideoGapInfo(undefined, undefined, undefined, shot2Slot);
    expect(gapShot2.totalVideoDur).toBe(0);
    expect(gapShot2.gap).toBeCloseTo(4.15);
    expect(gapShot2.isFilled).toBe(false);
  });
});
