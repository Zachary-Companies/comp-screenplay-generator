/// <reference path="./woodbury.d.ts" />

/**
 * @input validatedInput: object - Validated script input
 * @input metadata: object - Script metadata
 * @output locations: object[] - Array of LocationDefinition objects
 */
export async function execute(
  inputs: { validatedInput: any; metadata: any },
  context: ScriptContext,
): Promise<{ locations: object[] }> {
  const { validatedInput, metadata } = inputs;

  try {
    // Parse the inputs (handle both string and object inputs)
    const scriptInput = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

    context.log(`Generating locations for ${scriptMetadata.title} (${scriptInput.kind})`);

    // Create prompt for location generation based on script type and metadata
    const prompt = `Generate a comprehensive list of locations for a ${scriptInput.kind} screenplay with the following details:

Title: ${scriptMetadata.title}
Genre: ${scriptMetadata.genre?.join(', ') || 'Not specified'}
Tone: ${scriptMetadata.tone?.join(', ') || 'Not specified'}
Logline: ${scriptMetadata.logline || 'Not provided'}
Runtime: ${scriptMetadata.runtimeMinutes || 'Not specified'} minutes

Script Requirements:
${scriptInput.requirements || 'No specific requirements'}

Generate 8-15 diverse locations that would be needed for this story. Include both primary locations where major scenes occur and secondary locations for transitions or brief scenes.

For each location, provide:
- A unique identifier (kebab-case)
- A clear, concise name
- A detailed description (2-3 sentences)
- Whether it's a recurring location (appears in multiple scenes)

Consider the genre, tone, and story requirements when selecting appropriate locations. Ensure variety in location types (interior/exterior, public/private, etc.).

Return ONLY a valid JSON array of LocationDefinition objects with this exact structure:
[
  {
    "id": "location-id",
    "name": "Location Name",
    "description": "Detailed description of the location including atmosphere and key features.",
    "recurring": true
  }
]`;

    // Generate locations using LLM
    const locationsResponse = await context.llm.generateJSON(prompt);

    // Validate and process the response
    if (!Array.isArray(locationsResponse)) {
      throw new Error('LLM response is not an array');
    }

    // Validate each location object
    const validatedLocations = locationsResponse.map((location, index) => {
      if (!location.id || !location.name || !location.description || typeof location.recurring !== 'boolean') {
        throw new Error(`Invalid location object at index ${index}: missing required fields`);
      }

      return {
        id: location.id,
        name: location.name,
        description: location.description,
        recurring: location.recurring
      };
    });

    // Ensure we have a reasonable number of locations
    if (validatedLocations.length < 3) {
      throw new Error('Generated insufficient number of locations (minimum 3 required)');
    }

    if (validatedLocations.length > 20) {
      // Trim to reasonable number
      validatedLocations.splice(20);
    }

    context.log(`Generated ${validatedLocations.length} locations successfully`);

    return { locations: validatedLocations };

  } catch (error) {
    context.log(`Error generating locations: ${error.message}`);

    // Fallback: generate basic locations
    const fallbackLocations = [
      {
        id: "main-character-home",
        name: "Main Character's Home",
        description: "The primary residence where the main character lives, establishing their personal world and lifestyle.",
        recurring: true
      },
      {
        id: "workplace-office",
        name: "Workplace/Office",
        description: "Professional environment where key character interactions and plot developments occur.",
        recurring: true
      },
      {
        id: "public-meeting-place",
        name: "Public Meeting Place",
        description: "A neutral location such as a cafe, park, or restaurant where characters meet and important conversations happen.",
        recurring: false
      }
    ];

    return { locations: fallbackLocations };
  }
}
