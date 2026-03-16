/// <reference path="./woodbury.d.ts" />

/**
 * @input metadata: string - Script metadata
 * @input cast: string[] - Character definitions
 * @input locations: string[] - Location definitions
 * @input sectionsWithBeats: string[] - Complete script sections
 * @output scriptDocument: string - Complete ScriptDocument object
 */
export async function execute(
  inputs: { metadata: string; cast: string[]; locations: string[]; sectionsWithBeats: string[] },
  context: ScriptContext,
): Promise<{ scriptDocument: string }> {
  const { metadata, cast, locations, sectionsWithBeats } = inputs;

  try {
    // Parse input components
    const scriptMetadata = JSON.parse(metadata);
    const characterDefinitions = cast.map(c => JSON.parse(c));
    const locationDefinitions = locations.map(l => JSON.parse(l));
    const scriptSections = sectionsWithBeats.map(s => JSON.parse(s));

    // Generate production metadata based on script kind and genre
    const productionMetadata = {
      intendedFormat: scriptMetadata.kind === 'feature-film' ? 'theatrical' : 
                     scriptMetadata.kind === 'commercial' ? 'digital' : 'broadcast',
      pageLockMode: false,
      estimatedBudgetTier: scriptMetadata.kind === 'feature-film' ? 'high' :
                          scriptMetadata.kind === 'commercial' ? 'medium' : 'low',
      targetPlatform: scriptMetadata.kind === 'tv-episode' || scriptMetadata.kind === 'tv-pilot' ? 
                     ['broadcast', 'streaming'] : 
                     scriptMetadata.kind === 'commercial' ? ['digital', 'broadcast'] :
                     ['theatrical'],
      notes: `Generated ${scriptMetadata.kind} script for ${scriptMetadata.title}`
    };

    // Generate revision metadata
    const revisionMetadata = {
      color: 'white', // First draft
      revisionDate: new Date().toISOString().split('T')[0],
      revisionLabel: 'First Draft'
    };

    // Assemble complete ScriptDocument
    const scriptDocument = {
      id: `script_${scriptMetadata.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      metadata: scriptMetadata,
      cast: characterDefinitions,
      locations: locationDefinitions,
      sections: scriptSections,
      production: productionMetadata,
      revision: revisionMetadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    context.log(`Assembled complete ScriptDocument with ${characterDefinitions.length} characters, ${locationDefinitions.length} locations, and ${scriptSections.length} sections`);

    return { scriptDocument: JSON.stringify(scriptDocument, null, 2) };

  } catch (error) {
    context.log(`Error assembling script document: ${error.message}`);
    throw new Error(`Failed to assemble script document: ${error.message}`);
  }
}