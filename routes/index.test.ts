/**
 * Route handler tests for the Comprehensive Screenplay Generator pipeline.
 * Tests the key routes: prompt prefix saving, character headshot generation,
 * dialogue audio rendering, and dialogue audio persistence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock SDK factory ────────────────────────────────────────────

interface MockProject {
  metadata?: Record<string, any>;
  characters?: any[];
  locations?: any[];
  scenes?: any[];
  elements?: any[];
  dialogueAudio?: { assets: any[] };
  voiceBindings?: any[];
  previsualizations?: { shots: any[] };
  [key: string]: any;
}

function createMockSdk(project: MockProject = {}) {
  const dirtySlices: string[][] = [];
  const state = { flushed: false };
  const sentResponses: Array<{ status: number; data: any }> = [];
  const generatedImages: Array<{ prompt: string; outputPath: string }> = [];
  const ttsResults: Array<{ text: string; voiceId: string; outputPath: string }> = [];

  const sdk: any = {
    pipelineId: 'test-pipeline',
    pipelineDir: '/mock/pipeline',

    // Request/response
    sendJson: (_res: any, status: number, data: any) => {
      sentResponses.push({ status, data });
    },
    readBody: async (_req: any) => (_req as any).__body || {},

    // Project state
    getProject: () => project,
    ensureProject: async () => project,
    isProjectLoaded: () => true,
    updateProject: (partial: Record<string, any>) => {
      Object.assign(project, partial);
    },
    markDirty: (slices: string[]) => { dirtySlices.push(slices); },
    flushProject: async () => { state.flushed = true; },

    // File system
    getProjectFolder: async () => '/mock/project',
    mkdir: async () => {},
    join: (...segments: string[]) => segments.join('/'),
    basename: (p: string) => p.split('/').pop() || '',
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    fileExists: () => false,
    readFile: async () => '',
    writeFile: async () => {},
    copyFile: async () => {},
    stat: async () => ({ size: 16384, mtime: new Date() }),

    // Image generation
    generateImage: async (params: any) => {
      generatedImages.push({ prompt: params.prompt, outputPath: params.outputPath });
      return { success: true, filePath: params.outputPath };
    },

    // Tool calls (TTS etc.)
    callTool: async (toolName: string, params: any) => {
      if (toolName === 'tts_speak') {
        ttsResults.push({ text: params.text, voiceId: params.voice_id, outputPath: params.output_path });
        return { success: true, audio_path: params.output_path };
      }
      return null;
    },

    // Exec (ffprobe duration detection)
    exec: async () => ({ stdout: '2.5', stderr: '' }),
    spawn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} }, stdin: { write: () => {}, end: () => {} } }),

    // Bindings
    loadBindings: async () => ({ bindings: [] }),
    saveBindings: async () => {},
    loadRules: async () => ({ rules: [] }),
    saveRules: async () => {},
    autoRunRules: async () => ({ added: 0, replaced: 0, totalBindings: 0 }),

    // Action config
    loadActionConfig: async () => ({ generation: { model: 'flash', aspectRatio: '16:9' } }),

    // Logging
    log: () => {},
    discoverCompositions: async () => [],
  };

  return {
    sdk,
    // Inspection helpers
    dirtySlices,
    state,
    sentResponses,
    generatedImages,
    ttsResults,
    project,
  };
}

function mockReq(method: string, body: any = {}) {
  return { method, __body: body } as any;
}

// ── Import handler ──────────────────────────────────────────────

const setupRoutes = (await import('./index.js')).default;

// ── Tests ───────────────────────────────────────────────────────

describe('Route: POST /update-prompt-prefix', () => {
  it('should save character image prompt prefix to metadata', async () => {
    const { sdk, sentResponses, state, dirtySlices, project } = createMockSdk({
      metadata: {},
    });
    const handler = setupRoutes(sdk);
    const req = mockReq('POST', { imagePromptPrefix: 'Pixar 3D style, vibrant' });

    await handler(req, {}, '/update-prompt-prefix');

    expect(project.metadata!.imagePromptPrefix).toBe('Pixar 3D style, vibrant');
    expect(dirtySlices.flat()).toContain('metadata');
    expect(state.flushed).toBe(true);
    expect(sentResponses[0]?.status).toBe(200);
    expect(sentResponses[0]?.data.success).toBe(true);
  });

  it('should save location image prompt prefix to metadata', async () => {
    const { sdk, project } = createMockSdk({ metadata: {} });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { locationImagePromptPrefix: 'Cinematic wide angle' }), {}, '/update-prompt-prefix');

    expect(project.metadata!.locationImagePromptPrefix).toBe('Cinematic wide angle');
  });

  it('should save shot image prompt prefix to metadata', async () => {
    const { sdk, project } = createMockSdk({ metadata: {} });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { shotImagePromptPrefix: 'Film noir, high contrast' }), {}, '/update-prompt-prefix');

    expect(project.metadata!.shotImagePromptPrefix).toBe('Film noir, high contrast');
  });

  it('should save all three prefixes in a single request', async () => {
    const { sdk, project } = createMockSdk({ metadata: {} });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', {
      imagePromptPrefix: 'char-prefix',
      locationImagePromptPrefix: 'loc-prefix',
      shotImagePromptPrefix: 'shot-prefix',
    }), {}, '/update-prompt-prefix');

    expect(project.metadata!.imagePromptPrefix).toBe('char-prefix');
    expect(project.metadata!.locationImagePromptPrefix).toBe('loc-prefix');
    expect(project.metadata!.shotImagePromptPrefix).toBe('shot-prefix');
  });

  it('should not overwrite other prefixes when only one is sent', async () => {
    const { sdk, project } = createMockSdk({
      metadata: { imagePromptPrefix: 'existing-char', locationImagePromptPrefix: 'existing-loc' },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { shotImagePromptPrefix: 'new-shot' }), {}, '/update-prompt-prefix');

    expect(project.metadata!.imagePromptPrefix).toBe('existing-char');
    expect(project.metadata!.locationImagePromptPrefix).toBe('existing-loc');
    expect(project.metadata!.shotImagePromptPrefix).toBe('new-shot');
  });

  it('should handle empty string prefix (clearing it)', async () => {
    const { sdk, project } = createMockSdk({
      metadata: { imagePromptPrefix: 'old value' },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { imagePromptPrefix: '' }), {}, '/update-prompt-prefix');

    expect(project.metadata!.imagePromptPrefix).toBe('');
  });

  it('should return 400 when no project data', async () => {
    const mock = createMockSdk({});
    mock.sdk.getProject = () => null;
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { imagePromptPrefix: 'test' }), {}, '/update-prompt-prefix');

    expect(mock.sentResponses[0]?.status).toBe(400);
  });
});

describe('Route: POST /generate-character-headshot', () => {
  it('should prepend prompt prefix to character headshot prompt', async () => {
    const { sdk, generatedImages, project } = createMockSdk({
      metadata: { imagePromptPrefix: 'Anime style, cel shaded' },
      characters: [{
        id: 'char-1',
        name: 'Michael Chen',
        displayName: 'MICHAEL',
        description: 'A driven real estate developer',
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    expect(generatedImages.length).toBe(1);
    expect(generatedImages[0].prompt).toMatch(/^Anime style, cel shaded/);
    expect(generatedImages[0].prompt).toContain('Michael Chen');
  });

  it('should use default style when no prefix is set', async () => {
    const { sdk, generatedImages } = createMockSdk({
      metadata: {},
      characters: [{
        id: 'char-1',
        name: 'Michael Chen',
        description: 'A developer',
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    expect(generatedImages[0].prompt).toContain('Cinematic lighting');
    expect(generatedImages[0].prompt).toContain('Photorealistic');
  });

  it('should save prompt in imageVersions', async () => {
    const { sdk, project } = createMockSdk({
      metadata: { imagePromptPrefix: 'Watercolor style' },
      characters: [{
        id: 'char-1',
        name: 'Alice',
        description: 'A painter',
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    const char = project.characters![0];
    expect(char.imageVersions).toBeDefined();
    expect(char.imageVersions.length).toBeGreaterThan(0);
    const lastVersion = char.imageVersions[char.imageVersions.length - 1];
    expect(lastVersion.prompt).toBeDefined();
    expect(lastVersion.prompt).toContain('Watercolor style');
    expect(lastVersion.prompt).toContain('Alice');
  });

  it('should increment version number correctly', async () => {
    const { sdk, project } = createMockSdk({
      metadata: {},
      characters: [{
        id: 'char-1',
        name: 'Bob',
        description: 'A builder',
        imagePath: '/mock/project/characters/char-1_v1.png',
        imageVersions: [
          { version: 1, filePath: '/mock/project/characters/char-1_v1.png', generatedAt: '2025-01-01', prompt: 'original' },
        ],
        activeImageVersion: 1,
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    const char = project.characters![0];
    expect(char.imageVersions.length).toBe(2);
    expect(char.imageVersions[1].version).toBe(2);
    expect(char.activeImageVersion).toBe(2);
  });

  it('should seed existing imagePath as v1 when no imageVersions exist', async () => {
    const { sdk, project } = createMockSdk({
      metadata: {},
      characters: [{
        id: 'char-1',
        name: 'Carol',
        description: 'A singer',
        imagePath: '/existing/image.png',
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    const char = project.characters![0];
    expect(char.imageVersions.length).toBe(2);
    expect(char.imageVersions[0].version).toBe(1);
    expect(char.imageVersions[0].filePath).toBe('/existing/image.png');
    expect(char.imageVersions[1].version).toBe(2);
  });

  it('should flush project after generating', async () => {
    const { sdk, state } = createMockSdk({
      metadata: {},
      characters: [{ id: 'char-1', name: 'Test', description: 'Test' }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    expect(state.flushed).toBe(true);
  });

  it('should return 400 when characterId is missing', async () => {
    const { sdk, sentResponses } = createMockSdk({ metadata: {}, characters: [] });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', {}), {}, '/generate-character-headshot');

    expect(sentResponses[0]?.status).toBe(400);
  });
});

describe('Route: POST /generate-dialogue-audio', () => {
  it('should generate TTS audio and save to dialogueAudio assets', async () => {
    const { sdk, ttsResults, project, state } = createMockSdk({
      metadata: {},
      dialogueAudio: { assets: [] },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38',
      text: 'Let me ask you something.',
      voiceId: 'voice-george',
      characterName: 'MICHAEL',
      characterId: 'char-1',
    }), {}, '/generate-dialogue-audio');

    // TTS was called
    expect(ttsResults.length).toBe(1);
    expect(ttsResults[0].text).toBe('Let me ask you something.');
    expect(ttsResults[0].voiceId).toBe('voice-george');

    // Asset was saved
    expect(project.dialogueAudio!.assets.length).toBe(1);
    const asset = project.dialogueAudio!.assets[0];
    expect(asset.type).toBe('dialogue-audio');
    expect(asset.metadata.dialogueElementId).toBe('elem-38');
    expect(asset.metadata.characterId).toBe('char-1');
    expect(asset.metadata.text).toBe('Let me ask you something.');

    // Project was flushed to disk
    expect(state.flushed).toBe(true);
  });

  it('should replace existing audio for the same elementId', async () => {
    const { sdk, project } = createMockSdk({
      metadata: {},
      dialogueAudio: {
        assets: [{
          id: 'old-asset',
          type: 'dialogue-audio',
          filePath: '/old/audio.mp3',
          metadata: { dialogueElementId: 'elem-38' },
        }],
      },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38',
      text: 'New version of line.',
      voiceId: 'voice-george',
      characterName: 'MICHAEL',
      characterId: 'char-1',
    }), {}, '/generate-dialogue-audio');

    // Old asset replaced, not duplicated
    expect(project.dialogueAudio!.assets.length).toBe(1);
    expect(project.dialogueAudio!.assets[0].id).not.toBe('old-asset');
    expect(project.dialogueAudio!.assets[0].metadata.text).toBe('New version of line.');
  });

  it('should return 400 when required fields are missing', async () => {
    const { sdk, sentResponses } = createMockSdk({});
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { elementId: 'elem-1' }), {}, '/generate-dialogue-audio');

    expect(sentResponses[0]?.status).toBe(400);
  });

  it('should detect audio duration via ffprobe', async () => {
    const { sdk, project } = createMockSdk({
      metadata: {},
      dialogueAudio: { assets: [] },
    });
    // Mock ffprobe returning 3.7 seconds
    sdk.exec = async () => ({ stdout: '3.7\n', stderr: '' });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-50',
      text: 'A longer line of dialogue.',
      voiceId: 'voice-test',
      characterName: 'BRAD',
      characterId: 'char-2',
    }), {}, '/generate-dialogue-audio');

    expect(project.dialogueAudio!.assets[0].metadata.duration).toBe(3.7);
  });
});

describe('Route: POST /render-dialogue (bulk)', () => {
  it('should render all unrendered dialogue with assigned voices', async () => {
    const { sdk, ttsResults, project, state } = createMockSdk({
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Let me ask you something.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Mike, this is not-'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: { voiceName: 'George' } },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: { voiceName: 'James' } },
      ],
      dialogueAudio: { assets: [] },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(ttsResults.length).toBe(2);
    expect(project.dialogueAudio!.assets.length).toBe(2);
    expect(state.flushed).toBe(true);
  });

  it('should skip already-rendered dialogue', async () => {
    const { sdk, ttsResults } = createMockSdk({
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Already rendered.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Not rendered yet.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: {} },
      ],
      dialogueAudio: {
        assets: [{ id: 'existing', metadata: { dialogueElementId: 'elem-38' } }],
      },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    // Only the un-rendered dialogue should be processed
    expect(ttsResults.length).toBe(1);
    expect(ttsResults[0].text).toBe('Not rendered yet.');
  });

  it('should skip dialogue without voice assignments', async () => {
    const { sdk, ttsResults, sentResponses } = createMockSdk({
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['No voice assigned.'] },
        ],
        shots: [],
      }],
      voiceBindings: [],
      dialogueAudio: { assets: [] },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(ttsResults.length).toBe(0);
    expect(sentResponses[0]?.data.rendered).toBe(0);
  });

  it('should flush project after bulk render', async () => {
    const { sdk, state } = createMockSdk({
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Test.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(state.flushed).toBe(true);
  });
});

describe('Route: POST /select-character-version', () => {
  it('should set the active version and update imagePath', async () => {
    const { sdk, project, sentResponses, state } = createMockSdk({
      metadata: {},
      characters: [{
        id: 'char-1',
        name: 'Michael',
        imagePath: '/v2.png',
        activeImageVersion: 2,
        imageVersions: [
          { version: 1, filePath: '/v1.png', generatedAt: '2025-01-01', prompt: 'prompt 1' },
          { version: 2, filePath: '/v2.png', generatedAt: '2025-01-02', prompt: 'prompt 2' },
        ],
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1', version: 1 }), {}, '/set-character-image-version');

    expect(project.characters![0].imagePath).toBe('/v1.png');
    expect(project.characters![0].activeImageVersion).toBe(1);
    expect(state.flushed).toBe(true);
    expect(sentResponses[0]?.status).toBe(200);
  });

  it('should return 404 for nonexistent version', async () => {
    const { sdk, sentResponses } = createMockSdk({
      metadata: {},
      characters: [{
        id: 'char-1',
        name: 'Michael',
        imageVersions: [{ version: 1, filePath: '/v1.png' }],
      }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { characterId: 'char-1', version: 99 }), {}, '/set-character-image-version');

    expect(sentResponses[0]?.status).toBe(404);
  });
});

describe('Location image generation with prefix', () => {
  it('should use location prefix when set', async () => {
    const { sdk, generatedImages, project } = createMockSdk({
      metadata: { locationImagePromptPrefix: 'Anime background art, Studio Ghibli style' },
      characters: [],
      locations: [{ id: 'loc-1', name: 'Desert Ridge', description: 'A barren ridgeline' }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { entityType: 'locations' }), {}, '/generate-assets');

    expect(generatedImages.length).toBe(1);
    expect(generatedImages[0].prompt).toContain('Anime background art, Studio Ghibli style');
    expect(generatedImages[0].prompt).toContain('Desert Ridge');
    // Should NOT contain default boilerplate when prefix is set
    expect(generatedImages[0].prompt).not.toContain('Wide-angle lens, dramatic lighting');
  });

  it('should use default style when no location prefix is set', async () => {
    const { sdk, generatedImages } = createMockSdk({
      metadata: {},
      characters: [],
      locations: [{ id: 'loc-1', name: 'City Park', description: 'A park downtown' }],
    });
    const handler = setupRoutes(sdk);

    await handler(mockReq('POST', { entityType: 'locations' }), {}, '/generate-assets');

    expect(generatedImages[0].prompt).toContain('Cinematic establishing shot');
    expect(generatedImages[0].prompt).toContain('Wide-angle lens, dramatic lighting');
  });
});

describe('Prompt prefix save + load roundtrip', () => {
  it('should persist shotImagePromptPrefix and load it back for previs generation', async () => {
    const project: MockProject = {
      metadata: {},
      characters: [],
      locations: [],
      scenes: [],
      elements: [],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Step 1: Save shot prefix
    await handler(mockReq('POST', { shotImagePromptPrefix: 'Noir style, high contrast, dramatic shadows' }), {}, '/update-prompt-prefix');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.state.flushed).toBe(true);

    // Step 2: Verify prefix is persisted in project metadata
    expect(project.metadata!.shotImagePromptPrefix).toBe('Noir style, high contrast, dramatic shadows');

    // Step 3: Simulate a fresh page load — getProject() returns the same project with the saved metadata
    // The route should read the prefix from metadata when generating previs
    const freshProject = project;
    expect(freshProject.metadata!.shotImagePromptPrefix).toBe('Noir style, high contrast, dramatic shadows');
  });

  it('should persist imagePromptPrefix and use it in subsequent headshot generation', async () => {
    const project: MockProject = {
      metadata: {},
      characters: [{ id: 'char-1', name: 'Alice', description: 'A detective' }],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Step 1: Save character prefix
    await handler(mockReq('POST', { imagePromptPrefix: 'Watercolor painting style' }), {}, '/update-prompt-prefix');
    expect(project.metadata!.imagePromptPrefix).toBe('Watercolor painting style');
    expect(mock.state.flushed).toBe(true);

    // Step 2: Generate headshot — should pick up the saved prefix
    mock.state.flushed = false;
    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    expect(mock.generatedImages.length).toBe(1);
    expect(mock.generatedImages[0].prompt).toMatch(/^Watercolor painting style/);
    expect(mock.generatedImages[0].prompt).toContain('Alice');
  });

  it('should persist locationImagePromptPrefix and use it in subsequent location generation', async () => {
    const project: MockProject = {
      metadata: {},
      characters: [],
      locations: [{ id: 'loc-1', name: 'Dark Alley', description: 'A narrow alley' }],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Step 1: Save location prefix
    await handler(mockReq('POST', { locationImagePromptPrefix: 'Studio Ghibli background' }), {}, '/update-prompt-prefix');
    expect(project.metadata!.locationImagePromptPrefix).toBe('Studio Ghibli background');
    expect(mock.state.flushed).toBe(true);

    // Step 2: Generate location — should use saved prefix
    await handler(mockReq('POST', { entityType: 'locations' }), {}, '/generate-assets');

    expect(mock.generatedImages.length).toBe(1);
    expect(mock.generatedImages[0].prompt).toContain('Studio Ghibli background');
    expect(mock.generatedImages[0].prompt).toContain('Dark Alley');
    expect(mock.generatedImages[0].prompt).not.toContain('Cinematic establishing shot');
  });

  it('should overwrite prefix on re-save and use new value', async () => {
    const project: MockProject = {
      metadata: { imagePromptPrefix: 'Old style' },
      characters: [{ id: 'char-1', name: 'Bob', description: 'A builder' }],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Overwrite with new prefix
    await handler(mockReq('POST', { imagePromptPrefix: 'Cyberpunk neon aesthetic' }), {}, '/update-prompt-prefix');
    expect(project.metadata!.imagePromptPrefix).toBe('Cyberpunk neon aesthetic');

    // Generate — should use the NEW prefix, not the old one
    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    expect(mock.generatedImages[0].prompt).toMatch(/^Cyberpunk neon aesthetic/);
    expect(mock.generatedImages[0].prompt).not.toContain('Old style');
  });

  it('should clear prefix when saved as empty string', async () => {
    const project: MockProject = {
      metadata: { imagePromptPrefix: 'Some style' },
      characters: [{ id: 'char-1', name: 'Carol', description: 'A singer' }],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Clear the prefix
    await handler(mockReq('POST', { imagePromptPrefix: '' }), {}, '/update-prompt-prefix');
    expect(project.metadata!.imagePromptPrefix).toBe('');

    // Generate — should use default style, not the cleared prefix
    await handler(mockReq('POST', { characterId: 'char-1' }), {}, '/generate-character-headshot');

    expect(mock.generatedImages[0].prompt).toContain('Cinematic lighting');
    expect(mock.generatedImages[0].prompt).toContain('Photorealistic');
    expect(mock.generatedImages[0].prompt).not.toContain('Some style');
  });
});

// ── Music / Audio Tests ─────────────────────────────────────────

/** Helper: creates a mock SDK that captures spawn calls for ffmpeg verification */
function createRenderMockSdk(project: MockProject = {}) {
  const mock = createMockSdk(project);
  const spawnCalls: Array<{ cmd: string; args: string[] }> = [];

  // Override spawn to capture args and simulate successful render
  mock.sdk.spawn = (cmd: string, args: string[], _opts?: any) => {
    spawnCalls.push({ cmd, args });
    const handlers: Record<string, Function> = {};
    // Simulate process completing successfully after a tick
    setTimeout(() => handlers['close']?.(0), 0);
    return {
      on: (event: string, cb: Function) => { handlers[event] = cb; },
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      stdin: { write: () => {}, end: () => {} },
    };
  };
  // stat for output file
  mock.sdk.stat = async () => ({ size: 1024 * 1024, mtime: new Date() });

  return { ...mock, spawnCalls };
}

