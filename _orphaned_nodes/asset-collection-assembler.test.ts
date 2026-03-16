import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validAssetJSON } from './_test-fixtures.js';

const { execute } = await import('./asset-collection-assembler.js');

describe('Asset Collection Assembler', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      headshotAssets: [validAssetJSON],
      landscapeAssets: [validAssetJSON],
      previsAssets: [validAssetJSON],
      title: 'Glass Harbor',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('assetCollection');
  });

  it('should handle empty inputs gracefully', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      headshotAssets: [],
      landscapeAssets: [],
      previsAssets: [],
      title: 'Test',
    }, context);
    expect(result).toBeDefined();
    expect(result.assetCollection).toBeDefined();
    const parsed = JSON.parse(result.assetCollection);
    expect(parsed.assets).toEqual([]);
  });
});
