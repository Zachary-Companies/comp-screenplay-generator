/// <reference path="./woodbury.d.ts" />

/**
 * @input generatorRules: object - Generator rules configuration
 * @input validatedInput: object - Script input
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input elements: object[] - Script elements
 * @input assetCollection: object - Asset collection
 * @input previsualizationPlan: object - Previsualization plan
 * @output validationResults: object - Rule validation results and any corrections
 */
export async function execute(
  inputs: { generatorRules: any; validatedInput: any; characters: any[]; locations: any[]; elements: any[]; assetCollection: any; previsualizationPlan: any },
  context: ScriptContext,
): Promise<{ validationResults: object }> {
  const { generatorRules, validatedInput, characters, locations, elements, assetCollection, previsualizationPlan } = inputs;

  try {
    // Parse inputs (handle both string and object inputs)
    const rules = typeof generatorRules === 'string' ? JSON.parse(generatorRules) : generatorRules;
    const input = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;
    const characterDefs = Array.isArray(characters)
      ? characters.map(c => typeof c === 'string' ? JSON.parse(c) : c)
      : [];
    const locationDefs = Array.isArray(locations)
      ? locations.map(l => typeof l === 'string' ? JSON.parse(l) : l)
      : [];
    const scriptElements = Array.isArray(elements)
      ? elements.map(e => typeof e === 'string' ? JSON.parse(e) : e)
      : [];
    const assets = typeof assetCollection === 'string' ? JSON.parse(assetCollection) : assetCollection;
    const previsPlans = typeof previsualizationPlan === 'string' ? JSON.parse(previsualizationPlan) : previsualizationPlan;

    const validationResults = {
      passed: true,
      violations: [],
      corrections: []
    };

    // Rule 1: requireDialogueForNarrativeKinds
    if (rules.requireDialogueForNarrativeKinds) {
      const narrativeKinds = ['tv-episode', 'tv-pilot', 'feature-film', 'short-film'];
      if (narrativeKinds.includes(input.kind)) {
        const hasDialogue = scriptElements.some(element => element.type === 'dialogue');
        if (!hasDialogue) {
          validationResults.passed = false;
          validationResults.violations.push('Narrative scripts must contain dialogue elements');
          validationResults.corrections.push('Add dialogue elements to the script');
        }
      }
    }

    // Rule 2: requireHeadshotForEachNamedCharacter
    if (rules.requireHeadshotForEachNamedCharacter) {
      const namedCharacters = characterDefs.filter(char => char.name && char.name.trim() !== '');
      const headshotAssets = assets.assets?.filter(asset => asset.type === 'character-headshot') || [];

      for (const character of namedCharacters) {
        const hasHeadshot = headshotAssets.some(asset =>
          asset.metadata && asset.metadata.characterId === character.id
        );
        if (!hasHeadshot) {
          validationResults.passed = false;
          validationResults.violations.push(`Character '${character.name}' missing required headshot asset`);
          validationResults.corrections.push(`Generate character-headshot asset for character: ${character.name}`);
        }
      }
    }

    // Rule 3: requireLandscapeForEachLocation
    if (rules.requireLandscapeForEachLocation) {
      const landscapeAssets = assets.assets?.filter(asset => asset.type === 'landscape') || [];

      for (const location of locationDefs) {
        const hasLandscape = landscapeAssets.some(asset =>
          asset.metadata && asset.metadata.locationId === location.id
        );
        if (!hasLandscape) {
          validationResults.passed = false;
          validationResults.violations.push(`Location '${location.name}' missing required landscape asset`);
          validationResults.corrections.push(`Generate landscape asset for location: ${location.name}`);
        }
      }
    }

    // Rule 4: requirePrevisForEveryShot
    if (rules.requirePrevisForEveryShot) {
      const shotElements = scriptElements.filter(element => element.type === 'shot');
      const previsShots = previsPlans.shots || [];
      const previsFrameAssets = assets.assets?.filter(asset => asset.type === 'previs-frame') || [];

      for (const shotElement of shotElements) {
        // Check if shot has corresponding previs shot
        const hasPrevisShot = previsShots.some(shot => shot.shotElementId === shotElement.id);
        if (!hasPrevisShot) {
          validationResults.passed = false;
          validationResults.violations.push(`Shot element '${shotElement.id}' missing previsualization shot`);
          validationResults.corrections.push(`Generate previsualization shot for shot element: ${shotElement.id}`);
        }

        // Check if previs shot has corresponding previs-frame asset
        const previsShot = previsShots.find(shot => shot.shotElementId === shotElement.id);
        if (previsShot) {
          const hasPrevisFrame = previsFrameAssets.some(asset => asset.id === previsShot.assetId);
          if (!hasPrevisFrame) {
            validationResults.passed = false;
            validationResults.violations.push(`Previsualization shot '${previsShot.id}' missing previs-frame asset`);
            validationResults.corrections.push(`Generate previs-frame asset for shot: ${previsShot.id}`);
          }
        }
      }
    }

    // Log validation summary
    if (validationResults.passed) {
      context.log('All validation rules passed successfully');
    } else {
      context.log(`Validation failed with ${validationResults.violations.length} violations`);
      validationResults.violations.forEach(violation => context.log(`- ${violation}`));
    }

    return { validationResults };

  } catch (error) {
    context.log(`Error during rule enforcement: ${error.message}`);

    const errorResults = {
      passed: false,
      violations: [`Rule enforcement failed: ${error.message}`],
      corrections: ['Fix input data format and retry validation']
    };

    return { validationResults: errorResults };
  }
}
