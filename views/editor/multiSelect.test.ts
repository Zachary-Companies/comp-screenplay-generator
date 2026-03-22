/**
 * Tests for multi-select timeline functionality — selection, bulk operations,
 * clipboard (copy/cut/paste), and backward compatibility.
 */
import { describe, it, expect } from 'vitest';
import {
  editorReducer, initialEditorState, primarySelectedClipId, isClipSelected,
  type EditorState, type Clip,
} from './editorStore.js';

function stateWith(overrides: Partial<EditorState> = {}): EditorState {
  return { ...initialEditorState, ...overrides };
}

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1', trackId: 'visuals', type: 'image', name: 'Test',
    startTime: 0, duration: 10, ...overrides,
  };
}

// ── Selection ───────────────────────────────────────────────────

describe('SET_SELECTION', () => {
  it('should set selectedClipIds to provided array', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_SELECTION', clipIds: ['a', 'b', 'c'] });
    expect(s.selectedClipIds).toEqual(['a', 'b', 'c']);
  });

  it('should clear selection with empty array', () => {
    const s = stateWith({ selectedClipIds: ['a', 'b'] });
    const s2 = editorReducer(s, { type: 'SET_SELECTION', clipIds: [] });
    expect(s2.selectedClipIds).toEqual([]);
  });

  it('should replace previous selection', () => {
    const s = stateWith({ selectedClipIds: ['a', 'b'] });
    const s2 = editorReducer(s, { type: 'SET_SELECTION', clipIds: ['c'] });
    expect(s2.selectedClipIds).toEqual(['c']);
  });
});

describe('SET_SELECTED_CLIP (backward compat)', () => {
  it('should set selectedClipIds to single-element array', () => {
    const s = editorReducer(initialEditorState, { type: 'SET_SELECTED_CLIP', clipId: 'clip-1' });
    expect(s.selectedClipIds).toEqual(['clip-1']);
  });

  it('should clear selection when clipId is null', () => {
    const s = stateWith({ selectedClipIds: ['clip-1'] });
    const s2 = editorReducer(s, { type: 'SET_SELECTED_CLIP', clipId: null });
    expect(s2.selectedClipIds).toEqual([]);
  });
});

describe('TOGGLE_SELECTION (Cmd/Ctrl+click)', () => {
  it('should add clip to existing selection', () => {
    const s = stateWith({ selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'TOGGLE_SELECTION', clipId: 'b' });
    expect(s2.selectedClipIds).toEqual(['a', 'b']);
  });

  it('should remove clip if already selected', () => {
    const s = stateWith({ selectedClipIds: ['a', 'b', 'c'] });
    const s2 = editorReducer(s, { type: 'TOGGLE_SELECTION', clipId: 'b' });
    expect(s2.selectedClipIds).toEqual(['a', 'c']);
  });

  it('should add to empty selection', () => {
    const s2 = editorReducer(initialEditorState, { type: 'TOGGLE_SELECTION', clipId: 'x' });
    expect(s2.selectedClipIds).toEqual(['x']);
  });
});

describe('ADD_TO_SELECTION (Shift+click)', () => {
  it('should add clip to selection', () => {
    const s = stateWith({ selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'ADD_TO_SELECTION', clipId: 'b' });
    expect(s2.selectedClipIds).toEqual(['a', 'b']);
  });

  it('should not duplicate if already selected', () => {
    const s = stateWith({ selectedClipIds: ['a', 'b'] });
    const s2 = editorReducer(s, { type: 'ADD_TO_SELECTION', clipId: 'b' });
    expect(s2.selectedClipIds).toEqual(['a', 'b']);
  });

  it('should be identity when clip already in selection', () => {
    const s = stateWith({ selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'ADD_TO_SELECTION', clipId: 'a' });
    expect(s2).toBe(s); // same reference — no change
  });
});

describe('SELECT_ALL', () => {
  it('should select all clips', () => {
    const clips = [makeClip({ id: 'a' }), makeClip({ id: 'b' }), makeClip({ id: 'c' })];
    const s = stateWith({ clips });
    const s2 = editorReducer(s, { type: 'SELECT_ALL' });
    expect(s2.selectedClipIds).toEqual(['a', 'b', 'c']);
  });

  it('should return empty array when no clips', () => {
    const s2 = editorReducer(initialEditorState, { type: 'SELECT_ALL' });
    expect(s2.selectedClipIds).toEqual([]);
  });
});

// ── Helper functions ────────────────────────────────────────────

describe('primarySelectedClipId', () => {
  it('should return first selected clip', () => {
    const s = stateWith({ selectedClipIds: ['b', 'a'] });
    expect(primarySelectedClipId(s)).toBe('b');
  });

  it('should return null when none selected', () => {
    expect(primarySelectedClipId(initialEditorState)).toBeNull();
  });
});

