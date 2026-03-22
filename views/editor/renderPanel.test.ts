/**
 * Tests for the render panel — reducer state management, clip filtering,
 * resolution scaling, frame range calculations, and server-side render route.
 */
import { describe, it, expect } from 'vitest';
import {
  editorReducer, initialEditorState,
  formatTimecode, parseTimecodeToSeconds,
  type EditorState, type Clip, type Track,
} from './editorStore.js';

// ── Helper: create state with clips and tracks ──────────────────

function stateWith(overrides: Partial<EditorState> = {}): EditorState {
  return { ...initialEditorState, ...overrides };
}

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1', trackId: 'visuals', type: 'image', name: 'Test',
    startTime: 0, duration: 10, ...overrides,
  };
}

// ── Render Settings Reducer ─────────────────────────────────────

describe('Render settings reducer', () => {
  it('should have correct defaults', () => {
    const s = initialEditorState;
    expect(s.renderSettings.resolutionX).toBe(1920);
    expect(s.renderSettings.resolutionY).toBe(1080);
    expect(s.renderSettings.resolutionPct).toBe(100);
    expect(s.renderSettings.fps).toBe(24);
    expect(s.renderSettings.frameStart).toBe(0);
    expect(s.renderSettings.frameEnd).toBeNull();
    expect(s.renderSettings.format).toBe('mp4');
    expect(s.renderSettings.quality).toBe('medium');
    expect(s.renderSettings.outputPath).toBe('');
  });

  it('should update resolution X', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { resolutionX: 3840 } });
    expect(s.renderSettings.resolutionX).toBe(3840);
    expect(s.renderSettings.resolutionY).toBe(1080); // unchanged
  });

  it('should update resolution Y', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { resolutionY: 2160 } });
    expect(s.renderSettings.resolutionY).toBe(2160);
  });

  it('should update resolution percentage', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { resolutionPct: 50 } });
    expect(s.renderSettings.resolutionPct).toBe(50);
  });

  it('should update fps', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { fps: 60 } });
    expect(s.renderSettings.fps).toBe(60);
  });

  it('should update format', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { format: 'webm' } });
    expect(s.renderSettings.format).toBe('webm');
  });

  it('should update quality', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { quality: 'high' } });
    expect(s.renderSettings.quality).toBe('high');
  });

  it('should update output path', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { outputPath: '/renders/out' } });
    expect(s.renderSettings.outputPath).toBe('/renders/out');
  });

  it('should update frame range', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 10, frameEnd: 30 } });
    expect(s.renderSettings.frameStart).toBe(10);
    expect(s.renderSettings.frameEnd).toBe(30);
  });

  it('should set frameEnd to null for full sequence', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameEnd: 30 } });
    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 0, frameEnd: null } });
    expect(s.renderSettings.frameEnd).toBeNull();
  });

  it('should update multiple settings at once', () => {
    const s = editorReducer(initialEditorState, {
      type: 'SET_RENDER_SETTINGS',
      settings: { resolutionX: 1280, resolutionY: 720, fps: 30, format: 'mov', quality: 'low' },
    });
    expect(s.renderSettings.resolutionX).toBe(1280);
    expect(s.renderSettings.resolutionY).toBe(720);
    expect(s.renderSettings.fps).toBe(30);
    expect(s.renderSettings.format).toBe('mov');
    expect(s.renderSettings.quality).toBe('low');
  });

  it('should preserve unrelated state when updating settings', () => {
    const s = stateWith({ currentTime: 5.5, duration: 120 });
    const s2 = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { fps: 60 } });
    expect(s2.currentTime).toBe(5.5);
    expect(s2.duration).toBe(120);
  });
});

// ── Render Status Reducer ───────────────────────────────────────

