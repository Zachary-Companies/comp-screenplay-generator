/// <reference path="../woodbury.d.ts" />

/**
 * Final Assembly Node
 * 
 * Assembles all generated components into a complete GeneratedScriptPackage.
 * Handles nested section structures (acts containing scenes, etc.)
 * 
 * @input validatedInput: object - Original script input
 * @input metadata: object - Script metadata
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input processedSections: object[] - Script sections
 * @input elements: object[] - Script elements
 * @input productionMetadata: object - Production metadata
 * @input revisionMetadata: object - Revision metadata
 * @input assetCollection: object - Asset collection (may include dialogue audio)
 * @input previsualizationPlan: object - Previsualization plan
 * @input validationResults: object - Rule validation results
 * @input dialogueAudio: object[] - Generated dialogue audio assets
 * @output scriptPackage: object - Complete GeneratedScriptPackage
 */
export async function execute(
  inputs: { validatedInput: any; metadata: any; characters: any[]; locations: any[]; processedSections: any[]; elements: any[]; productionMetadata: any; revisionMetadata: any; assetCollection: any; previsualizationPlan: any; validationResults: any; dialogueAudio?: any[] },
  context: ScriptContext,
): Promise<{ scriptPackage: object }> {
  const { validatedInput, metadata, characters, locations, processedSections, elements, productionMetadata, revisionMetadata, assetCollection, previsualizationPlan, validationResults, dialogueAudio } = inputs;

  try {
    // Parse all input components (handle both string and object inputs)
    const input = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const characterDefinitions = Array.isArray(characters)
      ? characters.map(char => typeof char === 'string' ? JSON.parse(char) : char)
      : [];
    const locationDefinitions = Array.isArray(locations)
      ? locations.map(loc => typeof loc === 'string' ? JSON.parse(loc) : loc)
      : [];
    const scriptSections = Array.isArray(processedSections)
      ? processedSections.map(section => typeof section === 'string' ? JSON.parse(section) : section)
      : [];
    const scriptElements = Array.isArray(elements)
      ? elements.map(element => typeof element === 'string' ? JSON.parse(element) : element)
      : [];
    const prodMetadata = typeof productionMetadata === 'string' ? JSON.parse(productionMetadata) : productionMetadata;
    const revMetadata = typeof revisionMetadata === 'string' ? JSON.parse(revisionMetadata) : revisionMetadata;
    const assets = typeof assetCollection === 'string' ? JSON.parse(assetCollection) : assetCollection;
    const previs = typeof previsualizationPlan === 'string' ? JSON.parse(previsualizationPlan) : previsualizationPlan;
    const valResults = typeof validationResults === 'string' ? JSON.parse(validationResults) : validationResults;
    
    // Parse dialogue audio (optional input)
    const dialogueAudioAssets = Array.isArray(dialogueAudio)
      ? dialogueAudio.map(audio => typeof audio === 'string' ? JSON.parse(audio) : audio)
      : [];

    context.log('Assembling complete GeneratedScriptPackage');
    context.log(`Script title: ${scriptMetadata.title}`);
    context.log(`Characters: ${characterDefinitions.length}`);
    context.log(`Locations: ${locationDefinitions.length}`);
    context.log(`Sections: ${scriptSections.length}`);
    context.log(`Elements: ${scriptElements.length}`);
    context.log(`Assets: ${assets.assets?.length || 0}`);
    context.log(`Dialogue audio: ${dialogueAudioAssets.length}`);
    context.log(`Previs shots: ${previs.shots?.length || 0}`);

    // Link asset image paths back to character and location objects
    // The frontend expects character.imagePath and location.imagePath
    const assetList = assets?.assets || [];

    const charactersWithImages = characterDefinitions.map((char: any) => {
      const headshot = assetList.find((a: any) =>
        a.type === 'character-headshot' && a.metadata?.characterId === char.id
      );
      if (headshot?.filePath && !char.imagePath) {
        context.log(`Linking headshot to character "${char.name}": ${headshot.filePath}`);
        return { ...char, imagePath: headshot.filePath };
      }
      return char;
    });

    const locationsWithImages = locationDefinitions.map((loc: any) => {
      const landscape = assetList.find((a: any) =>
        a.type === 'landscape' && a.metadata?.locationId === loc.id
      );
      if (landscape?.filePath && !loc.imagePath) {
        context.log(`Linking landscape to location "${loc.name}": ${landscape.filePath}`);
        return { ...loc, imagePath: landscape.filePath };
      }
      return loc;
    });

    context.log(`Linked images: ${charactersWithImages.filter((c: any) => c.imagePath).length}/${characterDefinitions.length} characters, ${locationsWithImages.filter((l: any) => l.imagePath).length}/${locationDefinitions.length} locations`);

    // Populate section children arrays with their corresponding elements
    // Elements are generated per-section in order, so we distribute them back
    const populatedSections = populateSectionChildren(scriptSections, scriptElements, context);

    // Link dialogue audio to their corresponding dialogue elements
    const elementsWithAudio = linkDialogueAudio(scriptElements, dialogueAudioAssets, context);

    // Assemble the complete ScriptDocument
    const scriptDocument = {
      metadata: scriptMetadata,
      characters: charactersWithImages,
      locations: locationsWithImages,
      sections: populatedSections,
      elements: elementsWithAudio,
      productionMetadata: prodMetadata,
      revisionMetadata: revMetadata
    };

    // Assemble the complete GeneratedScriptPackage
    const scriptPackage = {
      input: input,
      script: scriptDocument,
      assets: assets,
      dialogueAudio: dialogueAudioAssets,
      previsualizations: previs,
      validationResults: valResults,
      generatedAt: new Date().toISOString(),
      version: "1.0.0"
    };

    context.log('Successfully assembled complete script package');
    context.log(`Package size: ${JSON.stringify(scriptPackage).length} characters`);

    return { scriptPackage };

  } catch (error: any) {
    context.log(`Error assembling script package: ${error.message}`);

    // Return a minimal error package
    const safeInput = typeof validatedInput === 'string'
      ? (() => { try { return JSON.parse(validatedInput); } catch { return {}; } })()
      : (validatedInput || {});

    const errorPackage = {
      input: safeInput,
      script: {
        metadata: { title: "Error", subtitle: "", logline: "Failed to generate script", author: [], language: "en" },
        characters: [],
        locations: [],
        sections: [],
        elements: [],
        productionMetadata: { intendedFormat: "screenplay", pageLockMode: false },
        revisionMetadata: { color: "white", revisionDate: new Date().toISOString() }
      },
      assets: { id: "error", name: "Error", description: "Failed to generate assets", assets: [] },
      dialogueAudio: [],
      previsualizations: { collectionName: "Error", shots: [] },
      validationResults: { valid: false, errors: [error.message] },
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      error: error.message
    };

    return { scriptPackage: errorPackage };
  }
}