describe('isClipSelected', () => {
  it('should return true for selected clip', () => {
    const s = stateWith({ selectedClipIds: ['a', 'b'] });
    expect(isClipSelected(s, 'a')).toBe(true);
    expect(isClipSelected(s, 'b')).toBe(true);
  });

  it('should return false for unselected clip', () => {
    const s = stateWith({ selectedClipIds: ['a'] });
    expect(isClipSelected(s, 'b')).toBe(false);
  });
});

// ── Bulk operations ─────────────────────────────────────────────

describe('DELETE_SELECTED', () => {
  it('should delete selected user clips', () => {
    const c1 = makeClip({ id: 'u1' });
    const c2 = makeClip({ id: 'u2' });
    const s = stateWith({
      clips: [c1, c2],
      userClips: [c1, c2],
      selectedClipIds: ['u1', 'u2'],
    });
    const s2 = editorReducer(s, { type: 'DELETE_SELECTED' });
    expect(s2.clips).toEqual([]);
    expect(s2.userClips).toEqual([]);
    expect(s2.selectedClipIds).toEqual([]);
  });

  it('should only delete user clips, preserve non-user clips', () => {
    const pipeline = makeClip({ id: 'pipeline-clip' });
    const user = makeClip({ id: 'user-clip' });
    const s = stateWith({
      clips: [pipeline, user],
      userClips: [user], // only user is a user clip
      selectedClipIds: ['pipeline-clip', 'user-clip'],
    });
    const s2 = editorReducer(s, { type: 'DELETE_SELECTED' });
    expect(s2.clips.map(c => c.id)).toEqual(['pipeline-clip']);
    // pipeline-clip stays in selectedClipIds since it wasn't deleted
    expect(s2.selectedClipIds).toEqual(['pipeline-clip']);
  });

  it('should be a no-op when nothing selected', () => {
    const c1 = makeClip({ id: 'a' });
    const s = stateWith({ clips: [c1], userClips: [c1], selectedClipIds: [] });
    const s2 = editorReducer(s, { type: 'DELETE_SELECTED' });
    expect(s2).toBe(s); // same reference
  });

  it('should be a no-op when selected clips are not user clips', () => {
    const pipeline = makeClip({ id: 'p' });
    const s = stateWith({ clips: [pipeline], userClips: [], selectedClipIds: ['p'] });
    const s2 = editorReducer(s, { type: 'DELETE_SELECTED' });
    expect(s2).toBe(s);
  });
});

describe('MOVE_SELECTED', () => {
  it('should shift all selected clips by deltaTime', () => {
    const c1 = makeClip({ id: 'a', startTime: 5 });
    const c2 = makeClip({ id: 'b', startTime: 10 });
    const c3 = makeClip({ id: 'c', startTime: 20 });
    const s = stateWith({
      clips: [c1, c2, c3],
      userClips: [c1, c2, c3],
      selectedClipIds: ['a', 'b'],
    });
    const s2 = editorReducer(s, { type: 'MOVE_SELECTED', deltaTime: 3 });
    expect(s2.clips.find(c => c.id === 'a')!.startTime).toBe(8);
    expect(s2.clips.find(c => c.id === 'b')!.startTime).toBe(13);
    expect(s2.clips.find(c => c.id === 'c')!.startTime).toBe(20); // unchanged
  });

  it('should clamp start time to >= 0', () => {
    const c1 = makeClip({ id: 'a', startTime: 2 });
    const s = stateWith({ clips: [c1], userClips: [c1], selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'MOVE_SELECTED', deltaTime: -10 });
    expect(s2.clips[0].startTime).toBe(0);
  });

  it('should allow negative delta (move left)', () => {
    const c1 = makeClip({ id: 'a', startTime: 10 });
    const s = stateWith({ clips: [c1], userClips: [c1], selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'MOVE_SELECTED', deltaTime: -5 });
    expect(s2.clips[0].startTime).toBe(5);
  });

  it('should also update userClips', () => {
    const c1 = makeClip({ id: 'a', startTime: 5 });
    const s = stateWith({ clips: [c1], userClips: [c1], selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'MOVE_SELECTED', deltaTime: 2 });
    expect(s2.userClips[0].startTime).toBe(7);
  });
});

// ── Clipboard ───────────────────────────────────────────────────

