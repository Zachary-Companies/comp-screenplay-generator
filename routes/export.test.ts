/**
 * Tests for screenplay export routes: Fountain and Lookbook.
 */
import { describe, it, expect } from 'vitest';

// ── Mock SDK factory ────────────────────────────────────────────

function createMockSdk(project: any = {}) {
  const sentResponses: Array<{ status: number; data: any }> = [];
  const writtenFiles: Array<{ path: string; content: string }> = [];
  const createdDirs: string[] = [];

  const sdk: any = {
    pipelineId: 'test-pipeline',
    pipelineDir: '/mock/pipeline',
    sendJson: (_res: any, status: number, data: any) => {
      sentResponses.push({ status, data });
    },
    readBody: async (_req: any) => (_req as any).__body || {},
    getProject: () => project,
    ensureProject: async () => project,
    isProjectLoaded: () => true,
    updateProject: (partial: Record<string, any>) => Object.assign(project, partial),
    markDirty: () => {},
    flushProject: async () => {},
    getProjectFolder: async () => '/mock/project',
    mkdir: async (dir: string) => { createdDirs.push(dir); },
    join: (...segments: string[]) => segments.join('/'),
    basename: (p: string) => p.split('/').pop() || '',
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    fileExists: () => false,
    readFile: async () => '',
    writeFile: async (path: string, content: string) => { writtenFiles.push({ path, content }); },
    copyFile: async () => {},
    stat: async () => ({ size: 0, mtime: new Date() }),
    generateImage: async (params: any) => ({ success: true, filePath: params.outputPath }),
    callTool: async () => null,
    exec: async () => ({ stdout: '', stderr: '' }),
    spawn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} }, stdin: { write: () => {}, end: () => {} } }),
    loadBindings: async () => ({ bindings: [] }),
    saveBindings: async () => {},
    loadRules: async () => ({ rules: [] }),
    saveRules: async () => {},
    autoRunRules: async () => ({ added: 0, replaced: 0, totalBindings: 0 }),
    loadActionConfig: async () => ({ generation: { model: 'flash', aspectRatio: '16:9' } }),
    log: () => {},
    discoverCompositions: async () => [],
  };

  return { sdk, sentResponses, writtenFiles, createdDirs, project };
}

function mockReq(method: string, body: any = {}) {
  return { method, __body: body } as any;
}

const setupRoutes = (await import('./index.js')).default;

// ── Test Data ──────────────────────────────────────────────────

