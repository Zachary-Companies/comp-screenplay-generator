import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { 
  validScriptInputJSON, 
  validMetadataJSON, 
  validCharacterJSON, 
  validLocationJSON,
  validSectionJSON,
  validElementJSON,
  validAssetCollectionJSON,
  validPrevisPlanJSON,
  validProductionMetadataJSON,
  validRevisionMetadataJSON
} from './_test-fixtures.js';

const { execute } = await import('./final-assembly.js');

describe('Final Assembly', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      validatedInput: validScriptInputJSON,
      metadata: validMetadataJSON,
      characters: [validCharacterJSON],
      locations: [validLocationJSON],
      processedSections: [validSectionJSON],
      elements: [validElementJSON],
      productionMetadata: validProductionMetadataJSON,
      revisionMetadata: validRevisionMetadataJSON,
      assetCollection: validAssetCollectionJSON,
      previsualizationPlan: validPrevisPlanJSON,
      validationResults: JSON.stringify({ valid: true, errors: [] }),
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('scriptPackage');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({});
    // With minimal valid structure - should return error package
    const minimalInput = JSON.stringify({ kind: 'short-film', concept: 'test' });
    const minimalMetadata = JSON.stringify({ title: 'Test' });
    const minimalAssets = JSON.stringify({ id: 'test', name: 'Test', assets: [] });
    const minimalPrevis = JSON.stringify({ collectionName: 'Test', shots: [] });
    const minimalProd = JSON.stringify({});
    const minimalRev = JSON.stringify({});
    const minimalValidation = JSON.stringify({ valid: true, errors: [] });
    
    const result = await execute({
      validatedInput: minimalInput,
      metadata: minimalMetadata,
      characters: [],
      locations: [],
      processedSections: [],
      elements: [],
      productionMetadata: minimalProd,
      revisionMetadata: minimalRev,
      assetCollection: minimalAssets,
      previsualizationPlan: minimalPrevis,
      validationResults: minimalValidation,
    }, context);
    expect(result).toBeDefined();
    expect(result.scriptPackage).toBeDefined();
  });
});
