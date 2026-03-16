import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./rule-enforcement.js');

describe('Rule Enforcement', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
    generatorRules: 'test-value',
    validatedInput: 'test-value',
    characters: ['item-1', 'item-2'],
    locations: ['item-1', 'item-2'],
    elements: ['item-1', 'item-2'],
    assetCollection: 'test-value',
    previsualizationPlan: 'test-value',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('validationResults');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({});
    await expect(execute({}, context)).resolves.toBeDefined();
  });
});
