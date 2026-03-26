/**
 * Script Generator Pipeline — Server-Side Routes
 *
 * Pipeline-specific API endpoints for the Comprehensive Screenplay Generator.
 * These routes handle previs generation, dialogue audio, video rendering,
 * asset generation, and screenplay-specific data manipulation.
 *
 * Loaded dynamically by Woodbury core when this pipeline is active.
 * Receives a PipelineRouteSdk with access to project state, image generation,
 * extension tools, file system, and other platform capabilities.
 */

import {
  buildKenBurnsFilter,
  buildCaptionFilter,
  buildLowerThirdFilter,
  buildTitleCardSegment,
  buildTransitionFilter,
  buildEffectFilters,
  defaultFontPath,
  type KenBurnsSpec,
  type CaptionSpec,
  type LowerThirdSpec,
  type TitleCardSpec,
  type TransitionSpec,
  type EffectSpec,
} from '../src/_ffmpeg-filters';

// The SDK is injected at runtime — we define the type inline for compilation
interface PipelineRouteSdk {
  pipelineId: string;
  pipelineDir: string | null;
  sendJson: (res: any, status: number, data: any) => void;
  readBody: (req: any) => Promise<any>;
  getProject: () => any | null;
  ensureProject: () => Promise<any | null>;
  updateProject: (partial: Record<string, any>) => void;
  markDirty: (slices: string[]) => void;
  flushProject: () => Promise<void>;
  getProjectFolder: () => Promise<string>;
  isProjectLoaded: () => boolean;
  loadActionConfig: (actionId: string) => Promise<Record<string, any>>;
  generateImage: (params: {
    prompt: string;
    model?: 'flash' | 'pro';
    aspectRatio?: string;
    outputPath: string;
    referenceImages?: string[];
  }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  generateVideo: (params: {
    prompt: string;
    image?: string;
    duration?: number;
    aspectRatio?: string;
    outputPath: string;
  }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  callTool: (toolName: string, params: Record<string, any>, workDir?: string) => Promise<any | null>;
  getTools: () => Promise<Array<{ name: string; handler: Function }>>;
  loadBindings: () => Promise<any>;
  saveBindings: (doc: any) => Promise<void>;
  loadRules: () => Promise<any>;
  saveRules: (doc: any) => Promise<void>;
  autoRunRules: () => Promise<{ added: number; replaced: number; totalBindings: number }>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  fileExists: (path: string) => boolean;
  copyFile: (src: string, dest: string) => Promise<void>;
  stat: (path: string) => Promise<{ size: number; mtime: Date }>;
  exec: (command: string, options?: { timeout?: number; cwd?: string }) => Promise<{ stdout: string; stderr: string }>;
  spawn: (command: string, args: string[], options?: any) => any;
  log: (level: 'info' | 'error' | 'warn', tag: string, message: string, meta?: any) => void;
  discoverCompositions: () => Promise<any[]>;
  join: (...segments: string[]) => string;
  basename: (path: string) => string;
  dirname: (path: string) => string;
}

// ────────────────────────────────────────────────────────────────
//  Screenplay data helpers
// ────────────────────────────────────────────────────────────────

interface ScreenplayData {
  characters: Record<string, any>;
  locations: Record<string, any>;
  elementMap: Record<string, any>;
  previsMap: Record<string, any>;
  characterAssets: Record<string, any>;
  locationAssets: Record<string, any>;
  assetMap: Record<string, any>;
  scenes?: any[];
}

/**
 * Build an SRT subtitle file from dialogue text and audio duration.
 * Splits text into sentences and distributes timing proportionally.
 */
function buildSrt(text: string, duration: number | null, characterName?: string): string {
  const totalDur = duration && duration > 0 ? duration : Math.max(2, text.length / 15);

  // Split into sentences (or clauses for short dialogue)
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const lines: string[] = [];

  const totalChars = sentences.reduce((sum, s) => sum + s.trim().length, 0) || 1;
  let currentTime = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const proportion = sentence.length / totalChars;
    const segDur = totalDur * proportion;
    const startTime = currentTime;
    const endTime = currentTime + segDur;

    const startSrt = formatSrtTime(startTime);
    const endSrt = formatSrtTime(endTime);

    const prefix = characterName ? `<b>${characterName}</b>\n` : '';
    lines.push(`${lines.length + 1}\n${startSrt} --> ${endSrt}\n${prefix}${sentence}\n`);

    currentTime = endTime;
  }

  return lines.join('\n');
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Call Google Veo 3.1 API directly for video generation.
 * Uses predictLongRunning endpoint with polling.
 */
async function callVeoApi(params: {
  prompt: string;
  sourceImage?: string;
  lastFrameImage?: string;
  duration: number;
  aspectRatio: string;
  outputPath: string;
}, sdk: PipelineRouteSdk): Promise<{ success: boolean; filePath?: string; error?: string }> {

  // Get API key via SDK exec (reads env files without fs import)
  let apiKey = '';
  try {
    const result = await sdk.exec(
      `cat "$HOME/.woodbury/extensions/woodbury-ext-nanobanana/.env" "$HOME/.woodbury/extensions/nanobanana/.env" 2>/dev/null | grep GEMINI_API_KEY | head -1 | cut -d= -f2`,
      { timeout: 3000 }
    );
    apiKey = (result.stdout || '').trim();
  } catch {}
  if (!apiKey) return { success: false, error: 'GEMINI_API_KEY not found in nanobanana extension config' };

  // Build request
  const instance: any = { prompt: params.prompt };
  if (params.sourceImage && sdk.fileExists(params.sourceImage)) {
    try {
      // Read file directly with Node.js fs (not exec) to avoid buffer overflow on large images
      const { readFileSync } = await import('fs');
      const imageBuffer = readFileSync(params.sourceImage);
      const b64 = imageBuffer.toString('base64');
      if (b64) {
        // Detect MIME from file magic bytes
        let mimeType = 'image/png';
        if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) mimeType = 'image/jpeg';
        else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mimeType = 'image/png';
        else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mimeType = 'image/webp';
        // Store raw data for now — format depends on which model is chosen later
        instance._imageB64 = b64;
        instance._imageMime = mimeType;
        sdk.log('info', 'veo-api', `Source image: ${params.sourceImage.split('/').pop()}, mime=${mimeType}, size=${imageBuffer.length} bytes, b64=${b64.length} chars`);
      }
    } catch (imgErr: any) {
      sdk.log('warn', 'veo-api', `Could not load source image: ${params.sourceImage} — ${imgErr.message}`);
    }
  }

  // Last frame support (Veo 3.1 interpolation: start → end frame)
  if (params.lastFrameImage && sdk.fileExists(params.lastFrameImage)) {
    try {
      const { readFileSync } = await import('fs');
      const lastBuffer = readFileSync(params.lastFrameImage);
      const lastB64 = lastBuffer.toString('base64');
      if (lastB64) {
        let lastMime = 'image/png';
        if (lastBuffer[0] === 0xFF && lastBuffer[1] === 0xD8) lastMime = 'image/jpeg';
        else if (lastBuffer[0] === 0x89 && lastBuffer[1] === 0x50) lastMime = 'image/png';
        else if (lastBuffer[0] === 0x52 && lastBuffer[1] === 0x49) lastMime = 'image/webp';
        instance._lastFrameB64 = lastB64;
        instance._lastFrameMime = lastMime;
        sdk.log('info', 'veo-api', `Last frame: ${params.lastFrameImage.split('/').pop()}, mime=${lastMime}, size=${lastBuffer.length} bytes`);
      }
    } catch (lastErr: any) {
      sdk.log('warn', 'veo-api', `Could not load last frame image: ${params.lastFrameImage} — ${lastErr.message}`);
    }
  }

  const hasImage = !!instance._imageB64;
  const hasLastFrame = !!instance._lastFrameB64;

  // ── SDK path: use @google/genai for lastFrame interpolation ──
  if (hasLastFrame && hasImage) {
    sdk.log('info', 'veo-api', `Using @google/genai SDK for first+last frame interpolation`);
    sdk.log('info', 'veo-api', `First image: ${instance._imageMime}, ${instance._imageB64.length} b64 chars`);
    sdk.log('info', 'veo-api', `Last frame: ${instance._lastFrameMime}, ${instance._lastFrameB64.length} b64 chars`);

    // Convert PNGs to JPEG to reduce size (PNGs can be 2MB+ which may exceed limits)
    const convertToJpeg = async (b64: string, mime: string, label: string): Promise<{ b64: string; mime: string }> => {
      if (mime === 'image/jpeg') return { b64, mime };
      try {
        // Decode b64 to temp file, convert with ffmpeg, re-encode
        const tmpIn = params.outputPath + `_${label}_in.png`;
        const tmpOut = params.outputPath + `_${label}_out.jpg`;
        const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
        writeFileSync(tmpIn, Buffer.from(b64, 'base64'));
        await sdk.exec(`ffmpeg -i "${tmpIn}" -q:v 2 -y "${tmpOut}"`, { timeout: 10000 });
        const jpgBuf = readFileSync(tmpOut);
        try { unlinkSync(tmpIn); } catch {}
        try { unlinkSync(tmpOut); } catch {}
        sdk.log('info', 'veo-api', `Converted ${label} to JPEG: ${b64.length} → ${jpgBuf.length * 4/3|0} b64 chars`);
        return { b64: jpgBuf.toString('base64'), mime: 'image/jpeg' };
      } catch (convErr) {
        sdk.log('warn', 'veo-api', `JPEG conversion failed for ${label}: ${convErr}`);
        return { b64, mime };
      }
    };

    const first = await convertToJpeg(instance._imageB64, instance._imageMime, 'first');
    const last = await convertToJpeg(instance._lastFrameB64, instance._lastFrameMime, 'last');

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const firstImage = { imageBytes: first.b64, mimeType: first.mime };
      const lastImage = { imageBytes: last.b64, mimeType: last.mime };

      sdk.log('info', 'veo-api', `Calling ai.models.generateVideos with prompt: ${params.prompt.substring(0, 100)}...`);

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: params.prompt,
        image: firstImage,
        config: {
          lastFrame: lastImage,
          aspectRatio: params.aspectRatio,
        },
      });

      const opName = (operation as any).name;
      sdk.log('info', 'veo-api', `Operation started: name=${opName}`);

      if (!opName) {
        return { success: false, error: 'No operation name returned from SDK' };
      }

