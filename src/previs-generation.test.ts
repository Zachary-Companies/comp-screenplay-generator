import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./previs-generation.js');

describe('Previs Generation', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should generate previs from shot elements', async () => {
    const sections = [{
      id: 'scene_1',
      type: 'scene',
      title: 'Opening',
      sceneHeading: { prefix: 'EXT', location: 'HARBOR', timeOfDay: 'DAWN' },
      locationId: 'loc_harbor',
      beats: [{ id: 'beat_1', description: 'Character arrives' }]
    }];
    
    const elements = [
      { id: 'elem_1', type: 'action', content: 'MARA walks along the dock' },
      { id: 'elem_2', type: 'shot', shotText: 'WIDE SHOT - Harbor at dawn', frameSize: 'WIDE', cameraMovement: 'STATIC' },
      { id: 'elem_3', type: 'dialogue', characterId: 'char_mara', characterName: 'MARA', lines: ['Hello'] }
    ];
    
    const characters = [{ id: 'char_mara', name: 'Mara' }];
    const locations = [{ id: 'loc_harbor', name: 'Harbor' }];
    const assetCollection = { name: 'Test Assets', assets: [] };
    
    const mockPrevisDetails = {
      description: 'Wide establishing shot of the harbor at dawn',
      cameraIntent: 'Establish location and mood',
      composition: 'Rule of thirds',
      lighting: 'Golden hour',
      durationSeconds: 5
    };
    
    const { context } = createMockContext({
      llmGenerateJSON: mockPrevisDetails,
    });
    
    const result = await execute({
      processedSections: sections,
      elements: elements,
      characters: characters,
      locations: locations,
      assetCollection: assetCollection,
    }, context);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('previsualizationPlan');
    expect(result.previsualizationPlan).toHaveProperty('shots');
    expect(Array.isArray(result.previsualizationPlan.shots)).toBe(true);
    expect(result.previsualizationPlan.shots.length).toBeGreaterThan(0);
  });

  it('should generate previs from scene beats when no shot elements exist', async () => {
    const sections = [{
      id: 'scene_1',
      type: 'scene',
      title: 'Opening Scene',
      sceneHeading: { prefix: 'EXT', location: 'BEACH', timeOfDay: 'SUNSET' },
      beats: [
        { id: 'beat_1', description: 'Character walks on beach' },
        { id: 'beat_2', description: 'Character sits down' }
      ]
    }];
    
    // No shot elements - only action and dialogue
    const elements = [
      { id: 'elem_1', type: 'action', content: 'Walking on beach' },
      { id: 'elem_2', type: 'dialogue', characterName: 'JOHN', lines: ['Beautiful sunset'] }
    ];
    
    const mockPrevisDetails = {
      shotText: 'WIDE SHOT - Beach at sunset',
      description: 'Wide shot of character on beach',
      cameraIntent: 'Establish mood',
      composition: 'Centered',
      lighting: 'Golden hour',
      durationSeconds: 4,
      suggestedFrameSize: 'WIDE',
      suggestedCameraMovement: 'STATIC'
    };
    
    const { context } = createMockContext({
      llmGenerateJSON: mockPrevisDetails,
    });
    
    const result = await execute({
      processedSections: sections,
      elements: elements,
      characters: [],
      locations: [],
      assetCollection: { name: 'Test', assets: [] },
    }, context);

    expect(result.previsualizationPlan.shots.length).toBe(2); // One per beat
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({ 
      llmGenerate: 'mock LLM response', 
      llmGenerateJSON: { result: 'mock' } 
    });
    
    const result = await execute({
      processedSections: [],
      elements: [],
      characters: [],
      locations: [],
      assetCollection: {},
    }, context);
    
    expect(result).toBeDefined();
    expect(result.previsualizationPlan).toBeDefined();
    expect(result.previsualizationPlan.shots).toEqual([]);
  });

  it('should handle JSON string inputs', async () => {
    const sections = [JSON.stringify({
      id: 'scene_1',
      type: 'scene',
      sceneHeading: { location: 'OFFICE' },
      beats: [{ id: 'beat_1', description: 'Meeting starts' }]
    })];
    
    const elements = [JSON.stringify({
      id: 'elem_1',
      type: 'shot',
      shotText: 'MEDIUM SHOT - Office'
    })];
    
    const { context } = createMockContext({
      llmGenerateJSON: { description: 'Office shot', durationSeconds: 3 },
    });
    
    const result = await execute({
      processedSections: sections,
      elements: elements,
      characters: [],
      locations: [],
      assetCollection: JSON.stringify({ name: 'Test', assets: [] }),
    }, context);

    expect(result.previsualizationPlan.shots.length).toBeGreaterThan(0);
  });

  it('should skip non-scene sections', async () => {
    const sections = [
      { id: 'act_1', type: 'act', title: 'Act One' },
      { id: 'scene_1', type: 'scene', beats: [{ description: 'Test' }] }
    ];
    
    const { context } = createMockContext({
      llmGenerateJSON: { shotText: 'Test', description: 'Test', durationSeconds: 3 },
    });
    
    const result = await execute({
      processedSections: sections,
      elements: [],
      characters: [],
      locations: [],
      assetCollection: {},
    }, context);

    // Should only process the scene section
    expect(result.previsualizationPlan.shots.length).toBe(1);
  });
});