function makeTestProject() {
  return {
    metadata: {
      title: 'Stories for Tomorrow',
      // Real data: author is array of {name, role} objects
      author: [{ name: 'Jane Doe', role: 'Writer' }],
      logline: 'A family navigates loss and hope.',
      // Real data: genre/tone/audience are arrays
      genre: ['Drama', 'Family'],
      tone: ['Hopeful', 'Bittersweet'],
      audience: ['General'],
      runtimeMinutes: 90,
      draftDate: '2026-03-26',
    },
    characters: [
      { id: 'char-david', name: 'David Chen', displayName: 'DAVID', description: 'A thoughtful father.', imagePath: '/assets/david.png', arc: 'From grief to acceptance' },
      { id: 'char-sarah', name: 'Sarah Chen', displayName: 'SARAH', description: 'A resilient mother.', imagePath: '/assets/sarah.png' },
    ],
    locations: [
      { id: 'loc-apartment', name: 'Apartment', description: 'A cozy city apartment.', imagePath: '/assets/apartment.png' },
      { id: 'loc-park', name: 'City Park', description: 'A tree-lined urban park.' },
    ],
    sections: [
      {
        id: 'scene-1', type: 'scene', title: 'Morning',
        sceneHeading: { prefix: 'INT', location: 'APARTMENT', timeOfDay: 'MORNING' },
        elementStart: 0,
      },
      {
        id: 'scene-2', type: 'scene', title: 'Park Walk',
        sceneHeading: { prefix: 'EXT', location: 'CITY PARK', timeOfDay: 'DAY' },
        elementStart: 3,
      },
    ],
    elements: [
      { id: 'e1', type: 'action', content: 'Sunlight fills the small apartment.' },
      { id: 'e2', type: 'dialogue', characterName: 'DAVID', lines: ['Good morning.', 'Did you sleep well?'], modifiers: ['softly'] },
      { id: 'e3', type: 'dialogue', characterName: 'SARAH', lines: ['Not really. But I made coffee.'] },
      { id: 'e4', type: 'action', content: 'They walk along the tree-lined path.' },
      { id: 'e5', type: 'shot', shotText: 'WIDE SHOT - David and Sarah walking through the park', frameSize: 'WIDE' },
      { id: 'e6', type: 'transition', content: 'FADE TO BLACK' },
    ],
    scenes: [
      {
        id: 'scene-1', title: 'APARTMENT', location: 'Apartment', locationId: 'loc-apartment',
        characterIds: ['char-david', 'char-sarah'],
        dialogue: [
          { characterName: 'DAVID', lines: ['Good morning.', 'Did you sleep well?'], elementId: 'e2' },
          { characterName: 'SARAH', lines: ['Not really. But I made coffee.'], elementId: 'e3' },
        ],
        actions: ['Sunlight fills the small apartment.'],
        shots: [{ id: 'e5', shotType: 'WIDE', description: 'David and Sarah walking', previsPath: '/assets/previs-e5.png' }],
        elementRange: [0, 3],
      },
      {
        id: 'scene-2', title: 'CITY PARK', location: 'City Park', locationId: 'loc-park',
        characterIds: ['char-david', 'char-sarah'],
        dialogue: [],
        actions: ['They walk along the tree-lined path.'],
        shots: [],
        elementRange: [3, 6],
      },
    ],
    assets: {
      assets: [
        { id: 'a1', type: 'character-headshot', filePath: '/assets/david.png', metadata: { characterId: 'char-david' } },
        { id: 'a2', type: 'character-headshot', filePath: '/assets/sarah.png', metadata: { characterId: 'char-sarah' } },
        { id: 'a3', type: 'landscape', filePath: '/assets/apartment.png', metadata: { locationId: 'loc-apartment' } },
      ],
    },
    previsualizations: {
      shots: [{ shotElementId: 'e5', filePath: '/assets/previs-e5.png', characterIds: ['char-david', 'char-sarah'] }],
    },
  };
}

// ── Fountain Export Tests ──────────────────────────────────────

describe('Route: POST /export-fountain', () => {
  it('should generate a .fountain file and return filePath', async () => {
    const { sdk, sentResponses, writtenFiles, createdDirs } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0].status).toBe(200);
    expect(sentResponses[0].data.filename).toBe('stories-for-tomorrow.fountain');
    expect(sentResponses[0].data.filePath).toContain('exports');
    expect(sentResponses[0].data.text).toBeDefined();
    expect(createdDirs).toContain('/mock/project/exports');
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0].path).toContain('.fountain');
  });

  it('should produce valid Fountain title page', async () => {
    const { sdk, sentResponses } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).toContain('Title: Stories for Tomorrow');
    expect(text).toContain('Author: Jane Doe');
    expect(text).toContain('Draft date: 2026-03-26');
    // Genre and logline merged into Notes
    expect(text).toContain('Notes:');
    expect(text).toContain('A family navigates loss and hope.');
  });

  it('should stringify non-string metadata values', async () => {
    const project = makeTestProject();
    project.metadata.genre = { primary: 'Drama', secondary: 'Thriller' } as any;
    project.metadata.author = ['Jane Doe', 'John Smith'] as any;
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).not.toContain('[object Object]');
    expect(text).toContain('Author: Jane Doe, John Smith');
    expect(text).toContain('Notes:');
  });

  it('should handle author as array of {name, role} objects', async () => {
    const project = makeTestProject();
    project.metadata.author = [{ name: 'Jane Doe', role: 'Writer' }, { name: 'John Smith', role: 'Co-Writer' }] as any;
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).not.toContain('[object Object]');
    // str() helper converts array of objects
    expect(text).toContain('Author:');
  });

  it('should produce scene headings', async () => {
    const { sdk, sentResponses } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).toContain('INT. APARTMENT - MORNING');
    expect(text).toContain('EXT. CITY PARK - DAY');
  });

  it('should format dialogue with character name and lines', async () => {
    const { sdk, sentResponses } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).toContain('DAVID');
    expect(text).toContain('(softly)');
    expect(text).toContain('Good morning.');
    expect(text).toContain('Did you sleep well?');
    expect(text).toContain('SARAH');
    expect(text).toContain('Not really. But I made coffee.');
  });

  it('should include action lines', async () => {
    const { sdk, sentResponses } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).toContain('Sunlight fills the small apartment.');
    expect(text).toContain('They walk along the tree-lined path.');
  });

  it('should include transitions', async () => {
    const { sdk, sentResponses } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    // Transitions ending in TO: are auto-recognized by Fountain
    expect(text).toMatch(/FADE TO BLACK/);
  });

  it('should include shot descriptions as action text', async () => {
    const { sdk, sentResponses } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    const text = sentResponses[0].data.text;
    expect(text).toContain('WIDE SHOT - David and Sarah walking through the park');
  });

  it('should return 400 when no project data', async () => {
    const { sdk, sentResponses } = createMockSdk(null as any);
    sdk.getProject = () => null;
    sdk.ensureProject = async () => null;
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    expect(sentResponses[0].status).toBe(400);
    expect(sentResponses[0].data.error).toContain('No project data');
  });

  it('should handle empty elements gracefully', async () => {
    const project = makeTestProject();
    project.elements = [];
    project.sections = [];
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-fountain');

    expect(sentResponses[0].status).toBe(200);
    const text = sentResponses[0].data.text;
    expect(text).toContain('Title: Stories for Tomorrow');
  });
});

