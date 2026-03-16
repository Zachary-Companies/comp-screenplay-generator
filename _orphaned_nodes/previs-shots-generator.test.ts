import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validScriptDocument } from './_test-fixtures.js';

const { execute } = await import('./previs-shots-generator.js');

describe('Previs Shots Generator', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    // Create a script document with proper structure including shots
    const scriptWithShots = {
      ...validScriptDocument,
      id: 'script_test',
      sections: [{
        id: 'scene_1',
        type: 'scene',
        order: 1,
        heading: { prefix: 'EXT', location: 'HARBOR', timeOfDay: 'DAY' },
        beats: [
          { id: 'shot_1', type: 'shot', text: 'WIDE SHOT - the harbor' }
        ],
        locationId: 'loc_harbor'
      }],
      locations: [{ id: 'loc_harbor', name: 'Harbor', description: 'A foggy harbor' }]
    };
    
    const result = await execute({
      scriptDocument: JSON.stringify(scriptWithShots),
      visualizationStyle: 'cinematic watercolor realism',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('previsAssets');
    expect(result).toHaveProperty('previsShots');
  });

  it('should handle script with no shots gracefully', async () => {
    const { context } = createMockContext({});
    const scriptNoShots = {
      id: 'script_test',
      kind: 'short-film',
      metadata: { title: 'Test' },
      sections: [{
        id: 'scene_1',
        type: 'scene',
        order: 1,
        heading: { prefix: 'INT', location: 'ROOM', timeOfDay: 'DAY' },
        beats: [
          { id: 'action_1', type: 'action', text: 'Someone walks in' }
        ]
      }],
      locations: []
    };
    
    const result = await execute({
      scriptDocument: JSON.stringify(scriptNoShots),
      visualizationStyle: 'test style',
    }, context);
    expect(result).toBeDefined();
    expect(result.previsAssets).toEqual([]);
    expect(result.previsShots).toEqual([]);
  });
});
