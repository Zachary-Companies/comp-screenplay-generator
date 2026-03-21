/**
 * Enrich Script Data
 *
 * Reads the imported screenplay and uses AI to fill in missing data
 * for characters and locations — descriptions, traits, arcs, age,
 * gender, relationships, location types, moods, etc.
 *
 * Works by analyzing the character's dialogue and action lines to
 * infer personality, role, and physical description.
 */

interface CharacterData {
  id: string;
  name: string;
  role: string;
  description: string;
  traits: string[];
  arc: string;
  relationships: Array<{ characterId: string; characterName: string; type: string }>;
  ageRange?: string;
  gender?: string;
  voiceDescription?: string;
  wardrobeNotes?: string;
  aliases?: string[];
  displayName?: string;
}

interface LocationData {
  id: string;
  name: string;
  description: string;
  type: string;
  mood: string;
  timeOfDay: string;
  setting?: string;
  atmosphere?: string;
}

interface DialogueSample {
  characterName: string;
  line: string;
  context: string; // action before or after
}

interface SceneAppearance {
  characterName: string;
  sceneHeading: string;
  actions: string[];
}

/**
 * Extract dialogue samples and scene appearances for each character
 * from the raw elements data.
 */
function extractCharacterContext(
  elements: any[],
  sections: any[],
): { dialogues: Map<string, DialogueSample[]>; appearances: Map<string, SceneAppearance[]> } {
  const dialogues = new Map<string, DialogueSample[]>();
  const appearances = new Map<string, SceneAppearance[]>();
  let currentScene = '';

  // Flatten sections to get scene titles
  const sceneHeadings: string[] = [];
  function flattenSections(secs: any[]) {
    for (const s of secs) {
      if (s.type === 'scene' && s.title) sceneHeadings.push(s.title);
      if (s.children) flattenSections(s.children);
    }
  }
  flattenSections(sections);

  let sceneIdx = 0;
  let lastAction = '';

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (el.type === 'action') {
      lastAction = el.content || '';
      // Check if this action mentions any character names for scene appearances
      continue;
    }

    if (el.type === 'dialogue' && el.characterName) {
      const name = el.characterName;
      if (!dialogues.has(name)) dialogues.set(name, []);
      const samples = dialogues.get(name)!;
      // Keep up to 15 representative samples per character
      if (samples.length < 15) {
        samples.push({
          characterName: name,
          line: (el.lines ? el.lines.join(' ') : el.content || '').substring(0, 200),
          context: lastAction.substring(0, 150),
        });
      }
    }
  }

  return { dialogues, appearances };
}

/**
 * Build an AI prompt to enrich a single character's data.
 */
function buildCharacterPrompt(
  char: CharacterData,
  dialogueSamples: DialogueSample[],
  allCharNames: string[],
): string {
  let prompt = `Analyze this character from a screenplay and provide detailed information.\n\n`;
  prompt += `Character name: ${char.name}\n`;
  prompt += `Current role: ${char.role}\n`;
  prompt += `Dialogue count indicates this is a ${char.role} character.\n\n`;

  if (dialogueSamples.length > 0) {
    prompt += `Sample dialogue lines:\n`;
    for (const s of dialogueSamples.slice(0, 10)) {
      if (s.context) prompt += `  [Action: ${s.context}]\n`;
      prompt += `  ${s.characterName}: "${s.line}"\n\n`;
    }
  }

  prompt += `\nOther characters in the script: ${allCharNames.filter(n => n !== char.name).join(', ')}\n`;

  prompt += `\nProvide a JSON object with these fields (use the exact field names):
{
  "description": "2-3 sentence physical and personality description",
  "ageRange": "estimated age range like '25-30' or 'early 40s'",
  "gender": "Male, Female, or Non-binary (infer from dialogue/name/context)",
  "traits": ["trait1", "trait2", "trait3", "trait4", "trait5"],
  "arc": "1-2 sentence character arc description",
  "voiceDescription": "How their voice sounds — tone, pace, accent, mannerisms",
  "wardrobeNotes": "Brief description of likely clothing/appearance",
  "relationships": [{"characterName": "NAME", "type": "relationship type (friend, enemy, lover, boss, etc.)"}],
  "aliases": ["any nicknames or alternative names used in the script"]
}

Return ONLY the JSON object, no other text.`;

  return prompt;
}

/**
 * Build an AI prompt to enrich location data.
 */
