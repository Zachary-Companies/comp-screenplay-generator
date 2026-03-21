/**
 * Fountain to Pipeline Importer
 *
 * Parses Fountain-format screenplay text and saves the structured data
 * into the pipeline's node state (metadata, characters, locations,
 * sections, elements, assembly).
 */

interface FountainMetadata {
  [key: string]: string;
}

interface Character {
  name: string;
  dialogueCount: number;
}

interface Section {
  type: 'scene' | 'act';
  title: string;
  location?: string;
  timeOfDay?: string;
  depth?: number;
  elementStart?: number;
}

interface Element {
  type: 'dialogue' | 'action' | 'transition';
  content: string;
  characterName?: string;
  lines?: string[];
  modifiers?: string[];
}

interface ParseResult {
  metadata: FountainMetadata;
  characters: Record<string, Character>;
  locations: string[];
  sections: Section[];
  elements: Element[];
}

// Non-character patterns
const NON_CHAR = /^(INT|EXT|EST|FADE|CUT|DISSOLVE|THE END|FLASHBACK|CONTINUED|MORE|DING|CLICK|BANG|SLAM|CRASH|BOOM|SMASH|TITLE|SUPER|INTERCUT|MONTAGE|LATER|BACK TO|END OF|SERIES OF|BEGIN|CLOSE ON|ANGLE ON|INSERT|WIDER|REVERSE|POV|TRACKING|ESTABLISHING|AERIAL|TIME CUT|MATCH CUT|JUMP CUT|SPLIT SCREEN)/;

