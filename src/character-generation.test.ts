import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const mockCharacters = [
  {
    id: 'david-chen',
    name: 'David Chen',
    displayName: 'DAVID',
    ageRange: '38-42',
    gender: 'Male',
    description: 'A gentle software engineer.',
    voiceDescription: 'Speaks with a calm, measured pace.',
    wardrobeNotes: 'Casual button-down shirts.',
    aliases: []
  },
  {
    id: 'sarah-chen',
    name: 'Sarah Chen',
    displayName: 'SARAH',
    ageRange: '35-39',
    gender: 'Female',
    description: 'A devoted wife and mother.',
    voiceDescription: 'Speaks with emotional intelligence.',
    wardrobeNotes: 'Comfortable but stylish clothing.',
    aliases: []
  }
];

describe('Character Generation', () => {
  it('should export an execute function', async () => {
    const { execute } = await import('./character-generation.js');
    expect(typeof execute).toBe('function');
  });

  it('should return all declared output keys', async () => {
    const { context } = createMockContext({
      llmGenerateJSON: mockCharacters
    });
    const { execute } = await import('./character-generation.js');
    const result = await execute({
      validatedInput: { kind: 'short-film', genre: ['Drama'], tone: ['emotional'], audience: ['Adults'] },
      metadata: { title: 'Test', logline: 'A test film', runtimeMinutes: 15 },
    }, context);

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('characters');
  });

  it('should handle empty inputs without throwing', async () => {
    const { context } = createMockContext({
      llmGenerateJSON: mockCharacters
    });
    const { execute } = await import('./character-generation.js');
    await expect(execute({}, context)).resolves.toBeDefined();
  });

  it('should auto-assign voices when tts_voices is available', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue({
      voices: [
        { voice_id: 'male-voice-1', name: 'Adam', labels: { gender: 'male' } },
        { voice_id: 'female-voice-1', name: 'Eve', labels: { gender: 'female' } },
        { voice_id: 'male-voice-2', name: 'Bob', labels: { gender: 'male' } },
      ]
    });

    const { context, logs } = createMockContext({
      llmGenerateJSON: mockCharacters,
      tools: {
        tts_voices: ttsVoicesMock
      }
    });

    const { execute } = await import('./character-generation.js');
    const result = await execute({
      validatedInput: { kind: 'short-film', genre: ['Drama'], tone: ['emotional'], audience: ['Adults'] },
      metadata: { title: 'Test', logline: 'A test', runtimeMinutes: 15 },
    }, context);

    expect(ttsVoicesMock).toHaveBeenCalled();

    // David (Male) should get a male voice
    const david = result.characters.find((c: any) => c.name === 'David Chen') as any;
    expect(david.voiceId).toBe('male-voice-1');
    expect(david.voiceName).toBe('Adam');

    // Sarah (Female) should get a female voice
    const sarah = result.characters.find((c: any) => c.name === 'Sarah Chen') as any;
    expect(sarah.voiceId).toBe('female-voice-1');
    expect(sarah.voiceName).toBe('Eve');

    // Should log the assignments
    expect(logs.some(l => l.includes('Assigned voice "Adam"'))).toBe(true);
    expect(logs.some(l => l.includes('Assigned voice "Eve"'))).toBe(true);
  });

  it('should gracefully skip voice assignment when tts_voices fails', async () => {
    const ttsVoicesMock = vi.fn().mockRejectedValue(new Error('TTS not available'));

    const { context, logs } = createMockContext({
      llmGenerateJSON: mockCharacters,
      tools: {
        tts_voices: ttsVoicesMock
      }
    });

    const { execute } = await import('./character-generation.js');
    const result = await execute({
      validatedInput: { kind: 'short-film', genre: ['Drama'], tone: ['emotional'], audience: ['Adults'] },
      metadata: { title: 'Test', logline: 'A test', runtimeMinutes: 15 },
    }, context);

    // Characters should still be generated, just without voiceId
    expect(result.characters.length).toBeGreaterThan(0);
    expect(logs.some(l => l.includes('Voice assignment skipped'))).toBe(true);
  });

  it('should handle no available voices gracefully', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue({ voices: [] });

    const { context, logs } = createMockContext({
      llmGenerateJSON: mockCharacters,
      tools: {
        tts_voices: ttsVoicesMock
      }
    });

    const { execute } = await import('./character-generation.js');
    const result = await execute({
      validatedInput: { kind: 'short-film', genre: ['Drama'] },
      metadata: { title: 'Test', logline: 'A test', runtimeMinutes: 15 },
    }, context);

    expect(result.characters.length).toBeGreaterThan(0);
    // No voices to assign, but no error either
    const noVoiceAssigned = result.characters.every((c: any) => !c.voiceId);
    expect(noVoiceAssigned).toBe(true);
  });
});
