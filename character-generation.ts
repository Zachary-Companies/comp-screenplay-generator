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
