import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from './_test-helpers';

/** Helper: build a minimal valid inputs object, merging overrides */
function makeInputs(overrides: Record<string, any> = {}) {
  return {
    validatedInput: { kind: 'short-film', requirements: 'Test' },
    metadata: { title: 'Test Script', genre: ['Drama'], runtimeMinutes: 15 },
    characters: [],
    locations: [],
    processedSections: [],
    elements: [],
    productionMetadata: { intendedFormat: 'screenplay' },
    revisionMetadata: { color: 'white', revisionDate: '2024-01-01' },
    assetCollection: { id: 'assets_1', name: 'Test Assets', assets: [] },
    previsualizationPlan: { collectionName: 'Test Previs', shots: [] },
    validationResults: { valid: true, errors: [] },
    ...overrides,
  };
}

describe('final-assembly', () => {
  // -------------------------------------------------------
  // Existing tests (section children population)
  // -------------------------------------------------------

  it('should populate section children with elements', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      characters: [
        { id: 'char_1', name: 'ALICE', description: 'Main character' },
        { id: 'char_2', name: 'BOB', description: 'Supporting character' },
      ],
      locations: [{ id: 'loc_1', name: 'Office', description: 'Modern office' }],
      processedSections: [
        {
          id: 'scene-01', type: 'scene', title: 'INT. OFFICE - DAY', order: 1, children: [],
          beats: [{ id: 'beat_1', description: 'Alice enters' }, { id: 'beat_2', description: 'Alice talks to Bob' }],
        },
        {
          id: 'scene-02', type: 'scene', title: 'EXT. STREET - NIGHT', order: 2, children: [],
          beats: [{ id: 'beat_3', description: 'Bob leaves' }],
        },
      ],
      elements: [
        { id: 'elem_1', type: 'action', content: 'Alice enters the office' },
        { id: 'elem_2', type: 'dialogue', characterName: 'ALICE', lines: ['Hello Bob!'] },
        { id: 'elem_3', type: 'shot', shotText: 'WIDE SHOT - Office' },
        { id: 'elem_4', type: 'dialogue', characterName: 'BOB', lines: ['Hi Alice!'] },
        { id: 'elem_5', type: 'action', content: 'Bob walks out' },
        { id: 'elem_6', type: 'shot', shotText: 'MEDIUM SHOT - Street' },
      ],
    });

    const result = await execute(inputs, context);

    expect(result.scriptPackage).toBeDefined();
    const pkg = result.scriptPackage as any;

    const sections = pkg.script.sections;
    expect(sections).toHaveLength(2);

    expect(sections[0].children.length).toBeGreaterThan(0);
    expect(sections[1].children.length).toBeGreaterThan(0);

    const totalChildren = sections.reduce((sum: number, s: any) => sum + (s.children?.length || 0), 0);
    expect(totalChildren).toBe(6);

    const allChildren = sections.flatMap((s: any) => s.children || []);
    const dialogueElements = allChildren.filter((e: any) => e.type === 'dialogue');
    expect(dialogueElements.length).toBe(2);
    expect(dialogueElements[0].characterName).toBe('ALICE');
    expect(dialogueElements[1].characterName).toBe('BOB');
  });

  it('should handle empty elements array', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      processedSections: [{ id: 'scene-01', type: 'scene', title: 'Test Scene', children: [] }],
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.script.sections[0].children).toEqual([]);
  });

  it('should link asset imagePaths to characters and locations', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      characters: [
        { id: 'char_1', name: 'ALICE', description: 'Main character' },
        { id: 'char_2', name: 'BOB', description: 'Supporting character' },
      ],
      locations: [
        { id: 'loc_1', name: 'Office', description: 'Modern office' },
        { id: 'loc_2', name: 'Park', description: 'City park' },
      ],
      processedSections: [
        { id: 'scene-01', type: 'scene', title: 'Test', children: [], beats: [{ id: 'b1', description: 'test' }] },
      ],
      elements: [{ id: 'elem_1', type: 'action', content: 'Test' }],
      assetCollection: {
        assets: [
          { type: 'character-headshot', filePath: '/assets/characters/alice.png', metadata: { characterId: 'char_1' } },
          { type: 'character-headshot', filePath: '/assets/characters/bob.png', metadata: { characterId: 'char_2' } },
          { type: 'landscape', filePath: '/assets/locations/office.png', metadata: { locationId: 'loc_1' } },
          { type: 'landscape', filePath: '/assets/locations/park.png', metadata: { locationId: 'loc_2' } },
        ],
      },
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.script.characters[0].imagePath).toBe('/assets/characters/alice.png');
    expect(pkg.script.characters[1].imagePath).toBe('/assets/characters/bob.png');
    expect(pkg.script.locations[0].imagePath).toBe('/assets/locations/office.png');
    expect(pkg.script.locations[1].imagePath).toBe('/assets/locations/park.png');
  });

  it('should not overwrite existing imagePath on characters or locations', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      characters: [{ id: 'char_1', name: 'ALICE', imagePath: '/existing/alice.png' }],
      locations: [{ id: 'loc_1', name: 'Office', imagePath: '/existing/office.png' }],
      processedSections: [{ id: 'scene-01', type: 'scene', title: 'Test', children: [] }],
      assetCollection: {
        assets: [
          { type: 'character-headshot', filePath: '/new/alice.png', metadata: { characterId: 'char_1' } },
          { type: 'landscape', filePath: '/new/office.png', metadata: { locationId: 'loc_1' } },
        ],
      },
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.script.characters[0].imagePath).toBe('/existing/alice.png');
    expect(pkg.script.locations[0].imagePath).toBe('/existing/office.png');
  });

  it('should distribute elements evenly when no beats info', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      processedSections: [
        { id: 'scene-01', type: 'scene', title: 'Scene 1', children: [] },
        { id: 'scene-02', type: 'scene', title: 'Scene 2', children: [] },
      ],
      elements: [
        { id: 'elem_1', type: 'action', content: 'Action 1' },
        { id: 'elem_2', type: 'action', content: 'Action 2' },
        { id: 'elem_3', type: 'action', content: 'Action 3' },
        { id: 'elem_4', type: 'action', content: 'Action 4' },
      ],
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.script.sections[0].children.length).toBe(2);
    expect(pkg.script.sections[1].children.length).toBe(2);
  });

  // -------------------------------------------------------
  // NEW: scenes array with elementRange
  // -------------------------------------------------------

  describe('scenes array with elementRange', () => {
    it('should include a scenes array in the scriptPackage output', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          { id: 'scene-01', type: 'scene', title: 'INT. ROOM - DAY', children: [], beats: [{ id: 'b1', description: 'enter' }] },
        ],
        elements: [{ id: 'elem_1', type: 'action', content: 'Test' }],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;

      expect(pkg.scenes).toBeDefined();
      expect(Array.isArray(pkg.scenes)).toBe(true);
    });

    it('should produce one scene per scene-type section', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          { id: 'scene-01', type: 'scene', title: 'Scene A', children: [], beats: [{ id: 'b1', description: 'a' }] },
          { id: 'scene-02', type: 'scene', title: 'Scene B', children: [], beats: [{ id: 'b2', description: 'b' }] },
          { id: 'scene-03', type: 'scene', title: 'Scene C', children: [], beats: [{ id: 'b3', description: 'c' }] },
        ],
        elements: [
          { id: 'e1', type: 'action', content: 'A1' },
          { id: 'e2', type: 'action', content: 'A2' },
          { id: 'e3', type: 'action', content: 'A3' },
        ],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;

      expect(pkg.scenes).toHaveLength(3);
    });

    it('should have proper fields on each scene object', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        characters: [{ id: 'char_1', name: 'ALICE', displayName: 'ALICE' }],
        processedSections: [
          {
            id: 'scene-01', type: 'scene', title: 'INT. ROOM - DAY',
            sceneHeading: { location: 'Room' },
            children: [],
            beats: [{ id: 'b1', description: 'talk' }],
          },
        ],
        elements: [
          { id: 'e1', type: 'dialogue', characterName: 'ALICE', characterId: 'char_1', lines: ['Hi'] },
          { id: 'e2', type: 'action', content: 'Alice sits' },
          { id: 'e3', type: 'shot', shotText: 'WIDE SHOT', frameSize: 'WIDE', characterIds: [] },
        ],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const scene = pkg.scenes[0];

      expect(scene.id).toBe('scene-01');
      expect(scene.title).toBe('Room');
      expect(scene.elementRange).toBeDefined();
      expect(Array.isArray(scene.elementRange)).toBe(true);
      expect(scene.elementRange).toHaveLength(2);
      expect(Array.isArray(scene.dialogue)).toBe(true);
      expect(Array.isArray(scene.actions)).toBe(true);
      expect(Array.isArray(scene.shots)).toBe(true);
      expect(Array.isArray(scene.characterIds)).toBe(true);
      expect(scene.characterIds).toContain('char_1');
    });

    it('should produce non-overlapping elementRange values that cover all elements', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const elements = Array.from({ length: 12 }, (_, i) => ({
        id: `e${i}`, type: 'action', content: `Action ${i}`,
      }));

      const inputs = makeInputs({
        processedSections: [
          { id: 's1', type: 'scene', title: 'S1', children: [], beats: [{ id: 'b1', description: 'a' }, { id: 'b2', description: 'b' }] },
          { id: 's2', type: 'scene', title: 'S2', children: [], beats: [{ id: 'b3', description: 'c' }] },
          { id: 's3', type: 'scene', title: 'S3', children: [], beats: [{ id: 'b4', description: 'd' }, { id: 'b5', description: 'e' }, { id: 'b6', description: 'f' }] },
        ],
        elements,
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const scenes = pkg.scenes as any[];

      expect(scenes.length).toBe(3);

      // Ranges should be [start, end] pairs
      for (const scene of scenes) {
        expect(scene.elementRange).toHaveLength(2);
        const [start, end] = scene.elementRange;
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThanOrEqual(start);
        expect(end).toBeLessThanOrEqual(elements.length);
      }

      // No gaps: each scene's start equals previous scene's end
      for (let i = 1; i < scenes.length; i++) {
        expect(scenes[i].elementRange[0]).toBe(scenes[i - 1].elementRange[1]);
      }

      // First starts at 0, last ends at elements.length
      expect(scenes[0].elementRange[0]).toBe(0);
      expect(scenes[scenes.length - 1].elementRange[1]).toBe(elements.length);

      // Total covered elements equals total elements
      const totalCovered = scenes.reduce((sum: number, s: any) => sum + (s.elementRange[1] - s.elementRange[0]), 0);
      expect(totalCovered).toBe(elements.length);
    });

    it('should distribute elements proportionally based on beat counts', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      // Scene A: 1 beat, Scene B: 3 beats => ratio 1:3
      // With 8 elements: A gets ~2, B gets ~6
      const inputs = makeInputs({
        processedSections: [
          { id: 's1', type: 'scene', title: 'A', children: [], beats: [{ id: 'b1', description: 'x' }] },
          { id: 's2', type: 'scene', title: 'B', children: [], beats: [{ id: 'b2', description: 'x' }, { id: 'b3', description: 'x' }, { id: 'b4', description: 'x' }] },
        ],
        elements: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, type: 'action', content: `A${i}` })),
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const scenes = pkg.scenes as any[];

      // Scene A: 1/4 * 8 = 2
      const sceneACount = scenes[0].elementRange[1] - scenes[0].elementRange[0];
      // Scene B: last scene takes remainder = 6
      const sceneBCount = scenes[1].elementRange[1] - scenes[1].elementRange[0];

      expect(sceneACount).toBe(2);
      expect(sceneBCount).toBe(6);

      // Full coverage
      expect(sceneACount + sceneBCount).toBe(8);
    });

    it('should distribute elements evenly when scenes have no beats', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          { id: 's1', type: 'scene', title: 'A', children: [] },
          { id: 's2', type: 'scene', title: 'B', children: [] },
        ],
        elements: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, type: 'action', content: `A${i}` })),
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const scenes = pkg.scenes as any[];

      expect(scenes).toHaveLength(2);

      // Even distribution: ceil(6/2)=3 for first, remainder for second
      const count0 = scenes[0].elementRange[1] - scenes[0].elementRange[0];
      const count1 = scenes[1].elementRange[1] - scenes[1].elementRange[0];

      expect(count0).toBe(3);
      expect(count1).toBe(3);
      expect(count0 + count1).toBe(6);
    });

    it('should flatten nested act > scene structures', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          {
            id: 'act-1', type: 'act', title: 'Act 1',
            children: [
              { id: 'scene-1a', type: 'scene', title: 'Scene 1A', children: [], beats: [{ id: 'b1', description: 'x' }] },
              { id: 'scene-1b', type: 'scene', title: 'Scene 1B', children: [], beats: [{ id: 'b2', description: 'y' }] },
            ],
          },
          {
            id: 'act-2', type: 'act', title: 'Act 2',
            children: [
              { id: 'scene-2a', type: 'scene', title: 'Scene 2A', children: [], beats: [{ id: 'b3', description: 'z' }] },
            ],
          },
        ],
        elements: [
          { id: 'e1', type: 'action', content: 'A1' },
          { id: 'e2', type: 'action', content: 'A2' },
          { id: 'e3', type: 'action', content: 'A3' },
        ],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;

      // Should have 3 scenes flattened from the nested structure
      expect(pkg.scenes).toHaveLength(3);
      expect(pkg.scenes[0].id).toBe('scene-1a');
      expect(pkg.scenes[1].id).toBe('scene-1b');
      expect(pkg.scenes[2].id).toBe('scene-2a');

      // Ranges cover all elements
      expect(pkg.scenes[0].elementRange[0]).toBe(0);
      expect(pkg.scenes[pkg.scenes.length - 1].elementRange[1]).toBe(3);
    });

    it('should return empty scenes array when there are no elements', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          { id: 's1', type: 'scene', title: 'A', children: [], beats: [{ id: 'b1', description: 'x' }] },
        ],
        elements: [],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;

      expect(pkg.scenes).toEqual([]);
    });

    it('should return empty scenes array when there are no scene sections', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [],
        elements: [{ id: 'e1', type: 'action', content: 'Orphan' }],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;

      expect(pkg.scenes).toEqual([]);
    });

    it('should extract dialogue, actions, and shots into scene fields', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        characters: [
          { id: 'char_1', name: 'ALICE', displayName: 'ALICE' },
        ],
        processedSections: [
          {
            id: 'scene-01', type: 'scene', title: 'INT. ROOM - DAY',
            sceneHeading: { location: 'Room' },
            children: [],
            beats: [{ id: 'b1', description: 'talk' }],
          },
        ],
        elements: [
          { id: 'e1', type: 'action', content: 'Alice enters' },
          { id: 'e2', type: 'dialogue', characterName: 'ALICE', characterId: 'char_1', lines: ['Hello!'] },
          { id: 'e3', type: 'shot', shotText: 'CLOSE UP on ALICE', frameSize: 'CLOSE-UP', characterIds: ['char_1'] },
        ],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const scene = pkg.scenes[0];

      // Dialogue
      expect(scene.dialogue).toHaveLength(1);
      expect(scene.dialogue[0].characterName).toBe('ALICE');
      expect(scene.dialogue[0].characterId).toBe('char_1');
      expect(scene.dialogue[0].lines).toEqual(['Hello!']);
      expect(scene.dialogue[0].elementId).toBe('e2');

      // Actions
      expect(scene.actions).toHaveLength(1);
      expect(scene.actions[0]).toBe('Alice enters');

      // Shots
      expect(scene.shots).toHaveLength(1);
      expect(scene.shots[0].id).toBe('e3');
      expect(scene.shots[0].shotType).toBe('CLOSE-UP');
      expect(scene.shots[0].description).toBe('CLOSE UP on ALICE');
    });

    it('should link previs shots to scene shot entries', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          {
            id: 'scene-01', type: 'scene', title: 'Scene', children: [],
            beats: [{ id: 'b1', description: 'x' }],
          },
        ],
        elements: [
          { id: 'shot-1', type: 'shot', shotText: 'WIDE SHOT - Park', frameSize: 'WIDE' },
        ],
        previsualizationPlan: {
          collectionName: 'Previs',
          shots: [
            { shotElementId: 'shot-1', filePath: '/previs/shot-1.png', description: 'Park wide' },
          ],
        },
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const shot = pkg.scenes[0].shots[0];

      expect(shot.previsPath).toBe('/previs/shot-1.png');
    });

    it('should pass through videoPath from previs shots', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        processedSections: [
          {
            id: 'scene-01', type: 'scene', title: 'Scene', children: [],
            beats: [{ id: 'b1', description: 'x' }],
          },
        ],
        elements: [
          { id: 'shot-1', type: 'shot', shotText: 'WIDE SHOT - Park', frameSize: 'WIDE' },
          { id: 'shot-2', type: 'shot', shotText: 'CLOSE UP - Tree', frameSize: 'CLOSE-UP' },
        ],
        previsualizationPlan: {
          collectionName: 'Previs',
          shots: [
            { shotElementId: 'shot-1', filePath: '/previs/shot-1.png', videoPath: '/video/shot-1.mp4', description: 'Park wide' },
            { shotElementId: 'shot-2', filePath: '/previs/shot-2.png', description: 'Tree close' },
          ],
        },
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const shots = pkg.scenes[0].shots;

      expect(shots[0].videoPath).toBe('/video/shot-1.mp4');
      expect(shots[1].videoPath).toBeNull();
    });

    it('should map locationId when scene heading location matches a known location', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        locations: [{ id: 'loc_1', name: 'Office' }],
        processedSections: [
          {
            id: 'scene-01', type: 'scene', title: 'INT. OFFICE - DAY',
            sceneHeading: { location: 'Office' },
            children: [],
            beats: [{ id: 'b1', description: 'x' }],
          },
        ],
        elements: [{ id: 'e1', type: 'action', content: 'Test' }],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;

      expect(pkg.scenes[0].locationId).toBe('loc_1');
      expect(pkg.scenes[0].location).toBe('Office');
    });

    it('should collect characterIds from dialogue elements in the scene', async () => {
      const { execute } = await import('./final-assembly.js');
      const { context } = createMockContext();

      const inputs = makeInputs({
        characters: [
          { id: 'char_1', name: 'ALICE' },
          { id: 'char_2', name: 'BOB' },
        ],
        processedSections: [
          { id: 's1', type: 'scene', title: 'Scene', children: [], beats: [{ id: 'b1', description: 'x' }] },
        ],
        elements: [
          { id: 'e1', type: 'dialogue', characterName: 'ALICE', characterId: 'char_1', lines: ['Hi'] },
          { id: 'e2', type: 'dialogue', characterName: 'BOB', characterId: 'char_2', lines: ['Hey'] },
          { id: 'e3', type: 'dialogue', characterName: 'ALICE', characterId: 'char_1', lines: ['Bye'] },
        ],
      });

      const result = await execute(inputs, context);
      const pkg = result.scriptPackage as any;
      const scene = pkg.scenes[0];

      // Should deduplicate character IDs
      expect(scene.characterIds.sort()).toEqual(['char_1', 'char_2']);
    });
  });

  // -------------------------------------------------------
  // Dialogue audio linking
  // -------------------------------------------------------

  it('should link dialogue audio assets to matching elements', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      processedSections: [
        { id: 's1', type: 'scene', title: 'Scene', children: [], beats: [{ id: 'b1', description: 'x' }] },
      ],
      elements: [
        { id: 'dlg_1', type: 'dialogue', characterName: 'ALICE', lines: ['Hello'] },
        { id: 'act_1', type: 'action', content: 'Walks away' },
      ],
      dialogueAudio: [
        { id: 'audio_1', filePath: '/audio/dlg_1.mp3', metadata: { dialogueElementId: 'dlg_1', duration: 2.5 } },
      ],
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    const dlgElem = pkg.script.elements.find((e: any) => e.id === 'dlg_1');
    expect(dlgElem.audioPath).toBe('/audio/dlg_1.mp3');
    expect(dlgElem.audioDuration).toBe(2.5);

    // Non-dialogue element should be untouched
    const actElem = pkg.script.elements.find((e: any) => e.id === 'act_1');
    expect(actElem.audioPath).toBeUndefined();
  });

  // -------------------------------------------------------
  // Motion graphics plan pass-through
  // -------------------------------------------------------

  it('should pass motionGraphicsPlan through to the output', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const motionGraphicsPlan = {
      kenBurns: [
        { shotElementId: 'shot-1', startScale: 1.0, endScale: 1.3, panDirection: 'left-to-right' },
        { shotElementId: 'shot-2', startScale: 1.2, endScale: 1.0, panDirection: 'right-to-left' },
      ],
      transitions: [
        { fromShotId: 'shot-1', toShotId: 'shot-2', type: 'dissolve', durationMs: 500 },
      ],
    };

    const inputs = makeInputs({
      processedSections: [
        { id: 's1', type: 'scene', title: 'Scene', children: [], beats: [{ id: 'b1', description: 'x' }] },
      ],
      elements: [{ id: 'e1', type: 'action', content: 'Test' }],
      motionGraphicsPlan,
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.motionGraphicsPlan).toBeDefined();
    expect(pkg.motionGraphicsPlan.kenBurns).toHaveLength(2);
    expect(pkg.motionGraphicsPlan.kenBurns[0].shotElementId).toBe('shot-1');
    expect(pkg.motionGraphicsPlan.transitions).toHaveLength(1);
    expect(pkg.motionGraphicsPlan.transitions[0].type).toBe('dissolve');
  });

  it('should default motionGraphicsPlan to empty object when not provided', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = makeInputs({
      processedSections: [
        { id: 's1', type: 'scene', title: 'Scene', children: [], beats: [{ id: 'b1', description: 'x' }] },
      ],
      elements: [{ id: 'e1', type: 'action', content: 'Test' }],
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.motionGraphicsPlan).toBeDefined();
    expect(pkg.motionGraphicsPlan).toEqual({});
  });

  // -------------------------------------------------------
  // Error handling
  // -------------------------------------------------------

  it('should return an error package when assembly throws', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    // metadata is null which will cause scriptMetadata.title to throw
    const inputs = makeInputs({
      metadata: null,
    });

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;

    expect(pkg.error).toBeDefined();
    expect(pkg.script.metadata.title).toBe('Error');
  });
});