/** Extract the -filter_complex value from captured spawn args */
function getFilterComplex(spawnCalls: Array<{ args: string[] }>): string {
  for (const call of spawnCalls) {
    const idx = call.args.indexOf('-filter_complex');
    if (idx >= 0 && idx + 1 < call.args.length) return call.args[idx + 1];
  }
  return '';
}

describe('Route: POST /import-audio', () => {
  it('should import audio file and detect duration via ffprobe', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    mock.sdk.exec = async () => ({ stdout: '38.5\n', stderr: '' });
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/Users/test/Music/track.mp3' }), {}, '/import-audio');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.sentResponses[0]?.data.success).toBe(true);
    expect(mock.sentResponses[0]?.data.duration).toBe(38.5);
    expect(mock.sentResponses[0]?.data.fileName).toBe('track.mp3');
    expect(mock.sentResponses[0]?.data.filePath).toContain('audio/');
  });

  it('should fallback to file size estimation when ffprobe fails', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    // ffprobe fails
    mock.sdk.exec = async () => { throw new Error('ffprobe not found'); };
    // File is 320KB mp3 → 320/16 = 20 seconds
    mock.sdk.stat = async () => ({ size: 320 * 1024, mtime: new Date() });
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/test/song.mp3' }), {}, '/import-audio');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.sentResponses[0]?.data.duration).toBe(20);
  });

  it('should return 400 when sourcePath is missing', async () => {
    const mock = createMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {}), {}, '/import-audio');

    expect(mock.sentResponses[0]?.status).toBe(400);
  });

  it('should return 404 when source file does not exist', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => false;
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/nonexistent/file.mp3' }), {}, '/import-audio');

    expect(mock.sentResponses[0]?.status).toBe(404);
  });

  it('should sanitize filename for destination', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/test/My Song (Remix) [Final].mp3' }), {}, '/import-audio');

    const filePath = mock.sentResponses[0]?.data.filePath as string;
    // Should not contain brackets/parens in the path
    expect(filePath).not.toMatch(/[[\]()]/);
    expect(filePath).toContain('.mp3');
  });
});

