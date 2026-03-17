import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./scene-content-generation.js');

describe('Scene Content Generation', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({ llmGenerate: 'mock LLM response', llmGenerateJSON: { result: 'mock' } });
    const result = await execute({
    section: 'test-value',
    characters: ['item-1', 'item-2'],
    locations: ['item-1', 'item-2'],
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('processedSection');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({ llmGenerate: 'mock LLM response', llmGenerateJSON: { result: 'mock' } });
    await expect(execute({}, context)).resolves.toBeDefined();
  });
});
