/**
 * Tests for clip inspector functionality — UPDATE_CLIP reducer, transform properties,
 * keyframe evaluation, clip lifecycle, and image panel fields.
 */
import { describe, it, expect } from 'vitest';
import {
  editorReducer, initialEditorState, evaluateKeyframes, KEYFRAMEABLE,
  formatTimecode, parseTimecodeToSeconds, getClipAtTime,
  type EditorState, type Clip, type Keyframe,
} from './editorStore.js';

function stateWith(overrides: Partial<EditorState> = {}): EditorState {
  return { ...initialEditorState, ...overrides };
}

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1', trackId: 'visuals', type: 'image', name: 'Test Shot',
    startTime: 0, duration: 10, ...overrides,
  };
}

// ── UPDATE_CLIP Reducer ─────────────────────────────────────────

describe('UPDATE_CLIP reducer', () => {
  it('should update clip start time', () => {
    const clip = makeClip({ startTime: 5 });
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { startTime: 10 } });
    expect(s2.clips[0].startTime).toBe(10);
  });

  it('should update clip duration', () => {
    const clip = makeClip({ duration: 5 });
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { duration: 8 } });
    expect(s2.clips[0].duration).toBe(8);
  });

  it('should update positionX', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { positionX: 150 } });
    expect((s2.clips[0] as any).positionX).toBe(150);
  });

  it('should update positionY', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { positionY: -200 } });
    expect((s2.clips[0] as any).positionY).toBe(-200);
  });

  it('should update scale', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { scale: 200 } });
    expect((s2.clips[0] as any).scale).toBe(200);
  });

  it('should update rotation', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { rotation: 45 } });
    expect((s2.clips[0] as any).rotation).toBe(45);
  });

  it('should update opacity', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { opacity: 50 } });
    expect((s2.clips[0] as any).opacity).toBe(50);
  });

  it('should update speed', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { speed: 2.5 } });
    expect((s2.clips[0] as any).speed).toBe(2.5);
  });

  it('should update volume', () => {
    const clip = makeClip({ type: 'music', trackId: 'music', volume: 100 });
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { volume: 42 } });
    expect(s2.clips[0].volume).toBe(42);
  });

  it('should update fadeIn and fadeOut', () => {
    const clip = makeClip({ type: 'music', trackId: 'music' });
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { fadeIn: 3, fadeOut: 5 } });
    expect(s2.clips[0].fadeIn).toBe(3);
    expect(s2.clips[0].fadeOut).toBe(5);
  });

  it('should update strength (image-to-video)', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { strength: 0.85 } });
    expect((s2.clips[0] as any).strength).toBe(0.85);
  });

  it('should update motionIntensity (image-to-video)', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { motionIntensity: 25 } });
    expect((s2.clips[0] as any).motionIntensity).toBe(25);
  });

  it('should update multiple fields at once', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: {
      positionX: 100, positionY: -50, scale: 150, rotation: 30, opacity: 80,
    } });
    const c = s2.clips[0] as any;
    expect(c.positionX).toBe(100);
    expect(c.positionY).toBe(-50);
    expect(c.scale).toBe(150);
    expect(c.rotation).toBe(30);
    expect(c.opacity).toBe(80);
  });

  it('should not modify other clips', () => {
    const c1 = makeClip({ id: 'clip-1', startTime: 0 });
    const c2 = makeClip({ id: 'clip-2', startTime: 10 });
    const s = stateWith({ clips: [c1, c2] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { startTime: 5 } });
    expect(s2.clips[0].startTime).toBe(5);
    expect(s2.clips[1].startTime).toBe(10); // unchanged
  });

  it('should also update userClips array', () => {
    const clip = makeClip();
    const s = stateWith({ clips: [clip], userClips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { duration: 20 } });
    expect(s2.clips[0].duration).toBe(20);
    expect(s2.userClips[0].duration).toBe(20);
  });

  it('should update track assignment', () => {
    const clip = makeClip({ trackId: 'visuals' });
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { trackId: 'gen-motion' } });
    expect(s2.clips[0].trackId).toBe('gen-motion');
  });

  it('should set keyframes on clip', () => {
    const clip = makeClip();
    const kfs: Keyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 5, value: 100, easing: 'linear' },
    ];
    const s = stateWith({ clips: [clip] });
    const s2 = editorReducer(s, { type: 'UPDATE_CLIP', clipId: 'clip-1', updates: { keyframes: { opacity: kfs } } });
    expect(s2.clips[0].keyframes?.opacity?.length).toBe(2);
  });
});