      // Poll with REST — the SDK's getVideosOperation doesn't return done/response
      let opData: any = {};
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${apiKey}`;
        const pollResp = await fetch(pollUrl);
        opData = await pollResp.json();
        sdk.log('info', 'veo-api', `Poll ${i + 1}: done=${opData.done}`);
        if (opData.done) break;
        if (opData.error) {
          return { success: false, error: `Veo error: ${opData.error.message || JSON.stringify(opData.error)}` };
        }
      }

      if (!opData.done) {
        return { success: false, error: 'Video generation timed out (5 min)' };
      }

      // Check for content filter (RAI = Responsible AI)
      const videoResp = opData.response?.generateVideoResponse;
      if (videoResp?.raiMediaFilteredCount > 0) {
        const reasons = videoResp.raiMediaFilteredReasons?.join('; ') || 'Content filtered by safety policy';
        sdk.log('warn', 'veo-api', `Content filtered: ${reasons}`);
        return { success: false, error: `Content filtered: ${reasons}` };
      }

      // Response: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } }
      const samples = videoResp?.generatedSamples;
      if (!samples?.length || !samples[0].video?.uri) {
        sdk.log('error', 'veo-api', `Unexpected response: ${JSON.stringify(opData).substring(0, 1000)}`);
        return { success: false, error: 'No video URI in response' };
      }

      // Download the video
      const videoUri = samples[0].video.uri;
      sdk.log('info', 'veo-api', `Downloading video from: ${videoUri.substring(0, 80)}...`);
      const dlUrl = videoUri.includes('?') ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`;
      const dlResp = await fetch(dlUrl);
      if (!dlResp.ok) {
        return { success: false, error: `Video download failed: ${dlResp.status}` };
      }
      const { writeFileSync } = await import('fs');
      const videoBuffer = Buffer.from(await dlResp.arrayBuffer());
      writeFileSync(params.outputPath, videoBuffer);
      sdk.log('info', 'veo-api', `Video saved: ${params.outputPath} (${(videoBuffer.length / 1024).toFixed(0)}KB)`);
      return { success: true, filePath: params.outputPath };
    } catch (sdkErr: any) {
      sdk.log('error', 'veo-api', `SDK error: ${sdkErr.message}\n${sdkErr.stack || ''}`);
      return { success: false, error: `Veo SDK error: ${sdkErr.message}` };
    }
  }

  // ── REST path: standard image-to-video or text-to-video ──
  const useVeo31 = !hasImage;
  const modelId = useVeo31 ? 'veo-3.1-generate-preview' : 'veo-2.0-generate-001';

  if (hasImage) {
    instance.image = { bytesBase64Encoded: instance._imageB64, mimeType: instance._imageMime };
  }

  // Clean up temp fields
  delete instance._imageB64; delete instance._imageMime;
  delete instance._lastFrameB64; delete instance._lastFrameMime;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predictLongRunning`;
  const body = {
    instances: [instance],
    parameters: { aspectRatio: params.aspectRatio, durationSeconds: params.duration },
  };

  sdk.log('info', 'veo-api', `POST ${modelId} (duration=${params.duration}s, hasImage=${hasImage})`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: `Veo API error (${response.status}): ${errText.substring(0, 500)}` };
  }

  let opData = await response.json() as any;
  sdk.log('info', 'veo-api', `Operation: ${opData.name || 'direct'}, done=${opData.done}`);

  // Poll if long-running operation
  if (opData.name && !opData.done) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opData.name}?key=${apiKey}`);
      if (!pollRes.ok) continue;
      opData = await pollRes.json();
      sdk.log('info', 'veo-api', `Poll ${i + 1}: done=${opData.done}`);
      if (opData.done) break;
    }
    if (!opData.done) return { success: false, error: 'Video generation timed out' };
    if (opData.error) return { success: false, error: `Veo error: ${opData.error.message}` };
  }

  // Check for content filter (RAI)
  const respData = opData.response || opData;
  const gvrCheck = respData.generateVideoResponse || respData;
  if (gvrCheck.raiMediaFilteredCount > 0) {
    const reasons = gvrCheck.raiMediaFilteredReasons?.join('; ') || 'Content filtered by safety policy';
    return { success: false, error: `Content filtered: ${reasons}` };
  }

  // Extract video URI — handle various response formats
  let videoUri: string | undefined;
  const resp = respData;
  const gvr = resp.generateVideoResponse || resp;
  const samples = gvr.generatedSamples || gvr.generated_samples || [];
  if (samples[0]?.video?.uri) {
    videoUri = samples[0].video.uri;
  } else if (samples[0]?.uri) {
    videoUri = samples[0].uri;
  }
  // Also check predictions format
  if (!videoUri && (resp.predictions?.[0]?.video?.uri)) {
    videoUri = resp.predictions[0].video.uri;
  }

  if (!videoUri) {
    // Check for content filter / RAI reasons
    const raiReasons = gvr.raiMediaFilteredReasons || [];
    const raiCount = gvr.raiMediaFilteredCount || 0;
    if (raiReasons.length > 0 || raiCount > 0) {
      const msg = raiReasons[0] || `Content filtered (${raiCount} items blocked by safety filter)`;
      sdk.log('warn', 'veo-api', `Content filtered: ${msg}`);
      return { success: false, error: msg };
    }
    const respStr = JSON.stringify(opData).substring(0, 1500);
    sdk.log('error', 'veo-api', `No video URI. Full response: ${respStr}`);
    return { success: false, error: `No video URI in response. Response: ${respStr.substring(0, 300)}` };
  }

  // Download video (follow redirects)
  sdk.log('info', 'veo-api', `Downloading video from: ${videoUri.substring(0, 80)}...`);
  const dlUrl = videoUri.includes('?') ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`;
  const dlRes = await fetch(dlUrl, { redirect: 'follow' });
  if (!dlRes.ok) {
    // If fetch doesn't follow redirects, use curl via exec
    try {
      await sdk.exec(`curl -sL "${dlUrl}" -o "${params.outputPath}" --max-time 60`, { timeout: 65000 });
      const stat = await sdk.stat(params.outputPath);
      if (stat.size > 1000) {
        sdk.log('info', 'veo-api', `Video downloaded via curl: ${params.outputPath} (${stat.size} bytes)`);
        return { success: true, filePath: params.outputPath };
      }
    } catch {}
    return { success: false, error: `Download failed (${dlRes.status})` };
  }

  const videoBuf = Buffer.from(await dlRes.arrayBuffer());
  const dir = sdk.dirname(params.outputPath);
  await sdk.mkdir(dir);
  await sdk.writeFile(params.outputPath, videoBuf);

  sdk.log('info', 'veo-api', `Video saved: ${params.outputPath} (${videoBuf.length} bytes)`);
  return { success: true, filePath: params.outputPath };
}

function buildScreenplayMaps(project: any): ScreenplayData {
  const allCharacters = project.characters || [];
  const allLocations = project.locations || [];
  const allElements = project.elements || [];
  const allPrevis = project.previsualizations?.shots || [];
  const allAssets = Array.isArray(project.assets) ? project.assets : (project.assets?.assets || []);

  const characters: Record<string, any> = {};
  for (const c of allCharacters) characters[c.id] = c;

  const locations: Record<string, any> = {};
  for (const l of allLocations) locations[l.id] = l;

  const elementMap: Record<string, any> = {};
  for (const e of allElements) elementMap[e.id] = e;

  // Include scene shots as virtual elements
  const allScenes = project.scenes || [];
  for (const scene of allScenes) {
    for (const shot of scene.shots || []) {
      if (!elementMap[shot.id]) {
        elementMap[shot.id] = {
          id: shot.id,
          type: 'shot',
          content: shot.description || '',
          shotText: `${shot.shotType} — ${shot.description || ''}`,
          characterIds: shot.characterIds || [],
          _sceneShot: true,
        };
      }
    }
  }

  const previsMap: Record<string, any> = {};
  for (const p of allPrevis) previsMap[p.shotElementId] = p;

  const assetMap: Record<string, any> = {};
  for (const a of allAssets) assetMap[a.id] = a;

  const characterAssets: Record<string, any> = {};
  for (const asset of allAssets) {
    const meta = asset.metadata || {};
    if (meta.characterId && (asset.type === 'character-headshot' || asset.name?.toLowerCase().includes('headshot'))) {
      characterAssets[meta.characterId] = asset;
    }
  }
  for (const c of allCharacters) {
    if (c.imagePath && !characterAssets[c.id]) {
      characterAssets[c.id] = { id: c.id, filePath: c.imagePath, type: 'character-headshot' };
    }
  }

  const locationAssets: Record<string, any> = {};
  for (const asset of allAssets) {
    const meta = asset.metadata || {};
    if (meta.locationId && (asset.type === 'landscape' || asset.name?.toLowerCase().includes('landscape'))) {
      locationAssets[meta.locationId] = asset;
    }
  }
  for (const l of allLocations) {
    if (l.imagePath && !locationAssets[l.id]) {
      locationAssets[l.id] = { id: l.id, filePath: l.imagePath, type: 'landscape' };
    }
  }

  return { characters, locations, elementMap, previsMap, characterAssets, locationAssets, assetMap, scenes: project.scenes };
}

async function collectScreenplayData(sdk: PipelineRouteSdk): Promise<ScreenplayData | null> {
  let project = sdk.getProject();
  if (!project || !project.elements?.length) {
    project = await sdk.ensureProject();
    if (!project || !project.elements?.length) return null;
  }
  return buildScreenplayMaps(project);
}

/**
 * Resolve character and location reference images for a given element.
 * Extracted from generate-previs to be reusable across image and video generation routes.
 */
async function resolveReferences(
  sdk: PipelineRouteSdk,
  screenplay: ScreenplayData,
  elementId: string,
  actionConfig: any,
  options?: { sceneId?: string; sceneLocationId?: string; projData?: any }
): Promise<{
  referenceImages: string[];
  refDescriptions: string[];
  characterIds: string[];
  locationId?: string;
}> {
  const referenceImages: string[] = [];
  const refDescriptions: string[] = [];
  const refConfig = actionConfig.referenceResolution || {};
  const charConfig = refConfig.characters || {};
  let characterIds: string[] = [];

  const element = screenplay.elementMap[elementId];
  const previs = screenplay.previsMap[elementId];

  // ── Resolve character references ──
  if (charConfig.strategy === 'binding-match' && sdk.pipelineDir) {
    let bindingsDoc = await sdk.loadBindings();
    const existingCharBindings = bindingsDoc.bindings.filter(
      (b: any) => b.type === (charConfig.bindingType || 'depicts') &&
           b.source.entityType === (charConfig.sourceEntityType || 'shot') &&
           b.source.entityId === elementId
    );

    if (charConfig.autoCreateBindings && existingCharBindings.length === 0) {
      const rulesDoc = await sdk.loadRules();
      if (rulesDoc.rules.length > 0) {
        sdk.log('info', 'resolve-refs', `Auto-creating bindings for shot ${elementId} from pipeline rules...`);
        const autoResult = await sdk.autoRunRules();
        if (autoResult.added > 0) {
          sdk.log('info', 'resolve-refs', `Auto-created ${autoResult.added} bindings`);
          bindingsDoc = await sdk.loadBindings();
        }
      }
    }

    const targetIds: string[] = [];
    for (const b of bindingsDoc.bindings) {
      if (b.type === (charConfig.bindingType || 'depicts') &&
          b.source.entityType === (charConfig.sourceEntityType || 'shot') &&
          b.source.entityId === elementId &&
          b.target?.entityId) {
        targetIds.push(b.target.entityId);
      }
    }
    characterIds = targetIds;
    sdk.log('info', 'resolve-refs', `Bindings → ${characterIds.length} characters for ${elementId}`, { characterIds });
  }

  // From scene-grouped shot data
  if (characterIds.length === 0 && screenplay.scenes && options?.sceneId) {
    const scene = screenplay.scenes.find((s: any) => s.id === options.sceneId);
    if (scene) {
      const shot = scene.shots?.find((s: any) => s.id === elementId);
      if (shot?.characterIds?.length) {
        characterIds = shot.characterIds;
        sdk.log('info', 'resolve-refs', `Scene shot → ${characterIds.length} characters from scene.shots[].characterIds`);
      }
    }
  }

  // Fallback: from element's characterIds metadata
  if (characterIds.length === 0 && element?.characterIds && Array.isArray(element.characterIds)) {
    characterIds = element.characterIds;
  }

  // Fallback: from previs entry
  if (characterIds.length === 0 && charConfig.fallback !== 'none') {
    characterIds = previs?.characterIds || [];
  }

  // Fallback: text-match character names
  if (characterIds.length === 0 && element) {
    const shotText = (element.content || element.shotText || '').toUpperCase();
    const candidates = Object.values(screenplay.characters)
      .map((c: any) => ({
        id: c.id,
        names: [c.name, c.displayName].filter(Boolean).map((n: string) => n.toUpperCase()),
        maxLen: Math.max(...[c.name, c.displayName].filter(Boolean).map((n: string) => n.length)),
      }))
      .sort((a, b) => b.maxLen - a.maxLen);

    for (const c of candidates) {
      for (const name of c.names) {
        if (!name || name.length < 2) continue;
        try {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`\\b${escaped}\\b`);
          if (re.test(shotText)) {
            if (!characterIds.includes(c.id)) characterIds.push(c.id);
            break;
          }
        } catch { /* skip */ }
      }
    }
    if (characterIds.length > 4) characterIds = characterIds.slice(0, 4);
  }

  // Fallback: infer characters from adjacent dialogue elements in the same scene
  if (characterIds.length === 0) {
    const allElemIds = Object.keys(screenplay.elementMap).sort((a, b) => {
      const na = parseInt(a.replace('element_', '')) || 0;
      const nb = parseInt(b.replace('element_', '')) || 0;
      return na - nb;
    });
    const elemIdx = allElemIds.indexOf(elementId);
    if (elemIdx >= 0) {
      const nearbyCharIds = new Set<string>();
      for (let di = Math.max(0, elemIdx - 5); di < Math.min(allElemIds.length, elemIdx + 6); di++) {
        const nearby = screenplay.elementMap[allElemIds[di]];
        if (nearby?.type === 'dialogue' && nearby?.characterId) {
          nearbyCharIds.add(nearby.characterId);
        }
      }
      characterIds = Array.from(nearbyCharIds).slice(0, 4);
      if (characterIds.length > 0) {
        sdk.log('info', 'resolve-refs', `Nearby dialogue → ${characterIds.length} characters for ${elementId}`);
      }
    }
  }

  for (const charId of characterIds) {
    const charData = screenplay.characters[charId];
    const charAsset = screenplay.characterAssets[charId];
    // Prefer fresh imagePath from character data over stale asset collection
    const charImagePath = charData?.imagePath || charAsset?.filePath;
    if (charImagePath && sdk.fileExists(charImagePath)) {
      referenceImages.push(charImagePath);
      const desc = charData?.description || charData?.name || charId;
      refDescriptions.push(
        `Reference image ${referenceImages.length} is ${charData?.displayName || charData?.name || charId}` +
        (desc ? ` (${desc.substring(0, 120)})` : '')
      );
    }
  }

  // ── Resolve location references ──
  const locConfig = refConfig.locations || {};
  let locationId: string | undefined = undefined;

  if (locConfig.strategy === 'binding-match' && sdk.pipelineDir) {
    const bindingsDoc = await sdk.loadBindings();
    for (const b of bindingsDoc.bindings) {
      if (b.type === (locConfig.bindingType || 'set-in') &&
          b.source.entityType === (locConfig.sourceEntityType || 'shot') &&
          b.source.entityId === elementId &&
          b.target?.entityId) {
        locationId = b.target.entityId;
        break;
      }
    }
  }

  if (!locationId && options?.sceneLocationId) {
    locationId = options.sceneLocationId;
  }

  if (!locationId && locConfig.fallback !== 'none') {
    locationId = previs?.locationId;
  }

  if (!locationId && element) {
    const shotText = (element.content || element.shotText || '').toUpperCase();
    for (const l of Object.values(screenplay.locations)) {
      const name = ((l as any).name || '').toUpperCase();
      if (name && shotText.includes(name)) {
        locationId = (l as any).id;
        break;
      }
    }
  }

  if (locationId) {
    const locData = screenplay.locations[locationId];
    const locAsset = screenplay.locationAssets[locationId];
    // Prefer fresh imagePath from location data over stale asset collection
    const locImagePath = locData?.imagePath || locAsset?.filePath;
    if (locImagePath && sdk.fileExists(locImagePath)) {
      referenceImages.push(locImagePath);
      refDescriptions.push(
        `Reference image ${referenceImages.length} is the location "${locData?.name || locationId}"` +
        (locData?.description ? ` (${locData.description.substring(0, 120)})` : '')
      );
    }
  }

  return { referenceImages, refDescriptions, characterIds, locationId };
}

// ────────────────────────────────────────────────────────────────
//  Route setup — exported as default
// ────────────────────────────────────────────────────────────────

export default function setupRoutes(sdk: PipelineRouteSdk) {
  // Store render process for cancellation
  let renderProcess: any = null;

  return async (req: any, res: any, subPath: string): Promise<boolean> => {

    // ── POST /generate-previs ──────────────────────────────────
    if (req.method === 'POST' && subPath === '/generate-previs') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      const promptOverrides: Record<string, string> = body.promptOverrides || {};
      const sceneId: string | undefined = body.sceneId;
      const sceneLocationId: string | undefined = body.sceneLocationId;

      if (!elementId) {
        sdk.sendJson(res, 400, { error: 'elementId required' });
        return true;
      }

      const actionConfig = await sdk.loadActionConfig('generate-image');
      const model: 'flash' | 'pro' = body.model || actionConfig.generation?.model || 'flash';
      const aspectRatio: string = body.aspectRatio || actionConfig.generation?.aspectRatio || '16:9';

      const screenplay = await collectScreenplayData(sdk);
      if (!screenplay) {
        sdk.sendJson(res, 404, { error: 'No screenplay data found in app state' });
        return true;
      }

      const previs = screenplay.previsMap[elementId];
      const element = screenplay.elementMap[elementId];
      if (!element) {
        sdk.sendJson(res, 404, { error: 'Element not found: ' + elementId });
        return true;
      }

      // ── Resolve character & location references via shared helper ──
      const refs = await resolveReferences(sdk, screenplay, elementId, actionConfig, { sceneId, sceneLocationId });
      const { referenceImages, refDescriptions, characterIds, locationId } = refs;

      // ── Build prompt ──
      const shotText = element.shotText || element.content || '';
      const previsDescription = promptOverrides.description || previs?.description || shotText;
      const cameraIntent = promptOverrides.cameraIntent || previs?.cameraIntent || '';
      const composition = promptOverrides.composition || previs?.composition || '';
      const lighting = promptOverrides.lighting || previs?.lighting || '';
      const frameSize = element.frameSize || '';
      const cameraMovement = element.cameraMovement || '';

      const lensMap: Record<string, string> = actionConfig.frameSizeLensMap || {
        'WIDE': 'wide-angle lens (24mm), deep depth of field',
        'EXTREME WIDE': 'ultra wide-angle lens (16mm), expansive depth of field',
        'MEDIUM': 'standard lens (50mm), natural perspective with moderate depth of field',
        'MEDIUM CLOSE-UP': '85mm portrait lens, shallow depth of field (f/2.8)',
        'CLOSE-UP': '85mm portrait lens, very shallow depth of field (f/1.8)',
        'EXTREME CLOSE-UP': 'macro lens (100mm), extremely shallow depth of field (f/1.4)',
      };
      const lensDesc = lensMap[frameSize.toUpperCase()] || '';

      const movementMap: Record<string, string> = actionConfig.cameraMovementMap || {
        'STATIC': 'locked-off camera on a tripod, perfectly still frame',
        'PAN': 'smooth horizontal pan following the action',
        'TILT': 'gentle vertical tilt revealing the scene',
        'DOLLY': 'dolly tracking shot moving through the space',
        'SLOW PUSH IN': 'subtle dolly push-in, gradually tightening the frame',
        'PUSH IN': 'dolly push-in toward the subject',
        'PULL BACK': 'slow dolly pull-back revealing the wider scene',
        'TRACKING': 'tracking shot moving alongside the subject',
        'CRANE': 'crane shot with elevated, sweeping perspective',
        'HANDHELD': 'handheld camera with slight organic movement',
        'STEADICAM': 'smooth Steadicam floating through the scene',
      };
      const movementDesc = movementMap[cameraMovement.toUpperCase()] || '';

      let prompt = '';
      const refInstruction = actionConfig.referenceInstruction
        || 'Using the attached reference images as visual guides for character appearance and location setting. The characters in this frame must match these references exactly — same face, hair, body type, clothing, and features. The environment should be consistent with the location reference.';

      if (referenceImages.length > 0) {
        prompt += refInstruction + '\n' + refDescriptions.join('. ') + '.\n\n';
      }

      prompt += previsDescription;
      if (previsDescription !== shotText && shotText) {
        prompt += ` The camera captures: ${shotText}`;
      }
      prompt += '\n\n';

      if (lensDesc || movementDesc || composition) {
        prompt += 'Shot on a cinema camera';
        if (lensDesc) prompt += ` with a ${lensDesc}`;
        prompt += '. ';
        if (movementDesc) prompt += `Camera technique: ${movementDesc}. `;
        if (composition) prompt += composition + '. ';
        prompt += '\n\n';
      }

      if (lighting) prompt += `Lighting: ${lighting}. `;
      if (cameraIntent && cameraIntent !== composition) prompt += cameraIntent + '. ';
      if (lighting || cameraIntent) prompt += '\n\n';

      // Use shot prompt prefix from metadata if set — overrides default style
      const shotProject = sdk.getProject();
      const shotPrefix = shotProject?.metadata?.shotImagePromptPrefix || '';
      if (shotPrefix) {
        prompt += `Style: ${shotPrefix}`;
      } else {
        const stylePrompt = actionConfig.prompt?.sections?.find((s: any) => s.id === 'style')?.template
          || 'Style: Cinematic previsualization frame, shot on 35mm film with subtle grain. Professional cinematography with rich color grading, deep shadows, and controlled highlights. The image should feel like a single frame from a feature film.';
        prompt += stylePrompt;
      }

      // ── Generate image ──
      const projFolder = await sdk.getProjectFolder();
      const previsDir = sdk.join(projFolder, 'assets', 'previs');
      await sdk.mkdir(previsDir);
      const outputPath = sdk.join(previsDir, `previs_${elementId}_${Date.now().toString(36)}.png`);

      try {
        sdk.log('info', 'generate-previs', `Generating previs for ${elementId} with ${referenceImages.length} reference images`, { referenceImages });
        const result = await sdk.generateImage({
          prompt,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
          model,
          aspectRatio,
          outputPath,
        });

        if (!result.success) {
          sdk.sendJson(res, 500, { error: result.error || 'Generation failed' });
          return true;
        }

        const filePath = result.filePath || outputPath;

        const generationId = `gen_${Date.now().toString(36)}`;
        const generation = {
          id: generationId,
          filePath,
          generatedAt: new Date().toISOString(),
          aspectRatio,
          referenceImages,
          referenceCharacterIds: characterIds,
          referenceLocationId: locationId || undefined,
          generationModel: model,
          generationPrompt: prompt.substring(0, 1000),
        };

        let generationCount = 1;

        // Update project data
        if (sdk.isProjectLoaded()) {
          const projData = sdk.getProject()!;
          if (!projData.previsualizations) projData.previsualizations = { shots: [] };
          if (!projData.previsualizations.shots) projData.previsualizations.shots = [];

          const existingIdx = projData.previsualizations.shots.findIndex((s: any) => s.shotElementId === elementId);
          if (existingIdx >= 0) {
            const existing = projData.previsualizations.shots[existingIdx];
            if (!existing.generations) existing.generations = [];
            if (existing.filePath && !existing.generations.some((g: any) => g.filePath === existing.filePath)) {
              existing.generations.push({
                id: `gen_migrated_${Date.now().toString(36)}`,
                filePath: existing.filePath,
                generatedAt: existing._generatedAt || new Date().toISOString(),
              });
            }
            existing.generations.push(generation);
            existing.filePath = filePath;
            existing._generatedFilePath = filePath;
            existing._generatedAt = generation.generatedAt;
            // Don't update selectedGenerationId — only gallery selection changes it
            existing.description = previsDescription; // Use overridden description if provided
            if (Object.keys(promptOverrides).length > 0) existing.promptOverrides = promptOverrides;
            generationCount = existing.generations.length;
          } else {
            const newEntry: any = {
              shotElementId: elementId,
              filePath,
              _generatedFilePath: filePath,
              _generatedAt: generation.generatedAt,
              description: previsDescription,
              generations: [generation],
            };
            if (Object.keys(promptOverrides).length > 0) newEntry.promptOverrides = promptOverrides;
            projData.previsualizations.shots.push(newEntry);
          }

          // Update scene-grouped shot data
          if (projData.scenes && Array.isArray(projData.scenes)) {
            for (const scene of projData.scenes) {
              if (!scene.shots) continue;
              const shotIdx = scene.shots.findIndex((s: any) => s.id === elementId);
              if (shotIdx >= 0) {
                const shot = scene.shots[shotIdx];
                if (!shot.generations) shot.generations = [];
                if (shot.previsPath && !shot.generations.some((g: any) => g.filePath === shot.previsPath)) {
                  shot.generations.push({
                    id: `gen_migrated_${Date.now().toString(36)}`,
                    filePath: shot.previsPath,
                    generatedAt: shot.generatedAt || new Date().toISOString(),
                  });
                }
                shot.generations.push(generation);
                shot.previsPath = filePath;
                shot.generatedAt = generation.generatedAt;
                if (aspectRatio) shot.aspectRatio = aspectRatio;
                generationCount = shot.generations.length;
                break;
              }
            }
          }
          sdk.markDirty(['previsualizations', 'scenes']);
          await sdk.flushProject();
        }

        sdk.sendJson(res, 200, {
          success: true,
          elementId,
          filePath,
          generationId,
          generationCount,
          refsUsed: referenceImages.map((r: string) => sdk.basename(r)),
          refCount: { characters: characterIds.length, locations: locationId ? 1 : 0 },
          prompt: prompt.substring(0, 500),
          model,
        });
      } catch (err) {
        sdk.log('info', 'generate-previs', `Error: ${err}`);
        sdk.sendJson(res, 500, { error: 'Generation failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /preview-video-prompt ──────────────────────────────
    if (req.method === 'POST' && subPath === '/preview-video-prompt') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      if (!elementId) { sdk.sendJson(res, 400, { error: 'elementId required' }); return true; }
      const actionConfig = await sdk.loadActionConfig('generate-video');
      const aspectRatio: string = body.aspectRatio || actionConfig.generation?.aspectRatio || '16:9';
      const screenplay = await collectScreenplayData(sdk);
      if (!screenplay) { sdk.sendJson(res, 404, { error: 'No screenplay data' }); return true; }
      const element = screenplay.elementMap[elementId];
      if (!element) { sdk.sendJson(res, 404, { error: 'Element not found: ' + elementId }); return true; }
      const previs = screenplay.previsMap[elementId];
      const refs = await resolveReferences(sdk, screenplay, elementId, actionConfig, {});
      const shotText = element.shotText || element.content || '';
      const previsDescription = previs?.description || shotText;
      const cameraMovement = element.cameraMovement || '';
      const cameraIntent = previs?.cameraIntent || '';
      const lighting = previs?.lighting || '';
      const lensDesc = (actionConfig.frameSizeLensMap || {})[((element.frameSize || '') as string).toUpperCase()] || '';
      const movementDesc = (actionConfig.cameraMovementPromptMap || {})[cameraMovement.toUpperCase()] || '';
      const continueChainPreview: boolean = body.continueChain === true;
      let sourceImage: string | undefined;

      // For chain continuation, show the last video's file path as the source reference
      if (continueChainPreview && sdk.isProjectLoaded()) {
        const projData = sdk.getProject()!;
        const pvShot = projData.previsualizations?.shots?.find((s: any) => s.shotElementId === elementId);
        if (pvShot) {
          let lastVideoPath: string | undefined;
          if (pvShot.videoChain?.length > 0 && pvShot.videoGenerations) {
            const lastId = pvShot.videoChain[pvShot.videoChain.length - 1];
            lastVideoPath = pvShot.videoGenerations.find((g: any) => g.id === lastId)?.filePath;
          } else if (pvShot.selectedVideoGenerationId && pvShot.videoGenerations) {
            lastVideoPath = pvShot.videoGenerations.find((g: any) => g.id === pvShot.selectedVideoGenerationId)?.filePath;
          } else if (pvShot.videoPath) {
            lastVideoPath = pvShot.videoPath;
          }
          if (lastVideoPath && sdk.fileExists(lastVideoPath)) sourceImage = lastVideoPath;
        }
      }

      if (!sourceImage && previs?.selectedGenerationId && previs.generations?.length > 0) {
        const g = previs.generations.find((g: any) => g.id === previs.selectedGenerationId);
        if (g?.filePath && sdk.fileExists(g.filePath)) sourceImage = g.filePath;
      }
      if (!sourceImage && previs?.filePath && sdk.fileExists(previs.filePath)) sourceImage = previs.filePath;
      let prompt = '';
      if (sourceImage) {
        const motionParts: string[] = [];
        if (movementDesc) motionParts.push(movementDesc);
        else if (cameraMovement) motionParts.push(cameraMovement.toLowerCase() + ' camera movement');
        else motionParts.push('Subtle camera movement');
        if (lensDesc) motionParts.push(lensDesc);
        if (cameraIntent) motionParts.push(cameraIntent);
        const genericDesc = (previsDescription || shotText || '').replace(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})?\b/g, 'the character').replace(/\b(?:David|Sarah|Marcus|Elena)\b/gi, 'the character').substring(0, 200);
        prompt = motionParts.join('. ') + '. ' + genericDesc + '\n\nNatural, cinematic motion. Characters move subtly and expressively.';
      } else {
        if (refs.referenceImages.length > 0) prompt += (actionConfig.referenceInstruction || '') + '\n' + refs.refDescriptions.join('. ') + '.\n\n';
        prompt += previsDescription;
        if (previsDescription !== shotText && shotText) prompt += ' The camera captures: ' + shotText;
        prompt += '\n\n';
        if (movementDesc) prompt += 'Camera motion: ' + movementDesc + '. ';
        if (lensDesc) prompt += 'Frame: ' + lensDesc + '. ';
        if (lighting) prompt += 'Lighting: ' + lighting + '. ';
        if (cameraIntent) prompt += cameraIntent + '. ';
        prompt += '\nStyle: Cinematic video footage shot on professional cinema camera.';
      }
      sdk.sendJson(res, 200, { prompt, sourceImage: sourceImage || null, aspectRatio });
      return true;
    }

    // ── POST /generate-video-previs ──────────────────────────────
    if (req.method === 'POST' && subPath === '/generate-video-previs') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      const sceneId: string | undefined = body.sceneId;
      const sceneLocationId: string | undefined = body.sceneLocationId;
      const lastFrameImagePath: string | undefined = body.lastFrameImage; // end-frame for interpolation

      if (!elementId) {
        sdk.sendJson(res, 400, { error: 'elementId required' });
        return true;
      }

      const actionConfig = await sdk.loadActionConfig('generate-video');
      const aspectRatio: string = body.aspectRatio || actionConfig.generation?.aspectRatio || '16:9';
      const duration: number = body.duration || actionConfig.generation?.defaultDuration || 6;

      const screenplay = await collectScreenplayData(sdk);
      if (!screenplay) {
        sdk.sendJson(res, 404, { error: 'No screenplay data found in app state' });
        return true;
      }

      const element = screenplay.elementMap[elementId];
      if (!element) {
        sdk.sendJson(res, 404, { error: 'Element not found: ' + elementId });
        return true;
      }

      const previs = screenplay.previsMap[elementId];
      const refs = await resolveReferences(sdk, screenplay, elementId, actionConfig, { sceneId, sceneLocationId });

      // ── Build video-specific prompt ──
      const shotText = element.shotText || element.content || '';
      const previsDescription = previs?.description || shotText;
      const frameSize = element.frameSize || '';
      const cameraMovement = element.cameraMovement || '';
      const lighting = previs?.lighting || '';
      const cameraIntent = previs?.cameraIntent || '';

      const lensMap: Record<string, string> = actionConfig.frameSizeLensMap || {};
      const lensDesc = lensMap[frameSize.toUpperCase()] || '';

      const movementPromptMap: Record<string, string> = actionConfig.cameraMovementPromptMap || {};
      const movementDesc = movementPromptMap[cameraMovement.toUpperCase()] || '';

      // For image-to-video: keep prompt simple (motion/camera only) to avoid content filter issues.
      // The source image already has the correct characters and scene.
      // For text-to-video: include full scene description since there's no source image.
      let prompt = '';

      // Check if we'll have a source image (determines prompt strategy)
      const willHaveSourceImage = (previs?.filePath && sdk.fileExists(previs.filePath)) ||
        (previs?.selectedGenerationId && previs?.generations?.some((g: any) => g.id === previs.selectedGenerationId && sdk.fileExists(g.filePath)));

      if (willHaveSourceImage) {
        // Image-to-video: simple motion prompt only — no character names, no references
        const motionParts: string[] = [];
        if (movementDesc) motionParts.push(movementDesc);
        else if (cameraMovement) motionParts.push(`${cameraMovement.toLowerCase()} camera movement`);
        else motionParts.push('Subtle camera movement');

        if (lensDesc) motionParts.push(lensDesc);
        if (cameraIntent) motionParts.push(cameraIntent);

        // Generic scene description without character names
        const genericDesc = (previsDescription || shotText || '')
          .replace(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})?\b/g, 'the character')  // Replace UPPERCASE names
          .replace(/\b(?:David|Sarah|Marcus|Elena)\b/gi, 'the character')  // Replace known names
          .substring(0, 200);

        prompt = motionParts.join('. ') + '. ' + genericDesc;
        prompt += '\n\nNatural, cinematic motion. Characters move subtly and expressively.';
      } else {
        // Text-to-video: full description needed
        const refInstruction = actionConfig.referenceInstruction || '';
        if (refs.referenceImages.length > 0) {
          prompt += refInstruction + '\n' + refs.refDescriptions.join('. ') + '.\n\n';
        }

        prompt += previsDescription;
        if (previsDescription !== shotText && shotText) {
          prompt += ` The camera captures: ${shotText}`;
        }
        prompt += '\n\n';

        if (movementDesc) prompt += `Camera motion: ${movementDesc}. `;
        if (lensDesc) prompt += `Frame: ${lensDesc}. `;
        if (movementDesc || lensDesc) prompt += '\n\n';

        if (lighting) prompt += `Lighting: ${lighting}. `;
        if (cameraIntent) prompt += cameraIntent + '. ';
        if (lighting || cameraIntent) prompt += '\n\n';

        const shotProject = sdk.getProject();
        const shotPrefix = shotProject?.metadata?.shotImagePromptPrefix || '';
        if (shotPrefix) {
          prompt += `Style: ${shotPrefix}`;
        } else {
          prompt += 'Style: Cinematic video footage shot on professional cinema camera. Smooth, naturalistic motion with 24fps film cadence.';
        }
      }

      // Allow prompt override from client
      if (body.promptOverride && typeof body.promptOverride === 'string' && body.promptOverride.trim()) {
        prompt = body.promptOverride.trim();
      }

      // ── Check for existing previs still image to use as source ──
      // For chain continuation: extract last frame from the last video in the chain
      const continueChain: boolean = body.continueChain === true;
      let sourceImage: string | undefined;

      if (continueChain && sdk.isProjectLoaded()) {
        const projData = sdk.getProject()!;
        const pvShot = projData.previsualizations?.shots?.find((s: any) => s.shotElementId === elementId);
        if (pvShot) {
          // Find the last video in the chain (or selected video if no chain)
          let lastVideoPath: string | undefined;
          if (pvShot.videoChain && pvShot.videoChain.length > 0 && pvShot.videoGenerations) {
            const lastId = pvShot.videoChain[pvShot.videoChain.length - 1];
            const lastGen = pvShot.videoGenerations.find((g: any) => g.id === lastId);
            lastVideoPath = lastGen?.filePath;
          } else if (pvShot.selectedVideoGenerationId && pvShot.videoGenerations) {
            const selGen = pvShot.videoGenerations.find((g: any) => g.id === pvShot.selectedVideoGenerationId);
            lastVideoPath = selGen?.filePath;
          } else if (pvShot.videoPath) {
            lastVideoPath = pvShot.videoPath;
          }

          if (lastVideoPath && sdk.fileExists(lastVideoPath)) {
            // Extract last frame from the video
            const projFolder = await sdk.getProjectFolder();
            const tempFrame = sdk.join(projFolder, 'assets', 'video-previs', `_lastframe_${elementId}.png`);
            try {
              // Get duration first, then seek to near end (more reliable than -sseof)
              const durResult = await sdk.exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${lastVideoPath}"`, { timeout: 5000 });
              const vidDur = parseFloat((durResult.stdout || '').trim()) || 5;
              const seekTo = Math.max(0, vidDur - 0.1);
              await sdk.exec(`ffmpeg -ss ${seekTo} -i "${lastVideoPath}" -frames:v 1 -update 1 -y "${tempFrame}"`, { timeout: 15000 });
              if (sdk.fileExists(tempFrame)) {
                sourceImage = tempFrame;
                sdk.log('info', 'generate-video-previs', `Chain continuation: extracted last frame from ${sdk.basename(lastVideoPath)}`);
              }
            } catch (frameErr) {
              sdk.log('warn', 'generate-video-previs', `Failed to extract last frame: ${frameErr}`);
            }
          }
        }
      }

      // Priority: 1) selected generation, 2) latest filePath, 3) scene shot previsPath

      // 1) Use the selected generation if one was picked in the gallery
      if (previs?.selectedGenerationId && previs.generations?.length > 0) {
        const selGen = previs.generations.find((g: any) => g.id === previs.selectedGenerationId);
        if (selGen?.filePath && sdk.fileExists(selGen.filePath)) {
          sourceImage = selGen.filePath;
          sdk.log('info', 'generate-video-previs', `Using SELECTED generation as source: ${sourceImage}`);
        }
      }

      // 2) Use the current filePath (latest generation)
      if (!sourceImage && previs?.filePath && sdk.fileExists(previs.filePath)) {
        sourceImage = previs.filePath;
        sdk.log('info', 'generate-video-previs', `Using latest previs still as source: ${sourceImage}`);
      }

      // 3) Check scene shots
      if (!sourceImage && screenplay.scenes) {
        for (const scene of screenplay.scenes) {
          const shot = scene.shots?.find((s: any) => s.id === elementId);
          if (shot?.previsPath && sdk.fileExists(shot.previsPath)) {
            sourceImage = shot.previsPath;
            sdk.log('info', 'generate-video-previs', `Using scene shot previs as source: ${sourceImage}`);
            break;
          }
        }
      }

      // ── Detect source image aspect ratio ──
      // When doing image-to-video, use the source image's own aspect ratio
      // to prevent Veo from cropping/reframing the image
      let effectiveAspectRatio = aspectRatio;
      if (sourceImage) {
        try {
          const sizeResult = await sdk.exec(
            `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${sourceImage}"`,
            { timeout: 5000 }
          );
          const dims = (sizeResult.stdout || '').trim().split('x');
          if (dims.length === 2) {
            const w = parseInt(dims[0]);
            const h = parseInt(dims[1]);
            if (w && h) {
              const ratio = w / h;
              if (ratio > 1.5) effectiveAspectRatio = '16:9';
              else if (ratio > 1.1) effectiveAspectRatio = '4:3';
              else if (ratio > 0.9) effectiveAspectRatio = '1:1';
              else if (ratio > 0.6) effectiveAspectRatio = '3:4';
              else effectiveAspectRatio = '9:16';
              sdk.log('info', 'generate-video-previs', `Source image ${w}x${h} → using aspect ratio ${effectiveAspectRatio}`);
            }
          }
        } catch {
          sdk.log('warn', 'generate-video-previs', 'Could not detect source image dimensions, using requested aspect ratio');
        }
      }

      // ── Generate video ──
      const projFolder = await sdk.getProjectFolder();
      const videoDir = sdk.join(projFolder, 'assets', 'video-previs');
      await sdk.mkdir(videoDir);
      const outputPath = sdk.join(videoDir, `video_${elementId}_${Date.now().toString(36)}.mp4`);

      try {
        sdk.log('info', 'generate-video-previs', `Generating video for ${elementId}, duration=${duration}s, aspectRatio=${aspectRatio}, source=${sourceImage ? 'image-to-video' : 'text-to-video'}`);

        // Call Veo API directly (inline, no external tool dependency)
        let result: { success: boolean; filePath?: string; error?: string };
        try {
          // Resolve last frame image for start+end interpolation
          let lastFrameImage: string | undefined = lastFrameImagePath;
          if (lastFrameImage && !sdk.fileExists(lastFrameImage)) {
            sdk.log('warn', 'generate-video-previs', `Last frame image not found: ${lastFrameImage}`);
            lastFrameImage = undefined;
          }

          result = await callVeoApi({
            prompt,
            sourceImage,
            lastFrameImage,
            duration,
            aspectRatio: effectiveAspectRatio,
            outputPath,
          }, sdk);
        } catch (veoErr: any) {
          result = { success: false, error: `Video generation failed: ${veoErr.message}` };
        }

        if (!result.success) {
          sdk.sendJson(res, 500, { error: result.error || 'Video generation failed' });
          return true;
        }

        const filePath = result.filePath || outputPath;

        // Probe actual video duration via ffprobe
        let actualDuration: number | undefined;
        try {
          const probeResult = sdk.spawnSync('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
          ]);
          if (probeResult.stdout) {
            const parsed = parseFloat(String(probeResult.stdout).trim());
            if (!isNaN(parsed) && parsed > 0) actualDuration = parsed;
          }
        } catch (_) { /* probe failure is non-fatal */ }

        // Update project data — store videoPath + videoGenerations on previs shot and scene shot
        const videoGeneration: any = {
          id: `vgen_${Date.now().toString(36)}`,
          filePath,
          generatedAt: new Date().toISOString(),
          aspectRatio: effectiveAspectRatio,
          duration,
          actualDuration,
          sourceImage: sourceImage || null,
          prompt: prompt.substring(0, 500),
        };
        let videoGenerationCount = 1;

        if (sdk.isProjectLoaded()) {
          const projData = sdk.getProject()!;
          if (!projData.previsualizations) projData.previsualizations = { shots: [] };
          if (!projData.previsualizations.shots) projData.previsualizations.shots = [];

          const existingIdx = projData.previsualizations.shots.findIndex((s: any) => s.shotElementId === elementId);
          if (existingIdx >= 0) {
            const existing = projData.previsualizations.shots[existingIdx];
            if (!existing.videoGenerations) existing.videoGenerations = [];
            // Migrate old videoPath into generations if not already there
            if (existing.videoPath && !existing.videoGenerations.some((g: any) => g.filePath === existing.videoPath)) {
              existing.videoGenerations.push({
                id: `vgen_migrated_${Date.now().toString(36)}`,
                filePath: existing.videoPath,
                generatedAt: existing._videoGeneratedAt || new Date().toISOString(),
              });
            }
            // If continuing chain, set continuationOf on the new generation
            if (continueChain) {
              const lastChainId = existing.videoChain?.length
                ? existing.videoChain[existing.videoChain.length - 1]
                : existing.selectedVideoGenerationId;
              if (lastChainId) videoGeneration.continuationOf = lastChainId;
            }
            existing.videoGenerations.push(videoGeneration);
            existing.videoPath = filePath;
            existing.selectedVideoGenerationId = videoGeneration.id;
            // Update video chain
            if (continueChain) {
              if (!existing.videoChain || existing.videoChain.length === 0) {
                // Initialize chain with previously selected video + new one
                const prevId = existing.videoGenerations.length >= 2
                  ? existing.videoGenerations[existing.videoGenerations.length - 2].id
                  : undefined;
                existing.videoChain = prevId ? [prevId, videoGeneration.id] : [videoGeneration.id];
              } else {
                existing.videoChain.push(videoGeneration.id);
              }
            }
            videoGenerationCount = existing.videoGenerations.length;
          } else {
            projData.previsualizations.shots.push({
              shotElementId: elementId,
              videoPath: filePath,
              selectedVideoGenerationId: videoGeneration.id,
              videoGenerations: [videoGeneration],
              description: shotText,
            });
          }

          if (projData.scenes && Array.isArray(projData.scenes)) {
            for (const scene of projData.scenes) {
              if (!scene.shots) continue;
              const shot = scene.shots.find((s: any) => s.id === elementId);
              if (shot) {
                shot.videoPath = filePath;
                break;
              }
            }
          }
          sdk.markDirty(['previsualizations', 'scenes']);
          await sdk.flushProject();
        }

        // Look up chain info for response
        let videoChain: string[] | undefined;
        if (sdk.isProjectLoaded()) {
          const pv = sdk.getProject()!.previsualizations?.shots?.find((s: any) => s.shotElementId === elementId);
          videoChain = pv?.videoChain;
        }

        sdk.sendJson(res, 200, {
          success: true,
          elementId,
          filePath,
          duration,
          actualDuration,
          generationId: videoGeneration.id,
          videoGenerationCount,
          videoChain,
          refsUsed: refs.referenceImages.map((r: string) => sdk.basename(r)),
          refCount: { characters: refs.characterIds.length, locations: refs.locationId ? 1 : 0 },
        });
      } catch (err) {
        sdk.log('error', 'generate-video-previs', `Error: ${err}`);
        sdk.sendJson(res, 500, { error: 'Video generation failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /generate-video-batch ─────────────────────────────────
    if (req.method === 'POST' && subPath === '/generate-video-batch') {
      const body = await sdk.readBody(req);
      const shotIds: string[] | undefined = body.shotIds;
      const dryRun: boolean = body.dryRun === true;
      const useStream: boolean = body.stream === true;

      const actionConfig = await sdk.loadActionConfig('generate-video');
      const defaultDuration: number = actionConfig.generation?.defaultDuration || 6;
      const costPerSecond: number = actionConfig.costEstimate?.perSecond || 0.075;
      const aspectRatio: string = actionConfig.generation?.aspectRatio || '16:9';

      const screenplay = await collectScreenplayData(sdk);
      if (!screenplay) {
        sdk.sendJson(res, 404, { error: 'No screenplay data found in app state' });
        return true;
      }

      // Collect target shots
      const allShotIds = Object.keys(screenplay.elementMap).filter(id => {
        const el = screenplay.elementMap[id];
        return el?.type === 'shot';
      });
      const targetIds = shotIds
        ? shotIds.filter(id => allShotIds.includes(id))
        : allShotIds.filter(id => {
            const previs = screenplay.previsMap[id];
            return !previs?.videoPath;
          });

      const totalSeconds = targetIds.length * defaultDuration;
      const estimatedCost = Math.round(totalSeconds * costPerSecond * 100) / 100;

      if (dryRun) {
        sdk.sendJson(res, 200, {
          estimatedCost,
          shotCount: targetIds.length,
          totalSeconds,
          costPerSecond,
        });
        return true;
      }

      // Stream or batch generate
      if (useStream) {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(JSON.stringify({ type: 'estimate', shotCount: targetIds.length, estimatedCost, totalSeconds }) + '\n');
      }

      const projFolder = await sdk.getProjectFolder();
      const videoDir = sdk.join(projFolder, 'assets', 'video-previs');
      await sdk.mkdir(videoDir);

      let rendered = 0;
      for (const elemId of targetIds) {
        if (useStream) {
          res.write(JSON.stringify({ type: 'progress', current: rendered + 1, total: targetIds.length, elementId: elemId }) + '\n');
        }
        try {
          const element = screenplay.elementMap[elemId];
          const previs = screenplay.previsMap[elemId];
          const shotText = element?.shotText || element?.content || '';
          const previsDescription = previs?.description || shotText;
          const cameraMovement = element?.cameraMovement || '';
          const movementPromptMap: Record<string, string> = actionConfig.cameraMovementPromptMap || {};
          const movementDesc = movementPromptMap[cameraMovement.toUpperCase()] || '';

          let prompt = previsDescription;
          if (movementDesc) prompt += `\nCamera motion: ${movementDesc}.`;

          const stylePrompt = actionConfig.prompt?.sections?.find((s: any) => s.id === 'style')?.template || '';
          if (stylePrompt) prompt += '\n' + stylePrompt;

          let sourceImage: string | undefined;
          if (previs?.filePath && sdk.fileExists(previs.filePath)) {
            sourceImage = previs.filePath;
          }

          const outputPath = sdk.join(videoDir, `video_${elemId}_${Date.now().toString(36)}.mp4`);
          const result = await sdk.generateVideo({
            prompt,
            image: sourceImage,
            duration: defaultDuration,
            aspectRatio,
            outputPath,
          });

          if (result.success) {
            const filePath = result.filePath || outputPath;
            // Update project data
            if (sdk.isProjectLoaded()) {
              const projData = sdk.getProject()!;
              if (!projData.previsualizations) projData.previsualizations = { shots: [] };
              const existing = projData.previsualizations.shots?.find((s: any) => s.shotElementId === elemId);
              if (existing) {
                existing.videoPath = filePath;
              } else {
                projData.previsualizations.shots.push({ shotElementId: elemId, videoPath: filePath, description: shotText });
              }
              if (projData.scenes) {
                for (const scene of projData.scenes) {
                  const shot = scene.shots?.find((s: any) => s.id === elemId);
                  if (shot) { shot.videoPath = filePath; break; }
                }
              }
            }
            rendered++;
          }
        } catch (err) {
          sdk.log('error', 'generate-video-batch', `Failed for ${elemId}: ${err}`);
        }
      }

      if (sdk.isProjectLoaded()) {
        sdk.markDirty(['previsualizations', 'scenes']);
        await sdk.flushProject();
      }

      if (useStream) {
        res.write(JSON.stringify({ type: 'complete', rendered, total: targetIds.length }) + '\n');
        res.end();
      } else {
        sdk.sendJson(res, 200, { success: true, rendered, total: targetIds.length, estimatedCost });
      }
      return true;
    }

    // ── POST /generate-overlay-graphics ─────────────────────────────
    if (req.method === 'POST' && subPath === '/generate-overlay-graphics') {
      const body = await sdk.readBody(req);
      const overlayType: string = body.type;
      const text: string = body.text;
      const subtext: string = body.subtext || '';
      const style: string = body.style || 'clean, modern broadcast design';

      if (!overlayType || !text) {
        sdk.sendJson(res, 400, { error: 'type and text required' });
        return true;
      }

      const aspectRatio = overlayType === 'lower-third' ? '16:9' : '1:1';
      const prompt = `Design a ${overlayType.replace('-', ' ')} graphic overlay for "${text}".${subtext ? ` Subtitle: "${subtext}".` : ''} Modern broadcast design, ${style}. Dark semi-transparent background suitable for compositing over video footage.`;

      try {
        const projFolder = await sdk.getProjectFolder();
        const overlayDir = sdk.join(projFolder, 'assets', 'overlays');
        await sdk.mkdir(overlayDir);
        const outputPath = sdk.join(overlayDir, `${overlayType}_${Date.now().toString(36)}.png`);

        const result = await sdk.generateImage({
          prompt,
          aspectRatio,
          outputPath,
        });

        if (!result.success) throw new Error(result.error || 'Generation failed');

        sdk.sendJson(res, 200, {
          success: true,
          filePath: result.filePath || outputPath,
          type: overlayType,
        });
      } catch (err) {
        sdk.log('error', 'generate-overlay-graphics', `Error: ${err}`);
        sdk.sendJson(res, 500, { error: 'Overlay generation failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /select-previs-generation ─────────────────────────
    if (req.method === 'POST' && subPath === '/select-previs-generation') {
      const body = await sdk.readBody(req);
      const shotId: string = body.shotId;
      const generationId: string = body.generationId;

      if (!shotId || !generationId) {
        sdk.sendJson(res, 400, { error: 'shotId and generationId required' });
        return true;
      }

      if (!sdk.isProjectLoaded()) {
        sdk.sendJson(res, 404, { error: 'Project not loaded' });
        return true;
      }

      const projData = sdk.getProject()!;
      let found = false;

      if (projData.scenes && Array.isArray(projData.scenes)) {
        for (const scene of projData.scenes) {
          if (!scene.shots) continue;
          const shot = scene.shots.find((s: any) => s.id === shotId);
          if (shot && shot.generations) {
            const gen = shot.generations.find((g: any) => g.id === generationId);
            if (gen) {
              shot.previsPath = gen.filePath;
              shot.generatedAt = gen.generatedAt;
              shot.selectedGenerationId = generationId;
              found = true;
              break;
            }
          }
        }
      }

      if (projData.previsualizations?.shots) {
        const entry = projData.previsualizations.shots.find((s: any) => s.shotElementId === shotId);
        if (entry && entry.generations) {
          const gen = entry.generations.find((g: any) => g.id === generationId);
          if (gen) {
            entry.filePath = gen.filePath;
            entry._generatedFilePath = gen.filePath;
            entry._generatedAt = gen.generatedAt;
            entry.selectedGenerationId = generationId;
            found = true;
          }
        }
      }

      if (!found) {
        sdk.sendJson(res, 404, { error: 'Shot or generation not found' });
        return true;
      }

      sdk.markDirty(['previsualizations', 'scenes']);
      await sdk.flushProject();
      sdk.sendJson(res, 200, { success: true, shotId, generationId });
      return true;
    }

    // ── POST /select-video-generation ──────────────────────────
    if (req.method === 'POST' && subPath === '/select-video-generation') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      const generationId: string = body.generationId;

      if (!elementId || !generationId) {
        sdk.sendJson(res, 400, { error: 'elementId and generationId required' });
        return true;
      }

      if (!sdk.isProjectLoaded()) {
        sdk.sendJson(res, 404, { error: 'Project not loaded' });
        return true;
      }

      const projData = sdk.getProject()!;
      let found = false;

      if (projData.previsualizations?.shots) {
        const entry = projData.previsualizations.shots.find((s: any) => s.shotElementId === elementId);
        if (entry && entry.videoGenerations) {
          const gen = entry.videoGenerations.find((g: any) => g.id === generationId);
          if (gen) {
            entry.videoPath = gen.filePath;
            entry.selectedVideoGenerationId = generationId;
            found = true;
          }
        }
      }

      if (!found) {
        sdk.sendJson(res, 404, { error: 'Video generation not found' });
        return true;
      }

      sdk.markDirty(['previsualizations']);
      await sdk.flushProject();
      sdk.sendJson(res, 200, { success: true, elementId, generationId });
      return true;
    }

    // ── POST /update-video-chain ─────────────────────────────────
    if (req.method === 'POST' && subPath === '/update-video-chain') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      const chain: string[] = body.chain;

      if (!elementId || !Array.isArray(chain)) {
        sdk.sendJson(res, 400, { error: 'elementId and chain[] required' });
        return true;
      }

      if (!sdk.isProjectLoaded()) {
        sdk.sendJson(res, 404, { error: 'Project not loaded' });
        return true;
      }

      const projData = sdk.getProject()!;
      const entry = projData.previsualizations?.shots?.find((s: any) => s.shotElementId === elementId);
      if (!entry) {
        sdk.sendJson(res, 404, { error: 'Shot not found' });
        return true;
      }

      // Validate all chain IDs exist in videoGenerations
      const genIds = new Set((entry.videoGenerations || []).map((g: any) => g.id));
      const invalid = chain.filter(id => !genIds.has(id));
      if (invalid.length > 0) {
        sdk.sendJson(res, 400, { error: `Invalid generation IDs in chain: ${invalid.join(', ')}` });
        return true;
      }

      entry.videoChain = chain;
      sdk.markDirty(['previsualizations']);
      await sdk.flushProject();
      sdk.sendJson(res, 200, { success: true, elementId, chain });
      return true;
    }

    // ── POST /remove-from-chain ──────────────────────────────────
    if (req.method === 'POST' && subPath === '/remove-from-chain') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      const generationId: string = body.generationId;

      if (!elementId || !generationId) {
        sdk.sendJson(res, 400, { error: 'elementId and generationId required' });
        return true;
      }

      if (!sdk.isProjectLoaded()) {
        sdk.sendJson(res, 404, { error: 'Project not loaded' });
        return true;
      }

      const projData = sdk.getProject()!;
      const entry = projData.previsualizations?.shots?.find((s: any) => s.shotElementId === elementId);
      if (!entry || !entry.videoChain) {
        sdk.sendJson(res, 404, { error: 'Shot or chain not found' });
        return true;
      }

      entry.videoChain = entry.videoChain.filter((id: string) => id !== generationId);
      if (entry.videoChain.length === 0) delete entry.videoChain;

      sdk.markDirty(['previsualizations']);
      await sdk.flushProject();
      sdk.sendJson(res, 200, { success: true, elementId, chain: entry.videoChain || [] });
      return true;
    }

    // ── POST /compact-timing ────────────────────────────────────
    // Recalculate shot durations based on dialogue audio: each shot lasts
    // as long as the dialogue it covers, with minimal gaps between shots.
    if (req.method === 'POST' && subPath === '/compact-timing') {
      try {
        await sdk.ensureProject();
        const projData = sdk.getProject();
        if (!projData) {
          sdk.sendJson(res, 404, { error: 'No project data' });
          return true;
        }

        const elements = projData.elements || [];
        const scenes = projData.scenes || [];
        const daAssets = projData.dialogueAudio?.assets || [];

        // Build audio duration map
        const audioDurMap: Record<string, number> = {};
        for (const a of daAssets) {
          if (a.metadata?.dialogueElementId && a.metadata?.duration > 0) {
            audioDurMap[a.metadata.dialogueElementId] = a.metadata.duration;
          }
        }

        const SHOT_MIN_DUR = 0.5;   // minimum shot-only duration
        const DIALOG_GAP = 0.15;    // tiny gap between dialogue items
        const SCENE_GAP = 0.3;      // gap between scenes

        let previousDuration = 0;
        let totalDuration = 0;
        let shotsUpdated = 0;

        for (const sc of scenes) {
          if (!sc.elementRange || !sc.shots) continue;
          const [start, end] = sc.elementRange;

          // Walk elements in this scene, compute audio-driven duration per shot
          let currentShotIdx = -1;
          const shotDurations: number[] = sc.shots.map(() => 0);
          const shotHasDialogue: boolean[] = sc.shots.map(() => false);
          let prevShotEnd = 0;

          // Map elements to shots: each shot covers elements until the next shot
          const shotStarts: number[] = [];
          for (let ei = start; ei < Math.min(end, elements.length); ei++) {
            const elem = elements[ei];
            if (elem?.type === 'shot') {
              // Find matching scene shot
              const matchIdx = sc.shots.findIndex((s: any) =>
                s.id === elem.id || s.description?.includes(elem.shotText?.substring(0, 30))
              );
              if (matchIdx >= 0) {
                currentShotIdx = matchIdx;
                shotStarts.push(ei);
              } else {
                currentShotIdx = shotStarts.length;
                shotStarts.push(ei);
                if (currentShotIdx < shotDurations.length) {
                  // already tracked
                } else {
                  shotDurations.push(0);
                  shotHasDialogue.push(false);
                }
              }
            } else if (elem?.type === 'dialogue' && currentShotIdx >= 0 && currentShotIdx < shotDurations.length) {
              const dur = audioDurMap[elem.id];
              if (dur) {
                shotDurations[currentShotIdx] += dur + DIALOG_GAP;
                shotHasDialogue[currentShotIdx] = true;
              }
            }
          }

          // Compute old total for comparison
          for (const shot of sc.shots) {
            previousDuration += shot.duration || 3;
          }

          // Apply compact durations to scene shots
          for (let si = 0; si < sc.shots.length; si++) {
            const shot = sc.shots[si];
            let newDur: number;
            if (si < shotDurations.length && shotHasDialogue[si]) {
              newDur = Math.max(shotDurations[si], SHOT_MIN_DUR);
            } else {
              newDur = SHOT_MIN_DUR;
            }
            shot.duration = Math.round(newDur * 100) / 100;
            totalDuration += shot.duration;
            shotsUpdated++;
          }
          totalDuration += SCENE_GAP;
        }

        sdk.markDirty(['scenes']);
        await sdk.flushProject();
        sdk.sendJson(res, 200, {
          success: true,
          shotsUpdated,
          totalDuration,
          previousDuration,
        });
      } catch (err) {
        sdk.sendJson(res, 500, { error: 'Compact timing failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /backfill-audio-durations ──────────────────────────
    if (req.method === 'POST' && subPath === '/backfill-audio-durations') {
      try {
        await sdk.ensureProject();
        const projData = sdk.getProject();
        if (!projData) {
          sdk.sendJson(res, 200, { updated: 0 });
          return true;
        }

        const daAssets = projData.dialogueAudio?.assets;
        if (!Array.isArray(daAssets) || daAssets.length === 0) {
          sdk.sendJson(res, 200, { updated: 0 });
          return true;
        }

        let updated = 0;
        for (const asset of daAssets) {
          if (asset.metadata?.duration && asset.metadata.duration > 0) continue;
          if (!asset.filePath) continue;

          let duration: number | null = null;
          try {
            const result = await sdk.exec(
              `ffprobe -v error -show_entries format=duration -of csv=p=0 "${asset.filePath}"`,
              { timeout: 5000 }
            );
            const parsed = parseFloat(result.stdout.trim());
            if (parsed > 0 && isFinite(parsed)) duration = parsed;
          } catch {
            try {
              const fileStat = await sdk.stat(asset.filePath);
              duration = (fileStat.size / 1024) / 16;
            } catch { continue; }
          }

          if (duration && duration > 0) {
            if (!asset.metadata) asset.metadata = {};
            asset.metadata.duration = duration;
            updated++;
          }
        }

        if (updated > 0) {
          sdk.markDirty(['dialogueAudio']);
        }

        sdk.sendJson(res, 200, { updated, total: daAssets.length });
      } catch (err) {
        sdk.sendJson(res, 500, { error: String(err) });
      }
      return true;
    }

    // ── POST /render-dialogue ───────────────────────────────────
    if (req.method === 'POST' && subPath === '/render-dialogue') {
      try {
        const rdBody = await sdk.readBody(req);
        const useStream = rdBody.stream === true;

        await sdk.ensureProject();
        const projData = sdk.getProject();
        if (!projData) {
          if (useStream) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
            res.write(JSON.stringify({ type: 'error', error: 'Project data not loaded' }) + '\n');
            res.end();
          } else {
            sdk.sendJson(res, 404, { error: 'Project data not loaded' });
          }
          return true;
        }

        // Load voice assignments: first from character voiceId (set by voice-assignment node or UI),
        // then from voice bindings (legacy), then from pipeline-level bindings
        const voiceMap: Record<string, string> = {};
        const voiceNameMap: Record<string, string> = {};

        // Primary source: voiceId persisted on character objects
        const allCharacters = projData.characters || [];
        for (const c of allCharacters) {
          if (c.voiceId) {
            voiceMap[c.id] = c.voiceId;
            voiceNameMap[c.id] = c.voiceName || '';
          }
        }

        // Fallback: voice bindings from project metadata or pipeline bindings
        if (Object.keys(voiceMap).length === 0) {
          const projectVoiceBindings = projData.metadata?.voiceBindings || projData.voiceBindings || [];
          const voiceSource = projectVoiceBindings.length > 0 ? projectVoiceBindings : (await sdk.loadBindings()).bindings;
          for (const b of voiceSource) {
            if (b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId && b.target?.entityId) {
              voiceMap[b.source.entityId] = b.target.entityId;
              voiceNameMap[b.source.entityId] = (b.metadata?.voiceName as string) || '';
            }
          }
        }

        // Collect dialogue elements from scenes
        const scenes = projData.scenes || [];
        const existingAudio = new Set<string>();
        const daAssets = projData.dialogueAudio?.assets || [];
        for (const a of daAssets) {
          if (a.metadata?.dialogueElementId) existingAudio.add(a.metadata.dialogueElementId);
        }

        // Fallback: scan audio directory for existing files when project state is empty
        if (existingAudio.size === 0) {
          try {
            const projFolder = await sdk.getProjectFolder();
            const audioDir = sdk.join(projFolder, 'audio');
            const lsResult = await sdk.exec(`ls "${audioDir}"`, { timeout: 3000 }).catch(() => ({ stdout: '' }));
            const files = (lsResult.stdout || '').split('\n').filter(Boolean);
            for (const f of files) {
              const match = f.match(/^dialogue_(element_\d+)_/);
              if (match) existingAudio.add(match[1]);
            }
            if (existingAudio.size > 0) {
              sdk.log('info', 'render-dialogue', `Found ${existingAudio.size} existing audio files on disk (not in project state)`);
            }
          } catch { /* ignore — directory might not exist */ }
        }

        const dialogueItems: { elementId: string; text: string; voiceId: string; characterName: string; characterId: string }[] = [];
        for (const sc of scenes) {
          if (!sc.dialogue) continue;
          for (const d of sc.dialogue) {
            const elemId = d.elementId || d.id;
            if (!elemId || existingAudio.has(elemId)) continue;
            const voiceId = voiceMap[d.characterId || ''];
            if (!voiceId) continue;
            const text = (d.lines || []).join(' ').trim();
            if (!text) continue;
            dialogueItems.push({
              elementId: elemId,
              text,
              voiceId,
              characterName: d.characterName || '',
              characterId: d.characterId || '',
            });
          }
        }

        if (dialogueItems.length === 0) {
          if (useStream) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
            res.write(JSON.stringify({ type: 'complete', rendered: 0, total: 0, message: 'No unrendered dialogue with assigned voices' }) + '\n');
            res.end();
          } else {
            sdk.sendJson(res, 200, { success: true, rendered: 0, total: 0, message: 'No unrendered dialogue with assigned voices' });
          }
          return true;
        }

        // ── ElevenLabs quota check ──
        let remainingChars: number | null = null;
        let characterLimit: number | null = null;
        let characterCount: number | null = null;
        try {
          const userInfoResult = await sdk.callTool('tts_user_info', {});
          if (userInfoResult) {
            characterCount = userInfoResult.character_count ?? null;
            characterLimit = userInfoResult.character_limit ?? null;
            if (characterCount !== null && characterLimit !== null) {
              remainingChars = characterLimit - characterCount;
            }
          }
        } catch {
          sdk.log('warn', 'render-dialogue', 'Could not fetch ElevenLabs usage info — continuing without quota tracking');
        }

        // Set up streaming if requested
        if (useStream) {
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          // Send initial quota info
          res.write(JSON.stringify({
            type: 'quota',
            characterCount,
            characterLimit,
            remainingChars,
            total: dialogueItems.length,
          }) + '\n');
        }

        function writeStreamEvent(event: Record<string, any>) {
          if (useStream) {
            res.write(JSON.stringify(event) + '\n');
          }
        }

        const projFolder = await sdk.getProjectFolder();
        const audioDir = sdk.join(projFolder, 'audio');
        await sdk.mkdir(audioDir);

        let rendered = 0;
        for (const d of dialogueItems) {
          // Check quota before each TTS call
          if (remainingChars !== null && d.text.length > remainingChars) {
            const msg = `Insufficient ElevenLabs character quota: need ${d.text.length} chars but only ${remainingChars} remaining`;
            sdk.log('warn', 'render-dialogue', msg);
            writeStreamEvent({
              type: 'error',
              error: msg,
              rendered,
              total: dialogueItems.length,
              remainingChars,
            });
            break;
          }

          try {
            const outputPath = sdk.join(audioDir, `dialogue_${d.elementId}_${Date.now().toString(36)}.mp3`);
            const ttsResult = await sdk.callTool('tts_speak', {
              text: d.text,
              voice_id: d.voiceId,
              output_path: outputPath,
              output_format: 'mp3_44100_128',
            }, audioDir);

            if (!ttsResult || !ttsResult.success) continue;

            const filePath = ttsResult.audio_path || outputPath;

            // Deduct from remaining chars tracking
            if (remainingChars !== null) {
              remainingChars -= d.text.length;
            }

            // Detect duration
            let audioDuration: number | null = null;
            try {
              const probe = await sdk.exec(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
                { timeout: 5000 }
              );
              const parsed = parseFloat(probe.stdout.trim());
              if (parsed > 0 && isFinite(parsed)) audioDuration = parsed;
            } catch {
              try {
                const fileStat = await sdk.stat(filePath);
                audioDuration = (fileStat.size / 1024) / 16;
              } catch { /* ignore */ }
            }

            // Generate SRT subtitle file alongside audio
            const srtPath = filePath.replace(/\.mp3$/, '.srt');
            try {
              const srtContent = buildSrt(d.text, audioDuration, d.characterName);
              await sdk.writeFile(srtPath, srtContent);
            } catch { /* non-critical — skip SRT on error */ }

            const assetId = 'ast_da_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const asset = {
              id: assetId,
              type: 'dialogue-audio',
              name: `Dialogue: ${d.characterName || d.elementId}`,
              description: d.text.substring(0, 200),
              filePath,
              srtPath,
              metadata: {
                dialogueElementId: d.elementId,
                characterId: d.characterId,
                characterName: d.characterName,
                voiceId: d.voiceId,
                text: d.text.substring(0, 500),
                generatedAt: new Date().toISOString(),
                duration: audioDuration,
                srtPath,
              },
            };
            if (!projData.dialogueAudio) projData.dialogueAudio = { assets: [] };
            if (!projData.dialogueAudio.assets) projData.dialogueAudio.assets = [];
            projData.dialogueAudio.assets.push(asset);
            rendered++;

            writeStreamEvent({
              type: 'progress',
              rendered,
              total: dialogueItems.length,
              remainingChars,
              characterName: d.characterName,
            });
          } catch { /* skip failed items */ }
        }

        sdk.markDirty(['dialogueAudio']);
        await sdk.flushProject();

        if (useStream) {
          writeStreamEvent({
            type: 'complete',
            rendered,
            total: dialogueItems.length,
            remainingChars,
          });
          res.end();
        } else {
          sdk.sendJson(res, 200, { success: true, rendered, total: dialogueItems.length, remainingChars });
        }
      } catch (err) {
        sdk.sendJson(res, 500, { error: 'Render failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /generate-dialogue-audio ──────────────────────────
    if (req.method === 'POST' && subPath === '/generate-dialogue-audio') {
      const body = await sdk.readBody(req);
      const elementId: string = body.elementId;
      const text: string = body.text;
      const voiceId: string = body.voiceId;
      const characterName: string = body.characterName || '';
      const characterId: string = body.characterId || '';

      if (!elementId || !text || !voiceId) {
        sdk.sendJson(res, 400, { error: 'elementId, text, and voiceId are required' });
        return true;
      }

      const projFolder = await sdk.getProjectFolder();
      const audioDir = sdk.join(projFolder, 'audio');
      await sdk.mkdir(audioDir);
      const outputPath = sdk.join(audioDir, `dialogue_${elementId}_${Date.now().toString(36)}.mp3`);

      try {
        const ttsResult = await sdk.callTool('tts_speak', {
          text,
          voice_id: voiceId,
          output_path: outputPath,
          output_format: 'mp3_44100_128',
        }, audioDir);

        if (!ttsResult || !ttsResult.success) {
          sdk.sendJson(res, 500, { error: ttsResult?.error || 'TTS generation failed' });
          return true;
        }

        const filePath = ttsResult.audio_path || outputPath;

        // Detect duration
        let audioDuration: number | null = null;
        try {
          const probe = await sdk.exec(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
            { timeout: 5000 }
          );
          const parsed = parseFloat(probe.stdout.trim());
          if (parsed > 0 && isFinite(parsed)) audioDuration = parsed;
        } catch {
          try {
            const fileStat = await sdk.stat(filePath);
            audioDuration = (fileStat.size / 1024) / 16;
          } catch { /* ignore */ }
        }

        const assetId = 'ast_da_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const asset = {
          id: assetId,
          type: 'dialogue-audio',
          name: `Dialogue: ${characterName || elementId}`,
          description: text.substring(0, 200),
          filePath,
          metadata: {
            dialogueElementId: elementId,
            characterId,
            characterName,
            voiceId,
            text: text.substring(0, 500),
            generatedAt: new Date().toISOString(),
            duration: audioDuration,
          },
        };

        await sdk.ensureProject();
        if (sdk.isProjectLoaded()) {
          const projData = sdk.getProject()!;
          if (!projData.dialogueAudio) projData.dialogueAudio = { assets: [] };
          if (!projData.dialogueAudio.assets) projData.dialogueAudio.assets = [];
          projData.dialogueAudio.assets = projData.dialogueAudio.assets.filter(
            (a: any) => a.metadata?.dialogueElementId !== elementId
          );
          projData.dialogueAudio.assets.push(asset);
          sdk.markDirty(['dialogueAudio']);
          await sdk.flushProject();
        }

        sdk.sendJson(res, 200, {
          success: true,
          elementId,
          filePath,
          assetId,
          characterName,
          duration: audioDuration,
        });
      } catch (err) {
        sdk.log('info', 'generate-dialogue-audio', `Error: ${err}`);
        sdk.sendJson(res, 500, { error: 'TTS failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /import-audio ──────────────────────────────────────
    if (req.method === 'POST' && subPath === '/import-audio') {
      const body = await sdk.readBody(req);
      const sourcePath: string = body.sourcePath;
      if (!sourcePath) {
        sdk.sendJson(res, 400, { error: 'sourcePath required' });
        return true;
      }

      try {
        if (!sdk.fileExists(sourcePath)) {
          sdk.sendJson(res, 404, { error: 'Source file not found' });
          return true;
        }

        const projFolder = await sdk.getProjectFolder();
        const audioDir = sdk.join(projFolder, 'audio');
        await sdk.mkdir(audioDir);

        const srcBase = sdk.basename(sourcePath);
        const dotIdx = srcBase.lastIndexOf('.');
        const name = dotIdx > 0 ? srcBase.substring(0, dotIdx) : srcBase;
        const ext = dotIdx > 0 ? srcBase.substring(dotIdx) : '';
        const safeName = name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').substring(0, 80);
        const destName = safeName + '_' + Date.now().toString(36) + ext;
        const destPath = sdk.join(audioDir, destName);

        await sdk.copyFile(sourcePath, destPath);

        // Detect duration
        let duration: number | null = null;
        try {
          const probe = await sdk.exec(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${destPath}"`,
            { timeout: 5000 }
          );
          const parsed = parseFloat(probe.stdout.trim());
          if (parsed > 0 && isFinite(parsed)) duration = parsed;
        } catch {
          try {
            const fileStat = await sdk.stat(destPath);
            const sizeKb = fileStat.size / 1024;
            if (ext.toLowerCase() === '.mp3') duration = sizeKb / 16;
            else if (ext.toLowerCase() === '.wav') duration = sizeKb / 176;
            else duration = sizeKb / 16;
          } catch { /* ignore */ }
        }

        sdk.sendJson(res, 200, { success: true, filePath: destPath, fileName: srcBase, duration });
      } catch (err) {
        sdk.sendJson(res, 500, { error: 'Import failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /generate-transition-video ─────────────────────────
    // Generates a transition video between two shots using first/last frame interpolation.
    // Takes the last frame of prevElementId's video chain and the start image of nextElementId.
    if (req.method === 'POST' && subPath === '/generate-transition-video') {
      const body = await sdk.readBody(req);
      const prevElementId: string = body.prevElementId;
      const nextElementId: string = body.nextElementId;
      const insertBeforeElementId: string | undefined = body.insertBeforeElementId; // element ID to insert the new shot before
      const promptOverride: string | undefined = body.promptOverride;

      if (!prevElementId || !nextElementId) {
        sdk.sendJson(res, 400, { error: 'prevElementId and nextElementId required' });
        return true;
      }

      if (!sdk.isProjectLoaded()) {
        sdk.sendJson(res, 404, { error: 'Project not loaded' });
        return true;
      }

      const projData = sdk.getProject()!;
      const previsShots = projData.previsualizations?.shots || [];

      // Get last frame from previous shot's video chain
      const prevShot = previsShots.find((s: any) => s.shotElementId === prevElementId);
      let prevLastFrame: string | undefined;
      if (prevShot) {
        let lastVideoPath: string | undefined;
        if (prevShot.videoChain?.length > 0 && prevShot.videoGenerations) {
          const lastId = prevShot.videoChain[prevShot.videoChain.length - 1];
          lastVideoPath = prevShot.videoGenerations.find((g: any) => g.id === lastId)?.filePath;
        } else if (prevShot.selectedVideoGenerationId && prevShot.videoGenerations) {
          lastVideoPath = prevShot.videoGenerations.find((g: any) => g.id === prevShot.selectedVideoGenerationId)?.filePath;
        } else if (prevShot.videoPath) {
          lastVideoPath = prevShot.videoPath;
        }
        if (lastVideoPath && sdk.fileExists(lastVideoPath)) {
          // Extract last frame
          const projFolder = await sdk.getProjectFolder();
          const tempFrame = sdk.join(projFolder, 'assets', 'video-previs', `_transition_prev_${prevElementId}.png`);
          try {
            // Get duration first, then seek to near end (more reliable than -sseof)
              const durResult = await sdk.exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${lastVideoPath}"`, { timeout: 5000 });
              const vidDur = parseFloat((durResult.stdout || '').trim()) || 5;
              const seekTo = Math.max(0, vidDur - 0.1);
              await sdk.exec(`ffmpeg -ss ${seekTo} -i "${lastVideoPath}" -frames:v 1 -update 1 -y "${tempFrame}"`, { timeout: 15000 });
            if (sdk.fileExists(tempFrame)) prevLastFrame = tempFrame;
          } catch { /* non-fatal */ }
        }
      }

      // Get start image from next shot
      const nextShot = previsShots.find((s: any) => s.shotElementId === nextElementId);
      let nextStartImage: string | undefined;
      if (nextShot) {
        if (nextShot.selectedGenerationId && nextShot.generations?.length > 0) {
          const sel = nextShot.generations.find((g: any) => g.id === nextShot.selectedGenerationId);
          if (sel?.filePath && sdk.fileExists(sel.filePath)) nextStartImage = sel.filePath;
        }
        if (!nextStartImage && nextShot.filePath && sdk.fileExists(nextShot.filePath)) {
          nextStartImage = nextShot.filePath;
        }
      }

      if (!prevLastFrame && !nextStartImage) {
        sdk.sendJson(res, 400, { error: 'No source images available. Previous shot needs a video and next shot needs a previs image.' });
        return true;
      }

      // Build transition prompt
      const actionConfig = await sdk.loadActionConfig('generate-video');
      const duration: number = body.duration || 4; // transitions are typically short
      const aspectRatio: string = body.aspectRatio || actionConfig.generation?.aspectRatio || '16:9';
      let prompt = promptOverride || 'Smooth cinematic camera movement transitioning away from this scene. The camera slowly pans or dollies, creating a natural bridge to the next shot. Subtle motion, cinematic lighting changes, and fluid movement.';

      // Generate video with start + end frame
      const projFolder = await sdk.getProjectFolder();
      const videoDir = sdk.join(projFolder, 'assets', 'video-previs');
      await sdk.mkdir(videoDir);
      const outputPath = sdk.join(videoDir, `transition_${prevElementId}_${nextElementId}_${Date.now().toString(36)}.mp4`);

      try {
        const result = await callVeoApi({
          prompt,
          sourceImage: prevLastFrame,
          lastFrameImage: nextStartImage,
          duration,
          aspectRatio,
          outputPath,
        }, sdk);

        if (!result.success) {
          sdk.sendJson(res, 500, { error: result.error || 'Transition generation failed' });
          return true;
        }

        const filePath = result.filePath || outputPath;

        // Probe actual duration
        let actualDuration: number | undefined;
        try {
          const probeResult = sdk.spawnSync('ffprobe', [
            '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
          ]);
          if (probeResult.stdout) {
            const parsed = parseFloat(String(probeResult.stdout).trim());
            if (!isNaN(parsed) && parsed > 0) actualDuration = parsed;
          }
        } catch { /* non-fatal */ }

        // Insert transition shot element into elements array if requested
        let newShotId: string | undefined;
        if (insertBeforeElementId && projData.elements) {
          newShotId = 'element_transition_' + Date.now().toString(36);
          const idx = projData.elements.findIndex((e: any) => e.id === insertBeforeElementId);
          if (idx >= 0) {
            projData.elements.splice(idx, 0, {
              id: newShotId,
              type: 'shot',
              content: 'TRANSITION — ' + (prevElementId.split('_').pop() || '') + ' → ' + (nextElementId.split('_').pop() || ''),
              shotText: 'TRANSITION',
              frameSize: 'TRANSITION',
            });
          }
        }

        // Store the video as a previs for the transition shot
        if (newShotId) {
          if (!projData.previsualizations) projData.previsualizations = { shots: [] };
          const videoGeneration = {
            id: `vgen_${Date.now().toString(36)}`,
            filePath,
            generatedAt: new Date().toISOString(),
            aspectRatio,
            duration,
            actualDuration,
            sourceImage: prevLastFrame || null,
            prompt: prompt.substring(0, 500),
          };
          projData.previsualizations.shots.push({
            shotElementId: newShotId,
            filePath: prevLastFrame || nextStartImage, // use as previs image
            videoPath: filePath,
            selectedVideoGenerationId: videoGeneration.id,
            videoGenerations: [videoGeneration],
            videoChain: [videoGeneration.id],
            description: 'Transition shot',
          });
        }

        sdk.markDirty(['elements', 'previsualizations']);
        await sdk.flushProject();

        sdk.sendJson(res, 200, {
          success: true,
          filePath,
          duration,
          actualDuration,
          newShotId,
          prevLastFrame,
          nextStartImage,
        });
      } catch (err) {
        sdk.sendJson(res, 500, { error: 'Transition generation failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /open-render-folder ─────────────────────────────────
    if (req.method === 'POST' && subPath === '/open-render-folder') {
      try {
        const projFolder = await sdk.getProjectFolder();
        const renderDir = sdk.join(projFolder, 'renders');
        await sdk.mkdir(renderDir);
        // Use platform-appropriate command to open folder in file manager
        const platform = typeof process !== 'undefined' ? process.platform : 'darwin';
        const cmd = platform === 'win32' ? `explorer "${renderDir}"`
          : platform === 'darwin' ? `open "${renderDir}"`
          : `xdg-open "${renderDir}"`;
        sdk.exec(cmd, { timeout: 5000 }).catch(() => {}); // fire-and-forget
        sdk.sendJson(res, 200, { success: true, path: renderDir });
      } catch (err) {
        sdk.sendJson(res, 500, { error: 'Failed to open folder: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /render-video ──────────────────────────────────────
    if (req.method === 'POST' && subPath === '/render-video') {
      const body = await sdk.readBody(req);
      const settings = body.settings || {};
      const clips: any[] = body.clips || [];
      const dialogAudioMap: Record<string, string> = body.dialogAudioMap || {};

      // Load motion graphics plan (from project data or request body)
      const projData = sdk.getProject();
      const mgPlan = projData?.motionGraphicsPlan || body.motionGraphicsPlan || null;

      const resX: number = settings.resolutionX || 1920;
      const resY: number = settings.resolutionY || 1080;
      const fps: number = settings.fps || 24;
      const format: string = settings.format || 'mp4';
      const quality: string = settings.quality || 'medium';
      const startTime: number = settings.startTime || 0;
      const endTime: number = settings.endTime || 120;
      const totalDuration = endTime - startTime;

      if (totalDuration <= 0) {
        sdk.sendJson(res, 400, { error: 'Invalid time range' });
        return true;
      }

      try {
        const projFolder = await sdk.getProjectFolder();
        const renderDir = sdk.join(projFolder, 'renders');
        await sdk.mkdir(renderDir);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ext = format === 'webm' ? 'webm' : format === 'mov' ? 'mov' : 'mp4';
        const outputPath = sdk.join(renderDir, `render_${timestamp}.${ext}`);

        const crfMap: Record<string, number> = { high: 18, medium: 23, low: 28 };
        const crf = crfMap[quality] || 23;

        const visualClips = clips
          .filter((c: any) => c.trackId === 'visuals' && c.filePath)
          .sort((a: any, b: any) => a.startTime - b.startTime);

        const audioClips: any[] = [];
        clips.filter((c: any) => c.type === 'dialog' && c.elementId && dialogAudioMap[c.elementId])
          .forEach((c: any) => {
            audioClips.push({
              path: dialogAudioMap[c.elementId],
              startTime: c.startTime - startTime,
              duration: c.duration,
              volume: (c.volume != null ? c.volume : 100) / 100,
              fadeIn: c.fadeIn || 0,
              fadeOut: c.fadeOut || 0,
            });
          });
        clips.filter((c: any) => (c.type === 'music' || c.type === 'sfx' || c.type === 'ambience') && c.filePath)
          .forEach((c: any) => {
            audioClips.push({
              path: c.filePath,
              startTime: c.startTime - startTime,
              duration: c.duration,
              volume: (c.volume != null ? c.volume : 100) / 100,
              fadeIn: c.fadeIn || 0,
              fadeOut: c.fadeOut || 0,
            });
          });

        if (visualClips.length === 0) {
          sdk.sendJson(res, 400, { error: 'No visual clips with images to render' });
          return true;
        }

        // Build ffmpeg command
        // Extend each visual clip to fill gaps so the video timeline matches
        // the NLE's absolute timing. Each image/video holds until the next cut.

        // Pre-concat video chains into temp files (if applicable)
        const chainConcatMap: Record<string, string> = {}; // elementId → temp concat file
        const tempFiles: string[] = [];
        if (projData?.previsualizations?.shots) {
          for (const vc of visualClips) {
            if (!vc.elementId) continue;
            const pvShot = projData.previsualizations.shots.find((s: any) => s.shotElementId === vc.elementId);
            if (!pvShot?.videoChain || pvShot.videoChain.length < 2) continue;
            const chainFiles: string[] = [];
            for (const gId of pvShot.videoChain) {
              const gen = pvShot.videoGenerations?.find((g: any) => g.id === gId);
              if (gen?.filePath && sdk.fileExists(gen.filePath)) chainFiles.push(gen.filePath);
            }
            if (chainFiles.length < 2) continue;

            // Write concat list and pre-concat
            const concatList = sdk.join(renderDir, `_concat_${vc.elementId}_${Date.now()}.txt`);
            const concatContent = chainFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
            await sdk.writeFile(concatList, concatContent);
            tempFiles.push(concatList);

            const concatOutput = sdk.join(renderDir, `_chain_${vc.elementId}_${Date.now()}.mp4`);
            try {
              await sdk.exec(`ffmpeg -f concat -safe 0 -i "${concatList}" -c copy -y "${concatOutput}"`, { timeout: 60000 });
              if (sdk.fileExists(concatOutput)) {
                chainConcatMap[vc.elementId] = concatOutput;
                tempFiles.push(concatOutput);
              }
            } catch (concatErr) {
              sdk.log('warn', 'render-video', `Chain concat failed for ${vc.elementId}: ${concatErr}`);
            }
          }
        }

        const ffmpegArgs: string[] = [];
        const clipDurations: number[] = [];
        const clipIsVideo: boolean[] = [];
        const effectiveVisualClips: any[] = [];

        for (let vi = 0; vi < visualClips.length; vi++) {
          const vc = visualClips[vi];
          const clipStart = Math.max(vc.startTime, startTime);
          // Extend this clip until the next clip starts (or endTime if last)
          const nextStart = vi + 1 < visualClips.length
            ? Math.max(visualClips[vi + 1].startTime, startTime)
            : endTime;
          const clipDur = nextStart - clipStart;
          if (clipDur <= 0) continue;

          clipDurations.push(clipDur);
          // Use chain concat file if available, otherwise original filePath
          const effectivePath = (vc.elementId && chainConcatMap[vc.elementId]) || vc.filePath;
          const isVideo = /\.(mp4|mov|webm|avi)$/i.test(effectivePath || '');
          clipIsVideo.push(isVideo);
          effectiveVisualClips.push({ ...vc, filePath: effectivePath });
          if (isVideo) {
            // For videos shorter than the slot, loop them; -stream_loop -1 loops indefinitely, -t caps duration
            ffmpegArgs.push('-stream_loop', '-1', '-t', String(clipDur), '-i', effectivePath);
          } else {
            ffmpegArgs.push('-loop', '1', '-t', String(clipDur), '-i', effectivePath);
          }
        }

        // Title card inputs — inserted as color sources before audio inputs
        const titleCardSegments: { spec: TitleCardSpec; inputIdx: number; filterLabel: string }[] = [];
        // numVisuals now includes gap-filler inputs
        const numVisuals = clipDurations.length;

        if (mgPlan?.titleCards?.length > 0) {
          const mainTitle = (mgPlan.titleCards as TitleCardSpec[]).find((tc: TitleCardSpec) => tc.type === 'main-title');
          const sceneTransitions = (mgPlan.titleCards as TitleCardSpec[]).filter((tc: TitleCardSpec) => tc.type === 'scene-transition');
          const titleCards = [...(mainTitle ? [mainTitle] : []), ...sceneTransitions];
          for (const tc of titleCards) {
            const seg = buildTitleCardSegment(tc, fps, resX, resY);
            const inputIdx = numVisuals + titleCardSegments.length;
            ffmpegArgs.push('-f', 'lavfi', '-i', seg.inputs[0]);
            titleCardSegments.push({ spec: tc, inputIdx, filterLabel: `tc${titleCardSegments.length}` });
          }
        }

        const numTitleCards = titleCardSegments.length;
        for (const ac of audioClips) {
          ffmpegArgs.push('-i', ac.path);
        }
        const numAudio = audioClips.length;

        const filterParts: string[] = [];
        let concatInputs = '';
        // Process visual clip filters — video clips, Ken Burns, gap-fillers, or default scale/pad
        for (let i = 0; i < numVisuals; i++) {
          const vc = effectiveVisualClips[i];
          const clipDur = clipDurations[i];
          const isVideo = clipIsVideo[i];

          if (isVideo) {
            // Video clips: scale/pad only (no zoompan, no loop)
            filterParts.push(`[${i}:v]fps=${fps},scale=${resX}:${resY}:force_original_aspect_ratio=decrease,pad=${resX}:${resY}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`);
          } else {
            const kbSpec = mgPlan?.kenBurns?.find((kb: any) => kb.shotElementId === vc.elementId);
            if (kbSpec) {
              const audioDrivenSpec = { ...kbSpec, durationSeconds: clipDur } as KenBurnsSpec;
              const kbFilter = buildKenBurnsFilter(audioDrivenSpec, fps, resX, resY);
              filterParts.push(`[${i}:v]${kbFilter},setsar=1[v${i}]`);
            } else {
              filterParts.push(`[${i}:v]fps=${fps},scale=${resX}:${resY}:force_original_aspect_ratio=decrease,pad=${resX}:${resY}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`);
            }
          }
          concatInputs += `[v${i}]`;
        }

        // Title card filter processing and insertion into concat
        if (titleCardSegments.length > 0) {
          for (const tcSeg of titleCardSegments) {
            const seg = buildTitleCardSegment(tcSeg.spec, fps, resX, resY);
            // Apply drawtext filters to the title card color source
            const drawtextChain = seg.filters.join(',');
            filterParts.push(`[${tcSeg.inputIdx}:v]${drawtextChain}[${tcSeg.filterLabel}]`);
          }

          // Build concat with title cards interleaved:
          // main-title at the start, scene-transitions between visual clips
          let newConcatInputs = '';
          let concatCount = 0;
          const mainTitleSeg = titleCardSegments.find(s => s.spec.type === 'main-title');
          const sceneTitleSegs = titleCardSegments.filter(s => s.spec.type === 'scene-transition');
          let sceneIdx = 0;

          if (mainTitleSeg) {
            newConcatInputs += `[${mainTitleSeg.filterLabel}]`;
            concatCount++;
          }
          for (let i = 0; i < numVisuals; i++) {
            newConcatInputs += `[v${i}]`;
            concatCount++;
            // Insert a scene transition card after each visual clip except the last
            if (sceneIdx < sceneTitleSegs.length && i < numVisuals - 1) {
              newConcatInputs += `[${sceneTitleSegs[sceneIdx].filterLabel}]`;
              concatCount++;
              sceneIdx++;
            }
          }
          filterParts.push(`${newConcatInputs}concat=n=${concatCount}:v=1:a=0[vcombined]`);
        } else {
          filterParts.push(`${concatInputs}concat=n=${numVisuals}:v=1:a=0[vcombined]`);
        }

        // Post-concat video label tracking
        let currentVideoLabel = 'vcombined';

        // Caption overlays
        if (mgPlan?.captions?.length > 0) {
          let cumulativeTime = 0;
          const clipTimeMap: Record<string, number> = {};
          for (let i = 0; i < numVisuals; i++) {
            clipTimeMap[effectiveVisualClips[i].elementId] = cumulativeTime;
            cumulativeTime += clipDurations[i];
          }

          const captionFilters: string[] = [];
          for (const cap of mgPlan.captions as CaptionSpec[]) {
            const clipStart = clipTimeMap[cap.elementId];
            if (clipStart == null) continue;
            const clipIdx = effectiveVisualClips.findIndex((vc: any) => vc.elementId === cap.elementId);
            const clipDur = clipIdx >= 0 ? clipDurations[clipIdx] : 0;
            if (clipDur <= 0) continue;
            const capFilter = buildCaptionFilter(cap, clipStart, clipDur, resX, resY);
            if (capFilter) captionFilters.push(capFilter);
          }

          if (captionFilters.length > 0) {
            const nextLabel = 'vcaptions';
            filterParts.push(`[${currentVideoLabel}]${captionFilters.join(',')}[${nextLabel}]`);
            currentVideoLabel = nextLabel;
          }
        }

        // Lower third overlays
        if (mgPlan?.lowerThirds?.length > 0) {
          let cumulativeTime = 0;
          const clipTimeMap: Record<string, number> = {};
          for (let i = 0; i < numVisuals; i++) {
            clipTimeMap[effectiveVisualClips[i].elementId] = cumulativeTime;
            cumulativeTime += clipDurations[i];
          }

          const ltFilters: string[] = [];
          for (const lt of mgPlan.lowerThirds as LowerThirdSpec[]) {
            const clipStart = clipTimeMap[lt.triggerElementId];
            if (clipStart == null) continue;
            const ltFilter = buildLowerThirdFilter(lt, clipStart, resX, resY);
            if (ltFilter) ltFilters.push(ltFilter);
          }

          if (ltFilters.length > 0) {
            const nextLabel = 'vlowerthirds';
            filterParts.push(`[${currentVideoLabel}]${ltFilters.join(',')}[${nextLabel}]`);
            currentVideoLabel = nextLabel;
          }
        }

        // Global effects (grain, vignette, letterbox)
        if (mgPlan?.effects?.length > 0) {
          const globalEffects = (mgPlan.effects as EffectSpec[]).filter((e: EffectSpec) => e.scope === 'global');
          if (globalEffects.length > 0) {
            const effectFilter = buildEffectFilters(globalEffects, currentVideoLabel);
            if (effectFilter) {
              const nextLabel = 'veffects';
              filterParts.push(`[${currentVideoLabel}]${effectFilter}[${nextLabel}]`);
              currentVideoLabel = nextLabel;
            }
          }
        }

        // Rename final video label to [vout]
        if (currentVideoLabel !== 'vout') {
          filterParts.push(`[${currentVideoLabel}]copy[vout]`);
        }

        if (numAudio > 0) {
          let amixInputs = '';
          for (let i = 0; i < numAudio; i++) {
            const audioIdx = numVisuals + numTitleCards + i;
            const ac = audioClips[i];
            let volFilter = `volume=${ac.volume}`;
            if (ac.fadeIn > 0) volFilter += `,afade=t=in:d=${ac.fadeIn}`;
            if (ac.fadeOut > 0) volFilter += `,afade=t=out:st=${Math.max(0, ac.duration - ac.fadeOut)}:d=${ac.fadeOut}`;
            const delayMs = Math.max(0, Math.round(ac.startTime * 1000));
            filterParts.push(`[${audioIdx}:a]atrim=0:${ac.duration},${volFilter},adelay=${delayMs}|${delayMs},apad[a${i}]`);
            amixInputs += `[a${i}]`;
          }
          if (numAudio === 1) {
            filterParts.push(`${amixInputs}atrim=0:${totalDuration}[aout]`);
          } else {
            filterParts.push(`${amixInputs}amix=inputs=${numAudio}:duration=longest:dropout_transition=2,atrim=0:${totalDuration}[aout]`);
          }
        } else {
          filterParts.push(`anullsrc=r=44100:cl=stereo,atrim=0:${totalDuration}[aout]`);
        }

        const filterComplex = filterParts.join(';');
        const isWebm = format === 'webm';
        const videoCodec = isWebm ? 'libvpx-vp9' : 'libx264';
        const audioCodec = isWebm ? 'libopus' : 'aac';

        ffmpegArgs.push(
          '-filter_complex', filterComplex,
          '-map', '[vout]',
          '-map', '[aout]',
          '-c:v', videoCodec,
          ...(isWebm ? ['-b:v', '2M'] : ['-preset', 'medium', '-crf', String(crf)]),
          '-c:a', audioCodec,
          '-b:a', '192k',
          '-t', String(totalDuration),
          '-pix_fmt', 'yuv420p',
          ...(isWebm ? [] : ['-movflags', '+faststart']),
          '-y',
          outputPath,
        );

        sdk.log('info', 'render-video', `Starting render: ${numVisuals} visual clips, ${numAudio} audio clips, ${totalDuration}s, ${resX}x${resY} @ ${fps}fps`);

        const ffmpegBin = '/opt/homebrew/bin/ffmpeg';
        const ffproc = sdk.spawn(ffmpegBin, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        renderProcess = ffproc;

        let stderrLog = '';
        ffproc.stderr?.on('data', (chunk: any) => {
          stderrLog += chunk.toString();
        });

        await new Promise<void>((resolve, reject) => {
          ffproc.on('close', (code: number | null) => {
            renderProcess = null;
            if (code === 0) resolve();
            else {
              const lines = stderrLog.trim().split('\n');
              const lastLines = lines.slice(-5).join('\n');
              reject(new Error(`ffmpeg exited with code ${code}: ${lastLines}`));
            }
          });
          ffproc.on('error', (err: Error) => {
            renderProcess = null;
            reject(err);
          });
        });

        const outputStat = await sdk.stat(outputPath);
        const fileSizeMB = (outputStat.size / (1024 * 1024)).toFixed(1);

        sdk.log('info', 'render-video', `Render complete: ${outputPath} (${fileSizeMB}MB)`);

        // Clean up temp chain concat files
        for (const tf of tempFiles) {
          try { await sdk.unlink(tf); } catch { /* ignore */ }
        }

        sdk.sendJson(res, 200, {
          success: true,
          videoPath: outputPath,
          duration: totalDuration,
          fileSize: outputStat.size,
          fileSizeMB,
          scenes: numVisuals,
          audioTracks: numAudio,
        });
      } catch (err) {
        sdk.log('error', 'render-video', `Render failed: ${err}`);
        sdk.sendJson(res, 500, { error: 'Render failed: ' + (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── POST /render-cancel ────────────────────────────────────
    if (req.method === 'POST' && subPath === '/render-cancel') {
      if (renderProcess) {
        renderProcess.kill('SIGTERM');
        renderProcess = null;
      }
      sdk.sendJson(res, 200, { success: true });
      return true;
    }

    // ── POST /generate-logo ─────────────────────────────────────
    if (req.method === 'POST' && subPath === '/generate-logo') {
      const body = await sdk.readBody(req);
      const prompt: string = body.prompt;
      if (!prompt) {
        sdk.sendJson(res, 400, { error: 'prompt required' });
        return true;
      }

      try {
        const projFolder = await sdk.getProjectFolder();
        const logoDir = sdk.join(projFolder, 'assets');
        await sdk.mkdir(logoDir);
        const outputPath = sdk.join(logoDir, `pipeline-logo.png`);

        const result = await sdk.generateImage({
          prompt,
          aspectRatio: '1:1',
          outputPath,
        });

        if (!result.success) throw new Error(result.error || 'Generation failed');

        sdk.sendJson(res, 200, { success: true, filePath: result.filePath || outputPath });
      } catch (err) {
        sdk.log('error', 'generate-logo', `Error: ${err}`);
        sdk.sendJson(res, 500, { error: (err instanceof Error ? err.message : String(err)) });
      }
      return true;
    }

    // ── PUT /element/:elementId ──────────────────────────────────
    const elementMatch = subPath.match(/^\/element\/([^/]+)$/);
    if (req.method === 'PUT' && elementMatch) {
      const elementId = decodeURIComponent(elementMatch[1]);
      const body = await sdk.readBody(req);
      const { field, value } = body;

      if (!field || value === undefined) {
        sdk.sendJson(res, 400, { error: 'field and value required' });
        return true;
      }

      const project = sdk.getProject();
      if (project) {
        const elem = project.elements?.find((e: any) => e.id === elementId);
        if (elem) {
          (elem as any)[field] = value;
          (elem as any)._editedAt = new Date().toISOString();
          sdk.markDirty(['elements']);
          sdk.sendJson(res, 200, { success: true, elementId, field, value });
          return true;
        }
      }

      sdk.sendJson(res, 404, { error: 'Element not found: ' + elementId });
      return true;
    }

    // ── POST /extract-pdf-text ──────────────────────────────────
    if (req.method === 'POST' && subPath === '/extract-pdf-text') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const pdfBuffer = Buffer.concat(chunks);

        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

        const page1 = await doc.getPage(1);
        const viewport = page1.getViewport({ scale: 1 });
        const pageWidth = viewport.width;

        let fullText = '';

        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const textContent = await page.getTextContent({ includeMarkedContent: false });

          interface TextItem {
            str: string;
            transform: number[];
            width: number;
            height: number;
          }

          const items: TextItem[] = textContent.items.filter((item: any) => 'str' in item);
          if (items.length === 0) continue;

          // Sort by Y descending (top to bottom) then X ascending (left to right)
          items.sort((a: TextItem, b: TextItem) => {
            const yA = Math.round(a.transform[5]);
            const yB = Math.round(b.transform[5]);
            if (Math.abs(yA - yB) > 3) return yB - yA;
            return a.transform[4] - b.transform[4];
          });

          let currentY = -1;
          let lineBuffer: TextItem[] = [];

          const flushLine = () => {
            if (lineBuffer.length === 0) return;
            lineBuffer.sort((a: TextItem, b: TextItem) => a.transform[4] - b.transform[4]);

            let lineStr = '';
            let lastEndX = 0;
            for (let i = 0; i < lineBuffer.length; i++) {
              const item = lineBuffer[i];
              const x = item.transform[4];
              if (i > 0) {
                const gap = x - lastEndX;
                if (gap > 4) lineStr += ' ';
              }
              lineStr += item.str;
              lastEndX = x + item.width;
            }

            const trimmed = lineStr.trimEnd();
            const leftMargin = lineBuffer[0].transform[4];
            const centerX = leftMargin + (lineBuffer[lineBuffer.length - 1].transform[4] + lineBuffer[lineBuffer.length - 1].width - leftMargin) / 2;
            const pageCenter = pageWidth / 2;
            const isCentered = Math.abs(centerX - pageCenter) < 30;

            if (trimmed.length === 0) {
              fullText += '\n';
            } else {
              // Detect indentation level for screenplay formatting
              const isCharacterName = isCentered && trimmed === trimmed.toUpperCase() && trimmed.length < 40 && leftMargin > pageWidth * 0.25;
              const isDialogue = leftMargin > pageWidth * 0.15 && leftMargin < pageWidth * 0.35;
              const isParenthetical = trimmed.startsWith('(') && isCentered;
              const isTransition = trimmed === trimmed.toUpperCase() && (trimmed.includes('CUT TO') || trimmed.includes('FADE') || trimmed.includes('DISSOLVE'));
              const isSlugline = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/.test(trimmed);

              if (isSlugline) {
                fullText += '\n' + trimmed + '\n';
              } else if (isTransition) {
                fullText += '\n' + trimmed + '\n';
              } else if (isCharacterName) {
                fullText += '\n' + trimmed + '\n';
              } else if (isParenthetical) {
                fullText += trimmed + '\n';
              } else if (isDialogue) {
                fullText += trimmed + '\n';
              } else {
                fullText += trimmed + '\n';
              }
            }

            lineBuffer = [];
          };

          for (const item of items) {
            const y = Math.round(item.transform[5]);
            if (currentY === -1) {
              currentY = y;
            } else if (Math.abs(y - currentY) > 3) {
              flushLine();
              const gap = currentY - y;
              if (gap > 14) fullText += '\n';
              currentY = y;
            }
            lineBuffer.push(item);
          }
          flushLine();
          fullText += '\n';
        }

        fullText = fullText.replace(/\n{4,}/g, '\n\n\n');

        sdk.sendJson(res, 200, { text: fullText.trim(), pages: doc.numPages });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: 'Failed to parse PDF: ' + (err.message || String(err)) });
      }
      return true;
    }

    // ── GET /voice-bindings ─────────────────────────────────
    // Return voice bindings stored in the project metadata (persisted).
    if (req.method === 'GET' && subPath === '/voice-bindings') {
      try {
        await sdk.ensureProject();
        const project = sdk.getProject();
        // Read from metadata (persisted) with fallback to legacy top-level field
        const voiceBindings = project?.metadata?.voiceBindings || project?.voiceBindings || [];
        sdk.sendJson(res, 200, { bindings: voiceBindings });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: String(err.message || err) });
      }
      return true;
    }

    // ── PUT /voice-bindings ──────────────────────────────────
    // Save voice bindings into project.metadata (persisted to project.json).
    if (req.method === 'PUT' && subPath === '/voice-bindings') {
      try {
        const body = await sdk.readBody(req);
        const voiceBindings = Array.isArray(body.bindings) ? body.bindings : [];
        await sdk.ensureProject();
        const project = sdk.getProject();
        if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }
        if (!project.metadata) project.metadata = {};
        project.metadata.voiceBindings = voiceBindings;
        sdk.markDirty(['metadata']);
        await sdk.flushProject();
        sdk.sendJson(res, 200, { success: true, count: voiceBindings.length });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: String(err.message || err) });
      }
      return true;
    }

    // ── POST /auto-assign-voices ──────────────────────────────
    // Validate LLM-generated voice assignments and save them.
    // Body: { assignments: [{characterId, voiceId, voiceName}], characters: [{id}], voices: [{voice_id}] }
    if (req.method === 'POST' && subPath === '/auto-assign-voices') {
      try {
        const body = await sdk.readBody(req);
        const assignments: any[] = body.assignments || [];
        const characters: any[] = body.characters || [];
        const voices: any[] = body.voices || [];

        if (characters.length === 0 || voices.length === 0) {
          sdk.sendJson(res, 400, { error: 'characters and voices arrays required' });
          return true;
        }

        await sdk.ensureProject();
        const project = sdk.getProject();
        const existingBindings: any[] = project?.metadata?.voiceBindings || project?.voiceBindings || [];
        const alreadyAssigned = new Set(
          existingBindings.filter((b: any) => b.type === 'voice').map((b: any) => b.source?.entityId)
        );

        // Validate assignments against actual IDs
        const validCharIds = new Set(characters.map((c: any) => c.id));
        const validVoiceIds = new Set(voices.map((v: any) => v.voice_id));
        const usedVoices = new Set(
          existingBindings.filter((b: any) => b.type === 'voice').map((b: any) => b.target?.entityId)
        );
        const validAssignments: any[] = [];

        for (const a of assignments) {
          if (!a.characterId || !a.voiceId) continue;
          if (!validCharIds.has(a.characterId)) continue;
          if (!validVoiceIds.has(a.voiceId)) continue;
          if (alreadyAssigned.has(a.characterId)) continue;
          if (usedVoices.has(a.voiceId)) continue;
          usedVoices.add(a.voiceId);
          validAssignments.push(a);
        }

        // Build new bindings
        const now = new Date().toISOString();
        const newBindings = [...existingBindings];
        for (const a of validAssignments) {
          newBindings.push({
            id: `voice-${a.characterId}-${Date.now()}`,
            type: 'voice',
            source: { entityType: 'character', entityId: a.characterId },
            target: { entityType: 'voice', entityId: a.voiceId },
            confidence: 0.8,
            origin: 'auto:llm',
            createdAt: now,
            updatedAt: now,
            metadata: { voiceName: a.voiceName },
          });
        }

        // Save to metadata
        if (project) {
          if (!project.metadata) project.metadata = {};
          project.metadata.voiceBindings = newBindings;
          sdk.markDirty(['metadata']);
          await sdk.flushProject();
        }

        sdk.sendJson(res, 200, {
          success: true,
          assignments: validAssignments,
          applied: validAssignments.length,
          total: characters.filter((c: any) => !alreadyAssigned.has(c.id)).length,
          bindings: newBindings,
        });
      } catch (err: any) {
        sdk.log('error', 'auto-assign-voices', `Error: ${err.message || err}`);
        sdk.sendJson(res, 500, { error: 'Auto-assign failed: ' + (err.message || String(err)) });
      }
      return true;
    }

    // ── PUT /editor-clips ──────────────────────────────────
    // Save user-added editor clips (music, sfx, etc.) to project metadata.
    if (req.method === 'PUT' && subPath === '/editor-clips') {
      try {
        const body = await sdk.readBody(req);
        const clips = Array.isArray(body.clips) ? body.clips : [];
        await sdk.ensureProject();
        const project = sdk.getProject();
        if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }
        if (!project.metadata) project.metadata = {};
        project.metadata.editorUserClips = clips;
        sdk.markDirty(['metadata']);
        await sdk.flushProject();
        sdk.sendJson(res, 200, { success: true, count: clips.length });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: String(err.message || err) });
      }
      return true;
    }

    // ── GET /editor-clips ──────────────────────────────────
    if (req.method === 'GET' && subPath === '/editor-clips') {
      try {
        await sdk.ensureProject();
        const project = sdk.getProject();
        const clips = project?.metadata?.editorUserClips || [];
        sdk.sendJson(res, 200, { clips });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: String(err.message || err) });
      }
      return true;
    }

    // ── POST /update-prompt-prefix ──────────────────────────
    // Save the image generation prompt prefix on the project.
    // Body: { imagePromptPrefix: string }
    if (req.method === 'POST' && subPath === '/update-prompt-prefix') {
      try {
        const body = await sdk.readBody(req);
        const prefix = typeof body.imagePromptPrefix === 'string' ? body.imagePromptPrefix : undefined;
        const locPrefix = typeof body.locationImagePromptPrefix === 'string' ? body.locationImagePromptPrefix : undefined;
        const shotPrefix = typeof body.shotImagePromptPrefix === 'string' ? body.shotImagePromptPrefix : undefined;
        await sdk.ensureProject();
        const project = sdk.getProject();
        if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }
        if (!project.metadata) project.metadata = {};
        if (prefix !== undefined) project.metadata.imagePromptPrefix = prefix;
        if (locPrefix !== undefined) project.metadata.locationImagePromptPrefix = locPrefix;
        if (shotPrefix !== undefined) project.metadata.shotImagePromptPrefix = shotPrefix;
        if (typeof body.globalAspectRatio === 'string') project.metadata.globalAspectRatio = body.globalAspectRatio;
        if (typeof body.motionApproach === 'string') project.metadata.motionApproach = body.motionApproach;
        sdk.markDirty(['metadata']);
        await sdk.flushProject();
        sdk.sendJson(res, 200, { success: true });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: 'Failed to save prompt prefix: ' + (err.message || String(err)) });
      }
      return true;
    }

    // ── POST /update-character ───────────────────────────────
    // Update a single character's editable fields. Does NOT touch image fields.
    // Body: { characterId: string, updates: { name?, description?, ... } }
    if (req.method === 'POST' && subPath === '/update-character') {
      try {
        const body = await sdk.readBody(req);
        const { characterId, updates } = body;
        if (!characterId || !updates) { sdk.sendJson(res, 400, { error: 'characterId and updates required' }); return true; }

        await sdk.ensureProject();
        const project = sdk.getProject();
        if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }

        const char = (project.characters || []).find((c: any) => c.id === characterId);
        if (!char) { sdk.sendJson(res, 404, { error: 'Character not found' }); return true; }

        // Only update user-editable fields — never image fields
        const editableFields = ['name', 'displayName', 'description', 'ageRange', 'gender', 'role',
          'traits', 'arc', 'voiceDescription', 'wardrobeNotes', 'aliases'] as const;
        for (const key of editableFields) {
          if (updates[key] !== undefined) {
            (char as any)[key] = updates[key];
          }
        }

        sdk.markDirty(['characters']);
        await sdk.flushProject();

        sdk.sendJson(res, 200, { success: true, character: char });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: String(err.message || err) });
      }
      return true;
    }

    // ── POST /generate-character-headshot ─────────────────────
    // Generate a single character headshot version.
    // Body: { characterId: string }
    // Returns the new version info and updates the character's imageVersions + imagePath.
    if (req.method === 'POST' && subPath === '/generate-character-headshot') {
      try {
        const body = await sdk.readBody(req);
        const charId = body.characterId;
        if (!charId) { sdk.sendJson(res, 400, { error: 'characterId required' }); return true; }

        await sdk.ensureProject();
        const pfolder = await sdk.getProjectFolder();
        if (!pfolder) { sdk.sendJson(res, 400, { error: 'No project data found' }); return true; }

        // Use the client-sent character for prompt building — this is the user's
        // latest data, which may not yet be reflected in the server's in-memory state.
        // Fall back to the server's copy only if no client data was sent.
        const clientChar = body.character;
        const project = sdk.getProject();
        const serverChar = (project?.characters || []).find((c: any) => c.id === charId);
        if (!serverChar && !clientChar) { sdk.sendJson(res, 404, { error: 'Character not found' }); return true; }

        // Use client data for prompt fields, fall back to server data
        const c = clientChar || serverChar;
        const name = c.name || 'a person';
        const description = c.description || '';
        const ageRange = c.ageRange || '';
        const gender = c.gender || '';
        const wardrobeNotes = c.wardrobeNotes || '';

        const charDir = sdk.join(pfolder, 'characters');
        await sdk.mkdir(charDir);

        // Read prompt prefix from project metadata
        const promptPrefix = project?.metadata?.imagePromptPrefix || '';

        // Build prompt — prefix overrides default style when set
        let prompt = promptPrefix
          ? `${promptPrefix} ${name}`
          : `Professional headshot portrait of ${name}`;
        if (description) prompt += `. ${description}`;
        if (ageRange) prompt += ` Age: ${ageRange}.`;
        if (gender) prompt += ` ${gender}.`;
        if (wardrobeNotes) prompt += ` Wearing: ${wardrobeNotes}.`;
        if (!promptPrefix) prompt += ' Cinematic lighting, studio portrait, shallow depth of field, 85mm lens. Photorealistic.';

        // Determine version number from server's copy (authoritative for image history).
        // If the character has an imagePath but no imageVersions, seed the existing
        // image as v1 so it's preserved in the version history.
        let existingVersions: any[] = (serverChar?.imageVersions) || [];
        if (existingVersions.length === 0 && serverChar?.imagePath) {
          existingVersions = [{ version: 1, filePath: serverChar.imagePath, generatedAt: '', prompt: 'Original generation' }];
          if (serverChar) serverChar.imageVersions = existingVersions;
        }
        const versionNum = existingVersions.length + 1;
        const safeName = (charId || name || 'char').replace(/[^a-zA-Z0-9_-]/g, '_');
        const outputPath = sdk.join(charDir, `${safeName}_v${versionNum}.png`);

        const result = await sdk.generateImage({
          prompt,
          model: 'flash',
          aspectRatio: '3:4',
          outputPath,
        });

        const imgPath = result.filePath || outputPath;
        const newVersion = {
          version: versionNum,
          filePath: imgPath,
          generatedAt: new Date().toISOString(),
          prompt,
        };

        // Re-read the character fresh from project state to avoid overwriting
        // concurrent edits. Only mutate image-related fields, then flush.
        const freshProject = sdk.getProject();
        const freshChar = (freshProject?.characters || []).find((c: any) => c.id === charId);
        if (freshChar) {
          if (!freshChar.imageVersions) freshChar.imageVersions = [];
          // Seed existing image as v1 if this is the first regen
          if (freshChar.imageVersions.length === 0 && freshChar.imagePath) {
            freshChar.imageVersions.push({ version: 1, filePath: freshChar.imagePath, generatedAt: '', prompt: 'Original generation' });
          }
          freshChar.imageVersions.push(newVersion);
          freshChar.imagePath = imgPath;
          freshChar.activeImageVersion = versionNum;
          // Mark characters dirty and flush — don't call updateProject which
          // replaces the whole slice and can overwrite concurrent edits.
          sdk.markDirty(['characters']);
          await sdk.flushProject();
        }

        sdk.sendJson(res, 200, { success: true, version: newVersion, totalVersions: versionNum });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: 'Headshot generation failed: ' + (err.message || String(err)) });
      }
      return true;
    }

    // ── POST /set-character-image-version ──────────────────────
    // Switch active image version for a character.
    // Body: { characterId: string, version: number }
    if (req.method === 'POST' && subPath === '/set-character-image-version') {
      try {
        const body = await sdk.readBody(req);
        const { characterId, version } = body;
        if (!characterId || !version) { sdk.sendJson(res, 400, { error: 'characterId and version required' }); return true; }

        await sdk.ensureProject();
        const project = sdk.getProject();
        if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }

        const char = (project.characters || []).find((c: any) => c.id === characterId);
        if (!char) { sdk.sendJson(res, 404, { error: 'Character not found' }); return true; }

        const ver = (char.imageVersions || []).find((v: any) => v.version === version);
        if (!ver) { sdk.sendJson(res, 404, { error: 'Version not found' }); return true; }

        char.imagePath = ver.filePath;
        char.activeImageVersion = version;
        sdk.markDirty(['characters']);
        await sdk.flushProject();

        sdk.sendJson(res, 200, { success: true, imagePath: ver.filePath, activeVersion: version });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: String(err.message || err) });
      }
      return true;
    }

    // ── POST /generate-assets ──────────────────────────────────
    if (req.method === 'POST' && subPath === '/generate-assets') {
      try {
        const body = await sdk.readBody(req);
        const entityType = body.type || 'all';
        const useStream = body.stream === true;

        await sdk.ensureProject();
        const project = sdk.getProject();
        const pfolder = await sdk.getProjectFolder();

        if (!project || !pfolder) {
          sdk.sendJson(res, 400, { error: 'No project data found' });
          return true;
        }

        // Helper: write an ndjson event to the stream
        function writeEvent(event: Record<string, any>) {
          if (useStream) {
            res.write(JSON.stringify(event) + '\n');
          }
        }

        // Set up streaming response if requested
        if (useStream) {
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
        }

        const results: Array<{ name: string; type: string; path?: string; error?: string }> = [];
        let completed = 0;

        // Generate character headshots (with versioning)
        if (entityType === 'characters' || entityType === 'all') {
          const chars = project.characters || [];
          const total = chars.length;
          const charDir = sdk.join(pfolder, 'characters');
          await sdk.mkdir(charDir);

          const bulkPromptPrefix = project.metadata?.imagePromptPrefix || '';
          for (const char of chars) {
            try {
              const charName = char.name || 'a person';
              let prompt = bulkPromptPrefix
                ? `${bulkPromptPrefix} ${charName}`
                : `Professional headshot portrait of ${charName}`;
              if (char.description) prompt += `. ${char.description}`;
              if (char.ageRange) prompt += ` Age: ${char.ageRange}.`;
              if (char.gender) prompt += ` ${char.gender}.`;
              if (char.wardrobeNotes) prompt += ` Wearing: ${char.wardrobeNotes}.`;
              if (!bulkPromptPrefix) prompt += ' Cinematic lighting, studio portrait, shallow depth of field, 85mm lens. Photorealistic.';

              const versions: any[] = char.imageVersions || [];
              const versionNum = versions.length + 1;
              const safeName = (char.id || char.name || 'char').replace(/[^a-zA-Z0-9_-]/g, '_');
              const outputPath = sdk.join(charDir, `${safeName}_v${versionNum}.png`);

              const result = await sdk.generateImage({
                prompt,
                model: 'flash',
                aspectRatio: '3:4',
                outputPath,
              });

              const imgPath = result.filePath || outputPath;
              const newVersion = {
                version: versionNum,
                filePath: imgPath,
                generatedAt: new Date().toISOString(),
                prompt,
              };
              if (!char.imageVersions) char.imageVersions = [];
              char.imageVersions.push(newVersion);
              char.imagePath = imgPath;
              char.activeImageVersion = versionNum;
              results.push({ name: char.name, type: 'character', path: imgPath });
              sdk.updateProject({ characters: project.characters });
              await sdk.flushProject();
            } catch (err: any) {
              results.push({ name: char.name, type: 'character', error: err.message || String(err) });
            }
            completed++;
            writeEvent({ type: 'progress', completed, total, name: char.name, entityType: 'character' });
          }
        }

        // Generate location shots
        if (entityType === 'locations' || entityType === 'all') {
          const locs = project.locations || [];
          const total = locs.length;
          const locDir = sdk.join(pfolder, 'locations');
          await sdk.mkdir(locDir);
          let locCompleted = 0;

          const locPromptPrefix = project.metadata?.locationImagePromptPrefix || '';
          for (const loc of locs) {
            try {
              const locName = loc.name || 'a location';
              let prompt = locPromptPrefix
                ? `${locPromptPrefix} ${locName}`
                : `Cinematic establishing shot of ${locName}`;
              if (loc.description) prompt += `. ${loc.description}`;
              if (loc.mood) prompt += ` Mood: ${loc.mood}.`;
              if (loc.atmosphere) prompt += ` ${loc.atmosphere}`;
              if (!locPromptPrefix) prompt += ' Wide-angle lens, dramatic lighting, film grain, professional cinematography. 35mm film look.';

              const safeName = (loc.id || loc.name || 'loc').replace(/[^a-zA-Z0-9_-]/g, '_');
              const outputPath = sdk.join(locDir, `${safeName}.png`);

              const result = await sdk.generateImage({
                prompt,
                model: 'flash',
                aspectRatio: '16:9',
                outputPath,
              });

              const imgPath = result.filePath || outputPath;
              results.push({ name: loc.name, type: 'location', path: imgPath });
              loc.imagePath = imgPath;
              sdk.updateProject({ locations: project.locations });
              await sdk.flushProject();
            } catch (err: any) {
              results.push({ name: loc.name, type: 'location', error: err.message || String(err) });
            }
            locCompleted++;
            completed++;
            writeEvent({ type: 'progress', completed: locCompleted, total, name: loc.name, entityType: 'location' });
          }
        }

        await sdk.flushProject();

        const succeeded = results.filter(r => r.path).length;
        const failed = results.filter(r => r.error).length;
        const summary = { type: 'done', success: true, generated: succeeded, failed, results };

        if (useStream) {
          writeEvent(summary);
          res.end();
        } else {
          sdk.sendJson(res, 200, summary);
        }
      } catch (err: any) {
        if (useStream) {
          try {
            res.write(JSON.stringify({ type: 'error', error: 'Asset generation failed: ' + (err.message || String(err)) }) + '\n');
            res.end();
          } catch { res.end(); }
        } else {
          sdk.sendJson(res, 500, { error: 'Asset generation failed: ' + (err.message || String(err)) });
        }
      }
      return true;
    }

    // ── Export: Fountain ───────────────────────────────────────
    if (req.method === 'POST' && subPath === '/export-fountain') {
      const project = sdk.getProject() || await sdk.ensureProject();
      if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }
      const text = buildFountainText(project);
      const folder = await sdk.getProjectFolder();
      const exportDir = sdk.join(folder, 'exports');
      await sdk.mkdir(exportDir);
      const slug = (project.metadata?.title || 'screenplay').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = slug + '.fountain';
      const filePath = sdk.join(exportDir, filename);
      await sdk.writeFile(filePath, text);
      sdk.sendJson(res, 200, { filePath, filename, text });
      return true;
    }

    // ── Export: Lookbook HTML ────────────────────────────────────
    if (req.method === 'POST' && subPath === '/export-lookbook') {
      try {
        const project = sdk.getProject() || await sdk.ensureProject();
        if (!project) { sdk.sendJson(res, 400, { error: 'No project data' }); return true; }
        const folder = await sdk.getProjectFolder();
        const html = buildLookbookHtml(project, sdk);
        const exportDir = sdk.join(folder, 'exports');
        await sdk.mkdir(exportDir);
        const slug = (project.metadata?.title || 'screenplay').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const filename = slug + '-lookbook.html';
        const filePath = sdk.join(exportDir, filename);
        await sdk.writeFile(filePath, html);
        // Return filePath only (html can be very large for JSON), client opens via /api/file
        sdk.sendJson(res, 200, { filePath, filename });
      } catch (err: any) {
        sdk.sendJson(res, 500, { error: 'Lookbook export failed: ' + (err.message || String(err)) });
      }
      return true;
    }

    return false;
  };
}

// ── Fountain text builder ──────────────────────────────────────
function buildFountainText(project: any): string {
  const lines: string[] = [];
  const meta = project.metadata || {};

  // Title page — only valid Fountain keys: Title, Author, Credit, Source, Draft date, Contact, Copyright, Notes
  const str = (v: any): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map((x: any) => typeof x === 'string' ? x : x?.name || String(x)).join(', ');
    if (typeof v === 'object') return v.name || JSON.stringify(v);
    return String(v);
  };
  if (meta.title) lines.push(`Title: ${str(meta.title)}`);
  if (meta.author) lines.push(`Author: ${str(meta.author)}`);
  if (meta.draftDate) lines.push(`Draft date: ${str(meta.draftDate)}`);
  else lines.push(`Draft date: ${new Date().toISOString().slice(0, 10)}`);
  // Genre/logline go into Notes (the only freeform Fountain title page field)
  const notes: string[] = [];
  if (meta.genre) notes.push(str(meta.genre));
  if (meta.logline) notes.push(str(meta.logline));
  if (notes.length) lines.push(`Notes: ${notes.join(' — ')}`);
  lines.push('', ''); // blank line separates title page from body

  const elements = project.elements || [];
  const sections = project.sections || [];

  // Build a flat list of scene sections with their sceneHeading + elementStart
  const flatScenes = flattenSectionsForExport(sections);

  // Build a set of element indices that start a new scene
  const sceneStartMap = new Map<number, any>();
  for (const s of flatScenes) {
    if (s.elementStart != null) sceneStartMap.set(s.elementStart, s);
  }

  // Walk all elements, inserting scene headings at the right points
  for (let i = 0; i < elements.length; i++) {
    const scene = sceneStartMap.get(i);
    if (scene) {
      lines.push(''); // blank line before scene heading
      const heading = scene.sceneHeading;
      if (heading?.prefix && heading?.location) {
        const tod = heading.timeOfDay ? ` - ${heading.timeOfDay}` : '';
        lines.push(`${heading.prefix}. ${heading.location}${tod}`);
      } else if (heading?.location) {
        lines.push(`.${heading.location}`); // forced scene heading
      } else {
        lines.push(`.${scene.title || 'SCENE'}`);
      }
      lines.push('');
    }

    const elem = elements[i];
    if (!elem) continue;

    switch (elem.type) {
      case 'dialogue': {
        const charName = (elem.characterName || 'UNKNOWN').toUpperCase();
        lines.push(charName);
        if (elem.modifiers?.length) {
          lines.push(`(${elem.modifiers[0]})`);
        }
        const dLines = elem.lines || [elem.content || ''];
        for (const dl of dLines) {
          lines.push(dl);
        }
        lines.push('');
        break;
      }
      case 'action': {
        lines.push(elem.content || '');
        lines.push('');
        break;
      }
      case 'transition': {
        const txt = (elem.content || '').toUpperCase();
        if (!txt.endsWith('TO:')) {
          lines.push(`> ${txt}`);
        } else {
          lines.push(txt); // Fountain auto-recognizes lines ending in TO:
        }
        lines.push('');
        break;
      }
      case 'shot': {
        // Shots render as action text in Fountain
        const desc = elem.shotText || elem.content || '';
        if (desc) {
          lines.push(desc);
          lines.push('');
        }
        break;
      }
    }
  }

  return lines.join('\n');
}

