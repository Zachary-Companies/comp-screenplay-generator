/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptKind: string - Script type
 * @input genre: string - Script genre
 * @input logline: string - Script premise
 * @input cast: string[] - Character definitions
 * @output locations: string[] - Array of LocationDefinition objects
 */
export async function execute(
  inputs: { scriptKind: string; genre: string; logline: string; cast: string[] },
  context: ScriptContext,
): Promise<{ locations: string[] }> {
  const { scriptKind, genre, logline, cast } = inputs;

  try {
    // Determine appropriate number of locations based on script kind
    let targetLocationCount: number;
    switch (scriptKind) {
      case 'commercial':
        targetLocationCount = 2; // Minimal locations for commercials
        break;
      case 'short-film':
        targetLocationCount = 4; // Limited locations for short films
        break;
      case 'tv-episode':
      case 'tv-pilot':
        targetLocationCount = 6; // Moderate locations for TV
        break;
      case 'feature-film':
        targetLocationCount = 10; // More locations for feature films
        break;
      default:
        targetLocationCount = 5; // Default fallback
    }

    // Parse cast to understand character requirements
    const castSummary = cast.map(charDef => {
      try {
        const char = JSON.parse(charDef);
        return `${char.name}: ${char.description}`;
      } catch {
        return charDef; // Fallback if not JSON
      }
    }).join('\n');

    const prompt = `Generate ${targetLocationCount} unique locations for a ${scriptKind} script in the ${genre} genre.

Logline: ${logline}

Main Characters:
${castSummary}

For each location, provide:
- id: string (format: "loc_[descriptive_name]")
- name: string (concise location name)
- description: string (detailed description of the location)
- recurring: boolean (true if location appears multiple times)

Consider:
- Script kind requirements (${scriptKind} typically needs ${targetLocationCount} locations)
- Genre conventions for ${genre}
- Character needs and story requirements
- Mix of interior and exterior locations
- Practical filming considerations
- Some locations should be recurring (true) for narrative continuity

Return a JSON array of LocationDefinition objects.`;

    context.log(`Generating ${targetLocationCount} locations for ${scriptKind} in ${genre} genre`);
    
    const locationsResponse = await context.llm.generateJSON(prompt);
    
    // Validate and format the response
    let locations: any[];
    if (Array.isArray(locationsResponse)) {
      locations = locationsResponse;
    } else if (locationsResponse.locations && Array.isArray(locationsResponse.locations)) {
      locations = locationsResponse.locations;
    } else {
      throw new Error('Invalid locations response format');
    }

    // Validate each location has required fields
    const validatedLocations = locations.map((loc, index) => {
      if (!loc.id) {
        loc.id = `loc_location_${index + 1}`;
      }
      if (!loc.name) {
        loc.name = `Location ${index + 1}`;
      }
      if (!loc.description) {
        loc.description = 'A location for the script.';
      }
      if (typeof loc.recurring !== 'boolean') {
        loc.recurring = index < Math.ceil(locations.length / 2); // Make first half recurring
      }
      
      return {
        id: loc.id,
        name: loc.name,
        description: loc.description,
        recurring: loc.recurring
      };
    });

    context.log(`Generated ${validatedLocations.length} locations`);
    
    // Convert to strings for output (maintaining LocationDefinition structure)
    const locationStrings = validatedLocations.map(loc => JSON.stringify(loc));
    
    return { locations: locationStrings };
    
  } catch (error) {
    context.log(`Error generating locations: ${error.message}`);
    
    // Fallback: generate basic locations
    const fallbackLocations = [
      {
        id: 'loc_interior_main',
        name: 'Interior Main Location',
        description: 'Primary interior setting for the script.',
        recurring: true
      },
      {
        id: 'loc_exterior_main',
        name: 'Exterior Main Location', 
        description: 'Primary exterior setting for the script.',
        recurring: true
      }
    ];
    
    const fallbackStrings = fallbackLocations.map(loc => JSON.stringify(loc));
    return { locations: fallbackStrings };
  }
}