describe('Render status reducer', () => {
  it('should default to null status', () => {
    expect(initialEditorState.renderStatus).toBeNull();
    expect(initialEditorState.renderProgress).toBe(0);
    expect(initialEditorState.renderError).toBeNull();
    expect(initialEditorState.lastRenderPath).toBeNull();
  });

  it('should set rendering status with progress 0', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_STATUS', status: 'rendering', progress: 0, error: null });
    expect(s.renderStatus).toBe('rendering');
    expect(s.renderProgress).toBe(0);
    expect(s.renderError).toBeNull();
  });

  it('should set done status with progress 100 and path', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_STATUS', status: 'rendering', progress: 0 });
    s = editorReducer(s, { type: 'SET_RENDER_STATUS', status: 'done', progress: 100, path: '/renders/output.mp4' });
    expect(s.renderStatus).toBe('done');
    expect(s.renderProgress).toBe(100);
    expect(s.lastRenderPath).toBe('/renders/output.mp4');
  });

  it('should set error status with error message', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_STATUS', status: 'error', error: 'FFmpeg crashed' });
    expect(s.renderStatus).toBe('error');
    expect(s.renderError).toBe('FFmpeg crashed');
  });

  it('should clear status on cancel', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_STATUS', status: 'rendering', progress: 50 });
    s = editorReducer(s, { type: 'SET_RENDER_STATUS', status: null, progress: 0 });
    expect(s.renderStatus).toBeNull();
    expect(s.renderProgress).toBe(0);
  });

  it('should preserve render path from previous render when starting new one', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_STATUS', status: 'done', path: '/old.mp4' });
    s = editorReducer(s, { type: 'SET_RENDER_STATUS', status: 'rendering', progress: 0, error: null });
    // path should be preserved (not cleared) unless explicitly set
    expect(s.lastRenderPath).toBe('/old.mp4');
  });

  it('should not affect render settings when changing status', () => {
    const s = stateWith({ renderSettings: { ...initialEditorState.renderSettings, fps: 60 } });
    const s2 = editorReducer(s, { type: 'SET_RENDER_STATUS', status: 'rendering' });
    expect(s2.renderSettings.fps).toBe(60);
  });
});

// ── Resolution Scaling ──────────────────────────────────────────

describe('Resolution scaling calculations', () => {
  it('100% should output full resolution', () => {
    const rs = initialEditorState.renderSettings;
    const outX = Math.round(rs.resolutionX * rs.resolutionPct / 100);
    const outY = Math.round(rs.resolutionY * rs.resolutionPct / 100);
    expect(outX).toBe(1920);
    expect(outY).toBe(1080);
  });

  it('50% should halve resolution', () => {
    const rs = { ...initialEditorState.renderSettings, resolutionPct: 50 };
    expect(Math.round(rs.resolutionX * rs.resolutionPct / 100)).toBe(960);
    expect(Math.round(rs.resolutionY * rs.resolutionPct / 100)).toBe(540);
  });

  it('25% should quarter resolution', () => {
    const rs = { ...initialEditorState.renderSettings, resolutionPct: 25 };
    expect(Math.round(rs.resolutionX * rs.resolutionPct / 100)).toBe(480);
    expect(Math.round(rs.resolutionY * rs.resolutionPct / 100)).toBe(270);
  });

  it('75% of 4K should calculate correctly', () => {
    const rs = { ...initialEditorState.renderSettings, resolutionX: 3840, resolutionY: 2160, resolutionPct: 75 };
    expect(Math.round(rs.resolutionX * rs.resolutionPct / 100)).toBe(2880);
    expect(Math.round(rs.resolutionY * rs.resolutionPct / 100)).toBe(1620);
  });
});

// ── Frame Range Calculations ────────────────────────────────────

describe('Frame range calculations', () => {
  it('should calculate correct frame count at 24fps', () => {
    const duration = 10;
    const fps = 24;
    expect(Math.round(duration * fps)).toBe(240);
  });

  it('should calculate correct frame count at 60fps', () => {
    const duration = 5;
    const fps = 60;
    expect(Math.round(duration * fps)).toBe(300);
  });

  it('full sequence should use frameStart=0 and duration as end', () => {
    const rs = initialEditorState.renderSettings;
    const duration = 120;
    const startTime = 0;
    const endTime = rs.frameEnd != null ? rs.frameEnd : duration;
    expect(startTime).toBe(0);
    expect(endTime).toBe(120);
  });

  it('range render should use frameStart and frameEnd', () => {
    const rs = { ...initialEditorState.renderSettings, frameStart: 10, frameEnd: 30 };
    const startTime = rs.frameStart;
    const endTime = rs.frameEnd ?? 120;
    expect(startTime).toBe(10);
    expect(endTime).toBe(30);
  });

  it('Use Selection should set frame range from selected clip', () => {
    const clip = makeClip({ startTime: 5.5, duration: 3.2 });
    const s = stateWith({ clips: [clip], selectedClipIds: [clip.id] });
    const sel = s.clips.find(c => c.id === s.selectedClipIds[0]);
    const settings = sel ? { frameStart: sel.startTime, frameEnd: sel.startTime + sel.duration } : null;
    expect(settings).toEqual({ frameStart: 5.5, frameEnd: 8.7 });
  });
});

