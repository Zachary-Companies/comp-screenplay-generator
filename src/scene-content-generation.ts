/// <reference path="./woodbury.d.ts" />

/**
 * Scene Content Generation Node
 * 
 * Processes sections (including container sections with children) to generate
 * scene content including headings, synopsis, and beats.
 * 
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
    // Parse the section (handle both string and object inputs)
    const sectionData = typeof section === 'string' ? JSON.parse(section) : section;

    // Parse characters and locations for reference
    const characterList = Array.isArray(characters)
      ? characters.map(char => typeof char === 'string' ? JSON.parse(char) : char)
      : [];
    const locationList = Array.isArray(locations)
      ? locations.map(loc => typeof loc === 'string' ? JSON.parse(loc) : loc)
      : [];

    // Process the section (handles both container sections and scene sections)
    const processedSection = await processSection(sectionData, characterList, locationList, context);
    
    return { processedSection };

  } catch (error) {
    context.log(`Error processing section: ${error}`);
    const fallbackSection = typeof section === 'string'
      ? (() => { try { return JSON.parse(section); } catch { return { type: 'scene', title: 'Error Scene' }; } })()
      : (section || { type: 'scene', title: 'Error Scene' });
    return { processedSection: fallbackSection };
  }
}

/**
 * Recursively process a section and its children
 */
async function processSection(
  sectionData: any,
  characterList: any[],
  locationList: any[],
  context: ScriptContext
): Promise<any> {
  // If this section has children, process them recursively
  if (Array.isArray(sectionData.children) && sectionData.children.length > 0) {
    context.log(`Processing container section "${sectionData.title}" with ${sectionData.children.length} children`);
    
    const processedChildren = [];
    for (const child of sectionData.children) {
      const processedChild = await processSection(child, characterList, locationList, context);
      processedChildren.push(processedChild);
    }
    
    return {
      ...sectionData,
      children: processedChildren
    };
  }

  // Only generate content for scene sections
  if (sectionData.type !== 'scene') {
    return sectionData;
  }

  // Generate scene content
  return await generateSceneContent(sectionData, characterList, locationList, context);
}

/**
 * Generate scene content (heading, synopsis, beats) for a scene section
 */
async function generateSceneContent(
  sectionData: any,
  characterList: any[],
  locationList: any[],
  context: ScriptContext
): Promise<any> {
  context.log(`Processing scene section: ${sectionData.title || 'Untitled Scene'}`);

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
    loc.name.toLowerCase().includes(sceneHeading.location?.toLowerCase() || '') ||
    (sceneHeading.location?.toLowerCase() || '').includes(loc.name.toLowerCase())
  );
  const locationId = matchingLocation ? matchingLocation.id : locationList[0]?.id || 'loc_001';

  // Generate synopsis
  const synopsisPrompt = `
Write a brief synopsis (1-2 sentences) for this scene:
Title: ${sectionData.title || 'Scene'}
Description: ${sectionData.description || 'No description'}
Location: ${sceneHeading.location || 'Unknown'}
Time: ${sceneHeading.timeOfDay || 'DAY'}

Available characters:
${characterList.map(char => `- ${char.name}: ${char.description}`).join('\n')}

Return just the synopsis text, no JSON.`;

  const synopsis = await context.llm.generate(synopsisPrompt);

  // Generate scene beats
  const beatsPrompt = `
Generate 3-5 scene beats for this scene:
Title: ${sectionData.title || 'Scene'}
Synopsis: ${synopsis}
Location: ${sceneHeading.location || 'Unknown'}

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

  context.log(`Generated scene content: ${beatsArray.length} beats, ${totalDuration}s duration`);

  // Return the section with generated content
  return {
    ...sectionData,
    sceneHeading: {
      prefix: sceneHeading.prefix || 'INT',
      location: sceneHeading.location || 'UNKNOWN',
      sublocation: sceneHeading.sublocation || null,
      timeOfDay: sceneHeading.timeOfDay || 'DAY'
    },
    synopsis: (synopsis || '').trim(),
    beats: beatsArray,
    estimatedDurationSeconds: totalDuration,
    locationId: locationId
  };
}
