/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptDocument: string - Complete script with shots
 * @input visualizationStyle: string - Visual style for prompts
 * @output previsAssets: string[] - Array of previs-frame VisualAssets
 * @output previsShots: string[] - Array of PrevisualizationShot objects
 */
export async function execute(
  inputs: { scriptDocument: string; visualizationStyle: string },
  context: ScriptContext,
): Promise<{ previsAssets: string[]; previsShots: string[] }> {
  const { scriptDocument, visualizationStyle } = inputs;

  try {
    // Parse the script document
    const script: ScriptDocument = JSON.parse(scriptDocument);
    
    const previsAssets: string[] = [];
    const previsShots: string[] = [];
    
    let shotOrder = 1;
    
    // Scan all sections for SceneSection entries
    for (const section of script.sections) {
      if (section.type === 'scene') {
        const sceneSection = section as SceneSection;
        
        // Find all ShotElement entries in the scene beats
        for (const beat of sceneSection.beats) {
          if (beat.type === 'shot') {
            const shotElement = beat as ShotElement;
            
            // Get location for this scene
            const location = script.locations.find(loc => loc.id === sceneSection.locationId);
            
            // Extract character IDs from dialogue elements in this scene
            const characterIds = sceneSection.beats
              .filter(b => b.type === 'dialogue')
              .map(b => (b as DialogueElement).characterId)
              .filter((id, index, arr) => arr.indexOf(id) === index); // unique
            
            // Create visual asset for previs frame
            const assetId = `asset_previs_${sceneSection.id}_${shotElement.id}`;
            
            // Build comprehensive prompt for the shot
            const sceneContext = `Scene: ${sceneSection.heading.prefix} ${sceneSection.heading.location}${sceneSection.heading.sublocation ? ' - ' + sceneSection.heading.sublocation : ''} - ${sceneSection.heading.timeOfDay}`;
            const shotPrompt = `${visualizationStyle} style. ${sceneContext}. ${shotElement.text}. ${sceneSection.synopsis || ''}${location ? '. Location: ' + location.description : ''}`;
            
            const previsAsset: VisualAsset = {
              id: assetId,
              name: `${shotElement.text} - ${sceneSection.heading.location}`,
              collectionName: script.metadata.title,
              prompt: shotPrompt,
              type: 'previs-frame',
              visualizationStyle: visualizationStyle,
              sceneId: sceneSection.id,
              shotElementId: shotElement.id,
              locationId: sceneSection.locationId
            };
            
            previsAssets.push(JSON.stringify(previsAsset));
            
            // Create previsualization shot
            const previsShot: PrevisualizationShot = {
              id: `previs_${sceneSection.id}_${shotElement.id}`,
              sceneId: sceneSection.id,
              shotElementId: shotElement.id,
              shotText: shotElement.text,
              order: shotOrder++,
              locationId: sceneSection.locationId,
              characterIds: characterIds,
              description: `${shotElement.text} in ${sceneSection.heading.location}${sceneSection.heading.sublocation ? ' - ' + sceneSection.heading.sublocation : ''} during ${sceneSection.heading.timeOfDay}`,
              cameraIntent: shotElement.text.toLowerCase().includes('close') ? 'close-up' : 
                           shotElement.text.toLowerCase().includes('wide') ? 'wide-shot' :
                           shotElement.text.toLowerCase().includes('medium') ? 'medium-shot' : 'establishing',
              composition: shotElement.text.toLowerCase().includes('over shoulder') ? 'over-shoulder' :
                          shotElement.text.toLowerCase().includes('two shot') ? 'two-shot' :
                          shotElement.text.toLowerCase().includes('group') ? 'group-shot' : 'single',
              lighting: sceneSection.heading.timeOfDay.toLowerCase().includes('night') ? 'low-key' :
                       sceneSection.heading.timeOfDay.toLowerCase().includes('day') ? 'natural' : 'mixed',
              durationSeconds: 3, // Default duration for previs shots
              assetId: assetId
            };
            
            previsShots.push(JSON.stringify(previsShot));
          }
        }
      }
    }
    
    context.log(`Generated ${previsAssets.length} previs assets and ${previsShots.length} previs shots`);
    
    return { previsAssets, previsShots };
    
  } catch (error) {
    context.log(`Error generating previs shots: ${error}`);
    throw error;
  }
}