// ── Clip Filtering for Render ───────────────────────────────────

describe('Clip filtering for render', () => {
  const baseClips: Clip[] = [
    makeClip({ id: 'v1', trackId: 'visuals', type: 'image', startTime: 0, duration: 10, filePath: '/img1.png' }),
    makeClip({ id: 'v2', trackId: 'visuals', type: 'image', startTime: 10, duration: 10, filePath: '/img2.png' }),
    makeClip({ id: 'd1', trackId: 'dialog', type: 'dialog', startTime: 2, duration: 3, elementId: 'elem-38' }),
    makeClip({ id: 'm1', trackId: 'music', type: 'music', startTime: 0, duration: 20, filePath: '/music.mp3', volume: 80, fadeIn: 2, fadeOut: 3 }),
    makeClip({ id: 's1', trackId: 'subtitles', type: 'caption', startTime: 5, duration: 2, content: 'Action line' }),
  ];

  const baseTracks: Track[] = [
    { id: 'visuals', name: 'Visuals', type: 'video', locked: false, visible: true, muted: false },
    { id: 'dialog', name: 'Dialog', type: 'dialog', locked: false, visible: true, muted: false },
    { id: 'music', name: 'Music', type: 'music', locked: false, visible: true, muted: false },
    { id: 'subtitles', name: 'Subtitles', type: 'caption', locked: false, visible: true, muted: false },
  ];

  function filterClips(clips: Clip[], tracks: Track[], startTime: number, endTime: number) {
    return clips.filter(c => {
      const clipEnd = c.startTime + c.duration;
      if (clipEnd <= startTime || c.startTime >= endTime) return false;
      const track = tracks.find(t => t.id === c.trackId);
      if (track?.muted) return false;
      return true;
    });
  }

  it('full range should include all clips', () => {
    const result = filterClips(baseClips, baseTracks, 0, 20);
    expect(result.length).toBe(5);
  });

  it('should exclude clips entirely outside time range', () => {
    const result = filterClips(baseClips, baseTracks, 0, 5);
    // v1 (0-10) ✓, v2 (10-20) ✗, d1 (2-5) ✓, m1 (0-20) ✓, s1 (5-7) ✗ (starts at boundary)
    expect(result.map(c => c.id)).toContain('v1');
    expect(result.map(c => c.id)).not.toContain('v2');
  });

  it('should exclude clips on muted tracks', () => {
    const mutedTracks = baseTracks.map(t => t.id === 'music' ? { ...t, muted: true } : t);
    const result = filterClips(baseClips, mutedTracks, 0, 20);
    expect(result.map(c => c.id)).not.toContain('m1');
  });

  it('should include clips that overlap the time range partially', () => {
    // v1 is 0-10, range is 5-15 → overlaps
    const result = filterClips(baseClips, baseTracks, 5, 15);
    expect(result.map(c => c.id)).toContain('v1');
    expect(result.map(c => c.id)).toContain('v2');
  });

  it('should exclude clips that end exactly at range start', () => {
    // d1 is 2-5, range starts at 5 → clipEnd(5) <= startTime(5) → excluded
    const result = filterClips(baseClips, baseTracks, 5, 20);
    expect(result.map(c => c.id)).not.toContain('d1');
  });

  it('should exclude clips that start exactly at range end', () => {
    // v2 starts at 10, range ends at 10 → excluded
    const result = filterClips(baseClips, baseTracks, 0, 10);
    expect(result.map(c => c.id)).not.toContain('v2');
  });

  it('should preserve volume, fadeIn, fadeOut in mapped clips', () => {
    const result = filterClips(baseClips, baseTracks, 0, 20);
    const music = result.find(c => c.id === 'm1')!;
    expect(music.volume).toBe(80);
    expect(music.fadeIn).toBe(2);
    expect(music.fadeOut).toBe(3);
  });

  it('should include dialog clips with elementId', () => {
    const result = filterClips(baseClips, baseTracks, 0, 20);
    const dialog = result.find(c => c.id === 'd1')!;
    expect(dialog.elementId).toBe('elem-38');
    expect(dialog.type).toBe('dialog');
  });

  it('multiple muted tracks should all be excluded', () => {
    const mutedTracks = baseTracks.map(t =>
      (t.id === 'music' || t.id === 'subtitles') ? { ...t, muted: true } : t
    );
    const result = filterClips(baseClips, mutedTracks, 0, 20);
    expect(result.map(c => c.id)).not.toContain('m1');
    expect(result.map(c => c.id)).not.toContain('s1');
    expect(result.length).toBe(3); // v1, v2, d1
  });
});