describe('COPY_SELECTED', () => {
  it('should store selected clips in clipboard', () => {
    const c1 = makeClip({ id: 'a', startTime: 5 });
    const c2 = makeClip({ id: 'b', startTime: 10 });
    const s = stateWith({ clips: [c1, c2], selectedClipIds: ['a', 'b'] });
    const s2 = editorReducer(s, { type: 'COPY_SELECTED' });
    expect(s2.clipboard).not.toBeNull();
    expect(s2.clipboard!.clips.length).toBe(2);
    expect(s2.clipboard!.operation).toBe('copy');
  });

  it('should deep copy clips (not references)', () => {
    const c1 = makeClip({ id: 'a' });
    const s = stateWith({ clips: [c1], selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'COPY_SELECTED' });
    expect(s2.clipboard!.clips[0]).not.toBe(c1);
    expect(s2.clipboard!.clips[0].id).toBe('a');
  });

  it('should not modify clips array', () => {
    const c1 = makeClip({ id: 'a' });
    const s = stateWith({ clips: [c1], selectedClipIds: ['a'] });
    const s2 = editorReducer(s, { type: 'COPY_SELECTED' });
    expect(s2.clips.length).toBe(1); // unchanged
  });
});

describe('CUT_SELECTED', () => {
  it('should store clips and remove them from state', () => {
    const c1 = makeClip({ id: 'a' });
    const c2 = makeClip({ id: 'b' });
    const s = stateWith({
      clips: [c1, c2], userClips: [c1, c2], selectedClipIds: ['a', 'b'],
    });
    const s2 = editorReducer(s, { type: 'CUT_SELECTED' });
    expect(s2.clipboard!.clips.length).toBe(2);
    expect(s2.clipboard!.operation).toBe('cut');
    expect(s2.clips).toEqual([]);
    expect(s2.userClips).toEqual([]);
    expect(s2.selectedClipIds).toEqual([]);
  });

  it('should only cut user clips', () => {
    const pipeline = makeClip({ id: 'p' });
    const user = makeClip({ id: 'u' });
    const s = stateWith({
      clips: [pipeline, user], userClips: [user], selectedClipIds: ['p', 'u'],
    });
    const s2 = editorReducer(s, { type: 'CUT_SELECTED' });
    expect(s2.clipboard!.clips.length).toBe(1);
    expect(s2.clipboard!.clips[0].id).toBe('u');
    expect(s2.clips.map(c => c.id)).toEqual(['p']); // pipeline stays
  });
});

describe('PASTE', () => {
  it('should insert clips with new IDs at target time', () => {
    const copied = [
      makeClip({ id: 'orig-1', startTime: 5, duration: 3 }),
      makeClip({ id: 'orig-2', startTime: 8, duration: 2 }),
    ];
    const s = stateWith({
      clipboard: { clips: copied, operation: 'copy' },
    });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 20 });

    expect(s2.clips.length).toBe(2);
    // New IDs
    expect(s2.clips[0].id).not.toBe('orig-1');
    expect(s2.clips[1].id).not.toBe('orig-2');
    // IDs start with 'clip-'
    expect(s2.clips[0].id).toMatch(/^clip-/);
  });

  it('should preserve relative timing between clips', () => {
    const copied = [
      makeClip({ id: 'a', startTime: 10, duration: 3 }),
      makeClip({ id: 'b', startTime: 15, duration: 2 }),
    ];
    const s = stateWith({ clipboard: { clips: copied, operation: 'copy' } });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 0 });

    // minStart was 10, offset = 0 - 10 = -10
    expect(s2.clips[0].startTime).toBe(0);  // 10 + (-10) = 0
    expect(s2.clips[1].startTime).toBe(5);  // 15 + (-10) = 5
  });

  it('should select the newly pasted clips', () => {
    const copied = [makeClip({ id: 'a' }), makeClip({ id: 'b' })];
    const s = stateWith({ clipboard: { clips: copied, operation: 'copy' } });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 0 });

    expect(s2.selectedClipIds.length).toBe(2);
    expect(s2.selectedClipIds[0]).toBe(s2.clips[0].id);
    expect(s2.selectedClipIds[1]).toBe(s2.clips[1].id);
  });

  it('should add to both clips and userClips', () => {
    const copied = [makeClip({ id: 'a' })];
    const s = stateWith({ clipboard: { clips: copied, operation: 'copy' } });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 0 });

    expect(s2.clips.length).toBe(1);
    expect(s2.userClips.length).toBe(1);
    expect(s2.clips[0].id).toBe(s2.userClips[0].id);
  });

  it('should be a no-op when clipboard is null', () => {
    const s = stateWith({ clipboard: null });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 5 });
    expect(s2).toBe(s);
  });

  it('should be a no-op when clipboard is empty', () => {
    const s = stateWith({ clipboard: { clips: [], operation: 'copy' } });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 5 });
    expect(s2).toBe(s);
  });

  it('double paste should produce distinct IDs', () => {
    const copied = [makeClip({ id: 'a' })];
    const s = stateWith({ clipboard: { clips: copied, operation: 'copy' } });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 0 });
    const s3 = editorReducer(s2, { type: 'PASTE', atTime: 10 });

    expect(s3.clips.length).toBe(2);
    expect(s3.clips[0].id).not.toBe(s3.clips[1].id);
  });

  it('should preserve clip properties (type, duration, volume, etc.)', () => {
    const copied = [makeClip({
      id: 'a', type: 'music', trackId: 'music', duration: 30,
      volume: 75, fadeIn: 2, fadeOut: 4, name: 'My Song',
    })];
    const s = stateWith({ clipboard: { clips: copied, operation: 'copy' } });
    const s2 = editorReducer(s, { type: 'PASTE', atTime: 0 });

    const pasted = s2.clips[0];
    expect(pasted.type).toBe('music');
    expect(pasted.trackId).toBe('music');
    expect(pasted.duration).toBe(30);
    expect(pasted.volume).toBe(75);
    expect(pasted.fadeIn).toBe(2);
    expect(pasted.fadeOut).toBe(4);
    expect(pasted.name).toBe('My Song');
  });
});