describe('Music import: file copied to project and path stored correctly', () => {
  it('should copy file to project audio directory (not reference source)', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    let copiedFrom = '', copiedTo = '';
    mock.sdk.copyFile = async (src: string, dest: string) => { copiedFrom = src; copiedTo = dest; };
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/Users/andrew/Music/Epic Song.mp3' }), {}, '/import-audio');

    // Source is the original file
    expect(copiedFrom).toBe('/Users/andrew/Music/Epic Song.mp3');
    // Destination is inside the project audio directory
    expect(copiedTo).toContain('/mock/project/audio/');
    expect(copiedTo).toContain('.mp3');
    // The returned filePath should be the PROJECT path, not the source
    expect(mock.sentResponses[0]?.data.filePath).toBe(copiedTo);
    expect(mock.sentResponses[0]?.data.filePath).not.toBe('/Users/andrew/Music/Epic Song.mp3');
  });

  it('should return project-local path for use in clip.filePath', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/external/path/track.mp3' }), {}, '/import-audio');

    const filePath = mock.sentResponses[0]?.data.filePath;
    // Must be inside the project, not the original path
    expect(filePath).toMatch(/^\/mock\/project\/audio\//);
    expect(filePath).not.toBe('/external/path/track.mp3');
  });

  it('imported file should be usable in render-video', async () => {
    const mock = createRenderMockSdk({});
    mock.sdk.fileExists = () => true;
    const handler = setupRoutes(mock.sdk);

    // Step 1: Import audio
    await handler(mockReq('POST', { sourcePath: '/ext/music.mp3' }), {}, '/import-audio');
    const importedPath = mock.sentResponses[0]?.data.filePath;
    expect(importedPath).toContain('/mock/project/audio/');

    // Step 2: Use imported path in render
    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: importedPath, startTime: 0, duration: 30, volume: 100 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=1');
    // The ffmpeg args should reference the project-local path
    const ffmpegArgs = mock.spawnCalls[0]?.args || [];
    expect(ffmpegArgs).toContain(importedPath);
  });

  it('should handle WAV files with correct duration estimation', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    mock.sdk.exec = async () => { throw new Error('no ffprobe'); };
    // 1.76MB WAV → 1760/176 = 10 seconds
    mock.sdk.stat = async () => ({ size: 1760 * 1024, mtime: new Date() });
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/test/effect.wav' }), {}, '/import-audio');

    expect(mock.sentResponses[0]?.data.duration).toBe(10);
    expect(mock.sentResponses[0]?.data.filePath).toContain('.wav');
  });

  it('should include timestamp in filename for uniqueness', async () => {
    const mock = createMockSdk({});
    mock.sdk.fileExists = () => true;
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { sourcePath: '/test/song.mp3' }), {}, '/import-audio');

    const filePath = mock.sentResponses[0]?.data.filePath;
    // Filename should be: sanitized_name + _ + timestamp + .ext
    // e.g. /mock/project/audio/song_mn15v7lc.mp3
    const filename = filePath.split('/').pop();
    expect(filename).toMatch(/^song_[a-z0-9]+\.mp3$/);
    // The timestamp portion ensures uniqueness across imports
    expect(filename.length).toBeGreaterThan('song_.mp3'.length);
  });
});

