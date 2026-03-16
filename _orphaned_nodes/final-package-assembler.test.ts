import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { 
  validScriptDocument,
  validAssetCollection,
  validPrevisPlan,
  validCharacter,
  validLocation
} from './_test-fixtures.js';

const { execute } = await import('./final-package-assembler.js');

describe('Final Package Assembler', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    
    // Create a complete valid script document with all required fields
    const completeScript = {
      id: 'script_glass_harbor',
      kind: 'short-film',
      metadata: {
        title: 'Glass Harbor',
        logline: 'A story about memory',
        genre: ['drama'],
      },
      cast: [validCharacter],
      locations: [validLocation],
      sections: [{
        id: 'scene_1',
        type: 'scene',
        order: 1,
        heading: { prefix: 'EXT', location: 'HARBOR', timeOfDay: 'DAY' },
        beats: [
          { id: 'shot_1', type: 'shot', text: 'WIDE SHOT' },
          { id: 'dialogue_1', type: 'dialogue', characterId: 'char_mara', characterName: 'MARA', lines: ['Hello'] }
        ],
        locationId: 'loc_harbor'
      }]
    };
    
    // Create matching asset collection
    const matchingAssets = {
      id: 'assets_glass_harbor',
      name: 'Glass Harbor',
      assets: [{
        id: 'asset_previs_scene1_shot1',
        type: 'previs-frame',
        name: 'Shot 1',
        collectionName: 'Glass Harbor',
        prompt: 'test',
        visualizationStyle: 'cinematic',
        sceneId: 'scene_1',
        shotElementId: 'shot_1',
        locationId: 'loc_harbor'
      }]
    };
    
    // Create matching previs plan
    const matchingPrevis = {
      collectionName: 'Glass Harbor',
      shots: [{
        id: 'previs_1',
        sceneId: 'scene_1',
        shotElementId: 'shot_1',
        shotText: 'WIDE SHOT',
        order: 1,
        locationId: 'loc_harbor',
        assetId: 'asset_previs_scene1_shot1'
      }]
    };
    
    const result = await execute({
      scriptDocument: JSON.stringify(completeScript),
      assetCollection: JSON.stringify(matchingAssets),
      previsualizationPlan: JSON.stringify(matchingPrevis),
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('scriptPackage');
  });

  it('should handle minimal valid inputs', async () => {
    const { context } = createMockContext({});
    const minimalScript = {
      id: 'script_test',
      kind: 'short-film',
      metadata: { title: 'Test' },
      cast: [],
      locations: [],
      sections: []
    };
    const minimalAssets = { id: 'test', name: 'Test', assets: [] };
    const minimalPrevis = { collectionName: 'Test', shots: [] };
    
    const result = await execute({
      scriptDocument: JSON.stringify(minimalScript),
      assetCollection: JSON.stringify(minimalAssets),
      previsualizationPlan: JSON.stringify(minimalPrevis),
    }, context);
    expect(result).toBeDefined();
  });
});