// ── Lookbook Export Tests ──────────────────────────────────────

describe('Route: POST /export-lookbook', () => {
  it('should generate an HTML lookbook and return filePath', async () => {
    const { sdk, sentResponses, writtenFiles, createdDirs } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0].status).toBe(200);
    expect(sentResponses[0].data.filename).toBe('stories-for-tomorrow-lookbook.html');
    expect(sentResponses[0].data.filePath).toContain('exports');
    expect(createdDirs).toContain('/mock/project/exports');
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0].path).toContain('-lookbook.html');
  });

  it('should produce valid HTML document', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<title>');
    expect(html).toContain('Stories for Tomorrow');
  });

  it('should include title page with metadata', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Stories for Tomorrow');
    expect(html).toContain('A family navigates loss and hope.');
    expect(html).toContain('Drama'); // from genre array
    expect(html).toContain('Jane Doe'); // from author[0].name
    expect(html).toContain('90 minutes');
    // Should not contain [object Object]
    expect(html).not.toContain('[object Object]');
  });

  it('should include character cards with images', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Characters');
    expect(html).toContain('DAVID');
    expect(html).toContain('SARAH');
    expect(html).toContain('A thoughtful father.');
    expect(html).toContain('A resilient mother.');
    // Character images referenced via /api/file?path=
    expect(html).toContain('/api/file?path=');
    expect(html).toContain(encodeURIComponent('/assets/david.png'));
  });

  it('should include location cards', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Locations');
    expect(html).toContain('Apartment');
    expect(html).toContain('A cozy city apartment.');
    expect(html).toContain('City Park');
  });

  it('should include previs key frames organized by scene', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Key Frames');
    expect(html).toContain('APARTMENT');
    expect(html).toContain(encodeURIComponent('/assets/previs-e5.png'));
  });

  it('should include print-friendly CSS', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('@media print');
    expect(html).toContain('page-break');
  });

  it('should include synopsis section', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Synopsis');
    expect(html).toContain('APARTMENT');
    expect(html).toContain('CITY PARK');
  });

  it('should handle scene.actions containing objects instead of strings', async () => {
    const project = makeTestProject();
    // Real data may have action objects with .content instead of plain strings
    project.scenes[0].actions = [{ type: 'action', content: 'An object action.' }] as any;
    const { sdk, writtenFiles } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('An object action.');
    expect(html).not.toContain('[object Object]');
  });

  it('should handle genre/tone/audience as arrays', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    // Genre array items should each become a tag
    expect(html).toContain('Drama');
    expect(html).toContain('Family');
    expect(html).toContain('Hopeful');
    expect(html).not.toContain('[object Object]');
  });

  it('should handle author as array of {name, role} objects', async () => {
    const project = makeTestProject();
    project.metadata.author = [{ name: 'Jane Doe', role: 'Writer' }, { name: 'John Smith', role: 'Producer' }] as any;
    const { sdk, writtenFiles } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Jane Doe');
    expect(html).toContain('John Smith');
    expect(html).not.toContain('[object Object]');
  });

  it('should handle author as plain string', async () => {
    const project = makeTestProject();
    project.metadata.author = 'Solo Author' as any;
    const { sdk, writtenFiles } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Solo Author');
  });

  it('should include character arc when present', async () => {
    const { sdk, writtenFiles } = createMockSdk(makeTestProject());
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('From grief to acceptance');
  });

  it('should return 400 when no project data', async () => {
    const { sdk, sentResponses } = createMockSdk(null as any);
    sdk.getProject = () => null;
    sdk.ensureProject = async () => null;
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    expect(sentResponses[0].status).toBe(400);
    expect(sentResponses[0].data.error).toContain('No project data');
  });

  it('should handle project with no characters or locations', async () => {
    const project = makeTestProject();
    project.characters = [];
    project.locations = [];
    project.scenes = [];
    project.assets = { assets: [] };
    const { sdk, writtenFiles } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Stories for Tomorrow');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('should include print button and auto-print script', async () => {
    const project = makeTestProject();
    const { sdk, writtenFiles } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    expect(html).toContain('Print / Save as PDF');
    expect(html).toContain('window.print()');
    expect(html).toContain('no-print');
    expect(html).toContain("URLSearchParams(window.location.search).has('print')");
  });

  it('should HTML-escape special characters in metadata', async () => {
    const project = makeTestProject();
    project.metadata.title = 'Tom & Jerry <script>alert("xss")</script>';
    const { sdk, writtenFiles } = createMockSdk(project);
    const handler = setupRoutes(sdk);
    await handler(mockReq('POST'), {}, '/export-lookbook');

    const html = writtenFiles[0].content;
    // User-injected script tag in title must be escaped
    expect(html).not.toContain('alert("xss")');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Tom &amp; Jerry');
    // Our own print script should still be present
    expect(html).toContain('window.print()');
  });
});

