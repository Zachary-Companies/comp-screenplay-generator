import { describe, it, expect, vi } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const sampleVoices = {
  voices: [
    { voice_id: 'male-1', name: 'Adam', labels: { gender: 'male' } },
    { voice_id: 'male-2', name: 'Brian', labels: { gender: 'male' } },
    { voice_id: 'female-1', name: 'Clara', labels: { gender: 'female' } },
    { voice_id: 'female-2', name: 'Diana', labels: { gender: 'female' } },
    { voice_id: 'neutral-1', name: 'River', labels: { gender: 'neutral' } },
  ],
};

const sampleCharacters = [
  {
    id: 'marcus',
    name: 'Marcus Reed',
    displayName: 'MARCUS',
    gender: 'Male',
    description: 'A tough detective.',
  },
  {
    id: 'elena',
    name: 'Elena Voss',
    displayName: 'ELENA',
    gender: 'Female',
    description: 'A brilliant scientist.',
  },
  {
    id: 'jordan',
    name: 'Jordan Blake',
    displayName: 'JORDAN',
    gender: 'Non-binary',
    description: 'A resourceful hacker.',
  },
];

describe('Voice Assignment', () => {
  it('should export an execute function', async () => {
    const { execute } = await import('./voice-assignment.js');
    expect(typeof execute).toBe('function');
  });

  it('should return the characters output key', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: sampleCharacters }, context);
    expect(result).toHaveProperty('characters');
    expect(Array.isArray(result.characters)).toBe(true);
  });

  it('should assign male voices to male characters', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: sampleCharacters }, context);
    const marcus = result.characters.find((c: any) => c.id === 'marcus') as any;

    expect(marcus.voiceId).toBe('male-1');
    expect(marcus.voiceName).toBe('Adam');
  });

  it('should assign female voices to female characters', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: sampleCharacters }, context);
    const elena = result.characters.find((c: any) => c.id === 'elena') as any;

    expect(elena.voiceId).toBe('female-1');
    expect(elena.voiceName).toBe('Clara');
  });

  it('should assign neutral voices to non-binary characters', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: sampleCharacters }, context);
    const jordan = result.characters.find((c: any) => c.id === 'jordan') as any;

    expect(jordan.voiceId).toBe('neutral-1');
    expect(jordan.voiceName).toBe('River');
  });

  it('should cycle voices when more characters than voices of that gender', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const manyMales = [
      { id: 'a', name: 'A', gender: 'Male' },
      { id: 'b', name: 'B', gender: 'Male' },
      { id: 'c', name: 'C', gender: 'Male' },
    ];

    const result = await execute({ characters: manyMales }, context);
    const voices = result.characters.map((c: any) => c.voiceId);

    // Should cycle: male-1, male-2, male-1
    expect(voices).toEqual(['male-1', 'male-2', 'male-1']);
  });

  it('should skip characters that already have a voiceId', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context, logs } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const charsWithExisting = [
      { id: 'pre-assigned', name: 'Pre', gender: 'Male', voiceId: 'existing-id', voiceName: 'Existing' },
      { id: 'new-char', name: 'New', gender: 'Female' },
    ];

    const result = await execute({ characters: charsWithExisting }, context);

    const pre = result.characters.find((c: any) => c.id === 'pre-assigned') as any;
    expect(pre.voiceId).toBe('existing-id');
    expect(pre.voiceName).toBe('Existing');

    const newChar = result.characters.find((c: any) => c.id === 'new-char') as any;
    expect(newChar.voiceId).toBe('female-1');

    expect(logs.some(l => l.includes('already has voice'))).toBe(true);
  });

  it('should fall back to any voice when gender pool is empty', async () => {
    const onlyMaleVoices = {
      voices: [
        { voice_id: 'male-1', name: 'Adam', labels: { gender: 'male' } },
      ],
    };
    const ttsVoicesMock = vi.fn().mockResolvedValue(onlyMaleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const femaleChar = [{ id: 'f1', name: 'Fiona', gender: 'Female' }];
    const result = await execute({ characters: femaleChar }, context);

    // No female voices, no neutral voices — should fall back to the only available voice
    const fiona = result.characters[0] as any;
    expect(fiona.voiceId).toBe('male-1');
  });

  it('should handle empty characters array', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context, logs } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: [] }, context);

    expect(result.characters).toEqual([]);
    expect(ttsVoicesMock).not.toHaveBeenCalled();
    expect(logs.some(l => l.includes('No characters provided'))).toBe(true);
  });

  it('should return characters unchanged when tts_voices fails', async () => {
    const ttsVoicesMock = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    const { context, logs } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: sampleCharacters }, context);

    expect(result.characters.length).toBe(3);
    expect(result.characters.every((c: any) => !c.voiceId)).toBe(true);
    expect(logs.some(l => l.includes('Failed to fetch TTS voices'))).toBe(true);
  });

  it('should return characters unchanged when no voices are available', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue({ voices: [] });
    const { context, logs } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const result = await execute({ characters: sampleCharacters }, context);

    expect(result.characters.length).toBe(3);
    expect(result.characters.every((c: any) => !c.voiceId)).toBe(true);
    expect(logs.some(l => l.includes('No voices available'))).toBe(true);
  });

  it('should handle string-encoded character inputs', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    const stringChars = sampleCharacters.map(c => JSON.stringify(c));
    const result = await execute({ characters: stringChars as any }, context);

    expect(result.characters.length).toBe(3);
    expect((result.characters[0] as any).voiceId).toBeDefined();
  });

  it('should log assignment summary', async () => {
    const ttsVoicesMock = vi.fn().mockResolvedValue(sampleVoices);
    const { context, logs } = createMockContext({ tools: { tts_voices: ttsVoicesMock } });
    const { execute } = await import('./voice-assignment.js');

    await execute({ characters: sampleCharacters }, context);

    expect(logs.some(l => l.includes('Voice assignment complete: 3/3'))).toBe(true);
  });
});