// ── DELETE_CLIP and ADD_CLIP ────────────────────────────────────

describe('Clip lifecycle (add/delete)', () => {
  it('should add a clip and select it', () => {
    const clip = makeClip({ id: 'new-clip' });
    const s = editorReducer(initialEditorState, { type: 'ADD_CLIP', clip });
    expect(s.clips.length).toBe(1);
    expect(s.clips[0].id).toBe('new-clip');
    expect(s.selectedClipIds).toEqual(['new-clip']);
    expect(s.userClips.length).toBe(1);
  });

  it('should delete a clip', () => {
    const clip = makeClip({ id: 'clip-1' });
    const s = stateWith({ clips: [clip], userClips: [clip], selectedClipIds: ['clip-1'] });
    const s2 = editorReducer(s, { type: 'DELETE_CLIP', clipId: 'clip-1' });
    expect(s2.clips.length).toBe(0);
    expect(s2.userClips.length).toBe(0);
    expect(s2.selectedClipIds).toEqual([]);
  });

  it('should not deselect when deleting a different clip', () => {
    const c1 = makeClip({ id: 'clip-1' });
    const c2 = makeClip({ id: 'clip-2' });
    const s = stateWith({ clips: [c1, c2], selectedClipIds: ['clip-1'] });
    const s2 = editorReducer(s, { type: 'DELETE_CLIP', clipId: 'clip-2' });
    expect(s2.selectedClipIds).toEqual(['clip-1']);
    expect(s2.clips.length).toBe(1);
  });
});

// ── evaluateKeyframes ───────────────────────────────────────────

