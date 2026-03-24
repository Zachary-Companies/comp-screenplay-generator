/// <reference path="../woodbury.d.ts" />

/**
 * Voice Assignment Node
 *
 * Fetches available ElevenLabs TTS voices and assigns them to characters
 * based on gender matching. Persists voiceId and voiceName onto each
 * character object so downstream nodes (dialogue-audio-generation) can
 * use them directly.
 *
 * @input characters: object[] - Character definitions from character-generation node
 * @output characters: object[] - Characters with voiceId and voiceName assigned
 */
export async function execute(
  inputs: { characters: any[] },
  context: ScriptContext,
): Promise<{ characters: object[] }> {
  const { characters } = inputs;

  // Parse input (handle both string and object inputs)
  const characterDefs: any[] = Array.isArray(characters)
    ? characters.map(c => (typeof c === 'string' ? JSON.parse(c) : c))
    : [];

  if (characterDefs.length === 0) {
    context.log('No characters provided, nothing to assign');
    return { characters: [] };
  }

  context.log('Assigning voices to ' + characterDefs.length + ' characters');

  // Fetch available TTS voices
  let availableVoices: any[] = [];
  try {
    const voicesResult = await (context.tools as any).tts_voices({});
    if (voicesResult?.voices && Array.isArray(voicesResult.voices)) {
      availableVoices = voicesResult.voices;
      context.log('Found ' + availableVoices.length + ' available TTS voices');
    } else {
      context.log('tts_voices returned no voices array');
      return { characters: characterDefs };
    }
  } catch (err: any) {
    context.log('Failed to fetch TTS voices: ' + err.message);
    return { characters: characterDefs };
  }

  if (availableVoices.length === 0) {
    context.log('No voices available, skipping assignment');
    return { characters: characterDefs };
  }

  // Bucket voices by gender
  const maleVoices = availableVoices.filter(
    (v: any) => v.labels?.gender?.toLowerCase() === 'male',
  );
  const femaleVoices = availableVoices.filter(
    (v: any) => v.labels?.gender?.toLowerCase() === 'female',
  );
  const neutralVoices = availableVoices.filter((v: any) => {
    const g = v.labels?.gender?.toLowerCase();
    return !g || (g !== 'male' && g !== 'female');
  });

  context.log(
    'Voice pool — male: ' + maleVoices.length +
    ', female: ' + femaleVoices.length +
    ', neutral: ' + neutralVoices.length,
  );

  // Track per-bucket index so each character gets a unique voice when possible
  let maleIdx = 0;
  let femaleIdx = 0;
  let neutralIdx = 0;
  let fallbackIdx = 0;

  const updatedCharacters = characterDefs.map(char => {
    // Skip if a voice is already assigned
    if (char.voiceId) {
      context.log('Character ' + char.name + ' already has voice ' + (char.voiceName || char.voiceId));
      return char;
    }

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
      voice = availableVoices[fallbackIdx % availableVoices.length];
      fallbackIdx++;
    }

    if (voice) {
      context.log(
        'Assigned voice "' + voice.name + '" (' + voice.voice_id + ') to ' +
        char.name + ' (' + (char.gender || 'unspecified') + ')',
      );
      return {
        ...char,
        voiceId: voice.voice_id,
        voiceName: voice.name,
      };
    }

    context.log('No voice available for ' + char.name);
    return char;
  });

  const assignedCount = updatedCharacters.filter((c: any) => c.voiceId).length;
  context.log('Voice assignment complete: ' + assignedCount + '/' + updatedCharacters.length + ' characters assigned');

  return { characters: updatedCharacters };
}
