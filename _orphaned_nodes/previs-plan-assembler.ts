/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptDocument: string - Script document for ID
 * @input previsShots: string[] - Previsualization shots
 * @input title: string - Collection name
 * @output previsualizationPlan: string - Complete PrevisualizationPlan object
 */
export async function execute(
  inputs: { scriptDocument: string; previsShots: string[]; title: string },
  context: ScriptContext,
): Promise<{ previsualizationPlan: string }> {
  const { scriptDocument, previsShots, title } = inputs;

  try {
    // Parse the script document to extract the script ID
    const script = JSON.parse(scriptDocument);
    const scriptId = script.id;

    if (!scriptId) {
      throw new Error('Script document missing required id field');
    }

    // Parse the previsualization shots array
    const shots = previsShots.map(shotStr => JSON.parse(shotStr));

    // Assemble the PrevisualizationPlan object
    const previsualizationPlan = {
      scriptId: scriptId,
      collectionName: title,
      shots: shots
    };

    context.log(`Assembled previsualization plan with ${shots.length} shots for script ${scriptId}`);

    return {
      previsualizationPlan: JSON.stringify(previsualizationPlan)
    };
  } catch (error) {
    context.log(`Error assembling previsualization plan: ${error.message}`);
    throw error;
  }
}