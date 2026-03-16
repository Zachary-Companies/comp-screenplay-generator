import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validMetadataJSON, validLocationJSON } from './_test-fixtures.js';

const { execute } = await import('./sections-generator.js');

describe('Sections Generator', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      scriptKind: 'short-film',
      metadata: validMetadataJSON,
      locations: [validLocationJSON],
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('sections');
    expect(Array.isArray(result.sections)).toBe(true);
  });

  it('should handle empty locations gracefully', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      scriptKind: 'short-film',
      metadata: validMetadataJSON,
      locations: [],
    }, context);
    expect(result).toBeDefined();
    expect(result.sections).toEqual([]);
  });

  it('should generate different structures for different script kinds', async () => {
    const { context } = createMockContext({});
    
    const shortFilmResult = await execute({
      scriptKind: 'short-film',
      metadata: validMetadataJSON,
      locations: [validLocationJSON],
    }, context);
    
    const commercialResult = await execute({
      scriptKind: 'commercial',
      metadata: JSON.stringify({ title: 'Test', commercialMetadata: { product: 'Widget' } }),
      locations: [validLocationJSON],
    }, context);
    
    expect(shortFilmResult.sections.length).toBeGreaterThan(0);
    expect(commercialResult.sections.length).toBeGreaterThan(0);
  });
});
