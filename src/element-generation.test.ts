import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validCharacterJSON } from './_test-fixtures.js';

const { execute } = await import('./element-generation.js');

describe('Element Generation', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should generate elements from scene beats', async () => {
    // Create a section with beats structure (as output by scene-content-generation)
    const sectionWithBeats = {
      id: 'scene_1',
      type: 'scene',
      title: 'Opening Scene',
      order: 1,
      sceneHeading: { prefix: 'EXT', location: 'HARBOR', timeOfDay: 'DAWN' },
      beats: [
        { id: 'beat_1', description: 'MARA walks along the dock, looking around nervously' },
        { id: 'beat_2', description: 'MARA speaks to herself about returning home' }
      ]
    };
    
    // Mock LLM to return dialogue and action elements
    const mockElements = [
      { type: 'action', content: 'MARA walks along the weathered dock, her eyes scanning the horizon.' },
      { type: 'dialogue', characterName: 'MARA', lines: ['I told myself I would never come back here.'], modifiers: [] },
      { type: 'shot', shotText: 'WIDE SHOT - Harbor at dawn', frameSize: 'WIDE', cameraMovement: 'STATIC' }
    ];
    
    const { context } = createMockContext({
      llmGenerateJSON: mockElements,
    });
    
    const result = await execute({
      processedSections: [sectionWithBeats],
      characters: [JSON.parse(validCharacterJSON)],
    }, context);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('elements');
    expect(Array.isArray(result.elements)).toBe(true);
    expect(result.elements.length).toBeGreaterThan(0);
    
    // Check that we have different element types
    const types = result.elements.map((e: any) => e.type);
    expect(types).toContain('action');
  });

  it('should handle nested sections (acts containing scenes)', async () => {
    // This tests the new nested structure where acts contain scene children
    const actWithScenes = {
      id: 'act_1',
      type: 'act',
      title: 'Act One',
      order: 1,
      children: [
        {
          id: 'scene_1',
          type: 'scene',
          title: 'Opening Scene',
          sceneHeading: { prefix: 'INT', location: 'OFFICE', timeOfDay: 'DAY' },
          beats: [
            { id: 'beat_1', description: 'Character enters the room' }
          ]
        }
      ]
    };
    
    const { context } = createMockContext({
      llmGenerateJSON: [{ type: 'action', content: 'Test action' }],
    });
    
    const result = await execute({
      processedSections: [actWithScenes],
      characters: [],
    }, context);

    expect(result.elements.length).toBeGreaterThan(0);
  });

  it('should generate dialogue elements with character info', async () => {
    const section = {
      id: 'scene_1',
      type: 'scene',
      sceneHeading: { prefix: 'INT', location: 'ROOM', timeOfDay: 'NIGHT' },
      beats: [{ id: 'beat_1', description: 'JOHN speaks to MARY' }]
    };
    
    const mockDialogue = [
      { 
        type: 'dialogue', 
        characterName: 'JOHN', 
        lines: ['Hello, Mary. It has been a long time.'],
        modifiers: []
      }
    ];
    
    const { context } = createMockContext({
      llmGenerateJSON: mockDialogue,
    });
    
    const result = await execute({
      processedSections: [section],
      characters: [{ id: 'char_john', name: 'John' }],
    }, context);

    const dialogueElements = result.elements.filter((e: any) => e.type === 'dialogue');
    expect(dialogueElements.length).toBeGreaterThan(0);
    
    const johnDialogue = dialogueElements.find((e: any) => e.characterName === 'JOHN');
    if (johnDialogue) {
      expect(johnDialogue.lines).toBeDefined();
      expect(Array.isArray(johnDialogue.lines)).toBe(true);
    }
  });

  it('should generate shot elements', async () => {
    const section = {
      id: 'scene_1',
      type: 'scene',
      sceneHeading: { prefix: 'EXT', location: 'BEACH', timeOfDay: 'SUNSET' },
      beats: [{ id: 'beat_1', description: 'Wide establishing shot of the beach' }]
    };
    
    const mockShot = [
      { 
        type: 'shot', 
        shotText: 'WIDE SHOT - Beach at sunset',
        frameSize: 'WIDE',
        cameraMovement: 'PAN'
      }
    ];
    
    const { context } = createMockContext({
      llmGenerateJSON: mockShot,
    });
    
    const result = await execute({
      processedSections: [section],
      characters: [],
    }, context);

    const shotElements = result.elements.filter((e: any) => e.type === 'shot');
    expect(shotElements.length).toBeGreaterThan(0);
    expect(shotElements[0].shotText).toBeDefined();
  });

  it('should handle empty inputs gracefully', async () => {
    const { context } = createMockContext({
      llmGenerateJSON: [],
    });
    const result = await execute({
      processedSections: [],
      characters: [],
    }, context);
    expect(result).toBeDefined();
    expect(result.elements).toEqual([]);
  });

  it('should skip non-scene sections without children', async () => {
    const nonSceneSection = {
      id: 'act_1',
      type: 'act',
      title: 'Act One',
      children: [] // Empty children - no scenes to process
    };
    
    const { context } = createMockContext({
      llmGenerateJSON: [],
    });
    
    const result = await execute({
      processedSections: [nonSceneSection],
      characters: [],
    }, context);

    expect(result.elements).toEqual([]);
  });
});