describe('Editor clips persistence (music, sfx, user clips)', () => {
  it('should save user clips to metadata and flush', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    const clips = [
      { id: 'clip-music-1', name: 'Song.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 30, filePath: '/mock/project/audio/song_abc.mp3', volume: 80, fadeIn: 2, fadeOut: 3 },
    ];
    await handler(mockReq('PUT', { clips }), {}, '/editor-clips');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.sentResponses[0]?.data.count).toBe(1);
    expect(mock.state.flushed).toBe(true);
    expect(project.metadata!.editorUserClips.length).toBe(1);
    expect(project.metadata!.editorUserClips[0].filePath).toBe('/mock/project/audio/song_abc.mp3');
  });

  it('should load saved clips back on GET', async () => {
    const project: MockProject = {
      metadata: {
        editorUserClips: [
          { id: 'clip-1', name: 'Track.mp3', trackId: 'music', type: 'music', startTime: 0, duration: 30, filePath: '/project/audio/track.mp3', volume: 100 },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('GET'), {}, '/editor-clips');

    expect(mock.sentResponses[0]?.data.clips.length).toBe(1);
    expect(mock.sentResponses[0]?.data.clips[0].filePath).toBe('/project/audio/track.mp3');
  });

  it('should survive save → reload roundtrip', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Save
    await handler(mockReq('PUT', {
      clips: [
        { id: 'c1', name: 'A.mp3', trackId: 'music', type: 'music', startTime: 5, duration: 60, filePath: '/project/audio/a.mp3', volume: 75, fadeIn: 1, fadeOut: 2 },
        { id: 'c2', name: 'B.wav', trackId: 'sfx', type: 'sfx', startTime: 10, duration: 3, filePath: '/project/audio/b.wav', volume: 120 },
      ],
    }), {}, '/editor-clips');

    // Reload
    const handler2 = setupRoutes(mock.sdk);
    await handler2(mockReq('GET'), {}, '/editor-clips');

    const clips = mock.sentResponses[1]?.data.clips;
    expect(clips.length).toBe(2);
    expect(clips[0].filePath).toBe('/project/audio/a.mp3');
    expect(clips[0].volume).toBe(75);
    expect(clips[0].fadeIn).toBe(1);
    expect(clips[1].filePath).toBe('/project/audio/b.wav');
    expect(clips[1].volume).toBe(120);
  });

  it('should preserve clip properties (volume, fade, keyframes)', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('PUT', {
      clips: [{
        id: 'c1', name: 'Track.mp3', trackId: 'music', type: 'music',
        startTime: 0, duration: 30, filePath: '/audio/t.mp3',
        volume: 42, fadeIn: 3, fadeOut: 5,
        keyframes: { volume: [{ time: 0, value: 0, easing: 'linear' }, { time: 10, value: 100, easing: 'linear' }] },
      }],
    }), {}, '/editor-clips');

    await handler(mockReq('GET'), {}, '/editor-clips');
    const clip = mock.sentResponses[1]?.data.clips[0];
    expect(clip.volume).toBe(42);
    expect(clip.fadeIn).toBe(3);
    expect(clip.fadeOut).toBe(5);
    expect(clip.keyframes.volume.length).toBe(2);
  });

  it('should overwrite previous clips on save (not merge)', async () => {
    const project: MockProject = {
      metadata: {
        editorUserClips: [
          { id: 'old', name: 'Old.mp3', trackId: 'music', type: 'music', filePath: '/old.mp3' },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('PUT', {
      clips: [{ id: 'new', name: 'New.mp3', trackId: 'music', type: 'music', filePath: '/new.mp3' }],
    }), {}, '/editor-clips');

    expect(project.metadata!.editorUserClips.length).toBe(1);
    expect(project.metadata!.editorUserClips[0].id).toBe('new');
  });

  it('should not affect other metadata when saving clips', async () => {
    const project: MockProject = {
      metadata: { title: 'My Movie', imagePromptPrefix: 'Style X' },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('PUT', { clips: [{ id: 'c1', name: 'T.mp3', trackId: 'music', type: 'music' }] }), {}, '/editor-clips');

    expect(project.metadata!.title).toBe('My Movie');
    expect(project.metadata!.imagePromptPrefix).toBe('Style X');
  });
});