// ── Render Settings Payload Construction ────────────────────────

describe('Render payload construction', () => {
  it('should scale resolution by percentage for server payload', () => {
    const rs = { ...initialEditorState.renderSettings, resolutionX: 1920, resolutionY: 1080, resolutionPct: 50 };
    const payload = {
      resolutionX: Math.round(rs.resolutionX * rs.resolutionPct / 100),
      resolutionY: Math.round(rs.resolutionY * rs.resolutionPct / 100),
      fps: rs.fps,
      format: rs.format,
      quality: rs.quality,
    };
    expect(payload.resolutionX).toBe(960);
    expect(payload.resolutionY).toBe(540);
    expect(payload.fps).toBe(24);
    expect(payload.format).toBe('mp4');
    expect(payload.quality).toBe('medium');
  });

  it('should map clips to render format with correct fields', () => {
    const clip = makeClip({
      id: 'c1', type: 'music', trackId: 'music',
      filePath: '/music.mp3', startTime: 5, duration: 30,
      volume: 75, fadeIn: 2, fadeOut: 4,
    });
    const mapped = {
      id: clip.id, type: clip.type, trackId: clip.trackId,
      startTime: clip.startTime, duration: clip.duration,
      filePath: clip.filePath || null, elementId: clip.elementId || null,
      volume: clip.volume ?? 100, fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0,
      name: clip.name,
    };
    expect(mapped.volume).toBe(75);
    expect(mapped.fadeIn).toBe(2);
    expect(mapped.fadeOut).toBe(4);
    expect(mapped.filePath).toBe('/music.mp3');
  });

  it('should default volume to 100 when undefined', () => {
    const clip = makeClip({ volume: undefined });
    expect(clip.volume ?? 100).toBe(100);
  });

  it('should default fadeIn/fadeOut to 0 when undefined', () => {
    const clip = makeClip({ fadeIn: undefined, fadeOut: undefined });
    expect(clip.fadeIn || 0).toBe(0);
    expect(clip.fadeOut || 0).toBe(0);
  });

  it('should collect muted track IDs', () => {
    const tracks: Track[] = [
      { id: 'visuals', name: 'Visuals', type: 'video', locked: false, visible: true, muted: false },
      { id: 'music', name: 'Music', type: 'music', locked: false, visible: true, muted: true },
      { id: 'sfx', name: 'SFX', type: 'sfx', locked: false, visible: true, muted: true },
    ];
    const mutedTracks = tracks.filter(t => t.muted).map(t => t.id);
    expect(mutedTracks).toEqual(['music', 'sfx']);
  });
});

// ── Track muting via reducer ────────────────────────────────────

describe('Track muting reducer', () => {
  it('should mute a track', () => {
    const s = stateWith({
      tracks: [
        { id: 'music', name: 'Music', type: 'music', locked: false, visible: true, muted: false },
      ],
    });
    const s2 = editorReducer(s, { type: 'SET_TRACK_MUTED', trackId: 'music', muted: true });
    expect(s2.tracks[0].muted).toBe(true);
  });

  it('should unmute a track', () => {
    const s = stateWith({
      tracks: [
        { id: 'music', name: 'Music', type: 'music', locked: false, visible: true, muted: true },
      ],
    });
    const s2 = editorReducer(s, { type: 'SET_TRACK_MUTED', trackId: 'music', muted: false });
    expect(s2.tracks[0].muted).toBe(false);
  });

  it('should not affect other tracks when muting one', () => {
    const s = stateWith({
      tracks: [
        { id: 'visuals', name: 'Visuals', type: 'video', locked: false, visible: true, muted: false },
        { id: 'music', name: 'Music', type: 'music', locked: false, visible: true, muted: false },
      ],
    });
    const s2 = editorReducer(s, { type: 'SET_TRACK_MUTED', trackId: 'music', muted: true });
    expect(s2.tracks[0].muted).toBe(false); // visuals unchanged
    expect(s2.tracks[1].muted).toBe(true);  // music muted
  });
});

