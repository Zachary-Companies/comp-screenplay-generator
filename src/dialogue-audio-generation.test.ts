import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from './_test-helpers';

describe('dialogue-audio-generation', () => {
  it('should generate audio for dialogue elements with voice bindings', async () => {
    const ttsSpeakMock = vi.fn().mockResolvedValue({
      file_path: '/tmp/dialogue_audio_1.mp3',
      duration: 2.5
    });
    
    const assetSaveMock = vi.fn().mockResolvedValue({
      asset: { id: 'saved-audio-123' }
    });

    const { context, logs } = createMockContext({
      tools: {
        tts_speak: ttsSpeakMock,
        asset_save: assetSaveMock,
        asset_list: vi.fn().mockResolvedValue({ assets: [] })
      }
    });

    const { execute } = await import('./dialogue-audio-generation.js');
    
    const inputs = {
      elements: [
        {
          id: 'element_5',
          type: 'dialogue',
          characterId: 'char-1',
          characterName: 'MARCUS',
          lines: ['Hello, how are you?', 'I hope you are well.'],
          content: 'Hello, how are you? I hope you are well.'
        },
        {
          id: 'element_10',
          type: 'action',
          content: 'Marcus walks across the room.'
        }
      ],
      characters: [
        {
          id: 'char-1',
          name: 'Marcus',
          gender: 'male',
          voiceId: 'voice-abc-123'
        }
      ],
      metadata: {
        title: 'Test Script'
      },
      assetCollection: {
        id: 'collection-1',
        slug: 'test-script-assets',
        assets: [],
        savedAssetIds: []
      }
    };

    const result = await execute(inputs, context);

    // Should have generated audio for the dialogue element
    expect(result.dialogueAudio).toHaveLength(1);
    expect(result.dialogueAudio[0].type).toBe('dialogue-audio');
    expect(result.dialogueAudio[0].metadata.characterName).toBe('MARCUS');
    expect(result.dialogueAudio[0].metadata.voiceId).toBe('voice-abc-123');
    
    // Should have called tts_speak with correct params
    expect(ttsSpeakMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello, how are you? I hope you are well.',
        voice_id: 'voice-abc-123'
      })
    );
    
    // Should have saved to asset library
    expect(assetSaveMock).toHaveBeenCalled();
    
    // Updated collection should include the new audio
    expect(result.updatedAssetCollection.assets).toHaveLength(1);
    expect(result.updatedAssetCollection.savedAssetIds).toContain('saved-audio-123');
  });

  it('should skip dialogue elements without voice assignments', async () => {
    const ttsSpeakMock = vi.fn();
    const ttsVoicesMock = vi.fn().mockResolvedValue({ voices: [] });

    const { context, logs } = createMockContext({
      tools: {
        tts_speak: ttsSpeakMock,
        tts_voices: ttsVoicesMock,
        asset_list: vi.fn().mockResolvedValue({ assets: [] })
      }
    });

    const { execute } = await import('./dialogue-audio-generation.js');
    
    const inputs = {
      elements: [
        {
          id: 'element_5',
          type: 'dialogue',
          characterId: 'char-1',
          characterName: 'UNKNOWN_CHARACTER',
          lines: ['Hello!']
        }
      ],
      characters: [
        {
          id: 'char-1',
          name: 'Unknown Character'
          // No voiceId
        }
      ],
      metadata: { title: 'Test' },
      assetCollection: { assets: [], savedAssetIds: [] }
    };

    const result = await execute(inputs, context);

    // Should not have generated any audio
    expect(result.dialogueAudio).toHaveLength(0);
    expect(ttsSpeakMock).not.toHaveBeenCalled();
  });

  it('should return empty array when no dialogue elements exist', async () => {
    const { context, logs } = createMockContext();

    const { execute } = await import('./dialogue-audio-generation.js');
    
    const inputs = {
      elements: [
        { id: 'element_1', type: 'action', content: 'Scene opens.' },
        { id: 'element_2', type: 'shot', shotText: 'WIDE SHOT' }
      ],
      characters: [],
      metadata: { title: 'Test' },
      assetCollection: { assets: [], savedAssetIds: [] }
    };

    const result = await execute(inputs, context);

    expect(result.dialogueAudio).toHaveLength(0);
  });

  it('should handle TTS errors gracefully', async () => {
    const ttsSpeakMock = vi.fn().mockRejectedValue(new Error('TTS API error'));

    const { context, logs } = createMockContext({
      tools: {
        tts_speak: ttsSpeakMock,
        asset_list: vi.fn().mockResolvedValue({ assets: [] })
      }
    });

    const { execute } = await import('./dialogue-audio-generation.js');
    
    const inputs = {
      elements: [
        {
          id: 'element_5',
          type: 'dialogue',
          characterId: 'char-1',
          characterName: 'MARCUS',
          lines: ['Hello!']
        }
      ],
      characters: [
        { id: 'char-1', name: 'Marcus', voiceId: 'voice-123' }
      ],
      metadata: { title: 'Test' },
      assetCollection: { assets: [], savedAssetIds: [] }
    };

    const result = await execute(inputs, context);

    // Should handle error gracefully and return empty audio
    expect(result.dialogueAudio).toHaveLength(0);
    expect(logs.some(log => log.includes('Error generating audio'))).toBe(true);
  });

  it('should try to auto-assign voices when no voiceId on characters', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue({
      voices: [
        { voice_id: 'auto-voice-1', name: 'Adam', labels: { gender: 'male' } },
        { voice_id: 'auto-voice-2', name: 'Eve', labels: { gender: 'female' } }
      ]
    });
    
    const ttsSpeakMock = vi.fn().mockResolvedValue({
      file_path: '/tmp/audio.mp3'
    });
    
    const assetSaveMock = vi.fn().mockResolvedValue({
      asset: { id: 'saved-1' }
    });

    const { context, logs } = createMockContext({
      tools: {
        tts_voices: ttsVoicesMock,
        tts_speak: ttsSpeakMock,
        asset_save: assetSaveMock,
        asset_list: vi.fn().mockResolvedValue({ assets: [] })
      }
    });

    const { execute } = await import('./dialogue-audio-generation.js');
    
    const inputs = {
      elements: [
        {
          id: 'element_5',
          type: 'dialogue',
          characterId: 'char-1',
          characterName: 'JOHN',
          lines: ['Hello!']
        }
      ],
      characters: [
        { id: 'char-1', name: 'John', gender: 'male' }
        // No voiceId - should auto-assign based on gender
      ],
      metadata: { title: 'Test' },
      assetCollection: { assets: [], savedAssetIds: [] }
    };

    const result = await execute(inputs, context);

    // Should have auto-assigned a male voice and generated audio
    expect(ttsVoicesMock).toHaveBeenCalled();
    expect(ttsSpeakMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_id: 'auto-voice-1' // Male voice
      })
    );
    expect(result.dialogueAudio).toHaveLength(1);
  });
});
