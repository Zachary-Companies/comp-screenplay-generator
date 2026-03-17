/// <reference path="./woodbury.d.ts" />

/**
 * Asset Collection Node
 * 
 * Generates images for characters, locations, and shots, then saves them
 * to the Woodbury asset library using the asset_save and asset_collection_create tools.
 *
 * @input metadata: object - Script metadata
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input elements: object[] - Script elements
 * @output assetCollection: object - Complete AssetCollection object with saved asset IDs
 */
export async function execute(
  inputs: { metadata: any; characters: any[]; locations: any[]; elements: any[] },
  context: ScriptContext,
): Promise<{ assetCollection: object }> {
  const { metadata, characters, locations, elements } = inputs;

  try {
    // Parse input data (handle both string and object inputs)
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const characterDefs = Array.isArray(characters)
      ? characters.map(char => typeof char === 'string' ? JSON.parse(char) : char)
      : [];
    const locationDefs = Array.isArray(locations)
      ? locations.map(loc => typeof loc === 'string' ? JSON.parse(loc) : loc)
      : [];
    const scriptElements = Array.isArray(elements)
      ? elements.map(elem => typeof elem === 'string' ? JSON.parse(elem) : elem)
      : [];

    context.log(`Generating assets for script: ${scriptMetadata.title}`);
    context.log(`Characters: ${characterDefs.length}, Locations: ${locationDefs.length}, Elements: ${scriptElements.length}`);

    // Step 1: Create a collection in the asset library for this script
    const collectionName = `${scriptMetadata.title} Assets`;
    
    context.log(`Creating asset collection: ${collectionName}`);
    
    let collectionSlug: string | null = null;
    let collectionId: string | null = null;
    try {
      const collectionResult = await context.tools.asset_collection_create({
        name: collectionName,
        description: `Complete asset collection for ${scriptMetadata.title} including character headshots, location landscapes, and shot previsualization frames.`
      });
      // The result can have collection at different paths depending on the runtime
      const collection = collectionResult?.collection || collectionResult?.result?.collection || collectionResult;
      collectionSlug = collection?.slug || null;
      collectionId = collection?.id || collectionResult?.id || null;
      context.log(`Created collection: slug=${collectionSlug}, id=${collectionId}`);
    } catch (collErr: any) {
      context.log(`Warning: Could not create collection: ${collErr.message}. Assets will be saved without collection.`);
    }

    const assets: any[] = [];
    const savedAssetIds: string[] = [];

    // Step 2: Generate and save character headshots
    for (const character of characterDefs) {
      context.log(`Generating headshot for character: ${character.name}`);

      const headShotPrompt = `Professional headshot of ${character.name}, ${character.description}. ${character.ageRange} ${character.gender}. ${character.wardrobeNotes || 'Professional attire'}. High quality portrait photography, neutral background, good lighting.`;

      const headShotPath = `/tmp/character_${character.id}_headshot.png`;
      const headShotResult = await context.tools.nanobanana({
        action: "generate",
        prompt: headShotPrompt,
        outputPath: headShotPath
      });

      if (headShotResult.success) {
        // Save to asset library using correct parameter names
        const assetName = `${character.name} Headshot`;
        const assetDescription = `Professional headshot of ${character.name}`;
        
        try {
          const saveResult = await context.tools.asset_save({
            name: assetName,
            file_path: headShotResult.imagePath,  // Use file_path, not path
            description: assetDescription,
            tags: ['character', 'headshot', character.name.toLowerCase()],
            collection: collectionSlug || undefined  // Use collection slug, not ID
          });
          
          // Extract saved ID from various possible response shapes
          const savedId = saveResult?.asset?.id || saveResult?.id || saveResult?.asset_id;
          if (savedId) {
            savedAssetIds.push(savedId);
            context.log(`Saved asset ${assetName} with ID: ${savedId}`);
          }
          
          assets.push({
            id: savedId || `asset_${assets.length + 1}`,
            type: "character-headshot",
            name: assetName,
            description: assetDescription,
            filePath: headShotResult.imagePath,
            libraryId: savedId,
            collectionSlug: collectionSlug,
            metadata: {
              characterId: character.id,
              characterName: character.name
            }
          });
        } catch (saveErr: any) {
          context.log(`Warning: Could not save asset to library: ${saveErr.message}`);
          assets.push({
            id: `asset_${assets.length + 1}`,
            type: "character-headshot",
            name: assetName,
            description: assetDescription,
            filePath: headShotResult.imagePath,
            metadata: {
              characterId: character.id,
              characterName: character.name
            }
          });
        }
      } else {
        context.log(`Failed to generate headshot for ${character.name}`);
      }
    }

    // Step 3: Generate and save location landscapes
    for (const location of locationDefs) {
      context.log(`Generating landscape for location: ${location.name}`);

      const landscapePrompt = `Beautiful landscape photograph of ${location.name}. ${location.description}. Cinematic composition, professional photography, high detail, atmospheric lighting.`;

      const landscapePath = `/tmp/location_${location.id}_landscape.png`;
      const landscapeResult = await context.tools.nanobanana({
        action: "generate",
        prompt: landscapePrompt,
        outputPath: landscapePath
      });

      if (landscapeResult.success) {
        const assetName = `${location.name} Landscape`;
        const assetDescription = `Landscape view of ${location.name}`;
        
        try {
          const saveResult = await context.tools.asset_save({
            name: assetName,
            file_path: landscapeResult.imagePath,  // Use file_path, not path
            description: assetDescription,
            tags: ['location', 'landscape', location.name.toLowerCase()],
            collection: collectionSlug || undefined  // Use collection slug, not ID
          });
          
          const savedId = saveResult?.asset?.id || saveResult?.id || saveResult?.asset_id;
          if (savedId) {
            savedAssetIds.push(savedId);
            context.log(`Saved asset ${assetName} with ID: ${savedId}`);
          }
          
          assets.push({
            id: savedId || `asset_${assets.length + 1}`,
            type: "landscape",
            name: assetName,
            description: assetDescription,
            filePath: landscapeResult.imagePath,
            libraryId: savedId,
            collectionSlug: collectionSlug,
            metadata: {
              locationId: location.id,
              locationName: location.name
            }
          });
        } catch (saveErr: any) {
          context.log(`Warning: Could not save asset to library: ${saveErr.message}`);
          assets.push({
            id: `asset_${assets.length + 1}`,
            type: "landscape",
            name: assetName,
            description: assetDescription,
            filePath: landscapeResult.imagePath,
            metadata: {
              locationId: location.id,
              locationName: location.name
            }
          });
        }
      } else {
        context.log(`Failed to generate landscape for ${location.name}`);
      }
    }

    // Step 4: Generate and save previs frames for shot elements
    const shotElements = scriptElements.filter(elem => elem.type === 'shot');

    for (const shotElement of shotElements) {
      const shotContent = shotElement.content || shotElement.shotText || 'Shot';
      context.log(`Generating previs frame for shot: ${shotContent}`);

      // Find related location and characters for context
      const relatedLocation = locationDefs.find(loc =>
        shotContent.toLowerCase().includes(loc.name.toLowerCase())
      );

      const previsPrompt = `Cinematic storyboard frame: ${shotContent}. ${relatedLocation ? relatedLocation.description : 'Generic film set'}. Professional cinematography, film composition, detailed storyboard illustration style.`;

      const previsPath = `/tmp/shot_${shotElement.id || assets.length + 1}_previs.png`;
      const previsResult = await context.tools.nanobanana({
        action: "generate",
        prompt: previsPrompt,
        outputPath: previsPath
      });

      if (previsResult.success) {
        const assetName = `Shot Previs: ${shotContent.substring(0, 50)}${shotContent.length > 50 ? '...' : ''}`;
        const assetDescription = `Previsualization frame for shot: ${shotContent}`;
        
        try {
          const saveResult = await context.tools.asset_save({
            name: assetName,
            file_path: previsResult.imagePath,  // Use file_path, not path
            description: assetDescription,
            tags: ['previs', 'shot', 'storyboard'],
            collection: collectionSlug || undefined  // Use collection slug, not ID
          });
          
          const savedId = saveResult?.asset?.id || saveResult?.id || saveResult?.asset_id;
          if (savedId) {
            savedAssetIds.push(savedId);
            context.log(`Saved asset ${assetName} with ID: ${savedId}`);
          }
          
          assets.push({
            id: savedId || `asset_${assets.length + 1}`,
            type: "previs-frame",
            name: assetName,
            description: assetDescription,
            filePath: previsResult.imagePath,
            libraryId: savedId,
            collectionSlug: collectionSlug,
            metadata: {
              shotElementId: shotElement.id,
              shotContent: shotContent,
              locationId: relatedLocation?.id
            }
          });
        } catch (saveErr: any) {
          context.log(`Warning: Could not save asset to library: ${saveErr.message}`);
          assets.push({
            id: `asset_${assets.length + 1}`,
            type: "previs-frame",
            name: assetName,
            description: assetDescription,
            filePath: previsResult.imagePath,
            metadata: {
              shotElementId: shotElement.id,
              shotContent: shotContent,
              locationId: relatedLocation?.id
            }
          });
        }
      } else {
        context.log(`Failed to generate previs frame for shot`);
      }
    }

    // Create the complete AssetCollection object for pipeline output
    const assetCollection = {
      id: collectionId || `collection_${scriptMetadata.title.toLowerCase().replace(/\s+/g, '_')}`,
      name: collectionName,
      slug: collectionSlug,
      description: `Complete asset collection for ${scriptMetadata.title} including character headshots, location landscapes, and shot previsualization frames.`,
      libraryCollectionId: collectionId,
      libraryCollectionSlug: collectionSlug,
      savedAssetIds: savedAssetIds,
      assets: assets
    };

    context.log(`Generated and saved ${assets.length} total assets to library`);
    context.log(`- Character headshots: ${assets.filter(a => a.type === 'character-headshot').length}`);
    context.log(`- Location landscapes: ${assets.filter(a => a.type === 'landscape').length}`);
    context.log(`- Previs frames: ${assets.filter(a => a.type === 'previs-frame').length}`);
    context.log(`- Library collection slug: ${collectionSlug || 'none'}`);
    context.log(`- Saved asset IDs: ${savedAssetIds.length}`);

    return { assetCollection };

  } catch (error: any) {
    context.log(`Error generating asset collection: ${error.message}`);

    // Return minimal asset collection on error
    const fallbackCollection = {
      id: "collection_fallback",
      name: "Asset Collection",
      slug: null,
      description: "Asset collection generation encountered errors",
      libraryCollectionId: null,
      libraryCollectionSlug: null,
      savedAssetIds: [],
      assets: []
    };

    return { assetCollection: fallbackCollection };
  }
}
