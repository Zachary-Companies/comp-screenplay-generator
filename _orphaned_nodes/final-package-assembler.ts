/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptDocument: string - Complete script document
 * @input assetCollection: string - All visual assets
 * @input previsualizationPlan: string - Previs plan
 * @output scriptPackage: string - Complete GeneratedScriptPackage
 */
export async function execute(
  inputs: { scriptDocument: string; assetCollection: string; previsualizationPlan: string },
  context: ScriptContext,
): Promise<{ scriptPackage: string }> {
  const { scriptDocument, assetCollection, previsualizationPlan } = inputs;

  try {
    // Parse input components
    const script = JSON.parse(scriptDocument);
    const assets = JSON.parse(assetCollection);
    const previsualizations = JSON.parse(previsualizationPlan);

    context.log('Validating script document structure...');
    
    // Validate script structure
    if (!script.metadata || !script.metadata.title) {
      throw new Error('Script missing required metadata.title');
    }
    if (!script.cast || !Array.isArray(script.cast)) {
      throw new Error('Script missing required cast array');
    }
    if (!script.locations || !Array.isArray(script.locations)) {
      throw new Error('Script missing required locations array');
    }
    if (!script.sections || !Array.isArray(script.sections)) {
      throw new Error('Script missing required sections array');
    }

    context.log('Validating asset collection structure...');
    
    // Validate assets structure
    if (!assets.name || !assets.assets || !Array.isArray(assets.assets)) {
      throw new Error('Invalid asset collection structure');
    }

    // Validate assets.name matches script.metadata.title
    if (assets.name !== script.metadata.title) {
      throw new Error(`Asset collection name "${assets.name}" must match script title "${script.metadata.title}"`);
    }

    context.log('Validating previs plan structure...');
    
    // Validate previs structure
    if (!previsualizations.shots || !Array.isArray(previsualizations.shots)) {
      throw new Error('Invalid previs plan structure');
    }

    context.log('Validating cross-references...');
    
    // Create lookup maps for validation
    const characterIds = new Set(script.cast.map(c => c.id));
    const locationIds = new Set(script.locations.map(l => l.id));
    const assetIds = new Set(assets.assets.map(a => a.id));
    const sceneIds = new Set();
    const shotElementIds = new Set();

    // Collect scene and shot element IDs
    script.sections.forEach(section => {
      if (section.type === 'scene') {
        sceneIds.add(section.id);
        if (section.beats) {
          section.beats.forEach(beat => {
            if (beat.type === 'shot') {
              shotElementIds.add(beat.id);
            }
          });
        }
      }
    });

    // Validate character references in dialogue
    script.sections.forEach(section => {
      if (section.beats) {
        section.beats.forEach(beat => {
          if (beat.type === 'dialogue' && beat.characterId) {
            if (!characterIds.has(beat.characterId)) {
              throw new Error(`Invalid character reference: ${beat.characterId}`);
            }
          }
        });
      }
    });

    // Validate location references in scenes
    script.sections.forEach(section => {
      if (section.type === 'scene' && section.locationId) {
        if (!locationIds.has(section.locationId)) {
          throw new Error(`Invalid location reference: ${section.locationId}`);
        }
      }
    });

    // Validate asset references
    assets.assets.forEach(asset => {
      if (asset.characterId && !characterIds.has(asset.characterId)) {
        throw new Error(`Asset ${asset.id} references invalid character: ${asset.characterId}`);
      }
      if (asset.locationId && !locationIds.has(asset.locationId)) {
        throw new Error(`Asset ${asset.id} references invalid location: ${asset.locationId}`);
      }
    });

    // Validate previs references
    previsualizations.shots.forEach(shot => {
      if (shot.sceneId && !sceneIds.has(shot.sceneId)) {
        throw new Error(`Previs shot ${shot.id} references invalid scene: ${shot.sceneId}`);
      }
      if (shot.shotElementId && !shotElementIds.has(shot.shotElementId)) {
        throw new Error(`Previs shot ${shot.id} references invalid shot element: ${shot.shotElementId}`);
      }
      if (shot.locationId && !locationIds.has(shot.locationId)) {
        throw new Error(`Previs shot ${shot.id} references invalid location: ${shot.locationId}`);
      }
      if (shot.assetId && !assetIds.has(shot.assetId)) {
        throw new Error(`Previs shot ${shot.id} references invalid asset: ${shot.assetId}`);
      }
      if (shot.characterIds) {
        shot.characterIds.forEach(charId => {
          if (!characterIds.has(charId)) {
            throw new Error(`Previs shot ${shot.id} references invalid character: ${charId}`);
          }
        });
      }
    });

    context.log('Assembling final script package...');
    
    // Create the complete GeneratedScriptPackage
    const scriptPackage = {
      input: {
        // Extract original input parameters from script metadata and structure
        scriptKind: script.metadata.kind || 'feature-film',
        title: script.metadata.title,
        subtitle: script.metadata.subtitle,
        genre: script.metadata.genre,
        visualizationStyle: assets.assets.length > 0 ? assets.assets[0].visualizationStyle || 'cinematic' : 'cinematic',
        logline: script.metadata.logline,
        tone: script.metadata.tone,
        audience: script.metadata.audience,
        language: script.metadata.language || 'en',
        runtimeMinutes: script.metadata.runtimeMinutes,
        authorName: script.metadata.authors && script.metadata.authors.length > 0 ? script.metadata.authors[0].name : 'Unknown',
        authorRole: script.metadata.authors && script.metadata.authors.length > 0 ? script.metadata.authors[0].role : 'writer',
        seriesMetadata: script.metadata.seriesMetadata,
        commercialMetadata: script.metadata.commercialMetadata
      },
      script: script,
      assets: assets,
      previsualizations: previsualizations
    };

    context.log(`Successfully assembled script package for "${script.metadata.title}"`);
    context.log(`Package contains: ${script.cast.length} characters, ${script.locations.length} locations, ${script.sections.length} sections, ${assets.assets.length} assets, ${previsualizations.shots.length} previs shots`);

    return { scriptPackage: JSON.stringify(scriptPackage, null, 2) };

  } catch (error) {
    context.log(`Error assembling script package: ${error.message}`);
    throw error;
  }
}