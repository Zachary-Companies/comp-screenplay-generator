/// <reference path="./woodbury.d.ts" />

/**
 * @input metadata: object - Script metadata
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input elements: object[] - Script elements
 * @output assetCollection: object - Complete AssetCollection object
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

    const assets = [];
    let assetIdCounter = 1;

    // Generate character headshots
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
        assets.push({
          id: `asset_${assetIdCounter++}`,
          type: "character-headshot",
          name: `${character.name} Headshot`,
          description: `Professional headshot of ${character.name}`,
          filePath: headShotResult.imagePath,
          metadata: {
            characterId: character.id,
            characterName: character.name
          }
        });
      } else {
        context.log(`Failed to generate headshot for ${character.name}`);
      }
    }

    // Generate location landscapes
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
        assets.push({
          id: `asset_${assetIdCounter++}`,
          type: "landscape",
          name: `${location.name} Landscape`,
          description: `Landscape view of ${location.name}`,
          filePath: landscapeResult.imagePath,
          metadata: {
            locationId: location.id,
            locationName: location.name
          }
        });
      } else {
        context.log(`Failed to generate landscape for ${location.name}`);
      }
    }

    // Generate previs frames for shot elements
    const shotElements = scriptElements.filter(elem => elem.type === 'shot');

    for (const shotElement of shotElements) {
      context.log(`Generating previs frame for shot: ${shotElement.content}`);

      // Find related location and characters for context
      const relatedLocation = locationDefs.find(loc =>
        shotElement.content.toLowerCase().includes(loc.name.toLowerCase())
      );

      const previsPrompt = `Cinematic storyboard frame: ${shotElement.content}. ${relatedLocation ? relatedLocation.description : 'Generic film set'}. Professional cinematography, film composition, detailed storyboard illustration style.`;

      const previsPath = `/tmp/shot_${shotElement.id || assetIdCounter}_previs.png`;
      const previsResult = await context.tools.nanobanana({
        action: "generate",
        prompt: previsPrompt,
        outputPath: previsPath
      });

      if (previsResult.success) {
        assets.push({
          id: `asset_${assetIdCounter++}`,
          type: "previs-frame",
          name: `Shot Previs: ${shotElement.content.substring(0, 50)}...`,
          description: `Previsualization frame for shot: ${shotElement.content}`,
          filePath: previsResult.imagePath,
          metadata: {
            shotElementId: shotElement.id,
            shotContent: shotElement.content,
            locationId: relatedLocation?.id
          }
        });
      } else {
        context.log(`Failed to generate previs frame for shot`);
      }
    }

    // Create the complete AssetCollection
    const assetCollection = {
      id: `collection_${scriptMetadata.title.toLowerCase().replace(/\s+/g, '_')}`,
      name: scriptMetadata.title,
      description: `Complete asset collection for ${scriptMetadata.title} including character headshots, location landscapes, and shot previsualization frames.`,
      assets: assets
    };

    context.log(`Generated ${assets.length} total assets`);
    context.log(`- Character headshots: ${assets.filter(a => a.type === 'character-headshot').length}`);
    context.log(`- Location landscapes: ${assets.filter(a => a.type === 'landscape').length}`);
    context.log(`- Previs frames: ${assets.filter(a => a.type === 'previs-frame').length}`);

    return { assetCollection };

  } catch (error) {
    context.log(`Error generating asset collection: ${error.message}`);

    // Return minimal asset collection on error
    const fallbackCollection = {
      id: "collection_fallback",
      name: "Asset Collection",
      description: "Asset collection generation encountered errors",
      assets: []
    };

    return { assetCollection: fallbackCollection };
  }
}
