import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { 
  validMetadataJSON, 
  validCharacterJSON, 
  validLocationJSON,
  validSectionJSON
} from './_test-fixtures.js';

const { execute } = await import('./script-document-assembler.js');

describe('Script Document Assembler', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    const result = await execute({
      metadata: validMetadataJSON,
      cast: [validCharacterJSON],
      locations: [validLocationJSON],
      sectionsWithBeats: [validSectionJSON],
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('scriptDocument');
  });

  it('should handle minimal inputs', async () => {
    const { context } = createMockContext({});
    const minimalMetadata = JSON.stringify({ title: 'Test', kind: 'short-film' });
    
    const result = await execute({
      metadata: minimalMetadata,
      cast: [],
      locations: [],
      sectionsWithBeats: [],
    }, context);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result.scriptDocument);
    expect(parsed.metadata.title).toBe('Test');
  });
});