/**
 * Links dialogue audio assets to their corresponding dialogue elements.
 * Adds audioPath and audioAssetId properties to dialogue elements that have audio.
 */
function linkDialogueAudio(elements: any[], dialogueAudio: any[], context: ScriptContext): any[] {
  if (!dialogueAudio || dialogueAudio.length === 0) {
    return elements;
  }

  // Build a map of dialogue element ID to audio asset
  const audioMap = new Map<string, any>();
  for (const audio of dialogueAudio) {
    const dialogueElementId = audio.metadata?.dialogueElementId;
    if (dialogueElementId) {
      audioMap.set(dialogueElementId, audio);
    }
  }

  context.log(`Linking ${audioMap.size} audio assets to dialogue elements`);

  // Add audio references to dialogue elements
  return elements.map(element => {
    if (element.type === 'dialogue' && audioMap.has(element.id)) {
      const audio = audioMap.get(element.id);
      return {
        ...element,
        audioPath: audio.filePath,
        audioAssetId: audio.libraryId || audio.id,
        audioDuration: audio.metadata?.duration
      };
    }
    return element;
  });
}

/**
 * Recursively flatten nested sections to extract all scene sections
 */
function flattenScenes(sections: any[]): any[] {
  const scenes: any[] = [];
  
  for (const section of sections) {
    if (section.type === 'scene') {
      scenes.push(section);
    }
    
    // Recursively process children
    if (Array.isArray(section.children) && section.children.length > 0) {
      const childScenes = flattenScenes(section.children);
      scenes.push(...childScenes);
    }
  }
  
  return scenes;
}

/**
 * Populates the children array of each scene section with its corresponding elements.
 * Handles nested section structures (acts containing scenes, etc.)
 * 
 * The element-generation node creates elements in order, processing each section's beats
 * sequentially. This function distributes those elements back to their parent sections.
 */
function populateSectionChildren(sections: any[], elements: any[], context: ScriptContext): any[] {
  if (!elements || elements.length === 0) {
    context.log('No elements to distribute to sections');
    return sections;
  }

  // Get all scene sections (including nested ones)
  const allScenes = flattenScenes(sections);
  
  if (allScenes.length === 0) {
    context.log('No scene sections found');
    return sections;
  }

  // Count how many beats each scene has to estimate element distribution
  const sceneBeatCounts = allScenes.map(s => {
    const beats = s.beats || [];
    return Array.isArray(beats) ? beats.length : 0;
  });
  
  const totalBeats = sceneBeatCounts.reduce((sum, count) => sum + count, 0);
  
  context.log(`Distributing ${elements.length} elements across ${allScenes.length} scenes (${totalBeats} total beats)`);

  // If we have beat counts, distribute elements proportionally
  // Otherwise, distribute evenly
  let elementIndex = 0;
  
  if (totalBeats > 0) {
    // Distribute elements proportionally based on beat count
    for (let i = 0; i < allScenes.length; i++) {
      const scene = allScenes[i];
      const beatCount = sceneBeatCounts[i];
      
      // Calculate how many elements this scene should get
      // Use proportional distribution based on beats
      const proportion = beatCount / totalBeats;
      let elementsForScene = Math.round(elements.length * proportion);
      
      // Ensure we don't exceed remaining elements
      elementsForScene = Math.min(elementsForScene, elements.length - elementIndex);
      
      // For the last scene, take all remaining elements
      if (i === allScenes.length - 1) {
        elementsForScene = elements.length - elementIndex;
      }
      
      // Assign elements to this scene's children array
      // Note: We're modifying the scene objects in place, which updates the nested structure
      scene.children = elements.slice(elementIndex, elementIndex + elementsForScene);
      elementIndex += elementsForScene;
      
      // Log element types for this scene
      const dialogueCount = scene.children.filter((e: any) => e.type === 'dialogue').length;
      const actionCount = scene.children.filter((e: any) => e.type === 'action').length;
      const shotCount = scene.children.filter((e: any) => e.type === 'shot').length;
      
      context.log(`Scene "${scene.title}": ${scene.children.length} elements (${dialogueCount} dialogue, ${actionCount} action, ${shotCount} shots)`);
    }
  } else {
    // No beat info - distribute evenly
    const elementsPerScene = Math.ceil(elements.length / allScenes.length);
    
    for (let i = 0; i < allScenes.length; i++) {
      const scene = allScenes[i];
      const start = i * elementsPerScene;
      const end = Math.min(start + elementsPerScene, elements.length);
      
      scene.children = elements.slice(start, end);
      
      context.log(`Scene "${scene.title}": ${scene.children.length} elements (even distribution)`);
    }
  }

  return sections;
}