describe('Route: POST /render-video — music volume', () => {
  it('should apply volume=1 for 100% volume clips', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 10 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 10, volume: 100, fadeIn: 0, fadeOut: 0 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=1');
  });

  it('should apply volume=0.5 for 50% volume clips', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 10 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 10, volume: 50, fadeIn: 0, fadeOut: 0 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=0.5');
  });

  it('should apply volume=2 for 200% volume clips', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 10 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 10, volume: 200, fadeIn: 0, fadeOut: 0 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=2');
  });

  it('should default to volume=1 when volume is not set', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 10 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 10 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=1');
  });
});

describe('Route: POST /render-video — fade in/out', () => {
  it('should apply fade in filter', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 30, volume: 100, fadeIn: 3, fadeOut: 0 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('afade=t=in:d=3');
    expect(filter).not.toContain('afade=t=out');
  });

  it('should apply fade out filter with correct start time', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 30, volume: 100, fadeIn: 0, fadeOut: 5 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    // fadeOut starts at duration - fadeOut = 30 - 5 = 25
    expect(filter).toContain('afade=t=out:st=25:d=5');
    expect(filter).not.toContain('afade=t=in');
  });

  it('should apply both fade in and fade out', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 30, volume: 42, fadeIn: 2, fadeOut: 4 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=0.42');
    expect(filter).toContain('afade=t=in:d=2');
    expect(filter).toContain('afade=t=out:st=26:d=4');
  });

  it('should not include fade filters when both are 0', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 10 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 10, volume: 100, fadeIn: 0, fadeOut: 0 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).not.toContain('afade');
  });
});

describe('Route: POST /render-video — audio clip timing', () => {
  it('should apply adelay for clips that start after the render start', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 5, duration: 10, volume: 100 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    // startTime=5 → 5000ms delay
    expect(filter).toContain('adelay=5000|5000');
  });

  it('should apply atrim to clip duration', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 15, volume: 100 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('atrim=0:15');
  });

  it('should handle dialog clips via dialogAudioMap', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 20 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 20 },
        { trackId: 'dialog', type: 'dialog', elementId: 'elem-38', startTime: 2, duration: 3, volume: 80 },
      ],
      dialogAudioMap: { 'elem-38': '/audio/dialogue_elem-38.mp3' },
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    // volume = 80/100 = 0.8
    expect(filter).toContain('volume=0.8');
    // delay = 2 * 1000 = 2000
    expect(filter).toContain('adelay=2000|2000');
  });
});

describe('Route: POST /render-video — multiple audio mixing', () => {
  it('should use amix for multiple audio clips', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 30 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 30 },
        { trackId: 'music', type: 'music', filePath: '/music1.mp3', startTime: 0, duration: 30, volume: 80 },
        { trackId: 'sfx', type: 'sfx', filePath: '/sfx.wav', startTime: 5, duration: 3, volume: 120 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('amix=inputs=2');
    expect(filter).toContain('volume=0.8');   // music
    expect(filter).toContain('volume=1.2');   // sfx at 120%
  });

  it('should generate silent audio when no audio clips exist', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 10 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('anullsrc=r=44100:cl=stereo');
  });

  it('should handle ambience clips the same as music', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 20 },
      clips: [
        { trackId: 'visuals', type: 'image', filePath: '/img.png', startTime: 0, duration: 20 },
        { trackId: 'ambience', type: 'ambience', filePath: '/rain.mp3', startTime: 0, duration: 20, volume: 30, fadeIn: 5, fadeOut: 5 },
      ],
    }), {}, '/render-video');

    const filter = getFilterComplex(mock.spawnCalls);
    expect(filter).toContain('volume=0.3');
    expect(filter).toContain('afade=t=in:d=5');
    expect(filter).toContain('afade=t=out:st=15:d=5');
  });
});

describe('Dialogue audio persistence and lookup', () => {
  it('should store each rendered dialogue with its elementId for UI lookup', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Render 3 dialogue lines
    const lines = [
      { elementId: 'elem-38', text: 'Let me ask you something.', characterName: 'MICHAEL', characterId: 'char-1', voiceId: 'voice-george' },
      { elementId: 'elem-46', text: 'Mike, this is not-', characterName: 'BRAD', characterId: 'char-2', voiceId: 'voice-james' },
      { elementId: 'elem-47', text: 'I know, just hear me out.', characterName: 'MICHAEL', characterId: 'char-1', voiceId: 'voice-george' },
    ];

    for (const line of lines) {
      await handler(mockReq('POST', line), {}, '/generate-dialogue-audio');
    }

    // All 3 assets should be stored
    expect(project.dialogueAudio!.assets.length).toBe(3);

    // Each asset should be findable by its elementId (this is how DialogueBlock looks it up)
    for (const line of lines) {
      const asset = project.dialogueAudio!.assets.find(
        (a: any) => a.metadata?.dialogueElementId === line.elementId
      );
      expect(asset).toBeDefined();
      expect(asset.metadata.characterName).toBe(line.characterName);
      expect(asset.metadata.characterId).toBe(line.characterId);
      expect(asset.filePath).toBeTruthy();
      expect(asset.type).toBe('dialogue-audio');
    }
  });

  it('should replace old audio when re-rendering the same dialogue line', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: {
        assets: [{
          id: 'old-asset',
          type: 'dialogue-audio',
          filePath: '/old/audio.mp3',
          metadata: { dialogueElementId: 'elem-38', characterName: 'MICHAEL', text: 'Old version' },
        }],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Re-render the same line
    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'New version of the line.',
      voiceId: 'voice-george', characterName: 'MICHAEL', characterId: 'char-1',
    }), {}, '/generate-dialogue-audio');

    // Should still be exactly 1 asset for this elementId (replaced, not duplicated)
    const matching = project.dialogueAudio!.assets.filter(
      (a: any) => a.metadata?.dialogueElementId === 'elem-38'
    );
    expect(matching.length).toBe(1);
    expect(matching[0].metadata.text).toBe('New version of the line.');
    expect(matching[0].id).not.toBe('old-asset');
  });

  it('should flush to disk after each dialogue render', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'Test.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');

    expect(mock.state.flushed).toBe(true);
    expect(mock.dirtySlices.flat()).toContain('dialogueAudio');
  });

  it('bulk render should store all dialogues with correct elementIds', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['First line.'] },
          { elementId: 'elem-41', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Second line.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Third line.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.sentResponses[0]?.data.rendered).toBe(3);
    expect(project.dialogueAudio!.assets.length).toBe(3);

    // Verify each asset is findable by elementId
    expect(project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-38')).toBeDefined();
    expect(project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-41')).toBeDefined();
    expect(project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-46')).toBeDefined();

    // Verify flush
    expect(mock.state.flushed).toBe(true);
  });

  it('bulk render should not re-render already rendered dialogues', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Already done.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Not done yet.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: {} },
      ],
      dialogueAudio: {
        assets: [{ id: 'existing', type: 'dialogue-audio', filePath: '/old.mp3', metadata: { dialogueElementId: 'elem-38' } }],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    // Only 1 new render (elem-46), elem-38 was skipped
    expect(mock.sentResponses[0]?.data.rendered).toBe(1);
    expect(mock.ttsResults.length).toBe(1);
    expect(mock.ttsResults[0].text).toBe('Not done yet.');

    // Total assets should be 2 (1 existing + 1 new)
    expect(project.dialogueAudio!.assets.length).toBe(2);
  });

  it('rendered audio should include duration metadata', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    // ffprobe returns 3.2 seconds
    mock.sdk.exec = async () => ({ stdout: '3.2\n', stderr: '' });
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-50', text: 'A longer dialogue line for testing.',
      voiceId: 'voice-test', characterName: 'BOB', characterId: 'char-2',
    }), {}, '/generate-dialogue-audio');

    const asset = project.dialogueAudio!.assets[0];
    expect(asset.metadata.duration).toBe(3.2);
    expect(asset.metadata.dialogueElementId).toBe('elem-50');
  });

  it('response should include filePath and elementId for client-side audio update', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-52', text: 'We cannot ignore this.',
      voiceId: 'voice-test', characterName: 'JUNIOR EXEC', characterId: 'char-3',
    }), {}, '/generate-dialogue-audio');

    const resp = mock.sentResponses[0]?.data;
    expect(resp.success).toBe(true);
    expect(resp.elementId).toBe('elem-52');
    expect(resp.filePath).toBeTruthy();
    expect(resp.characterName).toBe('JUNIOR EXEC');
  });
});

