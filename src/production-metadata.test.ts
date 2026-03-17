import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./production-metadata.js');

describe('Production Metadata', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({ llmGenerate: 'mock LLM response', llmGenerateJSON: { result: 'mock' } });
    const result = await execute({
    validatedInput: 'test-value',
    metadata: 'test-value',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('productionMetadata');
    expect(result).toHaveProperty('revisionMetadata');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({ llmGenerate: 'mock LLM response', llmGenerateJSON: { result: 'mock' } });
    await expect(execute({}, context)).resolves.toBeDefined();
  });
});