export function parseFountain(text: string): ParseResult {
  const lines = text.split('\n');
  const metadata: FountainMetadata = {};
  const characters: Record<string, Character> = {};
  const locations: string[] = [];
  const sections: Section[] = [];
  const elements: Element[] = [];
  let i = 0;

  // Title page (key: value pairs at the start)
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(Title|Author|Credit|Source|Draft date|Contact|Copyright|Notes|Revision)\s*:\s*(.*)/i);
    if (match) {
      metadata[match[1].toLowerCase().replace(/\s+/g, '')] = match[2].trim();
      i++;
    } else if (line.trim() === '') {
      i++;
      if (Object.keys(metadata).length > 0) break;
    } else {
      break;
    }
  }

  // Body
  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Scene heading — standard INT/EXT or forced (. prefix)
    if (/^(INT|EXT|EST|INT\.?\/?EXT|I\/E)[.\s]/i.test(trimmed) || /^\.[A-Z]/.test(trimmed)) {
      const heading = trimmed.replace(/^\./, '');
      const locMatch = heading.match(/^(?:INT|EXT|EST|INT\.?\/?EXT|I\/E)[.\s]+([^-–]+)/i);
      if (locMatch) {
        const locName = locMatch[1].trim().replace(/\s*[-–].*$/, '').trim();
        if (locName && !locations.includes(locName)) locations.push(locName);
      }
      const timeMatch = heading.match(/[-–]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK|LATER|CONTINUOUS|SAME)/i);
      sections.push({
        type: 'scene',
        title: heading,
        location: locMatch ? locMatch[1].trim().replace(/\s*[-–].*$/, '').trim() : heading,
        timeOfDay: timeMatch ? timeMatch[1].toUpperCase() : '',
        elementStart: elements.length,
      });
      continue;
    }

    // Transition
    if (/^(FADE IN|FADE OUT|FADE TO|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT).*:?\s*$/i.test(trimmed) || /^>\s/.test(trimmed)) {
      elements.push({ type: 'transition', content: trimmed.replace(/^>\s*/, '') });
      continue;
    }

    // Character name detection
    const prevLineBlank = (i === 0) || !lines[i - 1].trim();
    const isAllCaps = /^[A-Z][A-Z0-9\s.\-']+(\s*\(.*\))?\s*$/.test(trimmed);
    let hasDialogueNext = false;
    if (isAllCaps && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      hasDialogueNext = nextLine.length > 0 && (/^\(/.test(nextLine) || !/^[A-Z][A-Z0-9\s.\-']+$/.test(nextLine));
    }

    if (prevLineBlank && isAllCaps && hasDialogueNext && trimmed.length > 1 && trimmed.length < 40 && !NON_CHAR.test(trimmed)) {
      const charName = trimmed.replace(/\s*\(.*\)$/, '').trim();
      const wordCount = charName.split(/\s+/).length;
      const looksLikeLocation = wordCount >= 3 && /\b(ROOM|HALL|STREET|OFFICE|HOUSE|BUILDING|STORE|MALL|PARKING|LOT|ELEVATOR|KITCHEN|BATHROOM|BEDROOM)\b/i.test(charName);

      if (!looksLikeLocation) {
        if (!characters[charName]) {
          characters[charName] = { name: charName, dialogueCount: 0 };
        }

        // Collect dialogue lines
        const dialogueLines: string[] = [];
        let parenthetical = '';
        let j = i + 1;
        while (j < lines.length && lines[j].trim()) {
          const dline = lines[j].trim();
          if (/^\(.*\)$/.test(dline)) {
            parenthetical = dline.replace(/^\(|\)$/g, '');
          } else {
            dialogueLines.push(dline);
          }
          j++;
        }

        if (dialogueLines.length > 0) {
          characters[charName].dialogueCount++;
          elements.push({
            type: 'dialogue',
            characterName: charName,
            content: dialogueLines.join(' '),
            lines: dialogueLines,
            modifiers: parenthetical ? [parenthetical] : [],
          });
          i = j - 1;
          continue;
        }
      }
    }

    // Section header
    if (/^#{1,6}\s+/.test(trimmed)) {
      const depth = trimmed.match(/^(#+)/)![1].length;
      sections.push({ type: 'act', title: trimmed.replace(/^#+\s+/, ''), depth });
      continue;
    }

    // Action (everything else)
    elements.push({ type: 'action', content: trimmed });
  }

  return { metadata, characters, locations, sections, elements };
}

/**
 * Maps parsed Fountain data to pipeline node outputs and saves them.
 */
export async function execute(
  inputs: {
    fountainText?: string;
    fountainPath?: string;
    pipelineId?: string;
  },
  context: any,
): Promise<{
  metadata: any;
  characterCount: number;
  locationCount: number;
  sceneCount: number;
  elementCount: number;
}> {
  const { readFile } = await import('node:fs/promises');

  let text: string;
  if (inputs.fountainText) {
    text = inputs.fountainText;
  } else if (inputs.fountainPath) {
    text = await readFile(inputs.fountainPath, 'utf-8');
  } else {
    throw new Error('Either fountainText or fountainPath is required');
  }

  const parsed = parseFountain(text);
  const pid = inputs.pipelineId || context?.pipelineId || '';

  // Build structured data for each node
  const charArray = Object.values(parsed.characters).map((c, idx) => ({
    id: `char-${idx + 1}`,
    name: c.name,
    role: c.dialogueCount > 10 ? 'main' : c.dialogueCount > 3 ? 'supporting' : 'minor',
    description: '',
    traits: [],
    arc: '',
    relationships: [],
  }));

  const locArray = parsed.locations.map((loc, idx) => ({
    id: `loc-${idx + 1}`,
    name: loc,
    description: '',
    type: 'exterior',
    mood: '',
    timeOfDay: '',
  }));

  const sceneList = parsed.sections.filter(s => s.type === 'scene');
  const scenesPerAct = Math.max(5, Math.ceil(sceneList.length / 3));
  const actNames = ['Act I', 'Act II', 'Act III', 'Act IV', 'Act V'];
  const sectionChildren = [];
  for (let ai = 0; ai * scenesPerAct < sceneList.length; ai++) {
    const actScenes = sceneList.slice(ai * scenesPerAct, (ai + 1) * scenesPerAct);
    sectionChildren.push({
      type: 'act',
      id: `act-${ai + 1}`,
      title: actNames[ai] || `Act ${ai + 1}`,
      order: ai + 1,
      children: actScenes.map((s, idx) => ({
        type: 'scene',
        id: `scene-${ai * scenesPerAct + idx + 1}`,
        title: s.title,
        location: s.location || '',
        timeOfDay: s.timeOfDay || '',
        order: ai * scenesPerAct + idx + 1,
        children: [],
      })),
    });
  }

  const elementsArray = parsed.elements.map((el, idx) => {
    const base: any = { id: `elem-${idx + 1}`, type: el.type, content: el.content || '' };
    if (el.type === 'dialogue') {
      base.characterName = el.characterName || '';
      base.characterId = '';
      for (const c of charArray) {
        if (c.name === el.characterName) { base.characterId = c.id; break; }
      }
      base.lines = el.lines || [el.content];
      base.modifiers = el.modifiers || [];
    }
    return base;
  });

  const metadataObj = {
    title: parsed.metadata.title || 'Untitled',
    subtitle: null,
    logline: '',
    author: [{ name: parsed.metadata.author || 'Unknown', role: 'Writer' }],
    basedOn: null,
    language: 'en-US',
    runtimeMinutes: Math.max(1, Math.round(text.split('\n').length / 55)),
    estimatedPages: Math.max(1, Math.round(text.split('\n').length / 55)),
    genre: [],
    tone: [],
    audience: [],
    draftName: 'Imported',
    draftDate: (parsed.metadata.draftdate || new Date().toISOString().split('T')[0]) + 'T00:00:00.000Z',
    version: '1.0.0',
  };

  // If we have a pipeline ID, save to all nodes via API
  if (pid && typeof fetch !== 'undefined') {
    const baseUrl = `http://127.0.0.1:9001/api/app/${encodeURIComponent(pid)}`;

    // Clear old state
    await fetch(`${baseUrl}/state`, { method: 'DELETE' });

    // Save each node
    const saves = [
      { nodeId: 'node-4', outputs: { metadata: metadataObj } },
      { nodeId: 'node-5', outputs: { characters: charArray } },
      { nodeId: 'node-6', outputs: { locations: locArray } },
      { nodeId: 'node-7', outputs: { sections: sectionChildren } },
      { nodeId: 'node-10', outputs: { elements: elementsArray } },
      {
        nodeId: 'node-15',
        outputs: {
          scriptPackage: {
            script: { metadata: metadataObj, characters: charArray, locations: locArray, sections: sectionChildren, elements: elementsArray },
            previsualizations: { shots: [] },
            assets: [],
          },
          _fountainSource: text,
        },
      },
    ];

    for (const save of saves) {
      await fetch(`${baseUrl}/state/${encodeURIComponent(save.nodeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: save.outputs }),
      });
    }
  }

  if (context?.progress) {
    context.progress.complete?.(`Imported: ${charArray.length} characters, ${locArray.length} locations, ${sceneList.length} scenes, ${elementsArray.length} elements`);
  }

  return {
    metadata: metadataObj,
    characterCount: charArray.length,
    locationCount: locArray.length,
    sceneCount: sceneList.length,
    elementCount: elementsArray.length,
  };
}