describe('Route: POST /render-video — validation', () => {
  it('should return 400 when no visual clips exist', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 0, endTime: 10 },
      clips: [
        { trackId: 'music', type: 'music', filePath: '/music.mp3', startTime: 0, duration: 10 },
      ],
    }), {}, '/render-video');

    expect(mock.sentResponses[0]?.status).toBe(400);
    expect(mock.sentResponses[0]?.data.error).toContain('No visual clips');
  });

  it('should return 400 for invalid time range', async () => {
    const mock = createRenderMockSdk({});
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      settings: { startTime: 10, endTime: 5 },
      clips: [],
    }), {}, '/render-video');

    expect(mock.sentResponses[0]?.status).toBe(400);
    expect(mock.sentResponses[0]?.data.error).toContain('Invalid time range');
  });
});

// ── Comprehensive dialogue audio render + lookup tests ──────────

describe('Dialogue audio: full render → lookup flow', () => {
  it('should render 6 dialogue lines across 2 scenes and all be findable', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [
        {
          id: 'scene-5',
          dialogue: [
            { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Let me ask you something.'] },
            { elementId: 'elem-41', characterId: 'char-1', characterName: 'MICHAEL', lines: ['A mixed-income community.'] },
            { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Mike, this is not-'] },
          ],
          shots: [],
        },
        {
          id: 'scene-6',
          dialogue: [
            { elementId: 'elem-60', characterId: 'char-1', characterName: 'MICHAEL', lines: ['We need to talk.'] },
            { elementId: 'elem-62', characterId: 'char-3', characterName: 'JUNIOR EXEC', lines: ['This sounds like charity.'] },
            { elementId: 'elem-64', characterId: 'char-2', characterName: 'BRAD', lines: ['Enough.'] },
          ],
          shots: [],
        },
      ],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-3' }, target: { entityId: 'voice-sally' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.sentResponses[0]?.data.rendered).toBe(6);
    expect(project.dialogueAudio!.assets.length).toBe(6);

    // Every element should be findable by its elementId
    for (const elemId of ['elem-38', 'elem-41', 'elem-46', 'elem-60', 'elem-62', 'elem-64']) {
      const asset = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === elemId);
      expect(asset).toBeDefined();
      expect(asset.filePath).toBeTruthy();
      expect(asset.type).toBe('dialogue-audio');
      expect(asset.metadata.generatedAt).toBeTruthy();
    }
  });

  it('should preserve correct character metadata on each asset', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Hello.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Hi.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    const michaelAsset = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-38');
    expect(michaelAsset.metadata.characterName).toBe('MICHAEL');
    expect(michaelAsset.metadata.characterId).toBe('char-1');
    expect(michaelAsset.metadata.voiceId).toBe('voice-george');

    const bradAsset = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-46');
    expect(bradAsset.metadata.characterName).toBe('BRAD');
    expect(bradAsset.metadata.characterId).toBe('char-2');
    expect(bradAsset.metadata.voiceId).toBe('voice-james');
  });

  it('should store the dialogue text in asset metadata', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38',
      text: 'What if the most valuable development opportunity in Las Vegas isn\'t luxury?',
      voiceId: 'voice-george',
      characterName: 'MICHAEL',
      characterId: 'char-1',
    }), {}, '/generate-dialogue-audio');

    const asset = project.dialogueAudio!.assets[0];
    expect(asset.metadata.text).toContain('What if the most valuable');
  });

  it('should call TTS with correct voice for each character', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Line one.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Line two.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'voice-james' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.ttsResults.length).toBe(2);
    expect(mock.ttsResults[0].voiceId).toBe('voice-george');
    expect(mock.ttsResults[0].text).toBe('Line one.');
    expect(mock.ttsResults[1].voiceId).toBe('voice-james');
    expect(mock.ttsResults[1].text).toBe('Line two.');
  });

  it('should generate unique file paths for each dialogue', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'First.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');
    await handler(mockReq('POST', {
      elementId: 'elem-46', text: 'Second.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');

    const paths = project.dialogueAudio!.assets.map((a: any) => a.filePath);
    expect(paths[0]).not.toBe(paths[1]);
    expect(paths[0]).toContain('elem-38');
    expect(paths[1]).toContain('elem-46');
  });

  it('should generate unique asset IDs', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'A.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');
    await handler(mockReq('POST', {
      elementId: 'elem-46', text: 'B.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');

    const ids = project.dialogueAudio!.assets.map((a: any) => a.id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/^ast_da_/);
    expect(ids[1]).toMatch(/^ast_da_/);
  });

  it('bulk render then single re-render should update only the re-rendered line', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Original line one.'] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Original line two.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'v1' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'v2' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Step 1: Bulk render both
    await handler(mockReq('POST'), {}, '/render-dialogue');
    expect(project.dialogueAudio!.assets.length).toBe(2);

    const originalElem38Path = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-38')!.filePath;
    const originalElem46Path = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-46')!.filePath;

    // Step 2: Re-render just elem-38 with new text
    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'Updated line one.', voiceId: 'v1', characterName: 'MICHAEL', characterId: 'char-1',
    }), {}, '/generate-dialogue-audio');

    // Should still have exactly 2 assets
    expect(project.dialogueAudio!.assets.length).toBe(2);

    // elem-38 should have the updated text
    const newElem38 = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-38');
    expect(newElem38).toBeDefined();
    expect(newElem38!.metadata.text).toBe('Updated line one.');

    // elem-46 should still have original text (untouched)
    const unchangedElem46 = project.dialogueAudio!.assets.find((a: any) => a.metadata?.dialogueElementId === 'elem-46');
    expect(unchangedElem46).toBeDefined();
    expect(unchangedElem46!.metadata.text).toBe('Original line two.');
  });

  it('should skip dialogue with empty text', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: [''] },
          { elementId: 'elem-46', characterId: 'char-2', characterName: 'BRAD', lines: ['Has text.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'v1' }, metadata: {} },
        { type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityId: 'v2' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    // Only Brad's line should be rendered
    expect(mock.ttsResults.length).toBe(1);
    expect(mock.ttsResults[0].text).toBe('Has text.');
  });

  it('should join multi-line dialogue into single text for TTS', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Line one.', 'Line two.', 'Line three.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'v1' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.ttsResults[0].text).toBe('Line one. Line two. Line three.');
  });

  it('should use project voiceBindings over pipeline bindings', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Test.'] },
        ],
        shots: [],
      }],
      // Project-level bindings (should be used)
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'project-voice' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    // Pipeline-level bindings (should be ignored when project has bindings)
    mock.sdk.loadBindings = async () => ({
      bindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'pipeline-voice' }, metadata: {} },
      ],
    });
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.ttsResults[0].voiceId).toBe('project-voice');
  });

  it('should handle TTS failure gracefully and continue with remaining lines', async () => {
    const project: MockProject = {
      metadata: {},
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Will fail.'] },
          { elementId: 'elem-46', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Will succeed.'] },
        ],
        shots: [],
      }],
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'v1' }, metadata: {} },
      ],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    let callCount = 0;
    mock.sdk.callTool = async (_name: string, params: any) => {
      callCount++;
      if (callCount === 1) return { success: false, error: 'TTS service unavailable' };
      return { success: true, audio_path: params.output_path };
    };
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    // Only 1 asset saved (the successful one)
    expect(project.dialogueAudio!.assets.length).toBe(1);
    expect(mock.sentResponses[0]?.data.rendered).toBe(1);
    expect(mock.sentResponses[0]?.data.total).toBe(2);
  });

  it('should create dialogueAudio structure if it does not exist', async () => {
    const project: MockProject = {
      metadata: {},
      // No dialogueAudio key at all
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'Hello.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');

    expect(project.dialogueAudio).toBeDefined();
    expect(project.dialogueAudio!.assets).toBeDefined();
    expect(project.dialogueAudio!.assets.length).toBe(1);
  });

  it('should save audio files to the audio subdirectory of project folder', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-99', text: 'Test path.', voiceId: 'v1', characterName: 'X', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');

    const filePath = project.dialogueAudio!.assets[0].filePath;
    expect(filePath).toContain('/mock/project/audio/');
    expect(filePath).toContain('dialogue_elem-99');
    expect(filePath).toContain('.mp3');
  });

  it('should set generatedAt timestamp on each asset', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    const before = new Date().toISOString();
    await handler(mockReq('POST', {
      elementId: 'elem-38', text: 'Timestamp test.', voiceId: 'v1', characterName: 'A', characterId: 'c1',
    }), {}, '/generate-dialogue-audio');
    const after = new Date().toISOString();

    const generatedAt = project.dialogueAudio!.assets[0].metadata.generatedAt;
    expect(generatedAt >= before).toBe(true);
    expect(generatedAt <= after).toBe(true);
  });

  it('response should match the stored asset data', async () => {
    const project: MockProject = {
      metadata: {},
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      elementId: 'elem-52', text: 'Charity work.', voiceId: 'v1', characterName: 'JUNIOR EXEC', characterId: 'char-3',
    }), {}, '/generate-dialogue-audio');

    const resp = mock.sentResponses[0]?.data;
    const asset = project.dialogueAudio!.assets[0];

    // Response filePath should match stored asset filePath
    expect(resp.filePath).toBe(asset.filePath);
    expect(resp.elementId).toBe(asset.metadata.dialogueElementId);
    expect(resp.assetId).toBe(asset.id);
    expect(resp.characterName).toBe(asset.metadata.characterName);
  });
});

