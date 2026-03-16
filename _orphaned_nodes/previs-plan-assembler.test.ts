import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';
import { validPrevisShotJSON, validScriptDocumentJSON } from './_test-fixtures.js';

const { execute } = await import('./previs-plan-assembler.js');

describe('Previs Plan Assembler', () => {
  it('should export an execute function', () => {
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({});
    // Add id to script document
    const scriptWithId = JSON.parse(validScriptDocumentJSON);
    scriptWithId.id = 'script_glass_harbor';
    
    const result = await execute({
      scriptDocument: JSON.stringify(scriptWithId),
      previsShots: [validPrevisShotJSON],
      title: 'Glass Harbor',
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('previsualizationPlan');
  });

  it('should handle empty shots gracefully', async () => {
    const { context } = createMockContext({});
    const scriptWithId = { id: 'script_test', kind: 'short-film', metadata: { title: 'Test' } };
    
    const result = await execute({
      scriptDocument: JSON.stringify(scriptWithId),
      previsShots: [],
      title: 'Test',
    }, context);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result.previsualizationPlan);
    expect(parsed.shots).toEqual([]);
  });
});
