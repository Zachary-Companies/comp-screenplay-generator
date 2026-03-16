import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validSectionJSON, validCharacterJSON } from './_test-fixtures.js';

const { execute } = await import('./element-generation.js');

describe('Element Generation', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    // Create a section with sceneContent.beats structure
    const sectionWithBeats = {
      id: 'scene_1',
      type: 'scene',
      order: 1,
      sceneContent: {
        sceneHeading: { prefix: 'EXT', location: 'HARBOR', timeOfDay: 'DAY' },
        beats: ['A character walks in', 'They look around']
      }
    };
    
    const { context } = createMockContext({
      llmGenerateJSON: [{ type: 'action', content: 'Test action' }],
    });
    const result = await execute({
      processedSections: [JSON.stringify(sectionWithBeats)],
      characters: [validCharacterJSON],
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('elements');
    expect(Array.isArray(result.elements)).toBe(true);
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
});
