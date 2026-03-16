/// <reference path="./woodbury.d.ts" />

/**
 * @input validatedInput: object - Validated script input
 * @input metadata: object - Script metadata
 * @output productionMetadata: object - ProductionMetadata object
 * @output revisionMetadata: object - RevisionMetadata object
 */
export async function execute(
  inputs: { validatedInput: any; metadata: any },
  context: ScriptContext,
): Promise<{ productionMetadata: object; revisionMetadata: object }> {
  const { validatedInput, metadata } = inputs;

  try {
    // Parse inputs (handle both string and object inputs)
    const scriptInput = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

    context.log('Generating production and revision metadata');

    // Generate ProductionMetadata
    const productionPrompt = `Generate ProductionMetadata for a ${scriptInput.kind} script titled "${scriptMetadata.title}".

Script details:
- Kind: ${scriptInput.kind}
- Genre: ${scriptMetadata.genre?.join(', ') || 'Not specified'}
- Tone: ${scriptMetadata.tone?.join(', ') || 'Not specified'}
- Audience: ${scriptMetadata.audience?.join(', ') || 'Not specified'}
- Runtime: ${scriptMetadata.runtimeMinutes || 'Not specified'} minutes
- Pages: ${scriptMetadata.estimatedPages || 'Not specified'}

Generate a JSON object with these fields:
- intendedFormat: string ("screenplay", "teleplay", "commercial-script", "treatment", "outline")
- pageLockMode: boolean (true for locked pages in production)
- estimatedBudgetTier: string ("micro", "low", "medium", "high", "studio")
- targetPlatform: string[] ("theatrical", "streaming", "broadcast-tv", "cable-tv", "web", "mobile", "social-media")
- notes: string[] (production notes)

Consider the script kind and content when determining format, budget tier, and platforms.`;

    const productionMetadataResponse = await context.llm.generateJSON(productionPrompt);

    // Generate RevisionMetadata
    const revisionPrompt = `Generate RevisionMetadata for a ${scriptInput.kind} script in development.

Script details:
- Title: "${scriptMetadata.title}"
- Draft: ${scriptMetadata.draftName || 'First Draft'}
- Version: ${scriptMetadata.version || '1.0'}
- Date: ${scriptMetadata.draftDate || new Date().toISOString().split('T')[0]}

Generate a JSON object with these fields:
- color: string (revision color: "white", "blue", "pink", "yellow", "green", "goldenrod", "buff", "salmon", "cherry")
- revisionDate: string (ISO date format)
- revisionLabel: string (e.g., "First Draft", "Blue Revision", "Pink Pages")
- changedPages: number[] (array of page numbers that changed, can be empty for first draft)
- notes: string[] (revision notes)

For a first draft, use white color and empty changedPages array.`;

    const revisionMetadataResponse = await context.llm.generateJSON(revisionPrompt);

    // Validate and format the responses
    const productionMetadata = {
      intendedFormat: productionMetadataResponse.intendedFormat || 'screenplay',
      pageLockMode: productionMetadataResponse.pageLockMode || false,
      estimatedBudgetTier: productionMetadataResponse.estimatedBudgetTier || 'low',
      targetPlatform: Array.isArray(productionMetadataResponse.targetPlatform)
        ? productionMetadataResponse.targetPlatform
        : ['streaming'],
      notes: Array.isArray(productionMetadataResponse.notes)
        ? productionMetadataResponse.notes
        : []
    };

    const revisionMetadata = {
      color: revisionMetadataResponse.color || 'white',
      revisionDate: revisionMetadataResponse.revisionDate || new Date().toISOString().split('T')[0],
      revisionLabel: revisionMetadataResponse.revisionLabel || 'First Draft',
      changedPages: Array.isArray(revisionMetadataResponse.changedPages)
        ? revisionMetadataResponse.changedPages
        : [],
      notes: Array.isArray(revisionMetadataResponse.notes)
        ? revisionMetadataResponse.notes
        : []
    };

    context.log(`Generated production metadata with format: ${productionMetadata.intendedFormat}, budget tier: ${productionMetadata.estimatedBudgetTier}`);
    context.log(`Generated revision metadata: ${revisionMetadata.revisionLabel} (${revisionMetadata.color})`);

    return { productionMetadata, revisionMetadata };

  } catch (error) {
    context.log(`Error generating production metadata: ${error.message}`);

    // Return fallback metadata
    const fallbackProduction = {
      intendedFormat: 'screenplay',
      pageLockMode: false,
      estimatedBudgetTier: 'low',
      targetPlatform: ['streaming'],
      notes: ['Generated with fallback values due to processing error']
    };

    const fallbackRevision = {
      color: 'white',
      revisionDate: new Date().toISOString().split('T')[0],
      revisionLabel: 'First Draft',
      changedPages: [],
      notes: ['Generated with fallback values due to processing error']
    };

    return {
      productionMetadata: fallbackProduction,
      revisionMetadata: fallbackRevision
    };
  }
}