describe('evaluateKeyframes', () => {
  it('should return clip property value when no keyframes', () => {
    const clip = makeClip({ opacity: 75 } as any);
    expect(evaluateKeyframes(clip, 'opacity', 5)).toBe(75);
  });

  it('should return KEYFRAMEABLE default when no keyframes and no clip value', () => {
    const clip = makeClip();
    expect(evaluateKeyframes(clip, 'opacity', 5)).toBe(100); // KEYFRAMEABLE.opacity.def
    expect(evaluateKeyframes(clip, 'scale', 5)).toBe(100);
    expect(evaluateKeyframes(clip, 'rotation', 5)).toBe(0);
    expect(evaluateKeyframes(clip, 'speed', 5)).toBe(1);
    expect(evaluateKeyframes(clip, 'strength', 5)).toBe(0.7);
    expect(evaluateKeyframes(clip, 'motionIntensity', 5)).toBe(5);
  });

  it('should return single keyframe value regardless of time', () => {
    const clip = makeClip({
      keyframes: { opacity: [{ time: 2, value: 50, easing: 'linear' }] },
    });
    expect(evaluateKeyframes(clip, 'opacity', 0)).toBe(50);
    expect(evaluateKeyframes(clip, 'opacity', 5)).toBe(50);
    expect(evaluateKeyframes(clip, 'opacity', 100)).toBe(50);
  });

  it('should return first keyframe value before first keyframe time', () => {
    const clip = makeClip({
      keyframes: { opacity: [
        { time: 2, value: 30, easing: 'linear' },
        { time: 8, value: 90, easing: 'linear' },
      ] },
    });
    expect(evaluateKeyframes(clip, 'opacity', 0)).toBe(30);
    expect(evaluateKeyframes(clip, 'opacity', 1)).toBe(30);
  });

  it('should return last keyframe value after last keyframe time', () => {
    const clip = makeClip({
      keyframes: { opacity: [
        { time: 2, value: 30, easing: 'linear' },
        { time: 8, value: 90, easing: 'linear' },
      ] },
    });
    expect(evaluateKeyframes(clip, 'opacity', 9)).toBe(90);
    expect(evaluateKeyframes(clip, 'opacity', 100)).toBe(90);
  });

  it('should linearly interpolate between two keyframes', () => {
    const clip = makeClip({
      keyframes: { opacity: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 10, value: 100, easing: 'linear' },
      ] },
    });
    expect(evaluateKeyframes(clip, 'opacity', 0)).toBe(0);
    expect(evaluateKeyframes(clip, 'opacity', 5)).toBe(50);
    expect(evaluateKeyframes(clip, 'opacity', 10)).toBe(100);
    expect(evaluateKeyframes(clip, 'opacity', 2.5)).toBe(25);
    expect(evaluateKeyframes(clip, 'opacity', 7.5)).toBe(75);
  });

  it('should hold value with constant easing', () => {
    const clip = makeClip({
      keyframes: { opacity: [
        { time: 0, value: 20, easing: 'constant' },
        { time: 10, value: 80, easing: 'linear' },
      ] },
    });
    // Between 0 and 10, constant easing holds first value
    expect(evaluateKeyframes(clip, 'opacity', 0)).toBe(20);
    expect(evaluateKeyframes(clip, 'opacity', 5)).toBe(20);
    expect(evaluateKeyframes(clip, 'opacity', 9.99)).toBe(20);
    expect(evaluateKeyframes(clip, 'opacity', 10)).toBe(80);
  });

  it('should apply bezier easing (ease in-out)', () => {
    const clip = makeClip({
      keyframes: { scale: [
        { time: 0, value: 100, easing: 'bezier' },
        { time: 10, value: 200, easing: 'linear' },
      ] },
    });
    // Bezier: t*t*(3-2t), at midpoint (t=0.5) → 0.5*0.5*2 = 0.5 → same as linear
    expect(evaluateKeyframes(clip, 'scale', 5)).toBe(150);
    // At t=0.25 → 0.0625 * 2.5 = 0.15625 → 100 + 100*0.15625 = 115.625
    expect(evaluateKeyframes(clip, 'scale', 2.5)).toBeCloseTo(115.625, 2);
    // At t=0.75 → 0.5625 * 1.5 = 0.84375 → 100 + 100*0.84375 = 184.375
    expect(evaluateKeyframes(clip, 'scale', 7.5)).toBeCloseTo(184.375, 2);
  });

  it('should interpolate across multiple keyframes', () => {
    const clip = makeClip({
      keyframes: { positionX: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 5, value: 100, easing: 'linear' },
        { time: 10, value: 0, easing: 'linear' },
      ] },
    });
    expect(evaluateKeyframes(clip, 'positionX', 0)).toBe(0);
    expect(evaluateKeyframes(clip, 'positionX', 2.5)).toBe(50);
    expect(evaluateKeyframes(clip, 'positionX', 5)).toBe(100);
    expect(evaluateKeyframes(clip, 'positionX', 7.5)).toBe(50);
    expect(evaluateKeyframes(clip, 'positionX', 10)).toBe(0);
  });

  it('should handle negative values', () => {
    const clip = makeClip({
      keyframes: { positionY: [
        { time: 0, value: -100, easing: 'linear' },
        { time: 10, value: 100, easing: 'linear' },
      ] },
    });
    expect(evaluateKeyframes(clip, 'positionY', 5)).toBe(0);
    expect(evaluateKeyframes(clip, 'positionY', 0)).toBe(-100);
  });

  it('should handle volume keyframes 0-200', () => {
    const clip = makeClip({
      volume: 100,
      keyframes: { volume: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 10, value: 200, easing: 'linear' },
      ] },
    });
    expect(evaluateKeyframes(clip, 'volume', 0)).toBe(0);
    expect(evaluateKeyframes(clip, 'volume', 5)).toBe(100);
    expect(evaluateKeyframes(clip, 'volume', 10)).toBe(200);
  });
});

// ── KEYFRAMEABLE config ─────────────────────────────────────────

describe('KEYFRAMEABLE configuration', () => {
  it('should define all transform properties', () => {
    expect(KEYFRAMEABLE.positionX).toBeDefined();
    expect(KEYFRAMEABLE.positionY).toBeDefined();
    expect(KEYFRAMEABLE.scale).toBeDefined();
    expect(KEYFRAMEABLE.rotation).toBeDefined();
    expect(KEYFRAMEABLE.opacity).toBeDefined();
  });

  it('should define motion properties', () => {
    expect(KEYFRAMEABLE.speed).toBeDefined();
    expect(KEYFRAMEABLE.speed.min).toBe(0.1);
    expect(KEYFRAMEABLE.speed.max).toBe(10);
    expect(KEYFRAMEABLE.speed.def).toBe(1);
  });

  it('should define image-to-video properties', () => {
    expect(KEYFRAMEABLE.strength).toBeDefined();
    expect(KEYFRAMEABLE.strength.min).toBe(0);
    expect(KEYFRAMEABLE.strength.max).toBe(1);
    expect(KEYFRAMEABLE.strength.def).toBe(0.7);

    expect(KEYFRAMEABLE.motionIntensity).toBeDefined();
    expect(KEYFRAMEABLE.motionIntensity.min).toBe(0);
    expect(KEYFRAMEABLE.motionIntensity.max).toBe(100);
    expect(KEYFRAMEABLE.motionIntensity.def).toBe(5);
  });

  it('should define audio properties', () => {
    expect(KEYFRAMEABLE.volume).toBeDefined();
    expect(KEYFRAMEABLE.volume.min).toBe(0);
    expect(KEYFRAMEABLE.volume.max).toBe(200);
    expect(KEYFRAMEABLE.volume.def).toBe(100);
  });

  it('should have correct transform ranges', () => {
    expect(KEYFRAMEABLE.positionX.min).toBe(-9999);
    expect(KEYFRAMEABLE.positionX.max).toBe(9999);
    expect(KEYFRAMEABLE.positionY.min).toBe(-9999);
    expect(KEYFRAMEABLE.positionY.max).toBe(9999);
    expect(KEYFRAMEABLE.scale.max).toBe(1000);
    expect(KEYFRAMEABLE.rotation.min).toBe(-360);
    expect(KEYFRAMEABLE.rotation.max).toBe(360);
    expect(KEYFRAMEABLE.opacity.min).toBe(0);
    expect(KEYFRAMEABLE.opacity.max).toBe(100);
  });
});