// ── Voice Bindings Persistence Tests ────────────────────────────

describe('Voice bindings: save and load persistence', () => {
  it('should save voice bindings to metadata and flush to disk', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    const bindings = [
      { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-george' }, metadata: { voiceName: 'George' } },
      { id: 'vb-2', type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityType: 'voice', entityId: 'voice-james' }, metadata: { voiceName: 'James' } },
    ];

    await handler(mockReq('PUT', { bindings }), {}, '/voice-bindings');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.sentResponses[0]?.data.success).toBe(true);
    expect(mock.sentResponses[0]?.data.count).toBe(2);
    expect(mock.state.flushed).toBe(true);
    expect(mock.dirtySlices.flat()).toContain('metadata');
  });

  it('should store bindings in metadata, not as top-level project field', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    const bindings = [
      { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-george' }, metadata: { voiceName: 'George' } },
    ];

    await handler(mockReq('PUT', { bindings }), {}, '/voice-bindings');

    // Should be in metadata (persisted to project.json)
    expect(project.metadata!.voiceBindings).toBeDefined();
    expect(project.metadata!.voiceBindings.length).toBe(1);
    expect(project.metadata!.voiceBindings[0].id).toBe('vb-1');
  });

  it('should load bindings back from metadata after save', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-george' }, metadata: { voiceName: 'George' } },
          { id: 'vb-2', type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityType: 'voice', entityId: 'voice-james' }, metadata: { voiceName: 'James' } },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('GET'), {}, '/voice-bindings');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.sentResponses[0]?.data.bindings.length).toBe(2);
    expect(mock.sentResponses[0]?.data.bindings[0].target.entityId).toBe('voice-george');
    expect(mock.sentResponses[0]?.data.bindings[1].target.entityId).toBe('voice-james');
  });

  it('should survive a full save → reload cycle', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Step 1: Save bindings
    const bindings = [
      { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-george' }, metadata: { voiceName: 'George' } },
    ];
    await handler(mockReq('PUT', { bindings }), {}, '/voice-bindings');
    expect(mock.state.flushed).toBe(true);

    // Step 2: Simulate reload — create fresh handler with same project (simulates reading from disk)
    const handler2 = setupRoutes(mock.sdk);
    await handler2(mockReq('GET'), {}, '/voice-bindings');

    // Should return the saved bindings
    const loadedBindings = mock.sentResponses[1]?.data.bindings;
    expect(loadedBindings.length).toBe(1);
    expect(loadedBindings[0].target.entityId).toBe('voice-george');
  });

  it('should migrate legacy top-level voiceBindings on read', async () => {
    // Legacy: voiceBindings at project root (old code wrote it here)
    const project: MockProject = {
      metadata: {},
      voiceBindings: [
        { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-old' }, metadata: { voiceName: 'Old' } },
      ],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('GET'), {}, '/voice-bindings');

    // Should find legacy bindings
    expect(mock.sentResponses[0]?.data.bindings.length).toBe(1);
    expect(mock.sentResponses[0]?.data.bindings[0].target.entityId).toBe('voice-old');
  });

  it('should prefer metadata over legacy when both exist', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { id: 'vb-new', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-new' }, metadata: {} },
        ],
      },
      voiceBindings: [
        { id: 'vb-old', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-old' }, metadata: {} },
      ],
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('GET'), {}, '/voice-bindings');

    expect(mock.sentResponses[0]?.data.bindings.length).toBe(1);
    expect(mock.sentResponses[0]?.data.bindings[0].target.entityId).toBe('voice-new');
  });

  it('should return empty array when no bindings exist anywhere', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('GET'), {}, '/voice-bindings');

    expect(mock.sentResponses[0]?.data.bindings).toEqual([]);
  });

  it('should overwrite all bindings on save (not merge)', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'voice-george' }, metadata: {} },
          { id: 'vb-2', type: 'voice', source: { entityType: 'character', entityId: 'char-2' }, target: { entityType: 'voice', entityId: 'voice-james' }, metadata: {} },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Save with only 1 binding (should replace all)
    await handler(mockReq('PUT', {
      bindings: [
        { id: 'vb-3', type: 'voice', source: { entityType: 'character', entityId: 'char-3' }, target: { entityType: 'voice', entityId: 'voice-sally' }, metadata: {} },
      ],
    }), {}, '/voice-bindings');

    expect(project.metadata!.voiceBindings.length).toBe(1);
    expect(project.metadata!.voiceBindings[0].target.entityId).toBe('voice-sally');
  });

  it('should not affect other metadata fields when saving bindings', async () => {
    const project: MockProject = {
      metadata: {
        title: 'My Movie',
        imagePromptPrefix: 'Pixar style',
        shotImagePromptPrefix: 'Film noir',
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('PUT', {
      bindings: [{ id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'v1' }, metadata: {} }],
    }), {}, '/voice-bindings');

    expect(project.metadata!.title).toBe('My Movie');
    expect(project.metadata!.imagePromptPrefix).toBe('Pixar style');
    expect(project.metadata!.shotImagePromptPrefix).toBe('Film noir');
    expect(project.metadata!.voiceBindings.length).toBe(1);
  });

  it('render-dialogue should read voice bindings from metadata', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-george' }, metadata: {} },
        ],
      },
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Test line.'] },
        ],
        shots: [],
      }],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.ttsResults.length).toBe(1);
    expect(mock.ttsResults[0].voiceId).toBe('voice-george');
  });

  it('render-dialogue should fallback to legacy voiceBindings', async () => {
    const project: MockProject = {
      metadata: {},
      voiceBindings: [
        { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'voice-legacy' }, metadata: {} },
      ],
      scenes: [{
        id: 'scene-5',
        dialogue: [
          { elementId: 'elem-38', characterId: 'char-1', characterName: 'MICHAEL', lines: ['Legacy test.'] },
        ],
        shots: [],
      }],
      dialogueAudio: { assets: [] },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST'), {}, '/render-dialogue');

    expect(mock.ttsResults.length).toBe(1);
    expect(mock.ttsResults[0].voiceId).toBe('voice-legacy');
  });

  it('should handle save with empty bindings array (clear all)', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { id: 'vb-1', type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityType: 'voice', entityId: 'v1' }, metadata: {} },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('PUT', { bindings: [] }), {}, '/voice-bindings');

    expect(project.metadata!.voiceBindings).toEqual([]);
    expect(mock.state.flushed).toBe(true);

    // Load should return empty
    await handler(mockReq('GET'), {}, '/voice-bindings');
    expect(mock.sentResponses[1]?.data.bindings).toEqual([]);
  });
});

