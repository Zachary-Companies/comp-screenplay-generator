import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./cast-generator.js');

describe('Cast Generator', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({ llmGenerate: 'mock LLM response', llmGenerateJSON: { result: 'mock' } });
    const result = await execute({
    scriptKind: 'test-value',
    genre: 'test-value',
    logline: 'test-value',
    metadata: 'test-value',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('cast');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({ llmGenerate: 'mock LLM response', llmGenerateJSON: { result: 'mock' } });
    await expect(execute({}, context)).resolves.toBeDefined();
  });
});
