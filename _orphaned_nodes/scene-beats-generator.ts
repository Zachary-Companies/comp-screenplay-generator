/// <reference path="./woodbury.d.ts" />

/**
 * @input sections: string[] - Script sections
 * @input cast: string[] - Character definitions
 * @input scriptKind: string - Script type
 * @output sectionsWithBeats: string[] - Sections populated with ScriptElement beats
 */
export async function execute(
  inputs: { sections: string[]; cast: string[]; scriptKind: string },
  context: ScriptContext,
): Promise<{ sectionsWithBeats: string[] }> {
  const { sections, cast, scriptKind } = inputs;

  try {
    const sectionsWithBeats: string[] = [];
    const parsedSections = sections.map(s => JSON.parse(s));
    const parsedCast = cast.map(c => JSON.parse(c));

    for (const section of parsedSections) {
      if (section.type === 'scene') {
        // Generate beats for scene sections
        const sceneSection = section as any; // SceneSection
        
        const prompt = `Generate detailed script beats for this scene:

Scene: ${sceneSection.heading.prefix} ${sceneSection.heading.location} - ${sceneSection.heading.timeOfDay}
Synopsis: ${sceneSection.synopsis}
Script Kind: ${scriptKind}

Available Characters:
${parsedCast.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Generate a sequence of script elements (beats) as a JSON array. Each beat should be one of these types:

1. ActionElement: {"id": "action_X", "type": "action", "text": "description of action"}
2. DialogueElement: {"id": "dialogue_X", "type": "dialogue", "characterId": "char_X", "characterName": "CHARACTER NAME", "modifiers": [], "lines": ["dialogue text"]}
3. ParentheticalElement: {"id": "paren_X", "type": "parenthetical", "text": "(stage direction)"}
4. ShotElement: {"id": "shot_X", "type": "shot", "text": "WIDE SHOT" or "CLOSE UP" etc}
5. TransitionElement: {"id": "trans_X", "type": "transition", "text": "FADE IN:" or "CUT TO:" etc}
6. NoteElement: {"id": "note_X", "type": "note", "text": "production note"}
7. SfxElement: {"id": "sfx_X", "type": "sfx", "text": "sound effect description"}

Rules:
- Include ShotElement entries for camera angles/shots (needed for previs)
- For narrative scripts (not commercials), include dialogue
- Use proper character IDs from the cast list
- Character names in dialogue should be UPPERCASE
- Create a natural flow of action, shots, and dialogue
- Include 8-15 beats per scene depending on complexity
- Start scenes with establishing shots when appropriate

Return ONLY the JSON array of beats.`;

        const beatsResponse = await context.llm.generateJSON(prompt);
        let beats = Array.isArray(beatsResponse) ? beatsResponse : [];

        // Ensure we have some beats
        if (beats.length === 0) {
          context.log(`No beats generated for scene ${sceneSection.id}, creating default beats`);
          beats = [
            {
              id: `shot_${sceneSection.id}_1`,
              type: "shot",
              text: "ESTABLISHING SHOT"
            },
            {
              id: `action_${sceneSection.id}_1`,
              type: "action",
              text: sceneSection.synopsis || "Scene action takes place."
            }
          ];
        }

        // Ensure dialogue exists for narrative kinds (not commercials)
        const isNarrativeKind = ['tv-episode', 'tv-pilot', 'feature-film', 'short-film'].includes(scriptKind);
        if (isNarrativeKind) {
          const hasDialogue = beats.some(beat => beat.type === 'dialogue');
          if (!hasDialogue && parsedCast.length > 0) {
            // Add a simple dialogue beat
            const character = parsedCast[0];
            beats.push({
              id: `dialogue_${sceneSection.id}_1`,
              type: "dialogue",
              characterId: character.id,
              characterName: character.name,
              modifiers: [],
              lines: ["We need to move forward with the plan."]
            });
          }
        }

        // Ensure we have at least one shot element for previs
        const hasShot = beats.some(beat => beat.type === 'shot');
        if (!hasShot) {
          beats.unshift({
            id: `shot_${sceneSection.id}_establishing`,
            type: "shot",
            text: "WIDE SHOT"
          });
        }

        // Add beats to the scene section
        sceneSection.beats = beats;
        sectionsWithBeats.push(JSON.stringify(sceneSection));
      } else {
        // Non-scene sections (acts, etc.) pass through unchanged
        sectionsWithBeats.push(JSON.stringify(section));
      }
    }

    context.log(`Generated beats for ${sectionsWithBeats.length} sections`);
    return { sectionsWithBeats };

  } catch (error) {
    context.log(`Error generating scene beats: ${error}`);
    // Return sections unchanged if there's an error
    return { sectionsWithBeats: sections };
  }
}