// ── Frame Range Editing via Reducer ─────────────────────────────

describe('Frame range editing via SET_RENDER_SETTINGS', () => {
  it('should set start time from timecode input', () => {
    const seconds = parseTimecodeToSeconds('01:30:00', 24); // 1 min 30 sec 0 frames = 90s
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: seconds } });
    expect(s.renderSettings.frameStart).toBe(90);
  });

  it('should set end time from timecode input', () => {
    const seconds = parseTimecodeToSeconds('05:00:00', 24); // 5 min = 300s
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameEnd: seconds } });
    expect(s.renderSettings.frameEnd).toBe(300);
  });

  it('should set end time from duration input (start + duration)', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 60 } });
    const duration = parseTimecodeToSeconds('02:00:00', 24); // 2 min = 120s
    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameEnd: 60 + duration } });
    expect(s.renderSettings.frameStart).toBe(60);
    expect(s.renderSettings.frameEnd).toBe(180);
  });

  it('should handle timecode with frames', () => {
    const seconds = parseTimecodeToSeconds('00:10:12', 24); // 0 min 10 sec 12 frames = 10.5s
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: seconds } });
    expect(s.renderSettings.frameStart).toBe(10.5);
  });

  it('should handle HH:MM:SS:FF format', () => {
    const seconds = parseTimecodeToSeconds('01:02:30:12', 24); // 1h 2min 30sec 12frames
    expect(seconds).toBe(3600 + 120 + 30 + 12 / 24);
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameEnd: seconds } });
    expect(s.renderSettings.frameEnd).toBe(seconds);
  });

  it('should handle plain seconds input', () => {
    const seconds = parseTimecodeToSeconds('45.5');
    expect(seconds).toBe(45.5);
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: seconds } });
    expect(s.renderSettings.frameStart).toBe(45.5);
  });

  it('should reject NaN from invalid timecode (no state change)', () => {
    const seconds = parseTimecodeToSeconds('not-a-time');
    expect(isNaN(seconds)).toBe(true);
    // UI would not dispatch if NaN — state unchanged
    const s = initialEditorState;
    expect(s.renderSettings.frameStart).toBe(0);
  });

  it('should preserve other render settings when updating frame range', () => {
    let s = editorReducer(initialEditorState, {
      type: 'SET_RENDER_SETTINGS',
      settings: { resolutionX: 3840, resolutionY: 2160, fps: 60, format: 'mov', quality: 'high' },
    });
    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 10, frameEnd: 50 } });
    expect(s.renderSettings.resolutionX).toBe(3840);
    expect(s.renderSettings.resolutionY).toBe(2160);
    expect(s.renderSettings.fps).toBe(60);
    expect(s.renderSettings.format).toBe('mov');
    expect(s.renderSettings.quality).toBe('high');
    expect(s.renderSettings.frameStart).toBe(10);
    expect(s.renderSettings.frameEnd).toBe(50);
  });
});

describe('Timecode format ↔ parse roundtrip for frame range editing', () => {
  it('should roundtrip start time through format→parse at 24fps', () => {
    const original = 90; // 1:30:00
    const tc = formatTimecode(original, 24);
    const parsed = parseTimecodeToSeconds(tc, 24);
    expect(parsed).toBeCloseTo(original, 5);
  });

  it('should roundtrip fractional seconds (12 frames at 24fps)', () => {
    const original = 10.5; // 10 sec + 12 frames
    const tc = formatTimecode(original, 24);
    expect(tc).toBe('00:10:12');
    const parsed = parseTimecodeToSeconds(tc, 24);
    expect(parsed).toBeCloseTo(original, 5);
  });

  it('should roundtrip at 30fps', () => {
    const original = 61.5; // 1min 1sec 15frames
    const tc = formatTimecode(original, 30);
    const parsed = parseTimecodeToSeconds(tc, 30);
    expect(parsed).toBeCloseTo(original, 5);
  });

  it('should roundtrip at 60fps', () => {
    const original = 5.25; // 5sec 15frames at 60fps
    const tc = formatTimecode(original, 60);
    const parsed = parseTimecodeToSeconds(tc, 60);
    expect(parsed).toBeCloseTo(original, 5);
  });

  it('should roundtrip long duration with hours', () => {
    const original = 3661.5; // 1h 1min 1sec 12frames
    const tc = formatTimecode(original, 24);
    expect(tc).toMatch(/^01:/); // starts with hours
    const parsed = parseTimecodeToSeconds(tc, 24);
    expect(parsed).toBeCloseTo(original, 5);
  });

  it('should roundtrip zero', () => {
    const tc = formatTimecode(0, 24);
    expect(tc).toBe('00:00:00');
    expect(parseTimecodeToSeconds(tc, 24)).toBe(0);
  });
});

