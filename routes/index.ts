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

function buildScreenplayMaps(project: any): ScreenplayData {
  const allCharacters = project.characters || [];
  const allLocations = project.locations || [];
  const allElements = project.elements || [];
  const allPrevis = project.previsualizations?.shots || [];
  const allAssets = project.assets || [];

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

      // ── Resolve character references ──
      const referenceImages: string[] = [];
      const refDescriptions: string[] = [];
      const refConfig = actionConfig.referenceResolution || {};
      const charConfig = refConfig.characters || {};
      let characterIds: string[] = [];

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
            sdk.log('info', 'generate-previs', `Auto-creating bindings for shot ${elementId} from pipeline rules...`);
            const autoResult = await sdk.autoRunRules();
            if (autoResult.added > 0) {
              sdk.log('info', 'generate-previs', `Auto-created ${autoResult.added} bindings`);
              bindingsDoc = await sdk.loadBindings();
            }
          }
        }

        // Extract target IDs from bindings
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
        sdk.log('info', 'generate-previs', `Bindings → ${characterIds.length} characters for ${elementId}`, { characterIds });
      }

      // From scene-grouped shot data
      if (characterIds.length === 0 && screenplay.scenes && sceneId) {
        const scene = screenplay.scenes.find((s: any) => s.id === sceneId);
        if (scene) {
          const shot = scene.shots?.find((s: any) => s.id === elementId);
          if (shot?.characterIds?.length) {
            characterIds = shot.characterIds;
            sdk.log('info', 'generate-previs', `Scene shot → ${characterIds.length} characters from scene.shots[].characterIds`);
          }
        }
      }

      // Fallback: from element's characterIds metadata
      if (characterIds.length === 0 && element.characterIds && Array.isArray(element.characterIds)) {
        characterIds = element.characterIds;
      }

      // Fallback: from previs entry
      if (characterIds.length === 0 && charConfig.fallback !== 'none') {
        characterIds = previs?.characterIds || [];
      }

      // Fallback: text-match character names
      if (characterIds.length === 0) {
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

      for (const charId of characterIds) {
        const charAsset = screenplay.characterAssets[charId];
        if (charAsset?.filePath && sdk.fileExists(charAsset.filePath)) {
          referenceImages.push(charAsset.filePath);
          const charData = screenplay.characters[charId];
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

      if (!locationId && sceneLocationId) {
        locationId = sceneLocationId;
      }

      if (!locationId && locConfig.fallback !== 'none') {
        locationId = previs?.locationId;
      }

      if (!locationId) {
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
        const locAsset = screenplay.locationAssets[locationId];
        if (locAsset?.filePath && sdk.fileExists(locAsset.filePath)) {
          referenceImages.push(locAsset.filePath);
          const locData = screenplay.locations[locationId];
          refDescriptions.push(
            `Reference image ${referenceImages.length} is the location "${locData?.name || locationId}"` +
            (locData?.description ? ` (${locData.description.substring(0, 120)})` : '')
          );
        }
      }

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

      const stylePrompt = actionConfig.prompt?.sections?.find((s: any) => s.id === 'style')?.template
        || 'Style: Cinematic previsualization frame, shot on 35mm film with subtle grain. Professional cinematography with rich color grading, deep shadows, and controlled highlights. The image should feel like a single frame from a feature film.';
      prompt += stylePrompt;

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
            existing.description = shotText;
            generationCount = existing.generations.length;
          } else {
            projData.previsualizations.shots.push({
              shotElementId: elementId,
              filePath,
              _generatedFilePath: filePath,
              _generatedAt: generation.generatedAt,
              description: shotText,
              generations: [generation],
            });
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
        await sdk.ensureProject();
        const projData = sdk.getProject();
        if (!projData) {
          sdk.sendJson(res, 404, { error: 'Project data not loaded' });
          return true;
        }

        // Load bindings for voice assignments
        const bindingsDoc = await sdk.loadBindings();
        const voiceMap: Record<string, string> = {};
        const voiceNameMap: Record<string, string> = {};
        for (const b of bindingsDoc.bindings) {
          if (b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId && b.target?.entityId) {
            voiceMap[b.source.entityId] = b.target.entityId;
            voiceNameMap[b.source.entityId] = (b.metadata?.voiceName as string) || '';
          }
        }

        // Collect dialogue elements from scenes
        const scenes = projData.scenes || [];
        const existingAudio = new Set<string>();
        const daAssets = projData.dialogueAudio?.assets || [];
        for (const a of daAssets) {
          if (a.metadata?.dialogueElementId) existingAudio.add(a.metadata.dialogueElementId);
        }

        const dialogueItems: { elementId: string; text: string; voiceId: string; characterName: string; characterId: string }[] = [];
        for (const sc of scenes) {
          if (!sc.dialogue) continue;
          for (const d of sc.dialogue) {
            if (!d.elementId || existingAudio.has(d.elementId)) continue;
            const voiceId = voiceMap[d.characterId || ''];
            if (!voiceId) continue;
            const text = (d.lines || []).join(' ').trim();
            if (!text) continue;
            dialogueItems.push({
              elementId: d.elementId,
              text,
              voiceId,
              characterName: d.characterName || '',
              characterId: d.characterId || '',
            });
          }
        }

        if (dialogueItems.length === 0) {
          sdk.sendJson(res, 200, { success: true, rendered: 0, total: 0, message: 'No unrendered dialogue with assigned voices' });
          return true;
        }

        const projFolder = await sdk.getProjectFolder();
        const audioDir = sdk.join(projFolder, 'audio');
        await sdk.mkdir(audioDir);

        let rendered = 0;
        for (const d of dialogueItems) {
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
              name: `Dialogue: ${d.characterName || d.elementId}`,
              description: d.text.substring(0, 200),
              filePath,
              metadata: {
                dialogueElementId: d.elementId,
                characterId: d.characterId,
                characterName: d.characterName,
                voiceId: d.voiceId,
                text: d.text.substring(0, 500),
                generatedAt: new Date().toISOString(),
                duration: audioDuration,
              },
            };
            if (!projData.dialogueAudio) projData.dialogueAudio = { assets: [] };
            if (!projData.dialogueAudio.assets) projData.dialogueAudio.assets = [];
            projData.dialogueAudio.assets.push(asset);
            rendered++;
          } catch { /* skip failed items */ }
        }

        sdk.markDirty(['dialogueAudio']);
        sdk.sendJson(res, 200, { success: true, rendered, total: dialogueItems.length });
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

    // ── POST /render-video ──────────────────────────────────────
    if (req.method === 'POST' && subPath === '/render-video') {
      const body = await sdk.readBody(req);
      const settings = body.settings || {};
      const clips: any[] = body.clips || [];
      const dialogAudioMap: Record<string, string> = body.dialogAudioMap || {};

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
        const ffmpegArgs: string[] = [];
        for (const vc of visualClips) {
          const clipDur = Math.min(vc.startTime + vc.duration, endTime) - Math.max(vc.startTime, startTime);
          if (clipDur <= 0) continue;
          ffmpegArgs.push('-loop', '1', '-t', String(clipDur), '-i', vc.filePath);
        }

        const numVisuals = visualClips.length;
        for (const ac of audioClips) {
          ffmpegArgs.push('-i', ac.path);
        }
        const numAudio = audioClips.length;

        const filterParts: string[] = [];
        let concatInputs = '';
        for (let i = 0; i < numVisuals; i++) {
          filterParts.push(`[${i}:v]fps=${fps},scale=${resX}:${resY}:force_original_aspect_ratio=decrease,pad=${resX}:${resY}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`);
          concatInputs += `[v${i}]`;
        }
        filterParts.push(`${concatInputs}concat=n=${numVisuals}:v=1:a=0[vout]`);

        if (numAudio > 0) {
          let amixInputs = '';
          for (let i = 0; i < numAudio; i++) {
            const audioIdx = numVisuals + i;
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
        const project = sdk.getProject();
        const pfolder = await sdk.getProjectFolder();
        if (!project || !pfolder) { sdk.sendJson(res, 400, { error: 'No project data found' }); return true; }

        const char = (project.characters || []).find((c: any) => c.id === charId);
        if (!char) { sdk.sendJson(res, 404, { error: 'Character not found' }); return true; }

        // Apply any client-sent overrides so the latest edits are used in the prompt.
        // The client sends the current character fields; merge them into the server's copy
        // so the prompt reflects what the user sees, not stale in-memory state.
        if (body.character) {
          const overrides = body.character;
          for (const key of ['name', 'displayName', 'description', 'ageRange', 'gender', 'wardrobeNotes', 'traits', 'arc', 'voiceDescription'] as const) {
            if (overrides[key] !== undefined) {
              (char as any)[key] = overrides[key];
            }
          }
          sdk.updateProject({ characters: project.characters });
          await sdk.flushProject();
        }

        const charDir = sdk.join(pfolder, 'characters');
        await sdk.mkdir(charDir);

        // Build prompt
        let prompt = `Professional headshot portrait of ${char.name || 'a person'}`;
        if (char.description) prompt += `. ${char.description}`;
        if (char.ageRange) prompt += ` Age: ${char.ageRange}.`;
        if (char.gender) prompt += ` ${char.gender}.`;
        if (char.wardrobeNotes) prompt += ` Wearing: ${char.wardrobeNotes}.`;
        prompt += ' Cinematic lighting, studio portrait, shallow depth of field, 85mm lens. Photorealistic.';

        // Determine version number
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

        // Update character with new version
        if (!char.imageVersions) char.imageVersions = [];
        char.imageVersions.push(newVersion);
        char.imagePath = imgPath;
        char.activeImageVersion = versionNum;
        sdk.updateProject({ characters: project.characters });
        await sdk.flushProject();

        sdk.sendJson(res, 200, { success: true, version: newVersion, totalVersions: char.imageVersions.length });
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
        sdk.updateProject({ characters: project.characters });
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

          for (const char of chars) {
            try {
              let prompt = `Professional headshot portrait of ${char.name || 'a person'}`;
              if (char.description) prompt += `. ${char.description}`;
              if (char.ageRange) prompt += ` Age: ${char.ageRange}.`;
              if (char.gender) prompt += ` ${char.gender}.`;
              if (char.wardrobeNotes) prompt += ` Wearing: ${char.wardrobeNotes}.`;
              prompt += ' Cinematic lighting, studio portrait, shallow depth of field, 85mm lens. Photorealistic.';

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

          for (const loc of locs) {
            try {
              let prompt = `Cinematic establishing shot of ${loc.name || 'a location'}`;
              if (loc.description) prompt += `. ${loc.description}`;
              if (loc.mood) prompt += ` Mood: ${loc.mood}.`;
              if (loc.atmosphere) prompt += ` ${loc.atmosphere}`;
              prompt += ' Wide-angle lens, dramatic lighting, film grain, professional cinematography. 35mm film look.';

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

    return false;
  };
}
