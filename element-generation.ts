/// <reference path="./woodbury.d.ts" />

/**
 * @input processedSections: object[] - All processed sections with scene content
 * @input characters: object[] - Character definitions
 * @output elements: object[] - Array of ScriptElement objects
 */
export async function execute(
  inputs: { processedSections: any[]; characters: any[] },
  context: ScriptContext,
): Promise<{ elements: object[] }> {
  const processedSections = Array.isArray(inputs.processedSections) ? inputs.processedSections : [];
  const characters = Array.isArray(inputs.characters) ? inputs.characters : [];

  try {
    context.log('Starting element generation for scene beats');

    // Parse characters — handle both objects and JSON strings
    const characterDefs = characters.map(char =>
      typeof char === 'string' ? JSON.parse(char) : char
    );
    const characterMap = new Map(characterDefs.map((char: any) => [String(char.name || '').toLowerCase(), char]));

    const allElements: any[] = [];
    let elementIdCounter = 1;

    // Process each section to extract scene content and generate elements
    for (const sectionRaw of processedSections) {
      const section = typeof sectionRaw === 'string' ? JSON.parse(sectionRaw) : sectionRaw;

      // Only process scene sections that have beats
      if (section.type === 'scene' && section.sceneContent?.beats) {
        context.log(`Processing scene: ${section.sceneContent.sceneHeading?.location || 'Unknown'}`);

        // Generate elements for each beat
        for (const beat of section.sceneContent.beats) {
          const beatStr = typeof beat === 'string' ? beat : JSON.stringify(beat);
          const elements = await generateElementsForBeat(beatStr, characterMap, elementIdCounter, context);
          allElements.push(...elements);
          elementIdCounter += elements.length;
        }
      }
    }

    context.log(`Generated ${allElements.length} script elements`);

    // Return as native objects — do NOT JSON.stringify
    return { elements: allElements };

  } catch (error: any) {
    context.log(`Error in element generation: ${error.message}`);
    return { elements: [] };
  }
}

async function generateElementsForBeat(
  beat: string,
  characterMap: Map<string, any>,
  startId: number,
  context: ScriptContext
): Promise<any[]> {
  const elements: any[] = [];
  let currentId = startId;

  const prompt = `Analyze this scene beat and generate appropriate script elements (action, dialogue, transitions, shots, etc.):

Beat: ${beat}

Available characters: ${Array.from(characterMap.keys()).join(', ')}

Generate a JSON array of script elements. Each element should have:
- id: unique identifier
- type: one of "action", "dialogue", "parenthetical", "transition", "shot", "note", "lyrics", "sfx", "title-card", "super", "text-on-screen"
- content: the actual text content

For dialogue elements, also include:
- characterId: character ID
- characterName: character name
- lines: array of dialogue lines
- modifiers: array of modifiers like "VO", "OS", "OC", "FILTERED", "PHONE", "RADIO" if applicable

For shot elements, include:
- shotText: description of the shot
- cameraMovement: if applicable
- frameSize: if applicable

Return only the JSON array, no other text.`;

  try {
    const response = await context.llm.generateJSON(prompt);
    const generatedElements = Array.isArray(response) ? response : [response];

    for (const element of generatedElements) {
      const scriptElement: any = {
        id: `element_${currentId++}`,
        type: element.type || 'action',
        content: element.content || element.text || beat
      };

      if (element.type === 'dialogue') {
        const characterName = element.characterName || extractCharacterFromDialogue(element.content);
        const character = characterMap.get(characterName?.toLowerCase());

        scriptElement.characterId = character?.id || `char_${characterName?.toLowerCase().replace(/\s+/g, '_')}`;
        scriptElement.characterName = characterName || 'UNKNOWN';
        scriptElement.lines = element.lines || [element.content];

        if (element.modifiers && element.modifiers.length > 0) {
          scriptElement.modifiers = element.modifiers;
        }
      }

      if (element.type === 'shot') {
        scriptElement.shotText = element.shotText || element.content;
        if (element.cameraMovement) scriptElement.cameraMovement = element.cameraMovement;
        if (element.frameSize) scriptElement.frameSize = element.frameSize;
      }

      if (element.type === 'transition') {
        scriptElement.transitionType = element.transitionType || 'CUT TO:';
      }

      elements.push(scriptElement);
    }

  } catch (error: any) {
    context.log(`Error generating elements for beat, creating fallback: ${error.message}`);
    elements.push({
      id: `element_${currentId}`,
      type: 'action',
      content: beat
    });
  }

  return elements;
}

function extractCharacterFromDialogue(content: string): string | null {
  const match = content.match(/^([A-Z][A-Z\s]+):\s*(.+)/);
  return match ? match[1].trim() : null;
}
