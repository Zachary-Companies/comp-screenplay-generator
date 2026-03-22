/**
 * Tests for timeline data extraction — specifically that subtitle/caption clips
 * (action elements) do NOT affect timeline timing.
 */
import { describe, it, expect } from 'vitest';
import { extractData } from './extractData.js';

function makeProject(overrides: Record<string, any> = {}) {
  return {
    characters: [],
    locations: [],
    sections: [],
    scenes: [{
      id: 'scene-1',
      title: 'INT. OFFICE - DAY',
      elementRange: [0, 4],
      shots: [],
      dialogue: [],
      actions: [],
      characterIds: [],
    }],
    elements: [
      { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
      { id: 'elem-1', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Hello there.'] },
      { id: 'elem-2', type: 'action', content: 'She walks across the room slowly.' },
      { id: 'elem-3', type: 'dialogue', characterName: 'BOB', characterId: 'char-2', lines: ['Hey.'] },
    ],
    dialogueAudio: { assets: [] },
    ...overrides,
  } as any;
}

describe('Subtitle timing exclusion', () => {
  it('action elements should not advance the timeline offset', () => {
    const project = makeProject();
    const result = extractData(project, null, false);

    const dialogClips = result.clips.filter(c => c.trackId === 'dialog');
    const subtitleClips = result.clips.filter(c => c.trackId === 'subtitles');

    expect(dialogClips.length).toBe(2);
    expect(subtitleClips.length).toBe(1);

    // The subtitle clip should overlap with dialog, not push BOB's dialog later
    const aliceClip = dialogClips.find(c => c.characterName === 'ALICE')!;
    const bobClip = dialogClips.find(c => c.characterName === 'BOB')!;
    const captionClip = subtitleClips[0];

    // Caption should start at the same time as Bob's dialog (both follow Alice)
    // NOT after Bob — the caption should not create a gap
    expect(captionClip.startTime).toBe(bobClip.startTime);
  });

  it('scene duration should be based only on dialogue and shots, not subtitles', () => {
    // Scene with 1 dialogue and 3 action lines
    const project = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Short line.'] },
        { id: 'elem-2', type: 'action', content: 'A very long action description that goes on and on.' },
        { id: 'elem-3', type: 'action', content: 'Another long action line with lots of detail.' },
        { id: 'elem-4', type: 'action', content: 'Yet another action line for good measure.' },
      ],
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 5],
        shots: [], dialogue: [], actions: [], characterIds: [],
      }],
    });

    const result = extractData(project, null, false);

    const dialogClips = result.clips.filter(c => c.trackId === 'dialog');
    const subtitleClips = result.clips.filter(c => c.trackId === 'subtitles');

    expect(dialogClips.length).toBe(1);
    expect(subtitleClips.length).toBe(3);

    // All subtitle clips should have zero weight (not affecting the scene budget)
    // The total timeline offset should only account for the dialogue
    const lastDialog = dialogClips[dialogClips.length - 1];
    const dialogEnd = lastDialog.startTime + lastDialog.duration;

    // Subtitles should not extend the timeline beyond the dialogue
    for (const sub of subtitleClips) {
      // Each subtitle gets a duration based on proportional weight (which is 0),
      // so they should have minimal or zero duration and not push the timeline
      expect(sub.duration).toBeLessThanOrEqual(dialogEnd);
    }
  });

  it('audio-driven scenes should not include subtitle time in budget', () => {
    const project = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['A line with rendered audio.'] },
        { id: 'elem-2', type: 'action', content: 'A long descriptive action that should not affect timing at all.' },
        { id: 'elem-3', type: 'dialogue', characterName: 'BOB', characterId: 'char-2', lines: ['Another line with audio.'] },
      ],
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 4],
        shots: [], dialogue: [], actions: [], characterIds: [],
      }],
      dialogueAudio: {
        assets: [
          { type: 'dialogue-audio', filePath: '/audio/d1.mp3', metadata: { dialogueElementId: 'elem-1', duration: 3.0 } },
          { type: 'dialogue-audio', filePath: '/audio/d2.mp3', metadata: { dialogueElementId: 'elem-3', duration: 2.5 } },
        ],
      },
    });

    const result = extractData(project, null, false);

    const dialogClips = result.clips.filter(c => c.trackId === 'dialog');
    const subtitleClips = result.clips.filter(c => c.trackId === 'subtitles');

    expect(dialogClips.length).toBe(2);
    expect(subtitleClips.length).toBe(1);

    const aliceClip = dialogClips.find(c => c.characterName === 'ALICE')!;
    const bobClip = dialogClips.find(c => c.characterName === 'BOB')!;

    // Alice's clip should use audio duration
    expect(aliceClip.duration).toBe(3.0);
    // Bob's clip should use audio duration
    expect(bobClip.duration).toBe(2.5);

    // Bob should follow Alice with only the dialog gap, NOT pushed by the action
    const DIALOG_GAP = 0.3;
    expect(bobClip.startTime).toBeCloseTo(aliceClip.startTime + aliceClip.duration + DIALOG_GAP, 5);
  });

  it('multiple scenes should not accumulate subtitle time', () => {
    const project = makeProject({
      elements: [
        // Scene 1
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['First scene dialog.'] },
        { id: 'elem-2', type: 'action', content: 'Long action in scene 1.' },
        // Scene 2
        { id: 'elem-3', type: 'scene-heading', content: 'EXT. PARK - DAY' },
        { id: 'elem-4', type: 'dialogue', characterName: 'BOB', characterId: 'char-2', lines: ['Second scene dialog.'] },
        { id: 'elem-5', type: 'action', content: 'Long action in scene 2.' },
      ],
      scenes: [
        { id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 3], shots: [], dialogue: [], actions: [], characterIds: [] },
        { id: 'scene-2', title: 'EXT. PARK', elementRange: [3, 6], shots: [], dialogue: [], actions: [], characterIds: [] },
      ],
    });

    const resultWithActions = extractData(project, null, false);

    // Now create same project but WITHOUT any action elements
    const projectNoActions = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['First scene dialog.'] },
        { id: 'elem-3', type: 'scene-heading', content: 'EXT. PARK - DAY' },
        { id: 'elem-4', type: 'dialogue', characterName: 'BOB', characterId: 'char-2', lines: ['Second scene dialog.'] },
      ],
      scenes: [
        { id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 2], shots: [], dialogue: [], actions: [], characterIds: [] },
        { id: 'scene-2', title: 'EXT. PARK', elementRange: [2, 4], shots: [], dialogue: [], actions: [], characterIds: [] },
      ],
    });

    const resultWithoutActions = extractData(projectNoActions, null, false);

    // Dialog clip timing should be identical whether or not actions exist
    const dialogWith = resultWithActions.clips.filter(c => c.trackId === 'dialog');
    const dialogWithout = resultWithoutActions.clips.filter(c => c.trackId === 'dialog');

    expect(dialogWith.length).toBe(dialogWithout.length);
    for (let i = 0; i < dialogWith.length; i++) {
      expect(dialogWith[i].startTime).toBeCloseTo(dialogWithout[i].startTime, 5);
      expect(dialogWith[i].duration).toBeCloseTo(dialogWithout[i].duration, 5);
    }
  });

  it('total duration should not include subtitle time', () => {
    // Create project with lots of actions and minimal dialogue
    const project = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Hi.'] },
        ...Array.from({ length: 20 }, (_, i) => ({
          id: `elem-action-${i}`,
          type: 'action',
          content: `This is a very long action description number ${i} that would normally add significant time to the timeline.`,
        })),
      ],
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 22],
        shots: [], dialogue: [], actions: [], characterIds: [],
      }],
    });

    const result = extractData(project, null, false);

    // The total duration should be driven by the dialogue, not inflated by 20 action lines
    const dialogClips = result.clips.filter(c => c.trackId === 'dialog');
    const subtitleClips = result.clips.filter(c => c.trackId === 'subtitles');

    expect(dialogClips.length).toBe(1);
    expect(subtitleClips.length).toBe(20);

    // Duration should be modest (base 60 + small offset), not inflated by all the actions
    expect(result.duration).toBeLessThan(80);
  });

  it('subtitle clips should still be created with correct content', () => {
    const project = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'action', content: 'She opens the door.' },
        { id: 'elem-2', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Hello.'] },
      ],
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 3],
        shots: [], dialogue: [], actions: [], characterIds: [],
      }],
    });

    const result = extractData(project, null, false);

    const subtitleClips = result.clips.filter(c => c.trackId === 'subtitles');
    expect(subtitleClips.length).toBe(1);
    expect(subtitleClips[0].content).toBe('She opens the door.');
    expect(subtitleClips[0].type).toBe('caption');
    expect(subtitleClips[0].elementId).toBe('elem-1');
  });
});