// ── Auto-Assign Voices Tests ────────────────────────────────────
// Route receives pre-generated assignments from client (client calls LLM).
// Route validates IDs, enforces uniqueness, and saves to metadata.

describe('Route: POST /auto-assign-voices', () => {
  const chars = [
    { id: 'char-1', name: 'Michael Chen', displayName: 'MICHAEL' },
    { id: 'char-2', name: 'Brad Wilson', displayName: 'BRAD' },
    { id: 'char-3', name: 'Erika Tanaka', displayName: 'ERIKA' },
  ];
  const voicesList = [
    { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'George' },
    { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'James' },
    { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
  ];
  const validAssignments = [
    { characterId: 'char-1', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'George' },
    { characterId: 'char-2', voiceId: 'JBFqnCBsd6RMkjVDRZzb', voiceName: 'James' },
    { characterId: 'char-3', voiceId: 'XB0fDUnXU5powFXDhCwa', voiceName: 'Charlotte' },
  ];

  it('should validate and save assignments to metadata', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { assignments: validAssignments, characters: chars, voices: voicesList }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.status).toBe(200);
    expect(mock.sentResponses[0]?.data.success).toBe(true);
    expect(mock.sentResponses[0]?.data.applied).toBe(3);
    expect(mock.state.flushed).toBe(true);

    expect(project.metadata!.voiceBindings.length).toBe(3);
    const b1 = project.metadata!.voiceBindings.find((b: any) => b.source.entityId === 'char-1');
    expect(b1.target.entityId).toBe('EXAVITQu4vr4xnSDxMaL');
    expect(b1.origin).toBe('auto:llm');
  });

  it('should skip characters that already have voices assigned', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'existing-voice' }, metadata: {} },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Client sends all 3 assignments but char-1 already has a voice
    await handler(mockReq('POST', { assignments: validAssignments, characters: chars, voices: voicesList }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(2);
    expect(project.metadata!.voiceBindings.length).toBe(3); // 1 existing + 2 new
  });

  it('should enforce unique voice assignments (no duplicates)', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    const dupeAssignments = [
      { characterId: 'char-1', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'George' },
      { characterId: 'char-2', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'George' }, // duplicate!
      { characterId: 'char-3', voiceId: 'XB0fDUnXU5powFXDhCwa', voiceName: 'Charlotte' },
    ];
    await handler(mockReq('POST', { assignments: dupeAssignments, characters: chars, voices: voicesList }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(2);
    expect(project.metadata!.voiceBindings.length).toBe(2);
  });

  it('should reject invalid voice IDs', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      assignments: [
        { characterId: 'char-1', voiceId: 'FAKE_ID_NOT_REAL', voiceName: 'Fake' },
        { characterId: 'char-2', voiceId: 'JBFqnCBsd6RMkjVDRZzb', voiceName: 'James' },
      ],
      characters: chars, voices: voicesList,
    }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(1);
    expect(project.metadata!.voiceBindings[0].target.entityId).toBe('JBFqnCBsd6RMkjVDRZzb');
  });

  it('should reject invalid character IDs', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      assignments: [{ characterId: 'char-NONEXISTENT', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'George' }],
      characters: chars, voices: voicesList,
    }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(0);
  });

  it('should handle empty assignments array', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { assignments: [], characters: chars, voices: voicesList }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(0);
    expect(mock.sentResponses[0]?.data.success).toBe(true);
  });

  it('should return 400 when characters or voices are empty', async () => {
    const mock = createMockSdk({ metadata: {} });
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', { assignments: validAssignments, characters: [], voices: voicesList }), {}, '/auto-assign-voices');
    expect(mock.sentResponses[0]?.status).toBe(400);
  });

  it('should avoid reusing voices already assigned to other characters', async () => {
    const project: MockProject = {
      metadata: {
        voiceBindings: [
          { type: 'voice', source: { entityType: 'character', entityId: 'char-1' }, target: { entityId: 'EXAVITQu4vr4xnSDxMaL' }, metadata: {} },
        ],
      },
    };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    // Try to assign George (already used by char-1) to char-2
    await handler(mockReq('POST', {
      assignments: [
        { characterId: 'char-2', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'George' }, // should be rejected
        { characterId: 'char-3', voiceId: 'XB0fDUnXU5powFXDhCwa', voiceName: 'Charlotte' },
      ],
      characters: chars, voices: voicesList,
    }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(1); // only Charlotte
    expect(project.metadata!.voiceBindings.length).toBe(2); // 1 existing + 1 new
  });

  it('should persist bindings and return them for client state update', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      assignments: [{ characterId: 'char-1', voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'George' }],
      characters: chars, voices: voicesList,
    }), {}, '/auto-assign-voices');

    const respBindings = mock.sentResponses[0]?.data.bindings;
    expect(respBindings).toBeDefined();
    expect(respBindings.length).toBe(1);
    expect(mock.state.flushed).toBe(true);
    expect(mock.dirtySlices.flat()).toContain('metadata');

    // Survives reload
    const handler2 = setupRoutes(mock.sdk);
    await handler2(mockReq('GET'), {}, '/voice-bindings');
    expect(mock.sentResponses[1]?.data.bindings.length).toBe(1);
    expect(mock.sentResponses[1]?.data.bindings[0].target.entityId).toBe('EXAVITQu4vr4xnSDxMaL');
  });

  it('should handle assignments with missing fields gracefully', async () => {
    const project: MockProject = { metadata: {} };
    const mock = createMockSdk(project);
    const handler = setupRoutes(mock.sdk);

    await handler(mockReq('POST', {
      assignments: [
        { characterId: 'char-1' }, // missing voiceId
        { voiceId: 'JBFqnCBsd6RMkjVDRZzb' }, // missing characterId
        { characterId: 'char-3', voiceId: 'XB0fDUnXU5powFXDhCwa', voiceName: 'Charlotte' }, // valid
      ],
      characters: chars, voices: voicesList,
    }), {}, '/auto-assign-voices');

    expect(mock.sentResponses[0]?.data.applied).toBe(1);
  });
});