// ── Integration with existing actions ───────────────────────────

describe('Integration: DELETE_CLIP cleans selectedClipIds', () => {
  it('should remove deleted clip from selectedClipIds', () => {
    const s = stateWith({
      clips: [makeClip({ id: 'a' }), makeClip({ id: 'b' })],
      userClips: [makeClip({ id: 'a' }), makeClip({ id: 'b' })],
      selectedClipIds: ['a', 'b'],
    });
    const s2 = editorReducer(s, { type: 'DELETE_CLIP', clipId: 'a' });
    expect(s2.selectedClipIds).toEqual(['b']);
  });

  it('should leave other selections intact', () => {
    const s = stateWith({
      clips: [makeClip({ id: 'a' }), makeClip({ id: 'b' }), makeClip({ id: 'c' })],
      selectedClipIds: ['a', 'b', 'c'],
    });
    const s2 = editorReducer(s, { type: 'DELETE_CLIP', clipId: 'b' });
    expect(s2.selectedClipIds).toEqual(['a', 'c']);
  });
});

describe('Integration: ADD_CLIP sets selectedClipIds', () => {
  it('should select only the new clip', () => {
    const s = stateWith({ selectedClipIds: ['existing'] });
    const s2 = editorReducer(s, { type: 'ADD_CLIP', clip: makeClip({ id: 'new-clip' }) });
    expect(s2.selectedClipIds).toEqual(['new-clip']);
  });
});

describe('Integration: copy → paste → modify → paste again', () => {
  it('full workflow should work correctly', () => {
    const c1 = makeClip({ id: 'a', startTime: 0, duration: 5 });
    const c2 = makeClip({ id: 'b', startTime: 5, duration: 5 });
    let s = stateWith({
      clips: [c1, c2], userClips: [c1, c2], selectedClipIds: ['a', 'b'],
    });

    // Copy
    s = editorReducer(s, { type: 'COPY_SELECTED' });
    expect(s.clipboard!.clips.length).toBe(2);

    // Paste at time 20
    s = editorReducer(s, { type: 'PASTE', atTime: 20 });
    expect(s.clips.length).toBe(4);
    expect(s.selectedClipIds.length).toBe(2); // pasted clips selected

    // Move pasted clips
    s = editorReducer(s, { type: 'MOVE_SELECTED', deltaTime: 5 });
    const pastedClips = s.clips.filter(c => c.id !== 'a' && c.id !== 'b');
    expect(pastedClips[0].startTime).toBe(25);
    expect(pastedClips[1].startTime).toBe(30);

    // Original clips unchanged
    expect(s.clips.find(c => c.id === 'a')!.startTime).toBe(0);
    expect(s.clips.find(c => c.id === 'b')!.startTime).toBe(5);

    // Paste again — should produce more new clips
    s = editorReducer(s, { type: 'PASTE', atTime: 50 });
    expect(s.clips.length).toBe(6);
  });
});

describe('Integration: select all → delete selected', () => {
  it('should delete all user clips', () => {
    const c1 = makeClip({ id: 'u1' });
    const c2 = makeClip({ id: 'u2' });
    const pipeline = makeClip({ id: 'p1' });
    let s = stateWith({
      clips: [c1, c2, pipeline],
      userClips: [c1, c2],
    });

    s = editorReducer(s, { type: 'SELECT_ALL' });
    expect(s.selectedClipIds.length).toBe(3);

    s = editorReducer(s, { type: 'DELETE_SELECTED' });
    expect(s.clips.length).toBe(1); // only pipeline clip remains
    expect(s.clips[0].id).toBe('p1');
    expect(s.selectedClipIds).toEqual(['p1']); // pipeline still selected (wasn't deletable)
  });
});