// ── Metadata Update Tests ────────────────────────────────────────

describe('POST /update-metadata', () => {
  it('should update title', async () => {
    const project = makeTestProject();
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { title: 'New Title' });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(200);
    expect(sentResponses[0].data.success).toBe(true);
    expect(project.metadata.title).toBe('New Title');
  });

  it('should update logline only (partial update)', async () => {
    const project = makeTestProject();
    const originalTitle = project.metadata.title;
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { logline: 'A new logline about hope' });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(200);
    expect(project.metadata.logline).toBe('A new logline about hope');
    expect(project.metadata.title).toBe(originalTitle); // unchanged
  });

  it('should update author as string', async () => {
    const project = makeTestProject();
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { author: 'Jane Doe' });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(200);
    expect(project.metadata.author).toBe('Jane Doe');
  });

  it('should update multiple fields at once', async () => {
    const project = makeTestProject();
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { title: 'Updated', logline: 'Updated logline', author: 'New Author' });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(200);
    expect(project.metadata.title).toBe('Updated');
    expect(project.metadata.logline).toBe('Updated logline');
    expect(project.metadata.author).toBe('New Author');
  });

  it('should ignore non-string values', async () => {
    const project = makeTestProject();
    const originalTitle = project.metadata.title;
    const { sdk, sentResponses } = createMockSdk(project);
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { title: 123, logline: null });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(200);
    expect(project.metadata.title).toBe(originalTitle); // unchanged since 123 is not a string
  });

  it('should return 400 when no project', async () => {
    const { sdk, sentResponses } = createMockSdk(null);
    sdk.getProject = () => null;
    sdk.ensureProject = async () => null;
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { title: 'Test' });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(400);
    expect(sentResponses[0].data.error).toContain('No project data');
  });

  it('should call markDirty and flushProject', async () => {
    const project = makeTestProject();
    const { sdk, sentResponses } = createMockSdk(project);
    let dirtyKeys: string[] = [];
    let flushed = false;
    sdk.markDirty = (keys: string[]) => { dirtyKeys = keys; };
    sdk.flushProject = async () => { flushed = true; };
    const handler = setupRoutes(sdk);

    const req = mockReq('POST', { title: 'Persisted Title' });
    await handler(req, {}, '/update-metadata');

    expect(sentResponses[0].status).toBe(200);
    expect(dirtyKeys).toContain('metadata');
    expect(flushed).toBe(true);
  });
});
