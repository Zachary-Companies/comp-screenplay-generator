/// <reference path="./woodbury.d.ts" />

/**
 * @input processedSections: object[] - Sections with scene content
 * @input elements: object[] - Script elements
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input assetCollection: object - Asset collection
 * @output previsualizationPlan: object - Complete PrevisualizationPlan object
 */
export async function execute(
  inputs: { processedSections: any[]; elements: any[]; characters: any[]; locations: any[]; assetCollection: any },
  context: ScriptContext,
): Promise<{ previsualizationPlan: object }> {
  const { processedSections, elements, characters, locations, assetCollection } = inputs;

  try {
    // Parse input data (handle both string and object inputs)
    const parsedElements = Array.isArray(elements)
      ? elements.map(el => typeof el === 'string' ? JSON.parse(el) : el)
      : [];
    const parsedCharacters = Array.isArray(characters)
      ? characters.map(char => typeof char === 'string' ? JSON.parse(char) : char)
      : [];
    const parsedLocations = Array.isArray(locations)
      ? locations.map(loc => typeof loc === 'string' ? JSON.parse(loc) : loc)
      : [];
    const parsedAssets = typeof assetCollection === 'string' ? JSON.parse(assetCollection) : assetCollection;
    const parsedSections = Array.isArray(processedSections)
      ? processedSections.map(section => typeof section === 'string' ? JSON.parse(section) : section)
      : [];

    // Extract shot elements from all scene beats
    const shotElements: any[] = [];
    const sceneIdMap = new Map<string, string>();

    for (const section of parsedSections) {
      if (section.type === 'scene' && section.content?.beats) {
        for (const beat of section.content.beats) {
          if (beat.type === 'shot') {
            shotElements.push({
              ...beat,
              sceneId: section.id
            });
            sceneIdMap.set(beat.id, section.id);
          }
        }
      }
    }

    context.log(`Found ${shotElements.length} shot elements to create previsualization for`);

    // Create previsualization shots
    const previsualizationShots: any[] = [];
    let shotOrder = 1;

    for (const shotElement of shotElements) {
      const sceneId = shotElement.sceneId;
      const scene = parsedSections.find(s => s.id === sceneId);
      const locationId = scene?.content?.locationId || null;

      // Extract character IDs from dialogue elements in the same scene
      const characterIds: string[] = [];
      if (scene?.content?.beats) {
        for (const beat of scene.content.beats) {
          if (beat.type === 'dialogue' && beat.characterId) {
            if (!characterIds.includes(beat.characterId)) {
              characterIds.push(beat.characterId);
            }
          }
        }
      }

      // Find corresponding previs-frame asset
      const assetId = parsedAssets.assets?.find((asset: any) =>
        asset.type === 'previs-frame' && asset.metadata?.shotElementId === shotElement.id
      )?.id || null;

      // Generate shot description and camera intent using LLM
      const shotPrompt = `
Create a detailed previsualization description for this shot element:

Shot Text: ${shotElement.text || shotElement.content || 'Shot'}
Location: ${parsedLocations.find(loc => loc.id === locationId)?.name || 'Unknown'}
Characters Present: ${characterIds.map(id => parsedCharacters.find(char => char.id === id)?.name || id).join(', ') || 'None'}

Provide:
1. A detailed visual description of what the shot shows
2. Camera intent (e.g., "Close-up to show emotion", "Wide shot to establish location")
3. Composition notes (e.g., "Rule of thirds", "Low angle for power")
4. Lighting description (e.g., "Natural daylight", "Dramatic shadows")
5. Estimated duration in seconds

Format as JSON with keys: description, cameraIntent, composition, lighting, durationSeconds
`;

      const shotDetails = await context.llm.generateJSON(shotPrompt);

      const previsualizationShot = {
        id: `previs_${shotElement.id}`,
        sceneId: sceneId,
        shotElementId: shotElement.id,
        shotText: shotElement.text || shotElement.content || 'Shot',
        order: shotOrder++,
        locationId: locationId,
        characterIds: characterIds,
        description: shotDetails.description || `Previsualization for shot: ${shotElement.text || shotElement.content}`,
        cameraIntent: shotDetails.cameraIntent || 'Standard coverage',
        composition: shotDetails.composition || 'Balanced framing',
        lighting: shotDetails.lighting || 'Natural lighting',
        durationSeconds: shotDetails.durationSeconds || 3,
        assetId: assetId
      };

      previsualizationShots.push(previsualizationShot);
    }

    // Create the complete PrevisualizationPlan
    const previsualizationPlan = {
      collectionName: parsedAssets.name || 'Script Previsualization',
      shots: previsualizationShots
    };

    context.log(`Generated previsualization plan with ${previsualizationShots.length} shots`);

    return { previsualizationPlan };

  } catch (error) {
    context.log(`Error in previs generation: ${error}`);

    // Return minimal valid previsualization plan on error
    const fallbackPlan = {
      collectionName: 'Script Previsualization',
      shots: []
    };

    return { previsualizationPlan: fallbackPlan };
  }
}
