/// <reference path="./woodbury.d.ts" />

/**
 * @input locations: string[] - Location definitions
 * @input title: string - Script title for collection name
 * @input visualizationStyle: string - Visual style for prompts
 * @output landscapeAssets: string[] - Array of location landscape VisualAssets
 */
export async function execute(
  inputs: { locations: string[]; title: string; visualizationStyle: string },
  context: ScriptContext,
): Promise<{ landscapeAssets: string[] }> {
  const { locations, title, visualizationStyle } = inputs;

  context.log(`Generating landscape assets for ${locations.length} locations`);

  const landscapeAssets: string[] = [];

  for (let i = 0; i < locations.length; i++) {
    const locationDef = JSON.parse(locations[i]);
    const { id, name, description } = locationDef;

    // Generate landscape visual asset
    const assetId = `asset_landscape_${id.replace('loc_', '')}`;
    
    // Create detailed prompt for landscape generation
    const landscapePrompt = `Create a cinematic landscape view of ${name}. ${description}. Style: ${visualizationStyle}. Professional film production quality, atmospheric lighting, establishing shot composition.`;

    const landscapeAsset = {
      id: assetId,
      type: "landscape" as const,
      name: `${name} - Landscape`,
      collectionName: title,
      prompt: landscapePrompt,
      visualizationStyle: visualizationStyle,
      locationId: id,
      metadata: {
        generatedAt: new Date().toISOString(),
        locationName: name,
        locationDescription: description
      }
    };

    landscapeAssets.push(JSON.stringify(landscapeAsset));
    
    context.log(`Generated landscape asset for location: ${name} (${id})`);
  }

  context.log(`Generated ${landscapeAssets.length} landscape assets`);

  return { landscapeAssets };
}