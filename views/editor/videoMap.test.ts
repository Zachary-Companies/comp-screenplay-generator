/**
 * Tests for video map extraction and video clip type assignment.
 * Ensures that when previsualizations have video data, the extractData
 * function correctly builds a videoMap and assigns type: 'video' to clips.
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
      { id: 'elem-1', type: 'shot', shotText: 'WIDE SHOT - Office interior', frameSize: 'WIDE' },
      { id: 'elem-2', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Hello there.'] },
      { id: 'elem-3', type: 'shot', shotText: 'CLOSE-UP - Alice face', frameSize: 'CLOSE-UP' },
    ],
    dialogueAudio: { assets: [] },
    ...overrides,
  } as any;
}

describe('Video map extraction', () => {
  it('should return an empty videoMap when no previsualizations have videos', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          { shotElementId: 'elem-1', filePath: '/previs/shot1.png', description: 'Office' },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.videoMap).toBeDefined();
    expect(Object.keys(result.videoMap).length).toBe(0);
  });

  it('should populate videoMap from videoPath on previs shots', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          { shotElementId: 'elem-1', filePath: '/previs/shot1.png', videoPath: '/video/shot1.mp4' },
          { shotElementId: 'elem-3', filePath: '/previs/shot3.png' },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.videoMap['elem-1']).toBe('/video/shot1.mp4');
    expect(result.videoMap['elem-3']).toBeUndefined();
  });

  it('should populate videoMap from videoGenerations (latest)', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            filePath: '/previs/shot1.png',
            videoGenerations: [
              { id: 'vgen-1', filePath: '/video/shot1_v1.mp4' },
              { id: 'vgen-2', filePath: '/video/shot1_v2.mp4' },
            ],
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    // Should use the latest generation
    expect(result.videoMap['elem-1']).toBe('/video/shot1_v2.mp4');
  });

  it('should prefer selectedVideoGenerationId over latest', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            filePath: '/previs/shot1.png',
            selectedVideoGenerationId: 'vgen-1',
            videoGenerations: [
              { id: 'vgen-1', filePath: '/video/shot1_v1.mp4' },
              { id: 'vgen-2', filePath: '/video/shot1_v2.mp4' },
            ],
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.videoMap['elem-1']).toBe('/video/shot1_v1.mp4');
  });

  it('should assign type "video" to shot clips when video exists', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          { shotElementId: 'elem-1', filePath: '/previs/shot1.png', videoPath: '/video/shot1.mp4' },
          { shotElementId: 'elem-3', filePath: '/previs/shot3.png' },
        ],
      },
    });
    const result = extractData(project, null, false);
    const visualClips = result.clips.filter(c => c.trackId === 'visuals');

    const videoClip = visualClips.find(c => c.elementId === 'elem-1');
    const imageClip = visualClips.find(c => c.elementId === 'elem-3');

    expect(videoClip).toBeDefined();
    expect(videoClip!.type).toBe('video');
    expect(videoClip!.filePath).toBe('/video/shot1.mp4');

    expect(imageClip).toBeDefined();
    expect(imageClip!.type).toBe('image');
  });

  it('should assign type "image" to all shots when no videos exist', () => {
    const project = makeProject();
    const result = extractData(project, null, false);
    const visualClips = result.clips.filter(c => c.trackId === 'visuals');
    for (const clip of visualClips) {
      expect(clip.type).toBe('image');
    }
  });

  it('should include videoMap from scene-grouped shots with videoPath', () => {
    const project = makeProject({
      scenes: [{
        id: 'scene-1',
        title: 'INT. OFFICE - DAY',
        elementRange: [0, 4],
        shots: [
          { id: 'scene-shot-1', shotType: 'WIDE', description: 'Office', videoPath: '/video/scene_shot1.mp4', previsPath: '/previs/s1.png' },
        ],
        dialogue: [],
        actions: [],
        characterIds: [],
      }],
      previsualizations: { shots: [] },
    });
    const result = extractData(project, null, false);
    expect(result.videoMap['scene-shot-1']).toBe('/video/scene_shot1.mp4');
  });
});

describe('Compact timeline mode', () => {
  it('should produce shorter timelines in compact mode', () => {
    const project = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'shot', shotText: 'WIDE SHOT', frameSize: 'WIDE' },
        { id: 'elem-2', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Hello there, how are you doing today?'] },
        { id: 'elem-3', type: 'shot', shotText: 'CLOSE-UP', frameSize: 'CLOSE-UP' },
        { id: 'elem-4', type: 'dialogue', characterName: 'BOB', characterId: 'char-2', lines: ['I am doing well, thanks for asking.'] },
      ],
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 5],
        shots: [], dialogue: [], actions: [], characterIds: [],
      }],
      dialogueAudio: {
        assets: [
          { type: 'dialogue-audio', filePath: '/a/d1.mp3', metadata: { dialogueElementId: 'elem-2', duration: 3.0 } },
          { type: 'dialogue-audio', filePath: '/a/d2.mp3', metadata: { dialogueElementId: 'elem-4', duration: 2.5 } },
        ],
      },
    });

    const normal = extractData(project, null, false, undefined, false);
    const compact = extractData(project, null, false, undefined, true);

    // Compact mode should produce a shorter or equal duration
    expect(compact.duration).toBeLessThanOrEqual(normal.duration);

    // Shot clips should be shorter in compact mode
    const normalShots = normal.clips.filter(c => c.trackId === 'visuals');
    const compactShots = compact.clips.filter(c => c.trackId === 'visuals');

    for (let i = 0; i < normalShots.length; i++) {
      expect(compactShots[i].duration).toBeLessThanOrEqual(normalShots[i].duration);
    }
  });

  it('compact mode gives shots 0.5s when audio exists', () => {
    const project = makeProject({
      elements: [
        { id: 'elem-0', type: 'scene-heading', content: 'INT. OFFICE - DAY' },
        { id: 'elem-1', type: 'shot', shotText: 'WIDE SHOT', frameSize: 'WIDE' },
        { id: 'elem-2', type: 'dialogue', characterName: 'ALICE', characterId: 'char-1', lines: ['Line with audio'] },
      ],
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 3],
        shots: [], dialogue: [], actions: [], characterIds: [],
      }],
      dialogueAudio: {
        assets: [
          { type: 'dialogue-audio', filePath: '/a/d1.mp3', metadata: { dialogueElementId: 'elem-2', duration: 4.0 } },
        ],
      },
    });

    const result = extractData(project, null, false, undefined, true);
    const shotClip = result.clips.find(c => c.trackId === 'visuals');
    expect(shotClip).toBeDefined();
    expect(shotClip!.duration).toBe(0.5);
  });
});

describe('Asset array safety', () => {
  it('should handle project.assets as an object with nested assets array', () => {
    const project = makeProject({
      assets: {
        id: 'collection-1',
        name: 'My Assets',
        assets: [
          { id: 'a1', name: 'Headshot', type: 'character-headshot', filePath: '/img/headshot.png' },
        ],
      },
    });
    // Should not throw
    const result = extractData(project, null, false);
    expect(result.assets.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle project.assets as a flat array', () => {
    const project = makeProject({
      assets: [
        { id: 'a1', name: 'Headshot', type: 'character-headshot', filePath: '/img/headshot.png' },
      ],
    });
    const result = extractData(project, null, false);
    expect(result.assets.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle missing project.assets gracefully', () => {
    const project = makeProject();
    delete (project as any).assets;
    const result = extractData(project, null, false);
    expect(result.assets).toBeDefined();
  });
});
