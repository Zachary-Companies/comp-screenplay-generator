import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./asset-collection.js');

describe('Asset Collection', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
    metadata: 'test-value',
    characters: ['item-1', 'item-2'],
    locations: ['item-1', 'item-2'],
    elements: ['item-1', 'item-2'],
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('assetCollection');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({});
    await expect(execute({}, context)).resolves.toBeDefined();
  });
});