function buildLocationsPrompt(locations: LocationData[], elements: any[]): string {
  // Find action lines that mention each location
  const locationContext: Record<string, string[]> = {};
  for (const loc of locations) {
    locationContext[loc.name] = [];
  }

  for (const el of elements) {
    if (el.type !== 'action') continue;
    const content = el.content || '';
    for (const loc of locations) {
      if (content.toLowerCase().includes(loc.name.toLowerCase()) && locationContext[loc.name].length < 3) {
        locationContext[loc.name].push(content.substring(0, 200));
      }
    }
  }

  let prompt = `Analyze these locations from a screenplay and provide detailed information for each.\n\n`;
  prompt += `Locations:\n`;
  for (const loc of locations) {
    prompt += `- ${loc.name}`;
    if (locationContext[loc.name].length > 0) {
      prompt += ` (context: "${locationContext[loc.name][0].substring(0, 100)}...")`;
    }
    prompt += `\n`;
  }

  prompt += `\nProvide a JSON array with one object per location. Each object must have:
{
  "name": "exact location name from above",
  "description": "2-3 sentence vivid description of the location",
  "type": "interior or exterior",
  "mood": "overall mood/atmosphere (e.g. tense, warm, eerie, bustling)",
  "setting": "time period and geographic context",
  "atmosphere": "sensory details — lighting, sounds, smells"
}

Return ONLY the JSON array, no other text.`;

  return prompt;
}

/**
 * Pipeline script entry point.
 */
