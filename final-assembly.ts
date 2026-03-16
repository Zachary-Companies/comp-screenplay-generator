/// <reference path="./woodbury.d.ts" />

/**
 * @input validatedInput: object - Original script input
 * @input metadata: object - Script metadata
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input processedSections: object[] - Script sections
 * @input elements: object[] - Script elements
 * @input productionMetadata: object - Production metadata
 * @input revisionMetadata: object - Revision metadata
 * @input assetCollection: object - Asset collection
 * @input previsualizationPlan: object - Previsualization plan
 * @input validationResults: object - Rule validation results
 * @output scriptPackage: object - Complete GeneratedScriptPackage
 */
export async function execute(
  inputs: { validatedInput: any; metadata: any; characters: any[]; locations: any[]; processedSections: any[]; elements: any[]; productionMetadata: any; revisionMetadata: any; assetCollection: any; previsualizationPlan: any; validationResults: any },
  context: ScriptContext,
): Promise<{ scriptPackage: object }> {
  const { validatedInput, metadata, characters, locations, processedSections, elements, productionMetadata, revisionMetadata, assetCollection, previsualizationPlan, validationResults } = inputs;

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

    context.log('Assembling complete GeneratedScriptPackage');
    context.log(`Script title: ${scriptMetadata.title}`);
    context.log(`Characters: ${characterDefinitions.length}`);
    context.log(`Locations: ${locationDefinitions.length}`);
    context.log(`Sections: ${scriptSections.length}`);
    context.log(`Elements: ${scriptElements.length}`);
    context.log(`Assets: ${assets.assets?.length || 0}`);
    context.log(`Previs shots: ${previs.shots?.length || 0}`);

    // Assemble the complete ScriptDocument
    const scriptDocument = {
      metadata: scriptMetadata,
      characters: characterDefinitions,
      locations: locationDefinitions,
      sections: scriptSections,
      elements: scriptElements,
      productionMetadata: prodMetadata,
      revisionMetadata: revMetadata
    };

    // Assemble the complete GeneratedScriptPackage
    const scriptPackage = {
      input: input,
      script: scriptDocument,
      assets: assets,
      previsualizations: previs,
      validationResults: valResults,
      generatedAt: new Date().toISOString(),
      version: "1.0.0"
    };

    context.log('Successfully assembled complete script package');
    context.log(`Package size: ${JSON.stringify(scriptPackage).length} characters`);

    return { scriptPackage };

  } catch (error) {
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
      previsualizations: { collectionName: "Error", shots: [] },
      validationResults: { valid: false, errors: [error.message] },
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      error: error.message
    };

    return { scriptPackage: errorPackage };
  }
}
