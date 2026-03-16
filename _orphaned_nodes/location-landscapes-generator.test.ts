import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validLocationJSON } from './_test-fixtures.js';

const { execute } = await import('./location-landscapes-generator.js');

describe('Location Landscapes Generator', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      locations: [validLocationJSON],
      title: 'Glass Harbor',
      visualizationStyle: 'cinematic watercolor realism',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('landscapeAssets');
    expect(Array.isArray(result.landscapeAssets)).toBe(true);
  });

  it('should handle empty locations gracefully', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      locations: [],
      title: 'Test',
      visualizationStyle: 'test style',
    }, context);
    expect(result).toBeDefined();
    expect(result.landscapeAssets).toEqual([]);
  });
});
