/// <reference path="./woodbury.d.ts" />

/**
 * Element Generation Node
 * 
 * Takes processed sections with scene beats and generates actual script elements
 * including dialogue, action, shots, transitions, etc.
 * 
 * Handles nested section structures (acts containing scenes, etc.)
 *
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
    const characterNames = characterDefs.map((c: any) => c.name).join(', ');

    // Flatten all scene sections from the nested structure
    const allScenes = flattenScenes(processedSections);
    context.log(`Found ${allScenes.length} scene sections to process`);

    const allElements: any[] = [];
    let elementIdCounter = 1;

    // Process each scene section
    for (const scene of allScenes) {
      const beats = scene.beats;
      const sceneHeading = scene.sceneHeading;
      
      if (beats && Array.isArray(beats) && beats.length > 0) {
        const sceneName = sceneHeading?.location || scene.title || 'Unknown';
        context.log(`Processing scene: ${sceneName} with ${beats.length} beats`);

        // Generate elements for each beat
        for (const beat of beats) {
          const beatDescription = typeof beat === 'string' ? beat : (beat.description || JSON.stringify(beat));
          const elements = await generateElementsForBeat(
            beatDescription, 
            characterMap, 
            characterNames,
            sceneHeading,
            elementIdCounter, 
            context
          );
          allElements.push(...elements);
          elementIdCounter += elements.length;
        }
      } else {
        context.log(`Scene "${scene.title}" has no beats, skipping`);
      }
    }

    context.log(`Generated ${allElements.length} script elements total`);
    
    // Log element type breakdown
    const typeCounts: Record<string, number> = {};
    for (const el of allElements) {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    }
    context.log(`Element breakdown: ${JSON.stringify(typeCounts)}`);

    return { elements: allElements };

  } catch (error: any) {
    context.log(`Error in element generation: ${error.message}`);
    return { elements: [] };
  }
}

/**
 * Recursively flatten nested sections to extract all scene sections
 */
function flattenScenes(sections: any[]): any[] {
  const scenes: any[] = [];
  
  for (const sectionRaw of sections) {
    const section = typeof sectionRaw === 'string' ? JSON.parse(sectionRaw) : sectionRaw;
    
    if (section.type === 'scene') {
      scenes.push(section);
    }
    
    // Recursively process children
    if (Array.isArray(section.children) && section.children.length > 0) {
      const childScenes = flattenScenes(section.children);
      scenes.push(...childScenes);
    }
  }
  
  return scenes;
}

async function generateElementsForBeat(
  beatDescription: string,
  characterMap: Map<string, any>,
  characterNames: string,
  sceneHeading: any,
  startId: number,
  context: ScriptContext
): Promise<any[]> {
  const elements: any[] = [];
  let currentId = startId;

  const location = sceneHeading?.location || 'Unknown';
  const timeOfDay = sceneHeading?.timeOfDay || 'DAY';

  const prompt = `You are a professional screenwriter. Analyze this scene beat and generate proper screenplay elements.

SCENE BEAT: ${beatDescription}

SCENE LOCATION: ${location}
TIME OF DAY: ${timeOfDay}

AVAILABLE CHARACTERS: ${characterNames}

Generate a JSON array of screenplay elements for this beat. You MUST include:
1. At least one ACTION element describing what happens visually
2. DIALOGUE elements for any character interactions (characters should speak!)
3. At least one SHOT element describing camera work

Element types and their required fields:

ACTION element:
{
  "type": "action",
  "content": "Description of what we see on screen"
}

DIALOGUE element (REQUIRED for character interactions):
{
  "type": "dialogue",
  "characterName": "CHARACTER NAME IN CAPS",
  "lines": ["First line of dialogue", "Second line if needed"],
  "modifiers": []
}

SHOT element (REQUIRED for camera direction):
{
  "type": "shot",
  "shotText": "WIDE SHOT - Description of what camera shows",
  "frameSize": "WIDE",
  "cameraMovement": "STATIC"
}

TRANSITION element (optional):
{
  "type": "transition",
  "transitionType": "CUT TO:"
}

IMPORTANT RULES:
- Every beat should have dialogue if characters are present
- Write natural, realistic dialogue that reveals character
- Include at least one shot element per beat
- Action lines should be visual and cinematic
- Character names in dialogue must be UPPERCASE

Return ONLY a valid JSON array, no other text.`;

  try {
    const response = await context.llm.generateJSON(prompt);
    const generatedElements = Array.isArray(response) ? response : [response];

    for (const element of generatedElements) {
      const scriptElement: any = {
        id: `element_${currentId++}`,
        type: element.type || 'action',
        content: element.content || element.text || beatDescription
      };

      if (element.type === 'dialogue') {
        const characterName = element.characterName || extractCharacterFromDialogue(element.content);
        const character = characterMap.get(characterName?.toLowerCase());

        scriptElement.characterId = character?.id || `char_${(characterName || 'unknown').toLowerCase().replace(/\s+/g, '_')}`;
        scriptElement.characterName = characterName || 'UNKNOWN';
        scriptElement.lines = element.lines || [element.content];
        scriptElement.content = scriptElement.lines.join(' ');

        if (element.modifiers && element.modifiers.length > 0) {
          scriptElement.modifiers = element.modifiers;
        }
      }

      if (element.type === 'shot') {
        scriptElement.shotText = element.shotText || element.content;
        scriptElement.content = scriptElement.shotText;
        if (element.cameraMovement) scriptElement.cameraMovement = element.cameraMovement;
        if (element.frameSize) scriptElement.frameSize = element.frameSize;
      }

      if (element.type === 'transition') {
        scriptElement.transitionType = element.transitionType || 'CUT TO:';
        scriptElement.content = scriptElement.transitionType;
      }

      elements.push(scriptElement);
    }

    // Ensure we have at least one of each required type
    const hasDialogue = elements.some(e => e.type === 'dialogue');
    const hasShot = elements.some(e => e.type === 'shot');
    const hasAction = elements.some(e => e.type === 'action');

    if (!hasAction) {
      elements.unshift({
        id: `element_${currentId++}`,
        type: 'action',
        content: beatDescription
      });
    }

    if (!hasShot) {
      elements.push({
        id: `element_${currentId++}`,
        type: 'shot',
        shotText: `MEDIUM SHOT - ${sceneHeading?.location || 'Scene'}`,
        content: `MEDIUM SHOT - ${sceneHeading?.location || 'Scene'}`,
        frameSize: 'MEDIUM',
        cameraMovement: 'STATIC'
      });
    }

  } catch (error: any) {
    context.log(`Error generating elements for beat, creating fallback: ${error.message}`);
    
    elements.push({
      id: `element_${currentId++}`,
      type: 'action',
      content: beatDescription
    });
    elements.push({
      id: `element_${currentId++}`,
      type: 'shot',
      shotText: 'MEDIUM SHOT - Scene',
      content: 'MEDIUM SHOT - Scene',
      frameSize: 'MEDIUM',
      cameraMovement: 'STATIC'
    });
  }

  return elements;
}

function extractCharacterFromDialogue(content: string): string | null {
  if (!content) return null;
  const match = content.match(/^([A-Z][A-Z\s]+):\s*(.+)/);
  return match ? match[1].trim() : null;
}
