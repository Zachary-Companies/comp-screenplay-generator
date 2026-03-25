/**
 * Tests for previs image selection, previsMap construction, and filePath assignment.
 * Covers: selectedGenerationId from previsShots, scene-grouped shot overrides,
 * and shot element clips getting filePath from previsMap.
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

describe('PrevisMap respects selectedGenerationId from previsShots', () => {
  it('should use selectedGenerationId when set on previs shot', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            selectedGenerationId: 'gen-2',
            generations: [
              { id: 'gen-1', filePath: '/previs/shot1_v1.png' },
              { id: 'gen-2', filePath: '/previs/shot1_v2.png' },
              { id: 'gen-3', filePath: '/previs/shot1_v3.png' },
            ],
            _generatedFilePath: '/previs/shot1_latest.png',
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.previsMap['elem-1']).toBe('/previs/shot1_v2.png');
  });

  it('should fall back to latest generation when no selectedGenerationId', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            generations: [
              { id: 'gen-1', filePath: '/previs/shot1_v1.png' },
              { id: 'gen-2', filePath: '/previs/shot1_v2.png' },
            ],
            _generatedFilePath: '/previs/shot1_old.png',
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.previsMap['elem-1']).toBe('/previs/shot1_v2.png');
  });

  it('should fall back to _generatedFilePath when no generations array', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            _generatedFilePath: '/previs/shot1_gen.png',
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.previsMap['elem-1']).toBe('/previs/shot1_gen.png');
  });

  it('should fall back to filePath when no generations and no _generatedFilePath', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            filePath: '/previs/shot1_fp.png',
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.previsMap['elem-1']).toBe('/previs/shot1_fp.png');
  });
});

describe('Scene-grouped shots do not overwrite previs selections', () => {
  it('should NOT let scene shot generations overwrite previs selectedGenerationId', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            selectedGenerationId: 'pv-gen-2',
            generations: [
              { id: 'pv-gen-1', filePath: '/previs/pv_v1.png' },
              { id: 'pv-gen-2', filePath: '/previs/pv_v2.png' },
            ],
          },
        ],
      },
      scenes: [{
        id: 'scene-1',
        title: 'INT. OFFICE - DAY',
        elementRange: [0, 4],
        shots: [
          {
            id: 'elem-1',
            shotType: 'WIDE',
            description: 'Office',
            generations: [
              { id: 'sc-gen-1', filePath: '/scene/sc_v1.png' },
              { id: 'sc-gen-2', filePath: '/scene/sc_v2.png' },
              { id: 'sc-gen-3', filePath: '/scene/sc_v3.png' },
            ],
            // No selectedGenerationId — would default to latest (sc_v3)
          },
        ],
      }],
    });
    const result = extractData(project, null, false);
    // previs selected gen-2 should win, not scene's latest sc_v3
    expect(result.previsMap['elem-1']).toBe('/previs/pv_v2.png');
  });
});

describe('Shot element clips get filePath from previsMap', () => {
  it('should assign previsMap filePath to shot element clips', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            generations: [
              { id: 'gen-1', filePath: '/previs/shot1.png' },
            ],
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    const clip = result.clips.find(c => c.elementId === 'elem-1' && c.trackId === 'visuals');
    expect(clip).toBeDefined();
    expect(clip!.filePath).toBe('/previs/shot1.png');
  });

  it('should have undefined filePath when no previs exists for shot', () => {
    const project = makeProject();
    const result = extractData(project, null, false);
    const clip = result.clips.find(c => c.elementId === 'elem-1' && c.trackId === 'visuals');
    expect(clip).toBeDefined();
    expect(clip!.filePath).toBeUndefined();
  });
});

describe('Scene shots with only video are included', () => {
  it('should include scene shots that have video but no previs image', () => {
    const project = makeProject({
      scenes: [{
        id: 'scene-1',
        title: 'INT. OFFICE - DAY',
        elementRange: [0, 4],
        shots: [
          { id: 'video-only-shot', shotType: 'WIDE', description: 'Office wide' },
        ],
      }],
      previsualizations: {
        shots: [
          {
            shotElementId: 'video-only-shot',
            videoPath: '/video/shot1.mp4',
            videoGenerations: [{ id: 'vg-1', filePath: '/video/shot1.mp4' }],
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.videoMap['video-only-shot']).toBe('/video/shot1.mp4');
    // Scene shot gets normalized to elem-1 (first shot element in range)
    // The clip may use either the original or normalized ID
    const clip = result.clips.find(c => c.trackId === 'visuals' &&
      (c.elementId === 'video-only-shot' || c.elementId === 'elem-1'));
    expect(clip).toBeDefined();
    expect(clip!.type).toBe('video');
  });
});

describe('generationsMap construction', () => {
  it('should build generationsMap from previs shots with generations', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            selectedGenerationId: 'gen-2',
            generations: [
              { id: 'gen-1', filePath: '/previs/v1.png' },
              { id: 'gen-2', filePath: '/previs/v2.png' },
            ],
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    expect(result.generationsMap['elem-1']).toBeDefined();
    expect(result.generationsMap['elem-1'].images).toHaveLength(2);
    expect(result.generationsMap['elem-1'].images[0].id).toBe('gen-1');
    expect(result.generationsMap['elem-1'].images[1].id).toBe('gen-2');
    expect(result.generationsMap['elem-1'].images[0].selectedId).toBe('gen-2');
  });

  it('should include video generations in generationsMap', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          {
            shotElementId: 'elem-1',
            generations: [{ id: 'gen-1', filePath: '/previs/v1.png' }],
            selectedVideoGenerationId: 'vgen-2',
            videoGenerations: [
              { id: 'vgen-1', filePath: '/video/v1.mp4' },
              { id: 'vgen-2', filePath: '/video/v2.mp4' },
            ],
          },
        ],
      },
    });
    const result = extractData(project, null, false);
    const entry = result.generationsMap['elem-1'];
    expect(entry).toBeDefined();
    expect(entry.images).toHaveLength(1);
    expect(entry.videos).toHaveLength(2);
    expect(entry.videos[0].selectedId).toBe('vgen-2');
  });

  it('should return empty generationsMap when no generations exist', () => {
    const project = makeProject({
      previsualizations: {
        shots: [{ shotElementId: 'elem-1', filePath: '/previs/v1.png' }],
      },
    });
    const result = extractData(project, null, false);
    expect(result.generationsMap['elem-1']).toBeUndefined();
  });

  it('should merge scene-grouped shot generations when previs has none', () => {
    const project = makeProject({
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 4],
        shots: [{
          id: 'elem-1', shotType: 'WIDE', description: 'Office',
          generations: [
            { id: 'sg-1', filePath: '/scene/v1.png' },
            { id: 'sg-2', filePath: '/scene/v2.png' },
          ],
        }],
      }],
      previsualizations: { shots: [] },
    });
    const result = extractData(project, null, false);
    expect(result.generationsMap['elem-1']).toBeDefined();
    expect(result.generationsMap['elem-1'].images).toHaveLength(2);
  });

  it('should NOT overwrite previs generations with scene-grouped shot generations', () => {
    const project = makeProject({
      previsualizations: {
        shots: [{
          shotElementId: 'elem-1',
          generations: [
            { id: 'pv-1', filePath: '/previs/pv1.png' },
            { id: 'pv-2', filePath: '/previs/pv2.png' },
            { id: 'pv-3', filePath: '/previs/pv3.png' },
          ],
        }],
      },
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 4],
        shots: [{
          id: 'elem-1', shotType: 'WIDE', description: 'Office',
          generations: [{ id: 'sg-1', filePath: '/scene/v1.png' }],
        }],
      }],
    });
    const result = extractData(project, null, false);
    expect(result.generationsMap['elem-1'].images).toHaveLength(3);
    expect(result.generationsMap['elem-1'].images[0].id).toBe('pv-1');
  });
});

describe('Real project data shapes (from Stories for Tomorrow)', () => {
  it('should handle previs shot with 14 generations and no selectedGenerationId', () => {
    // Mirrors element_1 in the real project: 14 previs generations, no selection
    const project = makeProject({
      previsualizations: {
        shots: [{
          shotElementId: 'elem-1',
          filePath: '/previs/elem1_old.png',
          _generatedFilePath: '/previs/elem1_latest.png',
          generations: Array.from({ length: 14 }, (_, i) => ({
            id: 'gen_' + i, filePath: '/previs/elem1_v' + i + '.png',
          })),
        }],
      },
    });
    const result = extractData(project, null, false);
    // Should use latest generation (index 13), NOT _generatedFilePath
    expect(result.previsMap['elem-1']).toBe('/previs/elem1_v13.png');
    // generationsMap should have all 14
    expect(result.generationsMap['elem-1'].images).toHaveLength(14);
    // clip should have filePath set
    const clip = result.clips.find(c => c.elementId === 'elem-1' && c.trackId === 'visuals');
    expect(clip).toBeDefined();
    expect(clip!.filePath).toBe('/previs/elem1_v13.png');
  });

  it('should handle scene shot with 7 generations alongside previs with 14', () => {
    // Mirrors scene 0: scene shot has 7 gens, previs has 14 for same element
    const project = makeProject({
      previsualizations: {
        shots: [{
          shotElementId: 'elem-1',
          generations: Array.from({ length: 14 }, (_, i) => ({
            id: 'pv_gen_' + i, filePath: '/previs/pv_v' + i + '.png',
          })),
        }],
      },
      scenes: [{
        id: 'scene-1', title: 'INT. OFFICE', elementRange: [0, 4],
        shots: [{
          id: 'elem-1', shotType: 'WIDE', description: 'Office',
          generations: Array.from({ length: 7 }, (_, i) => ({
            id: 'sc_gen_' + i, filePath: '/scene/sc_v' + i + '.png',
          })),
        }],
      }],
    });
    const result = extractData(project, null, false);
    // previsMap should use previs latest (14th), not scene latest (7th)
    expect(result.previsMap['elem-1']).toBe('/previs/pv_v13.png');
    // generationsMap should have previs generations (14), not scene (7)
    expect(result.generationsMap['elem-1'].images).toHaveLength(14);
  });

  it('should handle previs with selectedVideoGenerationId', () => {
    // Mirrors element_4: has 11 video generations with a selected one
    const project = makeProject({
      previsualizations: {
        shots: [{
          shotElementId: 'elem-3',
          filePath: '/previs/elem3.png',
          generations: [{ id: 'gen-1', filePath: '/previs/elem3.png' }],
          selectedVideoGenerationId: 'vgen_5',
          videoGenerations: Array.from({ length: 11 }, (_, i) => ({
            id: 'vgen_' + i, filePath: '/video/elem3_v' + i + '.mp4',
          })),
        }],
      },
    });
    const result = extractData(project, null, false);
    // videoMap should use selected video (vgen_5)
    expect(result.videoMap['elem-3']).toBe('/video/elem3_v5.mp4');
    // generationsMap should have 1 image and 11 videos
    expect(result.generationsMap['elem-3'].images).toHaveLength(1);
    expect(result.generationsMap['elem-3'].videos).toHaveLength(11);
    expect(result.generationsMap['elem-3'].videos[0].selectedId).toBe('vgen_5');
    // clip should be type video
    const clip = result.clips.find(c => c.elementId === 'elem-3' && c.trackId === 'visuals');
    expect(clip).toBeDefined();
    expect(clip!.type).toBe('video');
    expect(clip!.filePath).toBe('/video/elem3_v5.mp4');
  });
});

describe('extractData does not crash', () => {
  it('should handle null project', () => {
    const result = extractData(null, null, false);
    expect(result.clips).toEqual([]);
    expect(result.generationsMap).toEqual({});
  });

  it('should handle project with no previsualizations', () => {
    const project = makeProject();
    const result = extractData(project, null, false);
    expect(result.generationsMap).toEqual({});
    expect(result.previsMap).toBeDefined();
    expect(result.videoMap).toBeDefined();
  });

  it('should handle previs shots with empty generations', () => {
    const project = makeProject({
      previsualizations: {
        shots: [{ shotElementId: 'elem-1', generations: [] }],
      },
    });
    const result = extractData(project, null, false);
    expect(result.generationsMap['elem-1']).toBeUndefined();
  });

  it('should handle previs shots with null fields', () => {
    const project = makeProject({
      previsualizations: {
        shots: [
          { shotElementId: 'elem-1', generations: null, videoGenerations: null },
          { shotElementId: null },
          null,
        ].filter(Boolean),
      },
    });
    // Should not throw
    const result = extractData(project, null, false);
    expect(result).toBeDefined();
  });
});

describe('Render clips match editor display', () => {
  it('visual clips with filePath should have consistent order and timing', () => {
    const project = {
      characters: [], locations: [], sections: [],
      elements: [
        { id: 'e0', type: 'scene-heading', content: 'INT. ROOM' },
        { id: 'e1', type: 'shot', shotText: 'WIDE SHOT', frameSize: 'WIDE' },
        { id: 'e2', type: 'dialogue', characterName: 'A', characterId: 'c1', lines: ['Hello'] },
        { id: 'e3', type: 'shot', shotText: 'CLOSE-UP', frameSize: 'CU' },
        { id: 'e4', type: 'dialogue', characterName: 'B', characterId: 'c2', lines: ['Hi'] },
      ],
      scenes: [{
        id: 'sc1', title: 'INT. ROOM', elementRange: [0, 5],
        shots: [
          { id: 'e1', shotType: 'WIDE', description: 'Room wide', previsPath: '/p/wide.png' },
          { id: 'e3', shotType: 'CU', description: 'Face closeup', previsPath: '/p/cu.png' },
        ],
      }],
      previsualizations: {
        shots: [
          { shotElementId: 'e1', generations: [{ id: 'g1', filePath: '/p/wide.png' }] },
          { shotElementId: 'e3', generations: [{ id: 'g2', filePath: '/p/cu.png' }] },
        ],
      },
      dialogueAudio: {
        assets: [
          { type: 'dialogue-audio', filePath: '/a/d1.mp3', metadata: { dialogueElementId: 'e2', duration: 3.0 } },
          { type: 'dialogue-audio', filePath: '/a/d2.mp3', metadata: { dialogueElementId: 'e4', duration: 2.0 } },
        ],
      },
    } as any;

    const result = extractData(project, null, true);  // fillGaps=true like editor default
    const visuals = result.clips.filter(c => c.trackId === 'visuals').sort((a, b) => a.startTime - b.startTime);

    // No duplicates
    const ids = visuals.map(c => c.elementId);
    expect(new Set(ids).size).toBe(ids.length);

    // All have filePaths (so render won't skip them)
    for (const c of visuals) {
      expect(c.filePath).toBeDefined();
    }

    // Clips should be in order with no overlaps
    for (let i = 0; i < visuals.length - 1; i++) {
      const end = visuals[i].startTime + visuals[i].duration;
      expect(end).toBeLessThanOrEqual(visuals[i + 1].startTime + 0.001);
    }

    // With fillGaps, clips should cover the timeline (no gaps > 0.01)
    for (let i = 0; i < visuals.length - 1; i++) {
      const end = visuals[i].startTime + visuals[i].duration;
      const gap = visuals[i + 1].startTime - end;
      expect(gap).toBeLessThan(0.01);
    }
  });
});

/**
 * Tests that model the EXACT data layout from the Stories for Tomorrow project.
 * Scene 0 has 11 scene shots with old-format IDs (shot_scene-0_...) that DON'T
 * match the element IDs (element_1, element_4, etc). The previs data is keyed
 * by element IDs. The editor must unify these so all generations are visible.
 */
