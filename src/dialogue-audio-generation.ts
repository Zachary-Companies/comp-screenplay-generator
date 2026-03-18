/// <reference path="../woodbury.d.ts" />

/**
 * Dialogue Audio Generation Node
 * 
 * Generates audio files for all dialogue elements using ElevenLabs TTS.
 * Uses voice bindings to match characters to their assigned voices.
 * Saves generated audio files to the Woodbury asset library.
 *
 * @input elements: object[] - Script elements (includes dialogue elements)
 * @input characters: object[] - Character definitions
 * @input metadata: object - Script metadata (for collection naming)
 * @input assetCollection: object - Existing asset collection to add audio to
 * @output dialogueAudio: object[] - Array of dialogue audio assets with file paths
 * @output updatedAssetCollection: object - Asset collection with audio assets added
 */
export async function execute(
  inputs: { elements: any[]; characters: any[]; metadata: any; assetCollection: any },
  context: ScriptContext,
): Promise<{ dialogueAudio: object[]; updatedAssetCollection: object }> {
  const { elements, characters, metadata, assetCollection } = inputs;

  try {
    // Parse input data (handle both string and object inputs)
    const scriptElements = Array.isArray(elements)
      ? elements.map(elem => typeof elem === 'string' ? JSON.parse(elem) : elem)
      : [];
    const characterDefs = Array.isArray(characters)
      ? characters.map(char => typeof char === 'string' ? JSON.parse(char) : char)
      : [];
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const existingCollection = typeof assetCollection === 'string' 
      ? JSON.parse(assetCollection) 
      : assetCollection || {};

    // Filter to only dialogue elements
    const dialogueElements = scriptElements.filter(elem => elem.type === 'dialogue');
    context.log('Found ' + dialogueElements.length + ' dialogue elements to process');

    if (dialogueElements.length === 0) {
      context.log('No dialogue elements found, skipping audio generation');
      return { 
        dialogueAudio: [], 
        updatedAssetCollection: existingCollection 
      };
    }

    // Build character ID to voice ID mapping from bindings
    // Voice bindings are stored as: character → voice (target is the voice ID)
    const characterVoiceMap = new Map<string, string>();
    
    // Try to load voice bindings from the pipeline bindings
    try {
      // The bindings are available via the pipeline context
      // We'll look for voice bindings in the format: character:id → voice:voiceId
      const bindingsResponse = await context.tools.asset_list?.({ 
        tags: ['voice-binding'],
        limit: 100 
      }).catch(() => null);
      
      // If we can't get bindings from assets, we'll use a fallback approach
      // by checking if characters have voiceId properties
      for (const char of characterDefs) {
        if (char.voiceId) {
          characterVoiceMap.set(char.id, char.voiceId);
          characterVoiceMap.set(char.name?.toLowerCase(), char.voiceId);
        }
      }
    } catch (e) {
      context.log('Could not load voice bindings from assets, using character voiceId properties');
    }

    // If no voice mappings found, try to get available voices and assign defaults
    if (characterVoiceMap.size === 0) {
      context.log('No voice bindings found, attempting to list available voices');
      try {
        const voicesResult = await context.tools.tts_voices?.({});
        if (voicesResult?.voices && Array.isArray(voicesResult.voices)) {
          const availableVoices = voicesResult.voices;
          context.log('Found ' + availableVoices.length + ' available voices');
          
          // Assign voices to characters based on gender/characteristics if possible
          for (let i = 0; i < characterDefs.length; i++) {
            const char = characterDefs[i];
            // Try to match voice by gender or just cycle through available voices
            let matchedVoice = availableVoices.find((v: any) => {
              const charGender = char.gender?.toLowerCase();
              const voiceLabels = v.labels || {};
              return charGender && voiceLabels.gender?.toLowerCase() === charGender;
            });
            
            if (!matchedVoice && availableVoices.length > 0) {
              // Fallback: cycle through voices
              matchedVoice = availableVoices[i % availableVoices.length];
            }
            
            if (matchedVoice) {
              characterVoiceMap.set(char.id, matchedVoice.voice_id);
              characterVoiceMap.set(char.name?.toLowerCase(), matchedVoice.voice_id);
              context.log('Assigned voice "' + matchedVoice.name + '" to character "' + char.name + '"');
            }
          }
        }
      } catch (e: any) {
        context.log('Could not list voices: ' + e.message);
      }
    }

    // Get or create collection for audio assets
    const collectionSlug = existingCollection.slug || existingCollection.libraryCollectionSlug;
    const collectionName = existingCollection.name || (scriptMetadata.title + ' Assets');

    // Generate audio for each dialogue element
    const dialogueAudio: any[] = [];
    const savedAssetIds: string[] = [...(existingCollection.savedAssetIds || [])];
    
    context.progress.start(dialogueElements.length, 'Generating dialogue audio');

    for (let i = 0; i < dialogueElements.length; i++) {
      const dialogue = dialogueElements[i];
      const characterId = dialogue.characterId;
      const characterName = dialogue.characterName || 'Unknown';
      
      // Get the dialogue text
      const dialogueText = Array.isArray(dialogue.lines) 
        ? dialogue.lines.join(' ') 
        : (dialogue.content || dialogue.text || '');
      
      if (!dialogueText.trim()) {
        context.log('Skipping empty dialogue for ' + characterName);
        context.progress.increment();
        continue;
      }

      // Look up voice ID for this character
      let voiceId = characterVoiceMap.get(characterId) || 
                    characterVoiceMap.get(characterName?.toLowerCase());
      
      if (!voiceId) {
        context.log('No voice assigned for character "' + characterName + '", skipping');
        context.progress.increment();
        continue;
      }

      context.log('Generating audio for ' + characterName + ': "' + dialogueText.substring(0, 50) + '..."');

      try {
        // Generate audio using ElevenLabs TTS
        const audioResult = await context.tools.tts_speak({
          text: dialogueText,
          voice_id: voiceId,
          model: 'eleven_multilingual_v2', // High quality model
          output_format: 'mp3_44100_128'
        });

        if (audioResult?.file_path || audioResult?.filePath) {
          const audioPath = audioResult.file_path || audioResult.filePath;
          
          // Save to asset library
          const assetName = 'Dialogue: ' + characterName + ' - ' + dialogue.id;
          const truncatedText = dialogueText.substring(0, 100) + (dialogueText.length > 100 ? '...' : '');
          const assetDescription = 'Dialogue audio for ' + characterName + ': "' + truncatedText + '"';
          
          try {
            const saveResult = await context.tools.asset_save({
              name: assetName,
              file_path: audioPath,
              description: assetDescription,
              tags: ['dialogue', 'audio', 'tts', characterName.toLowerCase(), dialogue.id],
              collection: collectionSlug || undefined
            });
            
            const savedId = saveResult?.asset?.id || saveResult?.id || saveResult?.asset_id;
            if (savedId) {
              savedAssetIds.push(savedId);
              context.log('Saved dialogue audio asset with ID: ' + savedId);
            }
            
            dialogueAudio.push({
              id: savedId || ('audio_' + dialogue.id),
              type: 'dialogue-audio',
              name: assetName,
              description: assetDescription,
              filePath: audioPath,
              libraryId: savedId,
              collectionSlug: collectionSlug,
              metadata: {
                dialogueElementId: dialogue.id,
                characterId: characterId,
                characterName: characterName,
                voiceId: voiceId,
                text: dialogueText,
                duration: audioResult.duration || null
              }
            });
          } catch (saveErr: any) {
            context.log('Warning: Could not save audio to library: ' + saveErr.message);
            // Still track the audio even if library save failed
            dialogueAudio.push({
              id: 'audio_' + dialogue.id,
              type: 'dialogue-audio',
              name: assetName,
              description: assetDescription,
              filePath: audioPath,
              metadata: {
                dialogueElementId: dialogue.id,
                characterId: characterId,
                characterName: characterName,
                voiceId: voiceId,
                text: dialogueText
              }
            });
          }
        } else {
          context.log('TTS generation did not return a file path for dialogue ' + dialogue.id);
        }
      } catch (ttsErr: any) {
        context.log('Error generating audio for ' + characterName + ': ' + ttsErr.message);
      }

      context.progress.increment();
    }

    context.progress.complete('Dialogue audio generation complete');

    // Build updated asset collection
    const updatedAssetCollection = {
      ...existingCollection,
      savedAssetIds: savedAssetIds,
      assets: [
        ...(existingCollection.assets || []),
        ...dialogueAudio
      ]
    };

    context.log('Generated ' + dialogueAudio.length + ' dialogue audio files');
    context.log('Total assets in collection: ' + updatedAssetCollection.assets.length);

    return { dialogueAudio, updatedAssetCollection };

  } catch (error: any) {
    context.log('Error in dialogue audio generation: ' + error.message);
    return { 
      dialogueAudio: [], 
      updatedAssetCollection: assetCollection || {} 
    };
  }
}
