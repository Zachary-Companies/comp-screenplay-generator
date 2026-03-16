/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptKind: string - Script type
 * @input genre: string - Script genre
 * @input logline: string - Script premise
 * @input metadata: string - Script metadata
 * @output cast: string[] - Array of CharacterDefinition objects
 */
export async function execute(
  inputs: { scriptKind: string; genre: string; logline: string; metadata: string },
  context: ScriptContext,
): Promise<{ cast: string[] }> {
  const { scriptKind, genre, logline, metadata } = inputs;

  try {
    // Parse metadata to get additional context
    let parsedMetadata: any = {};
    try {
      parsedMetadata = JSON.parse(metadata);
    } catch (e) {
      context.log('Could not parse metadata, using defaults');
    }

    const tone = parsedMetadata.tone || [];
    const audience = parsedMetadata.audience || [];

    // Determine cast size based on script kind
    let castSizeGuidance = '';
    switch (scriptKind) {
      case 'commercial':
        castSizeGuidance = 'Generate 1-3 characters maximum. Keep it minimal for commercial format.';
        break;
      case 'feature-film':
        castSizeGuidance = 'Generate 5-15 characters including protagonist, antagonist, supporting characters, and minor roles.';
        break;
      case 'tv-episode':
      case 'tv-pilot':
        castSizeGuidance = 'Generate 4-10 characters including recurring series characters and guest characters for this episode.';
        break;
      case 'short-film':
        castSizeGuidance = 'Generate 2-6 characters. Keep focused for short film format.';
        break;
      default:
        castSizeGuidance = 'Generate 3-8 characters appropriate for the story.';
    }

    const prompt = `Generate a cast of characters for a ${scriptKind} in the ${genre} genre.

Logline: ${logline}

Tone: ${tone.join(', ') || 'Not specified'}
Audience: ${audience.join(', ') || 'General'}

${castSizeGuidance}

For each character, provide:
- id: Use format "char_" followed by lowercase name with underscores (e.g., "char_john_doe")
- name: Character name in UPPERCASE (e.g., "JOHN DOE")
- displayName: Friendly display name (e.g., "John Doe")
- ageRange: Age range like "25-35" or specific age like "42"
- gender: "male", "female", "non-binary", or "unspecified"
- description: 2-3 sentence character description including personality, role in story, and key traits
- voiceDescription: How the character speaks (accent, tone, speech patterns)
- wardrobeNotes: Brief description of typical clothing/appearance
- aliases: Array of alternative names or nicknames (can be empty array)

Return a valid JSON array of CharacterDefinition objects. Ensure each character serves a clear purpose in the story and has distinct personality traits.

Example format:
[
  {
    "id": "char_sarah_chen",
    "name": "SARAH CHEN",
    "displayName": "Sarah Chen",
    "ageRange": "28-32",
    "gender": "female",
    "description": "A determined investigative journalist who never backs down from a story. Sarah is methodical and fearless, often putting herself in danger to uncover the truth. She has a dry sense of humor that helps her cope with the darker aspects of her work.",
    "voiceDescription": "Speaks with confidence and precision, slight urban accent, tends to ask probing questions",
    "wardrobeNotes": "Professional but practical - blazers, dark jeans, comfortable shoes for chasing leads",
    "aliases": ["Chen", "Sarah"]
  }
]`;

    context.log(`Generating cast for ${scriptKind} in ${genre} genre`);
    
    const response = await context.llm.generateJSON(prompt, {
      temperature: 0.8,
      maxTokens: 2000
    });

    let cast: any[] = [];
    
    if (Array.isArray(response)) {
      cast = response;
    } else if (response && typeof response === 'object' && response.characters) {
      cast = response.characters;
    } else if (response && typeof response === 'object' && response.cast) {
      cast = response.cast;
    } else {
      throw new Error('LLM response was not in expected format');
    }

    // Validate and clean up the cast
    const validatedCast = cast.map((character: any, index: number) => {
      // Ensure required fields exist
      if (!character.id) {
        character.id = `char_character_${index + 1}`;
      }
      if (!character.name) {
        character.name = character.displayName?.toUpperCase() || `CHARACTER ${index + 1}`;
      }
      if (!character.displayName) {
        character.displayName = character.name || `Character ${index + 1}`;
      }
      if (!character.ageRange) {
        character.ageRange = '25-35';
      }
      if (!character.gender) {
        character.gender = 'unspecified';
      }
      if (!character.description) {
        character.description = 'A character in the story.';
      }
      if (!character.voiceDescription) {
        character.voiceDescription = 'Standard speaking voice.';
      }
      if (!character.wardrobeNotes) {
        character.wardrobeNotes = 'Appropriate attire for the character.';
      }
      if (!character.aliases || !Array.isArray(character.aliases)) {
        character.aliases = [];
      }

      return character;
    });

    context.log(`Generated ${validatedCast.length} characters`);

    // Convert to string array as expected by output type
    const castStrings = validatedCast.map(character => JSON.stringify(character));

    return { cast: castStrings };

  } catch (error) {
    context.log(`Error generating cast: ${error.message}`);
    
    // Return minimal fallback cast
    const fallbackCast = [{
      id: 'char_protagonist',
      name: 'PROTAGONIST',
      displayName: 'Protagonist',
      ageRange: '25-35',
      gender: 'unspecified',
      description: 'The main character of the story.',
      voiceDescription: 'Clear, expressive speaking voice.',
      wardrobeNotes: 'Appropriate attire for the story setting.',
      aliases: []
    }];

    return { cast: fallbackCast.map(c => JSON.stringify(c)) };
  }
}