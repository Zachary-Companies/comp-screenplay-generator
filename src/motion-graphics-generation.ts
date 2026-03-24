/// <reference path="../woodbury.d.ts" />

/**
 * Motion Graphics Generation Node
 *
 * Pure data transformation: converts script elements, previs plan, characters,
 * locations, and metadata into a complete motion graphics specification
 * (Ken Burns, captions, lower thirds, title cards, transitions, effects).
 * No LLM calls.
 *
 * @input elements: object[] - Script elements (shots, dialogue, action, transition)
 * @input previsualizationPlan: object - Previs shots with camera movement and frame size
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @input metadata: object - Script metadata (title, genre, logline)
 * @input processedSections: object[] - Section hierarchy
 * @input dialogueAudio: object[] - Dialogue audio assets with duration metadata
 * @output motionGraphicsPlan: object - Complete motion graphics specification
 * @output videoSpecs: object[] - Video generation specifications per shot
 */

import {
  KEN_BURNS_MAP,
  type KenBurnsSpec,
  type CaptionSpec,
  type LowerThirdSpec,
  type TitleCardSpec,
  type TransitionSpec,
  type EffectSpec,
  type VideoGenSpec,
} from './_ffmpeg-filters';

export async function execute(
  inputs: {
    elements: any[];
    previsualizationPlan: any;
    characters: any[];
    locations: any[];
    metadata: any;
    processedSections: any[];
    dialogueAudio?: any[];
  },
  context: ScriptContext,
): Promise<{ motionGraphicsPlan: object; videoSpecs: VideoGenSpec[] }> {
  const elements = Array.isArray(inputs.elements) ? inputs.elements : [];
  const previs = inputs.previsualizationPlan ?? { shots: [] };
  const characters = Array.isArray(inputs.characters) ? inputs.characters : [];
  const locations = Array.isArray(inputs.locations) ? inputs.locations : [];
  const metadata = inputs.metadata ?? {};
  const processedSections = Array.isArray(inputs.processedSections) ? inputs.processedSections : [];

  const shots: any[] = Array.isArray(previs.shots) ? previs.shots : [];
  const dialogueAudioAssets = Array.isArray(inputs.dialogueAudio)
    ? inputs.dialogueAudio.map((a: any) => typeof a === 'string' ? JSON.parse(a) : a)
    : [];

  // Build audio duration map: elementId → duration in seconds
  // This is the source of truth for timing — audio dictates pacing
  const audioDurationMap = new Map<string, number>();
  for (const a of dialogueAudioAssets) {
    const elemId = a?.metadata?.dialogueElementId;
    const dur = a?.metadata?.duration;
    if (elemId && typeof dur === 'number' && dur > 0) {
      audioDurationMap.set(elemId, dur);
    }
  }

  // Build scene-level audio budgets: for each scene, sum dialogue audio durations
  // to determine how long the visual shots should last
  const DIALOG_GAP = 0.3;
  const sceneDurationMap = new Map<string, number>();
  // Group elements by scene (using element order and shot scene assignments)
  const shotToSceneMap = new Map<string, string>();
  for (const shot of shots) {
    if (shot.shotElementId && shot.sceneId) {
      shotToSceneMap.set(shot.shotElementId, shot.sceneId);
    }
  }

  // Calculate audio-driven duration for each scene
  const sceneAudioDurations = new Map<string, number>();
  for (const shot of shots) {
    const sceneId = shot.sceneId || 'default';
    if (!sceneAudioDurations.has(sceneId)) sceneAudioDurations.set(sceneId, 0);
  }
  for (const el of elements) {
    if (el.type === 'dialogue') {
      const dur = audioDurationMap.get(el.id);
      if (dur) {
        // Find which scene this dialogue belongs to (approximate by element order)
        // For now, accumulate globally — the render route uses actual clip durations anyway
      }
    }
  }

  context.log(`Motion graphics generation: ${elements.length} elements, ${shots.length} previs shots, ${audioDurationMap.size} audio durations`);

  // ── 1. Ken Burns ────────────────────────────────────────────────────────
  // Duration note: Ken Burns durationSeconds is a HINT. The render-video route
  // overrides it with the actual clip duration from the editor timeline,
  // which is audio-driven when dialogue audio exists. Setting it here as a
  // reasonable default for when no audio is available.
  const kenBurns: KenBurnsSpec[] = shots.map((shot: any) => {
    const movement = (shot.cameraMovement || 'STATIC').toUpperCase();
    const frameSize = (shot.frameSize || 'MEDIUM').toUpperCase();
    const base = KEN_BURNS_MAP[movement] ?? KEN_BURNS_MAP['STATIC'];

    // Frame size adjustments: CLOSE-UP reduces zoom range by 50%, WIDE increases by 25%
    let zoomFactor = 1;
    if (frameSize === 'CLOSE-UP' || frameSize === 'EXTREME CLOSE-UP') {
      zoomFactor = 0.5;
    } else if (frameSize === 'WIDE' || frameSize === 'EXTREME WIDE') {
      zoomFactor = 1.25;
    }

    // Adjust zoom range around 1.0 base
    const zoomStart = 1 + (base.zoomStart - 1) * zoomFactor;
    const zoomEnd = 1 + (base.zoomEnd - 1) * zoomFactor;
    const panAmount = base.panAmount * zoomFactor;

    // Use previs duration as hint — render route will override with actual clip duration
    const hintDuration = shot.durationSeconds ?? 3;

    return {
      shotElementId: shot.id || shot.shotElementId || '',
      cameraMovement: movement,
      frameSize: frameSize,
      durationSeconds: hintDuration,
      zoomStart: Math.round(zoomStart * 1000) / 1000,
      zoomEnd: Math.round(zoomEnd * 1000) / 1000,
      panDirection: base.panDirection as KenBurnsSpec['panDirection'],
      panAmount: Math.round(panAmount * 1000) / 1000,
      easing: base.easing as KenBurnsSpec['easing'],
    };
  });

  // ── 2. Captions ─────────────────────────────────────────────────────────
  const dialogueElements = elements.filter((el: any) => el.type === 'dialogue');
  const captions: CaptionSpec[] = dialogueElements.map((el: any) => {
    const lineText = Array.isArray(el.lines) ? el.lines.join(' ') : (el.content || '');
    const rawWords = lineText.split(/\s+/).filter((w: string) => w.length > 0);
    const totalLength = rawWords.reduce((sum: number, w: string) => sum + w.length, 0);

    let cursor = 0;
    const words = rawWords.map((w: string) => {
      const startPct = totalLength > 0 ? cursor / totalLength : 0;
      cursor += w.length;
      const endPct = totalLength > 0 ? cursor / totalLength : 1;
      return {
        word: w,
        startPct: Math.round(startPct * 10000) / 10000,
        endPct: Math.round(endPct * 10000) / 10000,
      };
    });

    const title = (metadata.title || '').toLowerCase();
    const genre = (metadata.genre || '').toLowerCase();
    const projectType = (metadata.projectType || '').toLowerCase();
    const isShorts = projectType.includes('short') || genre.includes('short') || title.includes('short');
    const isFilm = projectType.includes('film') || genre.includes('film');

    let style: 'shorts' | 'video' | 'film';
    let fontSize: number;
    let position: 'center' | 'bottom-third';

    if (isShorts) {
      style = 'shorts';
      fontSize = 48;
      position = 'center';
    } else if (isFilm) {
      style = 'film';
      fontSize = 24;
      position = 'bottom-third';
    } else {
      style = 'video';
      fontSize = 28;
      position = 'bottom-third';
    }

    // Look up character name
    const char = characters.find((c: any) => c.id === el.characterId);
    const characterName = char?.name || char?.displayName || el.characterId || '';

    return {
      elementId: el.id || '',
      characterName,
      text: lineText,
      words,
      style,
      fontSize,
      position,
    };
  });

  // ── 3. Lower thirds ────────────────────────────────────────────────────
  const lowerThirds: LowerThirdSpec[] = [];
  const seenCharacterIds = new Set<string>();
  const seenLocationIds = new Set<string>();

  for (const el of elements) {
    if (el.type === 'dialogue' && el.characterId && !seenCharacterIds.has(el.characterId)) {
      seenCharacterIds.add(el.characterId);
      const char = characters.find((c: any) => c.id === el.characterId);
      lowerThirds.push({
        id: `lt-char-${el.characterId}`,
        type: 'character',
        primaryText: char?.name || char?.displayName || el.characterId,
        triggerElementId: el.id || '',
        durationSeconds: 3.5,
        animation: 'slide-in-left',
      });
    }

    if (el.type === 'scene-heading') {
      const locId = el.locationId || el.location || null;
      if (locId && !seenLocationIds.has(locId)) {
        seenLocationIds.add(locId);
        const loc = locations.find((l: any) => l.id === locId);
        lowerThirds.push({
          id: `lt-loc-${locId}`,
          type: 'location',
          primaryText: loc?.name || locId,
          triggerElementId: el.id || '',
          durationSeconds: 3.5,
          animation: 'fade-in',
        });
      }
    }
  }

  // ── 4. Title cards ──────────────────────────────────────────────────────
  const titleCards: TitleCardSpec[] = [];

  // Main title
  if (metadata.title) {
    const lines = [metadata.title];
    if (metadata.logline) lines.push(metadata.logline);
    titleCards.push({
      id: 'title-main',
      type: 'main-title',
      lines,
      durationSeconds: 4,
      background: 'black',
    });
  }

  // Scene transitions from elements
  for (const el of elements) {
    if (el.type === 'scene-heading') {
      titleCards.push({
        id: `title-scene-${el.id || titleCards.length}`,
        type: 'scene-transition',
        lines: [el.content || el.heading || ''],
        durationSeconds: 2,
        background: 'dark-overlay',
      });
    }
  }

  // Chapter cards from act sections
  const actSections = processedSections.filter((s: any) => s.type === 'act');
  for (const act of actSections) {
    titleCards.push({
      id: `title-act-${act.id || titleCards.length}`,
      type: 'chapter',
      lines: [act.title || act.name || 'Act'],
      durationSeconds: 3,
      background: 'black',
    });
  }

  // ── 5. Transitions ─────────────────────────────────────────────────────
  const transitionElements = elements.filter((el: any) => el.type === 'transition');
  const transitions: TransitionSpec[] = transitionElements.map((el: any, idx: number) => {
    const raw = (el.transitionType || el.content || '').toUpperCase();
    let type: TransitionSpec['type'];
    let xfadeType: string;
    let durationSeconds: number;

    if (raw.includes('DISSOLVE')) {
      type = 'dissolve';
      xfadeType = 'fade';
      durationSeconds = 1;
    } else if (raw.includes('FADE')) {
      type = 'fade';
      xfadeType = 'fade';
      durationSeconds = 2;
    } else if (raw.includes('WIPE')) {
      type = 'wipe';
      xfadeType = 'wipeleft';
      durationSeconds = 1;
    } else {
      // CUT or default
      type = 'cut';
      xfadeType = '';
      durationSeconds = 0.5;
    }

    return {
      fromElementId: el.id || `trans-from-${idx}`,
      toElementId: el.toElementId || '',
      type,
      xfadeType,
      durationSeconds,
    };
  });

  // ── 6. Effects ──────────────────────────────────────────────────────────
  const effects: EffectSpec[] = [];
  const genre = (metadata.genre || '').toLowerCase();

  if (genre.includes('horror')) {
    effects.push({ type: 'grain', intensity: 0.5, scope: 'global' });
    effects.push({ type: 'vignette', intensity: 0.7, scope: 'global' });
  } else if (genre.includes('drama') || genre.includes('thriller')) {
    effects.push({ type: 'grain', intensity: 0.3, scope: 'global' });
    effects.push({ type: 'vignette', intensity: 0.5, scope: 'global' });
  } else if (genre.includes('comedy') || genre.includes('romance')) {
    effects.push({ type: 'vignette', intensity: 0.3, scope: 'global' });
  } else if (genre.includes('action')) {
    effects.push({ type: 'grain', intensity: 0.2, scope: 'global' });
  } else {
    effects.push({ type: 'vignette', intensity: 0.3, scope: 'global' });
  }

  // ── 7. Video Generation Specs ─────────────────────────────────────────
  const videoSpecs: VideoGenSpec[] = shots.map((shot: any) => ({
    shotElementId: shot.id || shot.shotElementId || '',
    approach: 'ken-burns' as const,  // default; changed by UI
    cameraMovement: (shot.cameraMovement || 'STATIC').toUpperCase(),
    frameSize: (shot.frameSize || 'MEDIUM').toUpperCase(),
    durationSeconds: shot.durationSeconds ?? 6,
    hasExistingVideo: false,
  }));

  context.log(
    `Motion graphics plan: ${kenBurns.length} ken burns, ${captions.length} captions, ` +
    `${lowerThirds.length} lower thirds, ${titleCards.length} title cards, ` +
    `${transitions.length} transitions, ${effects.length} effects, ${videoSpecs.length} video specs`,
  );

  return {
    motionGraphicsPlan: {
      version: '1.0',
      kenBurns,
      captions,
      lowerThirds,
      titleCards,
      transitions,
      effects,
    },
    videoSpecs,
  };
}
