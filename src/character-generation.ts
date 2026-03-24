/// <reference path="./woodbury.d.ts" />

/**
 * @input validatedInput: object - Validated script input
 * @input metadata: object - Script metadata
 * @output characters: object[] - Array of CharacterDefinition objects
 */
export async function execute(
  inputs: { validatedInput: any; metadata: any },
  context: ScriptContext,
): Promise<{ characters: object[] }> {
  const { validatedInput, metadata } = inputs;

  try {
    // Parse inputs (handle both string and object inputs)
    const scriptInput = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

    context.log(`Generating characters for ${scriptMetadata.title} (${scriptInput.kind})`);

    // Determine character count based on script kind and runtime
    let targetCharacterCount = 3; // default
    const runtime = scriptMetadata.runtimeMinutes || 30;

    switch (scriptInput.kind) {
      case 'commercial':
        targetCharacterCount = Math.min(2, Math.max(1, Math.floor(runtime / 15)));
        break;
      case 'short-film':
        targetCharacterCount = Math.min(4, Math.max(2, Math.floor(runtime / 5)));
        break;
      case 'tv-episode':
        targetCharacterCount = Math.min(8, Math.max(3, Math.floor(runtime / 10)));
        break;
      case 'tv-pilot':
        targetCharacterCount = Math.min(10, Math.max(4, Math.floor(runtime / 8)));
        break;
      case 'feature-film':
        targetCharacterCount = Math.min(12, Math.max(5, Math.floor(runtime / 15)));
        break;
      case 'youtube-short':
        targetCharacterCount = Math.min(2, Math.max(1, 1));
        break;
      case 'youtube-video':
        targetCharacterCount = Math.min(4, Math.max(1, Math.floor(runtime / 5)));
        break;
    }

    // Build character generation prompt
    const genreList = Array.isArray(scriptInput.genre) ? scriptInput.genre.join(', ') : (scriptInput.genre || 'drama');
    const toneList = Array.isArray(scriptInput.tone) ? scriptInput.tone.join(', ') : (scriptInput.tone || 'neutral');
    const audienceList = Array.isArray(scriptInput.audience) ? scriptInput.audience.join(', ') : (scriptInput.audience || 'general');

    const characterPrompt = `Generate ${targetCharacterCount} characters for a ${scriptInput.kind} titled "${scriptMetadata.title}".

Script Details:
- Logline: ${scriptMetadata.logline}
- Genre: ${genreList}
- Tone: ${toneList}
- Audience: ${audienceList}
- Runtime: ${runtime} minutes
- Theme: ${scriptInput.theme || 'Not specified'}
- Setting: ${scriptInput.setting || 'Not specified'}

For each character, provide:
- id: unique kebab-case identifier
- name: full character name
- displayName: name as it appears in dialogue headers
- ageRange: age range like "25-35" or specific age like "42"
- gender: character's gender
- description: 2-3 sentence physical and personality description
- voiceDescription: how they speak (accent, pace, vocabulary, etc.)
- wardrobeNotes: typical clothing/costume notes
- aliases: array of alternative names/nicknames (can be empty)

Ensure characters are:
- Diverse and well-rounded
- Appropriate for the genre, tone, and audience
- Suitable for the story's theme and setting
- Include at least one main protagonist
- Include speaking roles for dialogue-heavy formats

Return as a JSON array of character objects.`;

    context.log('Generating characters with LLM...');
    const charactersResponse = await context.llm.generateJSON(characterPrompt);

    // Validate and normalize character data
    const characters = Array.isArray(charactersResponse) ? charactersResponse : [charactersResponse];

    const normalizedCharacters = characters.map((char, index) => {
      // Ensure required fields with defaults
      const normalizedChar = {
        id: char.id || `character-${index + 1}`,
        name: char.name || `Character ${index + 1}`,
        displayName: char.displayName || char.name || `Character ${index + 1}`,
        ageRange: char.ageRange || '25-35',
        gender: char.gender || 'unspecified',
        description: char.description || 'A character in the story.',
        voiceDescription: char.voiceDescription || 'Speaks in a natural, conversational tone.',
        wardrobeNotes: char.wardrobeNotes || 'Casual, contemporary clothing.',
        aliases: Array.isArray(char.aliases) ? char.aliases : []
      };

      // Ensure id is kebab-case
      normalizedChar.id = normalizedChar.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      return normalizedChar;
    });

    context.log(`Generated ${normalizedCharacters.length} characters`);

    // Auto-assign ElevenLabs voices to characters
    try {
      const voicesResult = await (context.tools as any).tts_voices?.({});
      if (voicesResult?.voices && Array.isArray(voicesResult.voices)) {
        const availableVoices = voicesResult.voices;
        context.log(`Found ${availableVoices.length} available TTS voices, auto-assigning...`);

        // Separate voices by gender for better matching
        const maleVoices = availableVoices.filter((v: any) =>
          v.labels?.gender?.toLowerCase() === 'male');
        const femaleVoices = availableVoices.filter((v: any) =>
          v.labels?.gender?.toLowerCase() === 'female');
        const neutralVoices = availableVoices.filter((v: any) => {
          const g = v.labels?.gender?.toLowerCase();
          return !g || (g !== 'male' && g !== 'female');
        });

        let maleIdx = 0;
        let femaleIdx = 0;
        let neutralIdx = 0;

        for (const char of normalizedCharacters) {
          const gender = (char.gender || '').toLowerCase();
          let voice: any = null;

          if (gender === 'male' && maleVoices.length > 0) {
            voice = maleVoices[maleIdx % maleVoices.length];
            maleIdx++;
          } else if (gender === 'female' && femaleVoices.length > 0) {
            voice = femaleVoices[femaleIdx % femaleVoices.length];
            femaleIdx++;
          } else if (neutralVoices.length > 0) {
            voice = neutralVoices[neutralIdx % neutralVoices.length];
            neutralIdx++;
          } else if (availableVoices.length > 0) {
            // Fallback: cycle through all voices
            voice = availableVoices[(maleIdx + femaleIdx + neutralIdx) % availableVoices.length];
            neutralIdx++;
          }

          if (voice) {
            (char as any).voiceId = voice.voice_id;
            (char as any).voiceName = voice.name;
            context.log(`Assigned voice "${voice.name}" (${voice.voice_id}) to ${char.name} (${gender})`);
          }
        }
      } else {
        context.log('No TTS voices available, skipping voice assignment');
      }
    } catch (voiceErr: any) {
      context.log(`Voice assignment skipped (TTS not available): ${voiceErr.message}`);
    }

    return { characters: normalizedCharacters };

  } catch (error) {
    context.log(`Error generating characters: ${error.message}`);

    // Return minimal fallback characters
    const fallbackCharacters = [
      {
        id: 'protagonist',
        name: 'Main Character',
        displayName: 'MAIN CHARACTER',
        ageRange: '30-40',
        gender: 'unspecified',
        description: 'The main character of the story.',
        voiceDescription: 'Speaks clearly and confidently.',
        wardrobeNotes: 'Dressed appropriately for the setting.',
        aliases: []
      }
    ];

    return { characters: fallbackCharacters };
  }
}