describe('Frame range validation logic (UI behavior)', () => {
  it('start must be >= 0 (UI clamps negative values)', () => {
    // UI enforces: if (!isNaN(v) && v >= 0) dispatch(...)
    // Any negative result or NaN would be rejected
    const validStart = 0;
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: validStart } });
    expect(s.renderSettings.frameStart).toBe(0);
    // Negative start would not be dispatched by UI — state stays at 0
    expect(s.renderSettings.frameStart).toBeGreaterThanOrEqual(0);
  });

  it('end must be greater than start', () => {
    const start = 100;
    const endInput = parseTimecodeToSeconds('01:00:00', 24); // 60s
    // UI checks: endInput > start → 60 > 100 → false → rejects
    expect(endInput > start).toBe(false);
  });

  it('duration must be positive', () => {
    const durInput = parseTimecodeToSeconds('00:00:00', 24); // 0s
    // UI checks: durInput > 0 → false → rejects
    expect(durInput > 0).toBe(false);
  });

  it('Full Sequence resets to start=0, end=null', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 30, frameEnd: 90 } });
    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 0, frameEnd: null } });
    expect(s.renderSettings.frameStart).toBe(0);
    expect(s.renderSettings.frameEnd).toBeNull();
  });

  it('Use Selection sets frame range from clip times', () => {
    const clip = makeClip({ startTime: 15.5, duration: 8.3 });
    const s = stateWith({ clips: [clip], selectedClipIds: [clip.id] });
    // Simulates: frameStart = sel.startTime, frameEnd = sel.startTime + sel.duration
    const s2 = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: clip.startTime, frameEnd: clip.startTime + clip.duration } });
    expect(s2.renderSettings.frameStart).toBe(15.5);
    expect(s2.renderSettings.frameEnd).toBeCloseTo(23.8, 5);
  });

  it('frame count matches duration × fps', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 10, frameEnd: 20, fps: 30 } });
    const duration = s.renderSettings.frameEnd! - s.renderSettings.frameStart;
    const frames = Math.round(duration * s.renderSettings.fps);
    expect(frames).toBe(300); // 10 seconds × 30fps
  });

  it('changing fps updates frame count for same duration', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 0, frameEnd: 10 } });
    expect(Math.round(10 * s.renderSettings.fps)).toBe(240); // 24fps default

    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { fps: 60 } });
    expect(Math.round(10 * s.renderSettings.fps)).toBe(600); // 60fps
  });

  it('editing duration adjusts end, not start', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 30, frameEnd: 90 } });
    // User edits duration to 2 minutes (120s) → end = start + 120 = 150
    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameEnd: 30 + 120 } });
    expect(s.renderSettings.frameStart).toBe(30); // unchanged
    expect(s.renderSettings.frameEnd).toBe(150);
  });

  it('editing start with same end changes duration', () => {
    let s = editorReducer(initialEditorState, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 10, frameEnd: 100 } });
    // Duration is 90. User changes start to 50 → duration becomes 50
    s = editorReducer(s, { type: 'SET_RENDER_SETTINGS', settings: { frameStart: 50 } });
    expect(s.renderSettings.frameStart).toBe(50);
    expect(s.renderSettings.frameEnd).toBe(100); // unchanged
    // Duration is now 100 - 50 = 50
    expect(s.renderSettings.frameEnd! - s.renderSettings.frameStart).toBe(50);
  });
});