export async function execute(
  inputs: {
    pipelineId?: string;
    enrichCharacters?: boolean;
    enrichLocations?: boolean;
    maxCharacters?: number;
  },
  context: any,
): Promise<{
  enrichedCharacters: number;
  enrichedLocations: number;
  errors: string[];
}> {
  const enrichChars = inputs.enrichCharacters !== false;
  const enrichLocs = inputs.enrichLocations !== false;
  const maxChars = inputs.maxCharacters || 30;
  const errors: string[] = [];
  let enrichedCharCount = 0;
  let enrichedLocCount = 0;

  const pid = inputs.pipelineId || context?.pipelineId || '';
  if (!pid) throw new Error('No pipeline ID');

  const baseUrl = `http://127.0.0.1:9001/api/app/${encodeURIComponent(pid)}`;

  // Load current state
  const stateResp = await fetch(`${baseUrl}/state`);
  const state = await stateResp.json();
  if (!state || !state.nodeData) throw new Error('No pipeline state found');

  const charNode = state.nodeData['node-5'];
  const locNode = state.nodeData['node-6'];
  const elemNode = state.nodeData['node-10'];
  const secNode = state.nodeData['node-7'];

  const characters: CharacterData[] = charNode?.characters || charNode?.outputs?.characters || [];
  const locations: LocationData[] = locNode?.locations || locNode?.outputs?.locations || [];
  const elements: any[] = elemNode?.elements || elemNode?.outputs?.elements || [];
  const sections: any[] = secNode?.sections || secNode?.outputs?.sections || [];

  if (context?.progress) context.progress.start?.('Enriching script data...');

  // Enrich characters
  if (enrichChars && characters.length > 0) {
    const { dialogues } = extractCharacterContext(elements, sections);
    const allCharNames = characters.map(c => c.name);

    // Sort by importance (main first), limit to maxChars
    const sortedChars = [...characters].sort((a, b) => {
      const order = { main: 0, supporting: 1, minor: 2 };
      return (order[a.role as keyof typeof order] || 3) - (order[b.role as keyof typeof order] || 3);
    });

    const toEnrich = sortedChars.slice(0, maxChars);

    for (let ci = 0; ci < toEnrich.length; ci++) {
      const char = toEnrich[ci];
      if (context?.progress) {
        context.progress.set?.({
          current: ci,
          total: toEnrich.length,
          label: `Enriching character: ${char.name}`,
        });
      }

      // Skip if already enriched (has a description longer than 20 chars)
      if (char.description && char.description.length > 20) continue;

      const samples = dialogues.get(char.name) || [];
      const prompt = buildCharacterPrompt(char, samples, allCharNames);

      try {
        // Use the pipeline's LLM tool
        let result: any;
        if (context?.tools?.llm_generate) {
          result = await context.tools.llm_generate({
            prompt,
            temperature: 0.7,
            maxTokens: 800,
          });
        } else {
          // Fall back to direct API call
          const resp = await fetch(`${baseUrl.replace('/api/app/' + encodeURIComponent(pid), '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: prompt,
              pipelineId: pid,
              oneShot: true,
            }),
          });
          const data = await resp.json();
          result = { text: data.response || data.text || '' };
        }

        const text = result?.text || result?.content || '';
        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const enriched = JSON.parse(jsonMatch[0]);
          // Merge enriched data into character
          const idx = characters.findIndex(c => c.id === char.id);
          if (idx >= 0) {
            if (enriched.description) characters[idx].description = enriched.description;
            if (enriched.ageRange) characters[idx].ageRange = enriched.ageRange;
            if (enriched.gender) characters[idx].gender = enriched.gender;
            if (enriched.traits?.length) characters[idx].traits = enriched.traits;
            if (enriched.arc) characters[idx].arc = enriched.arc;
            if (enriched.voiceDescription) characters[idx].voiceDescription = enriched.voiceDescription;
            if (enriched.wardrobeNotes) characters[idx].wardrobeNotes = enriched.wardrobeNotes;
            if (enriched.aliases?.length) characters[idx].aliases = enriched.aliases;
            if (enriched.relationships?.length) {
              characters[idx].relationships = enriched.relationships.map((r: any) => ({
                characterName: r.characterName || r.name || '',
                characterId: '',
                type: r.type || 'unknown',
              }));
              // Resolve character IDs
              for (const rel of characters[idx].relationships) {
                const match = characters.find(c => c.name === rel.characterName);
                if (match) rel.characterId = match.id;
              }
            }
            // Set displayName
            characters[idx].displayName = char.name.split(' ').map(
              w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
            ).join(' ');
            enrichedCharCount++;
          }
        }
      } catch (err: any) {
        errors.push(`Failed to enrich ${char.name}: ${err.message}`);
      }
    }

    // Save enriched characters
    await fetch(`${baseUrl}/state/node-5`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputs: { characters } }),
    });
  }

  // Enrich locations
  if (enrichLocs && locations.length > 0) {
    if (context?.progress) {
      context.progress.set?.({ label: 'Enriching locations...' });
    }

    // Batch all locations into one prompt (usually < 20)
    const locsToEnrich = locations.filter(l => !l.description || l.description.length < 20);
    if (locsToEnrich.length > 0) {
      const prompt = buildLocationsPrompt(locsToEnrich, elements);

      try {
        let result: any;
        if (context?.tools?.llm_generate) {
          result = await context.tools.llm_generate({
            prompt,
            temperature: 0.7,
            maxTokens: 2000,
          });
        } else {
          const resp = await fetch(`${baseUrl.replace('/api/app/' + encodeURIComponent(pid), '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: prompt,
              pipelineId: pid,
              oneShot: true,
            }),
          });
          const data = await resp.json();
          result = { text: data.response || data.text || '' };
        }

        const text = result?.text || result?.content || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const enrichedLocs = JSON.parse(jsonMatch[0]);
          for (const enriched of enrichedLocs) {
            const idx = locations.findIndex(l => l.name === enriched.name);
            if (idx >= 0) {
              if (enriched.description) locations[idx].description = enriched.description;
              if (enriched.type) locations[idx].type = enriched.type;
              if (enriched.mood) locations[idx].mood = enriched.mood;
              if (enriched.setting) (locations[idx] as any).setting = enriched.setting;
              if (enriched.atmosphere) (locations[idx] as any).atmosphere = enriched.atmosphere;
              enrichedLocCount++;
            }
          }
        }
      } catch (err: any) {
        errors.push(`Failed to enrich locations: ${err.message}`);
      }

      // Save enriched locations
      await fetch(`${baseUrl}/state/node-6`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: { locations } }),
      });
    }
  }

  // Also update the assembly node
  const assemblyResp = await fetch(`${baseUrl}/state`);
  const updatedState = await assemblyResp.json();
  const assemblyNode = updatedState?.nodeData?.['node-15'];
  if (assemblyNode) {
    const assembly = assemblyNode.scriptPackage || assemblyNode;
    if (assembly?.script) {
      assembly.script.characters = characters;
      assembly.script.locations = locations;
      await fetch(`${baseUrl}/state/node-15`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: assemblyNode }),
      });
    }
  }

  if (context?.progress) {
    context.progress.complete?.(`Enriched ${enrichedCharCount} characters, ${enrichedLocCount} locations`);
  }

  return { enrichedCharacters: enrichedCharCount, enrichedLocations: enrichedLocCount, errors };
}
