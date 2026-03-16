import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validScriptInputJSON, validMetadataJSON, validCharacterJSON, validLocationJSON } from './_test-fixtures.js';

const { execute } = await import('./section-structure.js');

describe('Section Structure', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const mockSections = [
      { id: 'scene_1', type: 'scene', order: 1, title: 'Opening', children: [] }
    ];
    const { context } = createMockContext({
      llmGenerateJSON: mockSections,
    });
    const result = await execute({
      validatedInput: validScriptInputJSON,
      metadata: validMetadataJSON,
      characters: [validCharacterJSON],
      locations: [validLocationJSON],
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('sections');
    expect(Array.isArray(result.sections)).toBe(true);
  });

  it('should handle empty inputs with fallback', async () => {
    const { context } = createMockContext({
      llmGenerateJSON: async () => { throw new Error('LLM error'); },
    });
    // Should use fallback sections
    const result = await execute({
      validatedInput: JSON.stringify({ kind: 'short-film', concept: 'test' }),
      metadata: JSON.stringify({ title: 'Test' }),
      characters: [],
      locations: [],
    }, context);
    expect(result).toBeDefined();
    expect(result.sections.length).toBeGreaterThan(0);
  });
});
