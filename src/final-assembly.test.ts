import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from './_test-helpers';

describe('final-assembly', () => {
  it('should populate section children with elements', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = {
      validatedInput: { kind: 'short-film', requirements: 'Test' },
      metadata: { title: 'Test Script', genre: ['Drama'], runtimeMinutes: 15 },
      characters: [
        { id: 'char_1', name: 'ALICE', description: 'Main character' },
        { id: 'char_2', name: 'BOB', description: 'Supporting character' }
      ],
      locations: [
        { id: 'loc_1', name: 'Office', description: 'Modern office' }
      ],
      processedSections: [
        {
          id: 'scene-01',
          type: 'scene',
          title: 'INT. OFFICE - DAY',
          order: 1,
          children: [],
          beats: [
            { id: 'beat_1', description: 'Alice enters' },
            { id: 'beat_2', description: 'Alice talks to Bob' }
          ]
        },
        {
          id: 'scene-02',
          type: 'scene',
          title: 'EXT. STREET - NIGHT',
          order: 2,
          children: [],
          beats: [
            { id: 'beat_3', description: 'Bob leaves' }
          ]
        }
      ],
      elements: [
        { id: 'elem_1', type: 'action', content: 'Alice enters the office' },
        { id: 'elem_2', type: 'dialogue', characterName: 'ALICE', lines: ['Hello Bob!'] },
        { id: 'elem_3', type: 'shot', shotText: 'WIDE SHOT - Office' },
        { id: 'elem_4', type: 'dialogue', characterName: 'BOB', lines: ['Hi Alice!'] },
        { id: 'elem_5', type: 'action', content: 'Bob walks out' },
        { id: 'elem_6', type: 'shot', shotText: 'MEDIUM SHOT - Street' }
      ],
      productionMetadata: { intendedFormat: 'screenplay' },
      revisionMetadata: { color: 'white', revisionDate: '2024-01-01' },
      assetCollection: { id: 'assets_1', name: 'Test Assets', assets: [] },
      previsualizationPlan: { collectionName: 'Test Previs', shots: [] },
      validationResults: { valid: true, errors: [] }
    };

    const result = await execute(inputs, context);

    expect(result.scriptPackage).toBeDefined();
    const pkg = result.scriptPackage as any;
    
    // Check that sections have children populated
    const sections = pkg.script.sections;
    expect(sections).toHaveLength(2);
    
    // Scene 1 has 2 beats, Scene 2 has 1 beat
    // With 6 elements total, proportional distribution:
    // Scene 1: 2/3 * 6 = 4 elements
    // Scene 2: 1/3 * 6 = 2 elements
    expect(sections[0].children.length).toBeGreaterThan(0);
    expect(sections[1].children.length).toBeGreaterThan(0);
    
    // Total children should equal total elements
    const totalChildren = sections.reduce((sum: number, s: any) => sum + (s.children?.length || 0), 0);
    expect(totalChildren).toBe(6);
    
    // Check that dialogue elements are present
    const allChildren = sections.flatMap((s: any) => s.children || []);
    const dialogueElements = allChildren.filter((e: any) => e.type === 'dialogue');
    expect(dialogueElements.length).toBe(2);
    expect(dialogueElements[0].characterName).toBe('ALICE');
    expect(dialogueElements[1].characterName).toBe('BOB');
  });

  it('should handle empty elements array', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = {
      validatedInput: { kind: 'short-film' },
      metadata: { title: 'Test' },
      characters: [],
      locations: [],
      processedSections: [
        { id: 'scene-01', type: 'scene', title: 'Test Scene', children: [] }
      ],
      elements: [],
      productionMetadata: {},
      revisionMetadata: {},
      assetCollection: { assets: [] },
      previsualizationPlan: { shots: [] },
      validationResults: { valid: true }
    };

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;
    
    // Children should remain empty
    expect(pkg.script.sections[0].children).toEqual([]);
  });

  it('should distribute elements evenly when no beats info', async () => {
    const { execute } = await import('./final-assembly.js');
    const { context } = createMockContext();

    const inputs = {
      validatedInput: { kind: 'short-film' },
      metadata: { title: 'Test' },
      characters: [],
      locations: [],
      processedSections: [
        { id: 'scene-01', type: 'scene', title: 'Scene 1', children: [] },
        { id: 'scene-02', type: 'scene', title: 'Scene 2', children: [] }
      ],
      elements: [
        { id: 'elem_1', type: 'action', content: 'Action 1' },
        { id: 'elem_2', type: 'action', content: 'Action 2' },
        { id: 'elem_3', type: 'action', content: 'Action 3' },
        { id: 'elem_4', type: 'action', content: 'Action 4' }
      ],
      productionMetadata: {},
      revisionMetadata: {},
      assetCollection: { assets: [] },
      previsualizationPlan: { shots: [] },
      validationResults: { valid: true }
    };

    const result = await execute(inputs, context);
    const pkg = result.scriptPackage as any;
    
    // With 4 elements and 2 scenes, each should get 2
    expect(pkg.script.sections[0].children.length).toBe(2);
    expect(pkg.script.sections[1].children.length).toBe(2);
  });
});
