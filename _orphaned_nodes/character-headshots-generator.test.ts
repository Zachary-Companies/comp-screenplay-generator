import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validCharacterJSON } from './_test-fixtures.js';

const { execute } = await import('./character-headshots-generator.js');

describe('Character Headshots Generator', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      cast: [validCharacterJSON],
      title: 'Glass Harbor',
      visualizationStyle: 'cinematic watercolor realism',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('headshotAssets');
    expect(Array.isArray(result.headshotAssets)).toBe(true);
  });

  it('should handle empty cast gracefully', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      cast: [],
      title: 'Test',
      visualizationStyle: 'test style',
    }, context);
    expect(result).toBeDefined();
    expect(result.headshotAssets).toEqual([]);
  });
});