function flattenSectionsForExport(sections: any[]): any[] {
  const result: any[] = [];
  for (const s of sections) {
    if (s.type === 'scene') result.push(s);
    if (Array.isArray(s.children)) result.push(...flattenSectionsForExport(s.children));
  }
  return result;
}

// ── Lookbook HTML builder ──────────────────────────────────────
function buildLookbookHtml(project: any, sdk: PipelineRouteSdk): string {
  const meta = project.metadata || {};
  const characters = project.characters || [];
  const locations = project.locations || [];
  const scenes = project.scenes || [];
  const assets = project.assets?.assets || [];

  const esc = (s: any): string => { const v = s == null ? '' : typeof s === 'string' ? s : typeof s === 'number' ? String(s) : Array.isArray(s) ? s.join(', ') : JSON.stringify(s); return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const imgUrl = (path: string) => path ? `/api/file?path=${encodeURIComponent(path)}` : '';

  // Gather character headshots from assets
  const charImageMap: Record<string, string> = {};
  for (const c of characters) {
    if (c.imagePath) charImageMap[c.id] = c.imagePath;
  }
  for (const a of assets) {
    if (a.type === 'character-headshot' && a.metadata?.characterId) {
      charImageMap[a.metadata.characterId] = a.filePath;
    }
  }

  // Gather location images
  const locImageMap: Record<string, string> = {};
  for (const l of locations) {
    if (l.imagePath) locImageMap[l.id] = l.imagePath;
  }
  for (const a of assets) {
    if ((a.type === 'landscape' || a.type === 'location-landscape') && a.metadata?.locationId) {
      locImageMap[a.metadata.locationId] = a.filePath;
    }
  }

  const parts: string[] = [];

  parts.push(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'Lookbook')} — Lookbook</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #0f0d1a; color: #e2e8f0; line-height: 1.6; }
  .page { padding: 48px 40px; max-width: 1000px; margin: 0 auto; }
  .page-break { page-break-after: always; margin-bottom: 48px; }
  h1 { font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  h2 { font-size: 28px; font-weight: 600; color: #c4b5fd; margin-bottom: 20px; border-bottom: 1px solid rgba(139,92,246,0.3); padding-bottom: 8px; }
  h3 { font-size: 18px; font-weight: 600; color: #a78bfa; margin-bottom: 12px; }
  .subtitle { font-size: 18px; color: #94a3b8; font-style: italic; margin-bottom: 16px; }
  .tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .tag { background: rgba(139,92,246,0.15); color: #c4b5fd; padding: 4px 12px; border-radius: 20px; font-size: 13px; }
  .meta-row { font-size: 14px; color: #94a3b8; margin-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
  .card-body { padding: 16px; }
  .card-title { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 4px; }
  .card-desc { font-size: 13px; color: #94a3b8; }
  .scene-heading { font-size: 14px; font-weight: 700; color: #22d3ee; text-transform: uppercase; margin-bottom: 8px; }
  .previs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .previs-card { border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
  .previs-card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
  .previs-caption { padding: 8px; font-size: 11px; color: #94a3b8; }
  .synopsis-item { margin-bottom: 8px; padding-left: 12px; border-left: 2px solid rgba(139,92,246,0.3); }
  .synopsis-title { font-weight: 600; color: #e2e8f0; font-size: 14px; }
  .synopsis-desc { font-size: 13px; color: #64748b; }

  @media print {
    body { background: #fff; color: #1e293b; }
    .page { padding: 24px 20px; }
    h1 { color: #0f172a; }
    h2 { color: #6d28d9; border-color: #e5e7eb; }
    h3 { color: #7c3aed; }
    .subtitle { color: #475569; }
    .tag { background: #f3f4f6; color: #6d28d9; border: 1px solid #e5e7eb; }
    .meta-row { color: #475569; }
    .card { border-color: #e5e7eb; background: #fafafa; }
    .card-title { color: #0f172a; }
    .card-desc { color: #475569; }
    .scene-heading { color: #0891b2; }
    .previs-card { border-color: #e5e7eb; }
    .previs-caption { color: #475569; }
    .synopsis-title { color: #0f172a; }
    .synopsis-desc { color: #475569; }
    .synopsis-item { border-color: #e5e7eb; }
  }
</style>
</head>
<body>`);

  // ── Title page ──
  parts.push(`<div class="page page-break">`);
  parts.push(`<div style="display:flex;flex-direction:column;justify-content:center;min-height:80vh">`);
  parts.push(`<h1>${esc(meta.title || 'Untitled')}</h1>`);
  if (meta.logline) parts.push(`<p class="subtitle">${esc(meta.logline)}</p>`);
  parts.push(`<div class="tags">`);
  // genre/tone/audience can be string, string[], or object
  const tagList = (v: any): string[] => {
    if (!v) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.map((x: any) => typeof x === 'string' ? x : x?.name || x?.label || String(x)).filter(Boolean);
    return [String(v)];
  };
  for (const t of tagList(meta.genre)) parts.push(`<span class="tag">${esc(t)}</span>`);
  for (const t of tagList(meta.tone)) parts.push(`<span class="tag">${esc(t)}</span>`);
  for (const t of tagList(meta.audience)) parts.push(`<span class="tag">${esc(t)}</span>`);
  parts.push(`</div>`);
  // author can be string, string[], or [{name, role}]
  const authorStr = (() => {
    if (!meta.author) return '';
    if (typeof meta.author === 'string') return meta.author;
    if (Array.isArray(meta.author)) return meta.author.map((a: any) => typeof a === 'string' ? a : a?.name || '').filter(Boolean).join(' & ');
    return String(meta.author);
  })();
  if (authorStr) parts.push(`<p class="meta-row">Written by ${esc(authorStr)}</p>`);
  if (meta.runtimeMinutes) parts.push(`<p class="meta-row">Estimated runtime: ${meta.runtimeMinutes} minutes</p>`);
  parts.push(`<p class="meta-row">${scenes.length} Scenes · ${characters.length} Characters · ${locations.length} Locations</p>`);
  parts.push(`</div></div>`);

  // ── Synopsis ──
  if (scenes.length > 0) {
    parts.push(`<div class="page page-break">`);
    parts.push(`<h2>Synopsis</h2>`);
    for (const scene of scenes) {
      parts.push(`<div class="synopsis-item">`);
      parts.push(`<div class="synopsis-title">${esc(scene.title || 'Scene')}</div>`);
      if (scene.actions?.length) {
        const actionText = typeof scene.actions[0] === 'string' ? scene.actions[0] : String(scene.actions[0]?.content || scene.actions[0] || '');
        parts.push(`<div class="synopsis-desc">${esc(actionText.substring(0, 200))}${actionText.length > 200 ? '...' : ''}</div>`);
      }
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  // ── Characters ──
  if (characters.length > 0) {
    parts.push(`<div class="page page-break">`);
    parts.push(`<h2>Characters</h2>`);
    parts.push(`<div class="grid">`);
    for (const c of characters) {
      const img = charImageMap[c.id];
      parts.push(`<div class="card">`);
      if (img) parts.push(`<img src="${esc(imgUrl(img))}" alt="${esc(c.displayName || c.name)}">`);
      parts.push(`<div class="card-body">`);
      parts.push(`<div class="card-title">${esc(c.displayName || c.name)}</div>`);
      if (c.description) parts.push(`<div class="card-desc">${esc(c.description)}</div>`);
      if (c.arc) parts.push(`<div class="card-desc" style="margin-top:6px;color:#a78bfa"><strong>Arc:</strong> ${esc(c.arc)}</div>`);
      parts.push(`</div></div>`);
    }
    parts.push(`</div></div>`);
  }

  // ── Locations ──
  if (locations.length > 0) {
    parts.push(`<div class="page page-break">`);
    parts.push(`<h2>Locations</h2>`);
    parts.push(`<div class="grid">`);
    for (const l of locations) {
      const img = locImageMap[l.id];
      parts.push(`<div class="card">`);
      if (img) parts.push(`<img src="${esc(imgUrl(img))}" alt="${esc(l.name)}">`);
      parts.push(`<div class="card-body">`);
      parts.push(`<div class="card-title">${esc(l.name)}</div>`);
      if (l.description) parts.push(`<div class="card-desc">${esc(l.description)}</div>`);
      parts.push(`</div></div>`);
    }
    parts.push(`</div></div>`);
  }

  // ── Key Frames (Previs by Scene) ──
  const scenesWithPrevis = scenes.filter((s: any) => s.shots?.some((sh: any) => sh.previsPath));
  if (scenesWithPrevis.length > 0) {
    parts.push(`<div class="page">`);
    parts.push(`<h2>Key Frames</h2>`);
    for (const scene of scenesWithPrevis) {
      const shotsWithPrevis = (scene.shots || []).filter((sh: any) => sh.previsPath);
      if (shotsWithPrevis.length === 0) continue;
      parts.push(`<div class="scene-heading">${esc(scene.title || 'Scene')}</div>`);
      parts.push(`<div class="previs-grid">`);
      for (const sh of shotsWithPrevis) {
        parts.push(`<div class="previs-card">`);
        parts.push(`<img src="${esc(imgUrl(sh.previsPath))}" alt="${esc(sh.description || '')}">`);
        parts.push(`<div class="previs-caption">${sh.shotType ? `<strong>${esc(sh.shotType)}</strong> — ` : ''}${esc((sh.description || '').substring(0, 120))}</div>`);
        parts.push(`</div>`);
      }
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  // ── Print support ──
  parts.push(`
<div class="print-bar no-print" style="position:fixed;top:16px;right:16px;z-index:9999;display:flex;gap:8px">
  <button onclick="window.print()" style="padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🖨 Print / Save as PDF</button>
</div>
<style>@media print { .no-print { display: none !important; } }</style>
<script>
  if (new URLSearchParams(window.location.search).has('print')) {
    window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 600); });
  }
</script>`);

  parts.push(`</body></html>`);
  return parts.join('\n');
}