// ── Timecode formatting/parsing ─────────────────────────────────

describe('Timecode formatting (MM:SS:FF, HH:MM:SS:FF with hours)', () => {
  it('should format 0 seconds as 00:00:00', () => {
    expect(formatTimecode(0)).toBe('00:00:00');
  });

  it('should format 30 seconds as MM:SS:FF', () => {
    expect(formatTimecode(30)).toBe('00:30:00');
  });

  it('should format 90 seconds with minutes', () => {
    expect(formatTimecode(90)).toBe('01:30:00');
  });

  it('should include hours prefix when >= 3600s', () => {
    expect(formatTimecode(3661)).toBe('01:01:01:00');
  });

  it('should format fractional seconds as frames at 24fps', () => {
    // 0.5 seconds = 12 frames at 24fps
    expect(formatTimecode(0.5, 24)).toBe('00:00:12');
  });

  it('should format at 30fps', () => {
    // 0.5 seconds = 15 frames at 30fps
    expect(formatTimecode(0.5, 30)).toBe('00:00:15');
  });
});

describe('Timecode parsing', () => {
  it('should parse plain seconds', () => {
    expect(parseTimecodeToSeconds('30')).toBe(30);
  });

  it('should parse decimal seconds', () => {
    expect(parseTimecodeToSeconds('2.5')).toBe(2.5);
  });

  it('should parse MM:SS:FF format (3 parts)', () => {
    // 01:30:00 at 24fps = 1*60 + 30 + 0/24 = 90
    expect(parseTimecodeToSeconds('01:30:00', 24)).toBe(90);
  });

  it('should parse HH:MM:SS:FF format (4 parts)', () => {
    // 00:00:01:12 at 24fps = 0*3600 + 0*60 + 1 + 12/24 = 1.5
    expect(parseTimecodeToSeconds('00:00:01:12', 24)).toBe(1.5);
  });

  it('should parse MM:SS format (2 parts)', () => {
    expect(parseTimecodeToSeconds('01:30')).toBe(90);
  });

  it('should roundtrip format→parse', () => {
    const original = 95.5; // 1 min 35 sec 12 frames
    const tc = formatTimecode(original, 24);
    const parsed = parseTimecodeToSeconds(tc, 24);
    expect(parsed).toBeCloseTo(original, 1);
  });
});

// ── getClipAtTime ───────────────────────────────────────────────

describe('getClipAtTime', () => {
  const clips: Clip[] = [
    makeClip({ id: 'v1', trackId: 'visuals', startTime: 0, duration: 10 }),
    makeClip({ id: 'v2', trackId: 'visuals', startTime: 10, duration: 10 }),
    makeClip({ id: 'm1', trackId: 'music', startTime: 0, duration: 20 }),
  ];

  it('should find clip at given time (returns last match)', () => {
    // At time 5: v1 (0-10) and m1 (0-20) both match; returns last
    expect(getClipAtTime(clips, 5)?.id).toBe('m1');
  });

  it('should find clip on specific track', () => {
    expect(getClipAtTime(clips, 5, 'music')?.id).toBe('m1');
  });

  it('should return null when no clip at time', () => {
    expect(getClipAtTime(clips, 25)).toBeNull();
  });

  it('should find the latest clip when multiple overlap', () => {
    // At time 5, v1 (0-10) and m1 (0-20) overlap; getClipAtTime returns last match
    const result = getClipAtTime(clips, 5);
    // Without trackId filter, it should return one of the overlapping clips
    expect(result).not.toBeNull();
  });
});