// ── User clip persistence via metadata ──────────────────────────

describe('User clips loaded from project metadata', () => {
  it('should load editorUserClips from project.metadata', () => {
    const project = makeProject({
      metadata: {
        editorUserClips: [
          { id: 'music-1', name: 'Song.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 30, filePath: '/audio/song.mp3', volume: 80 },
        ],
      },
    });
    const result = extractData(project, null, false);

    const musicClip = result.clips.find(c => c.id === 'music-1');
    expect(musicClip).toBeDefined();
    expect(musicClip!.filePath).toBe('/audio/song.mp3');
    expect(musicClip!.volume).toBe(80);
    expect(result.userClips.length).toBe(1);
  });

  it('should load multiple user clips (music, sfx, ambience)', () => {
    const project = makeProject({
      metadata: {
        editorUserClips: [
          { id: 'music-1', name: 'Song.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 60, filePath: '/audio/song.mp3' },
          { id: 'sfx-1', name: 'Boom.wav', trackId: 'sfx', type: 'sfx', startTime: 5, duration: 2, filePath: '/audio/boom.wav' },
          { id: 'amb-1', name: 'Rain.mp3', trackId: 'ambience', type: 'ambience', startTime: 0, duration: 120, filePath: '/audio/rain.mp3' },
        ],
      },
    });
    const result = extractData(project, null, false);

    expect(result.userClips.length).toBe(3);
    expect(result.clips.filter(c => c.trackId === 'music').length).toBe(1);
    expect(result.clips.filter(c => c.trackId === 'sfx').length).toBe(1);
    expect(result.clips.filter(c => c.trackId === 'ambience').length).toBe(1);
  });

  it('should preserve volume, fadeIn, fadeOut on loaded clips', () => {
    const project = makeProject({
      metadata: {
        editorUserClips: [
          { id: 'c1', name: 'T.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 30, filePath: '/a.mp3', volume: 42, fadeIn: 3, fadeOut: 5 },
        ],
      },
    });
    const result = extractData(project, null, false);
    const clip = result.clips.find(c => c.id === 'c1')!;
    expect(clip.volume).toBe(42);
    expect(clip.fadeIn).toBe(3);
    expect(clip.fadeOut).toBe(5);
  });

  it('should fallback to legacy nodeData when metadata has no clips', () => {
    const project = makeProject({ metadata: {} });
    const appState = {
      nodeData: {
        '_editor': {
          outputs: {
            _editorUserClips: [
              { id: 'legacy-1', name: 'Old.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 20, filePath: '/old.mp3' },
            ],
          },
        },
      },
    };
    const result = extractData(project, appState, false);

    expect(result.userClips.length).toBe(1);
    expect(result.userClips[0].id).toBe('legacy-1');
  });

  it('should prefer metadata over legacy nodeData', () => {
    const project = makeProject({
      metadata: {
        editorUserClips: [
          { id: 'meta-1', name: 'New.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 30, filePath: '/new.mp3' },
        ],
      },
    });
    const appState = {
      nodeData: {
        '_editor': {
          outputs: {
            _editorUserClips: [
              { id: 'legacy-1', name: 'Old.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 20, filePath: '/old.mp3' },
            ],
          },
        },
      },
    };
    const result = extractData(project, appState, false);

    expect(result.userClips.length).toBe(1);
    expect(result.userClips[0].id).toBe('meta-1');
  });

  it('should not duplicate user clips in the clips array', () => {
    const project = makeProject({
      metadata: {
        editorUserClips: [
          { id: 'music-1', name: 'Song.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 30, filePath: '/audio/song.mp3' },
        ],
      },
    });
    const result = extractData(project, null, false);
    const matches = result.clips.filter(c => c.id === 'music-1');
    expect(matches.length).toBe(1);
  });
});
