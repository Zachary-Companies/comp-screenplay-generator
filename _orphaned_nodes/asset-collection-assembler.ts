/// <reference path="./woodbury.d.ts" />

/**
 * @input headshotAssets: string[] - Character headshot assets
 * @input landscapeAssets: string[] - Location landscape assets
 * @input previsAssets: string[] - Previs frame assets
 * @input title: string - Collection name (must match script title)
 * @output assetCollection: string - Complete AssetCollection object
 */
export async function execute(
  inputs: { headshotAssets: string[]; landscapeAssets: string[]; previsAssets: string[]; title: string },
  context: ScriptContext,
): Promise<{ assetCollection: string }> {
  const { headshotAssets, landscapeAssets, previsAssets, title } = inputs;

  try {
    // Parse all asset arrays
    const parsedHeadshotAssets = headshotAssets.map(asset => JSON.parse(asset));
    const parsedLandscapeAssets = landscapeAssets.map(asset => JSON.parse(asset));
    const parsedPrevisAssets = previsAssets.map(asset => JSON.parse(asset));

    // Combine all assets into a single array
    const allAssets = [
      ...parsedHeadshotAssets,
      ...parsedLandscapeAssets,
      ...parsedPrevisAssets
    ];

    // Validate that all assets have the correct collection name
    for (const asset of allAssets) {
      if (asset.collectionName !== title) {
        context.log(`Warning: Asset ${asset.id} has collectionName '${asset.collectionName}' but expected '${title}'`);
        // Fix the collection name to match the script title
        asset.collectionName = title;
      }
    }

    // Create the AssetCollection object
    const assetCollection = {
      id: `collection_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: title,
      description: `Visual assets collection for ${title} including character headshots, location landscapes, and previsualization frames`,
      assets: allAssets
    };

    context.log(`Created asset collection '${title}' with ${allAssets.length} assets (${parsedHeadshotAssets.length} headshots, ${parsedLandscapeAssets.length} landscapes, ${parsedPrevisAssets.length} previs frames)`);

    return {
      assetCollection: JSON.stringify(assetCollection)
    };

  } catch (error) {
    context.log(`Error assembling asset collection: ${error.message}`);
    
    // Return empty collection on error
    const emptyCollection = {
      id: `collection_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: title,
      description: `Visual assets collection for ${title} (error during assembly)`,
      assets: []
    };

    return {
      assetCollection: JSON.stringify(emptyCollection)
    };
  }
}