describe('Old-format scene shot ID unification', () => {
  // Helper: builds a project that mirrors Scene 0's data shape
  function makeScene0Project() {
    return {
      characters: [],
      locations: [],
      sections: [],
      elements: [
        { id: 'element_1', type: 'shot', shotText: 'WIDE SHOT - Bedroom', frameSize: 'WIDE' },
        { id: 'element_2', type: 'action', content: 'David sits on the bed.' },
        { id: 'element_3', type: 'action', content: 'Sarah appears.' },
        { id: 'element_4', type: 'shot', shotText: 'MEDIUM TWO-SHOT', frameSize: 'MEDIUM' },
        { id: 'element_5', type: 'dialogue', characterName: 'SARAH', characterId: 'c1', lines: ['Hello'] },
      ],
      scenes: [{
        id: 'scene-0',
        title: 'Opening Hook',
        elementRange: [0, 5],
        shots: [
          {
            id: 'shot_scene-0_abc_0',  // OLD format — does NOT match element_1
            shotType: 'WIDE',
            description: 'Bedroom bathed in moonlight',
            previsPath: '/scene/shot0_previs.png',
            generations: [
              { id: 'sc-gen-1', filePath: '/scene/sc_v1.png' },
              { id: 'sc-gen-2', filePath: '/scene/sc_v2.png' },
              { id: 'sc-gen-3', filePath: '/scene/sc_v3.png' },
              { id: 'sc-gen-4', filePath: '/scene/sc_v4.png' },
              { id: 'sc-gen-5', filePath: '/scene/sc_v5.png' },
              { id: 'sc-gen-6', filePath: '/scene/sc_v6.png' },
              { id: 'sc-gen-7', filePath: '/scene/sc_v7.png' },
            ],
          },
          {
            id: 'shot_scene-0_abc_1',  // OLD format
            shotType: 'MEDIUM',
            description: 'David and Sarah',
          },
        ],
      }],
      previsualizations: {
        shots: [
          {
            shotElementId: 'element_1',  // keyed by element ID
            generations: Array.from({ length: 14 }, (_, i) => ({
              id: 'pv-gen-' + i,
              filePath: '/previs/pv_v' + i + '.png',
            })),
            videoGenerations: [
              { id: 'vgen-1', filePath: '/video/v1.mp4' },
            ],
          },
          {
            shotElementId: 'element_4',
            generations: [
              { id: 'pv-gen-e4', filePath: '/previs/e4.png' },
            ],
            selectedVideoGenerationId: 'vgen-e4-2',
            videoGenerations: [
              { id: 'vgen-e4-1', filePath: '/video/e4_v1.mp4' },
              { id: 'vgen-e4-2', filePath: '/video/e4_v2.mp4' },
            ],
          },
          // Some old-format shots also have their own previs entries
          {
            shotElementId: 'shot_scene-0_abc_0',
            generations: [
              { id: 'dup-gen-1', filePath: '/previs/dup_v1.png' },
              { id: 'dup-gen-2', filePath: '/previs/dup_v2.png' },
            ],
          },
        ],
      },
      dialogueAudio: { assets: [] },
    } as any;
  }

  it('should NOT create duplicate visual clips for the same shot', () => {
    const project = makeScene0Project();
    const result = extractData(project, null, false);

    // Count visual clips — should be exactly 2 (one per shot element), not 4
    const visualClips = result.clips.filter(c => c.trackId === 'visuals');
    const elem1Clips = visualClips.filter(c =>
      c.elementId === 'element_1' || c.elementId === 'shot_scene-0_abc_0'
    );
    // There should be exactly ONE clip for the first shot, not two
    expect(elem1Clips.length).toBe(1);
  });

  it('should use element_1 video when available, previs as fallback', () => {
    const project = makeScene0Project();
    const result = extractData(project, null, false);

    const clip = result.clips.find(c =>
      c.trackId === 'visuals' && (c.elementId === 'element_1' || c.elementId === 'shot_scene-0_abc_0')
    );
    expect(clip).toBeDefined();
    // element_1 has a video, so the clip should be type video with video filePath
    expect(clip!.type).toBe('video');
    expect(clip!.filePath).toBe('/video/v1.mp4');
    // previsMap should still have the image for when no video exists
    expect(result.previsMap['element_1']).toBe('/previs/pv_v13.png');
  });

  it('should use previs image when no video exists', () => {
    const project = makeScene0Project();
    // Remove videos from element_1
    project.previsualizations.shots[0].videoGenerations = [];
    const result = extractData(project, null, false);

    const clip = result.clips.find(c =>
      c.trackId === 'visuals' && (c.elementId === 'element_1' || c.elementId === 'shot_scene-0_abc_0')
    );
    expect(clip).toBeDefined();
    expect(clip!.type).toBe('image');
    expect(clip!.filePath).toBe('/previs/pv_v13.png');
  });

  it('should show all 14 images in generationsMap for the first shot clip', () => {
    const project = makeScene0Project();
    const result = extractData(project, null, false);

    const clip = result.clips.find(c =>
      c.trackId === 'visuals' && (c.elementId === 'element_1' || c.elementId === 'shot_scene-0_abc_0')
    );
    expect(clip).toBeDefined();

    // The generationsMap entry for this clip's elementId should have 14 images
    const gens = result.generationsMap[clip!.elementId!];
    expect(gens).toBeDefined();
    expect(gens.images.length).toBe(14);
  });

  it('should show video in generationsMap for the first shot clip', () => {
    const project = makeScene0Project();
    const result = extractData(project, null, false);

    const clip = result.clips.find(c =>
      c.trackId === 'visuals' && (c.elementId === 'element_1' || c.elementId === 'shot_scene-0_abc_0')
    );
    expect(clip).toBeDefined();

    const gens = result.generationsMap[clip!.elementId!];
    expect(gens).toBeDefined();
    expect(gens.videos.length).toBe(1);
    expect(gens.videos[0].filePath).toBe('/video/v1.mp4');
  });

  it('should use element_4 video selection for the second shot', () => {
    const project = makeScene0Project();
    const result = extractData(project, null, false);

    const clip = result.clips.find(c =>
      c.trackId === 'visuals' && (c.elementId === 'element_4' || c.elementId === 'shot_scene-0_abc_1')
    );
    expect(clip).toBeDefined();
    expect(clip!.type).toBe('video');
    expect(clip!.filePath).toBe('/video/e4_v2.mp4');  // selectedVideoGenerationId
  });

  it('should use consistent element IDs as clip elementId', () => {
    const project = makeScene0Project();
    const result = extractData(project, null, false);

    // All visual clips should use element_* IDs, not shot_scene-* IDs
    const visualClips = result.clips.filter(c => c.trackId === 'visuals');
    for (const c of visualClips) {
      expect(c.elementId).toMatch(/^element_/);
    }
  });
});
