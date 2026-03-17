import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from './_test-helpers.js';

describe('asset-collection', () => {
  it('should create a collection and save assets to the library', async () => {
    const { execute } = await import('./asset-collection.js');
    
    // Track tool calls
    const collectionCreateCalls: any[] = [];
    const assetSaveCalls: any[] = [];
    
    // Create mock tools
    const mockTools = {
      asset_collection_create: async (params: any) => {
        collectionCreateCalls.push(params);
        const slug = params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return {
          success: true,
          collection: {
            id: 'col_0001',
            name: params.name,
            slug: slug,
            description: params.description
          }
        };
      },
      asset_save: async (params: any) => {
        assetSaveCalls.push(params);
        return {
          success: true,
          asset: {
            id: `ast_${String(assetSaveCalls.length).padStart(4, '0')}`,
            name: params.name,
            file_path: params.file_path
          }
        };
      },
      nanobanana: async (params: any) => {
        return {
          success: true,
          imagePath: params.outputPath
        };
      }
    };
    
    const { context } = createMockContext({ tools: mockTools });
    
    const inputs = {
      metadata: {
        title: 'Test Script',
        genre: ['Drama'],
        tone: ['Serious']
      },
      characters: [
        { id: 'char_1', name: 'John', description: 'A detective', ageRange: '40s', gender: 'male' }
      ],
      locations: [
        { id: 'loc_1', name: 'Office', description: 'A dark office' }
      ],
      elements: [
        { id: 'elem_1', type: 'shot', content: 'Wide shot of the office' }
      ]
    };
    
    const result = await execute(inputs, context);
    
    // Verify collection was created
    expect(collectionCreateCalls.length).toBe(1);
    expect(collectionCreateCalls[0].name).toBe('Test Script Assets');
    
    // Verify assets were saved with correct parameters
    expect(assetSaveCalls.length).toBe(3); // 1 character + 1 location + 1 shot
    
    // Check that file_path (not path) was used
    for (const call of assetSaveCalls) {
      expect(call).toHaveProperty('file_path');
      expect(call).toHaveProperty('name');
      expect(call).toHaveProperty('collection');
      expect(call.collection).toBe('test-script-assets');
    }
    
    // Verify output structure
    expect(result.assetCollection).toBeDefined();
    expect((result.assetCollection as any).slug).toBe('test-script-assets');
    expect((result.assetCollection as any).savedAssetIds.length).toBe(3);
    expect((result.assetCollection as any).assets.length).toBe(3);
  });

  it('should handle collection creation failure gracefully', async () => {
    const { execute } = await import('./asset-collection.js');
    
    const mockTools = {
      asset_collection_create: async () => {
        throw new Error('Collection creation failed');
      },
      asset_save: async (params: any) => {
        return {
          success: true,
          asset: { id: 'ast_0001', name: params.name }
        };
      },
      nanobanana: async (params: any) => {
        return { success: true, imagePath: params.outputPath };
      }
    };
    
    const { context } = createMockContext({ tools: mockTools });
    
    const inputs = {
      metadata: { title: 'Test Script' },
      characters: [{ id: 'char_1', name: 'John', description: 'A detective' }],
      locations: [],
      elements: []
    };
    
    const result = await execute(inputs, context);
    
    // Should still return assets even if collection creation failed
    expect(result.assetCollection).toBeDefined();
    expect((result.assetCollection as any).assets.length).toBe(1);
    expect((result.assetCollection as any).libraryCollectionSlug).toBeNull();
  });

  it('should use collection slug not ID when saving assets', async () => {
    const { execute } = await import('./asset-collection.js');
    
    const assetSaveCalls: any[] = [];
    
    const mockTools = {
      asset_collection_create: async () => ({
        success: true,
        collection: {
          id: 'col_0001',
          name: 'My Collection',
          slug: 'my-collection'
        }
      }),
      asset_save: async (params: any) => {
        assetSaveCalls.push(params);
        return { success: true, asset: { id: 'ast_0001' } };
      },
      nanobanana: async () => ({
        success: true,
        imagePath: '/tmp/test.png'
      })
    };
    
    const { context } = createMockContext({ tools: mockTools });
    
    const inputs = {
      metadata: { title: 'My Collection' },
      characters: [{ id: 'char_1', name: 'Test', description: 'Test' }],
      locations: [],
      elements: []
    };
    
    await execute(inputs, context);
    
    // Verify collection parameter is the slug, not the ID
    expect(assetSaveCalls.length).toBeGreaterThan(0);
    expect(assetSaveCalls[0].collection).toBe('my-collection');
    expect(assetSaveCalls[0].collection).not.toBe('col_0001');
  });
});
