/// <reference path="./woodbury.d.ts" />

/**
 * @input section: object - Current section to process
 * @input characters: object[] - Available characters
 * @input locations: object[] - Available locations
 * @output processedSection: object - Section with scene content generated
 */
export async function execute(
  inputs: { section: any; characters: any[]; locations: any[] },
  context: ScriptContext,
): Promise<{ processedSection: object }> {
  const { section, characters, locations } = inputs;

  try {
    // Parse the section to check if it's a SceneSection (handle both string and object inputs)
    const sectionData = typeof section === 'string' ? JSON.parse(section) : section;

    // Only process if this is a scene section
    if (sectionData.type !== 'scene') {
      return { processedSection: sectionData };
    }

    context.log(`Processing scene section: ${sectionData.title || 'Untitled Scene'}`);

    // Parse characters and locations for reference (handle both string and object inputs)
    const characterList = Array.isArray(characters)
      ? characters.map(char => typeof char === 'string' ? JSON.parse(char) : char)
      : [];
    const locationList = Array.isArray(locations)
      ? locations.map(loc => typeof loc === 'string' ? JSON.parse(loc) : loc)
      : [];

    // Generate scene heading
    const sceneHeadingPrompt = `
Generate a scene heading for this scene:
Title: ${sectionData.title || 'Scene'}
Description: ${sectionData.description || 'No description'}

Available locations:
${locationList.map(loc => `- ${loc.name}: ${loc.description}`).join('\n')}

Return a JSON object with:
{
  "prefix": "INT" | "EXT" | "INT-EXT" | "I-E",
  "location": "location name",
  "sublocation": "specific area (optional)",
  "timeOfDay": "DAY" | "NIGHT" | "DAWN" | "DUSK" | "CONTINUOUS" | "LATER"
}`;

    const sceneHeading = await context.llm.generateJSON(sceneHeadingPrompt);

    // Find matching location ID
    const matchingLocation = locationList.find(loc =>
      loc.name.toLowerCase().includes(sceneHeading.location.toLowerCase()) ||
      sceneHeading.location.toLowerCase().includes(loc.name.toLowerCase())
    );
    const locationId = matchingLocation ? matchingLocation.id : locationList[0]?.id || 'loc_001';

    // Generate synopsis
    const synopsisPrompt = `
Write a brief synopsis (1-2 sentences) for this scene:
Title: ${sectionData.title || 'Scene'}
Description: ${sectionData.description || 'No description'}
Location: ${sceneHeading.location}
Time: ${sceneHeading.timeOfDay}

Available characters:
${characterList.map(char => `- ${char.name}: ${char.description}`).join('\n')}

Return just the synopsis text, no JSON.`;

    const synopsis = await context.llm.generate(synopsisPrompt);

    // Generate scene beats
    const beatsPrompt = `
Generate 3-5 scene beats for this scene:
Title: ${sectionData.title || 'Scene'}
Synopsis: ${synopsis}
Location: ${sceneHeading.location}

Available characters:
${characterList.map(char => `- ${char.name}: ${char.description}`).join('\n')}

Return a JSON array of beat objects:
[
  {
    "id": "beat_001",
    "description": "Brief description of what happens",
    "estimatedDurationSeconds": 30
  }
]

Each beat should be 15-60 seconds long.`;

    const beats = await context.llm.generateJSON(beatsPrompt);

    // Calculate total duration
    const beatsArray = Array.isArray(beats) ? beats : [];
    const totalDuration = beatsArray.reduce((sum: number, beat: any) => sum + (beat.estimatedDurationSeconds || 30), 0);

    // Update the section with generated content
    const updatedSection = {
      ...sectionData,
      sceneHeading: {
        prefix: sceneHeading.prefix,
        location: sceneHeading.location,
        sublocation: sceneHeading.sublocation || null,
        timeOfDay: sceneHeading.timeOfDay
      },
      synopsis: synopsis.trim(),
      beats: beatsArray,
      estimatedDurationSeconds: totalDuration,
      locationId: locationId
    };

    context.log(`Generated scene content: ${beatsArray.length} beats, ${totalDuration}s duration`);

    return { processedSection: updatedSection };

  } catch (error) {
    context.log(`Error processing section: ${error}`);
    // Return original section as object if processing fails
    const fallbackSection = typeof section === 'string'
      ? (() => { try { return JSON.parse(section); } catch { return { type: 'scene', title: 'Error Scene' }; } })()
      : (section || { type: 'scene', title: 'Error Scene' });
    return { processedSection: fallbackSection };
  }
}
