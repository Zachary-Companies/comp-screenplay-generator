/**
 * extractData — pure function that extracts editor clips, scenes, characters, and assets
 * from ProjectData. No React dependency — can be tested directly.
 *
 * All data is sourced from project.json (ProjectData) — NOT from nodeData.
 * nodeData is only used for persisted user clips (_editor node).
 */
import type { ProjectData } from './sdk';
import {
  type Clip, type EditorScene, type EditorCharacter, type EditorAsset, type Track,
  DEFAULT_TRACKS, charColor, stableId,
} from './editorStore';

// SceneShot type inlined since it's used extensively and comes from project-types
interface SceneShot {
  id: string;
  shotType?: string;
  description?: string;
  previsPath?: string;
  characterIds?: string[];
  duration?: number;
  aspectRatio?: string;
  selectedGenerationId?: string;
  generations?: Array<{ id: string; filePath: string; [key: string]: any }>;
  [key: string]: any;
}

export interface ExtractionResult {
  clips: Clip[];
  scenes: EditorScene[];
  characters: EditorCharacter[];
  assets: EditorAsset[];
  tracks: Track[];
  duration: number;
  previsMap: Record<string, string>;
  videoMap: Record<string, string>;
  dialogAudioMap: Record<string, string>;
  dialogDurationMap: Record<string, number>;
  userClips: Clip[];
}

export function extractData(
  project: ProjectData | null,
  appState: any | null,
  fillGaps: boolean,
  extraDurations?: Record<string, number>,
  compactTimeline?: boolean,
): ExtractionResult {
    if (!project) {
      return {
        clips: [], scenes: [], characters: [], assets: [],
        tracks: DEFAULT_TRACKS.map(t => ({ ...t })),
        duration: 120, previsMap: {}, videoMap: {}, dialogAudioMap: {}, dialogDurationMap: {}, userClips: [],
      };
    }

    const scenes: EditorScene[] = [];
    const characters: EditorCharacter[] = [];
    const assets: EditorAsset[] = [];
    const clips: Clip[] = [];
    const previsShots: any[] = [];
    const sceneGroupedShots: SceneShot[] = [];
    let timeOffset = 0;

    // ── Pre-build audio duration map from dialogue-audio assets ──
    const dialogAudioMap: Record<string, string> = {};
    const dialogDurationMap: Record<string, number> = {};
    const rawAssets = (project as any).assets;
    const assetArray = Array.isArray(rawAssets) ? rawAssets : (rawAssets?.assets || []);
    const allAssetSources = [
      ...assetArray,
      ...((project as any).dialogueAudio?.assets || []),
    ];
    for (const a of allAssetSources) {
      if (!a) continue;
      if (a.type === 'dialogue-audio' && a.filePath && a.metadata?.dialogueElementId) {
        dialogAudioMap[a.metadata.dialogueElementId] = a.filePath;
        if (a.metadata.duration && typeof a.metadata.duration === 'number' && a.metadata.duration > 0) {
          dialogDurationMap[a.metadata.dialogueElementId] = a.metadata.duration;
        }
      }
    }

    if (extraDurations) {
      for (const [elemId, dur] of Object.entries(extraDurations)) {
        if (dur > 0) {
          dialogDurationMap[elemId] = dur;
        }
      }
    }

    // ── Characters ──────────────────────────────────────────
    if (project.characters) {
      for (const c of project.characters) {
        if (c && c.name) characters.push(c as EditorCharacter);
      }
    }

    // ── Sections → scenes ───────────────────────────────────
    if (project.sections) {
      project.sections.forEach((sec, si) => {
        const secName = (sec as any).heading || sec.title;
        if (secName) {
          scenes.push({
            id: sec.id || ('scene-' + si),
            name: secName,
            duration: 0,
            startTime: 0,
            children: (sec.children || []).map((c: any) => c.id || c),
            color: ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981'][si % 5],
          });
        }
      });
    }

    // ── Scene-based time budgeting ─────────────────────────
    const DEFAULT_SCENE_BUDGET = 8;
    const DIALOG_GAP = 0.3;
    const SCENE_GAP = 0.5;

    interface SceneRange { sceneId: string; start: number; end: number; }
    const sceneRanges: SceneRange[] = [];

    if (project.scenes && project.scenes.length > 0) {
      for (const sc of project.scenes) {
        if (sc && sc.elementRange) {
          sceneRanges.push({ sceneId: sc.id, start: sc.elementRange[0], end: sc.elementRange[1] });
        }
      }
    }

    if (sceneRanges.length === 0 && project.elements) {
      sceneRanges.push({ sceneId: 'all', start: 0, end: project.elements.length });
    }

    // Process elements scene by scene
    if (project.elements) {
      for (const range of sceneRanges) {
        const sceneStart = timeOffset;

        interface ElemInfo { idx: number; weight: number; audioDur: number | null; }
        const elems: ElemInfo[] = [];
        let totalWeight = 0;
        let totalAudioDur = 0;
        let audioCount = 0;

        for (let ei = range.start; ei < Math.min(range.end, project.elements.length); ei++) {
          const elem = project.elements[ei];
          if (!elem) continue;
          let w = 0;
          if (elem.type === 'dialogue') {
            w = Math.max(1, (elem.lines || []).join(' ').length / 15);
            const audioDur = dialogDurationMap[elem.id] || null;
            if (audioDur) { totalAudioDur += audioDur + DIALOG_GAP; audioCount++; }
            elems.push({ idx: ei, weight: w, audioDur });
            totalWeight += w;
          } else if (elem.type === 'action') {
            // Actions become subtitles — they don't affect timeline duration
            elems.push({ idx: ei, weight: 0, audioDur: null });
          } else if (elem.type === 'shot') {
            w = Math.max(1, ((elem.content || elem.shotText || '').length / 20));
            elems.push({ idx: ei, weight: w, audioDur: null });
            totalWeight += w;
          } else if (elem.type === 'scene-heading') {
            const matchScene = scenes.find(s =>
              s.children && s.children.indexOf(elem.id) !== -1
            );
            if (matchScene) matchScene.startTime = sceneStart;
            continue;
          } else {
            continue;
          }
        }

        if (elems.length === 0) {
          timeOffset += SCENE_GAP;
          continue;
        }

        const hasAudio = audioCount > 0;
        let budget: number;

        // Compact timeline: shots/non-dialogue get minimal time (0.5s each)
        // so the video is paced tightly by dialogue audio
        const COMPACT_SHOT_DUR = 0.5;

        if (hasAudio) {
          // Shot elements get minimal time — visuals change with dialogue, not independently
          const shotCount = elems.filter(e => e.audioDur === null && e.weight > 0 && project.elements![e.idx].type === 'shot').length;
          const unrenderedDialogCount = elems.filter(e => e.audioDur === null && project.elements![e.idx].type === 'dialogue').length;
          if (compactTimeline) {
            // Compact: shots get 0.5s, unrendered dialogue gets 1s estimate
            budget = totalAudioDur + shotCount * COMPACT_SHOT_DUR + unrenderedDialogCount * 1.0;
          } else {
            // Normal: shots get 1s each (not proportional weight), unrendered dialogue gets 2s estimate
            budget = totalAudioDur + shotCount * 1.0 + unrenderedDialogCount * 2.0;
          }
        } else {
          budget = compactTimeline ? 4 : DEFAULT_SCENE_BUDGET;
        }

        let localOffset = 0;

        for (const { idx, weight, audioDur } of elems) {
          const elem = project.elements[idx];

          let clipDur: number;
          if (audioDur !== null) {
            clipDur = audioDur;
          } else if (hasAudio) {
            // Non-audio elements: fixed duration based on type, not proportional weight
            const elemType = project.elements![idx].type;
            if (compactTimeline) {
              clipDur = elemType === 'shot' ? COMPACT_SHOT_DUR : (elemType === 'dialogue' ? 1.0 : 0);
            } else {
              clipDur = elemType === 'shot' ? 1.0 : (elemType === 'dialogue' ? 2.0 : 0);
            }
          } else {
            clipDur = totalWeight > 0 ? (weight / totalWeight) * budget : budget / elems.length;
          }

          if (elem.type === 'dialogue') {
            clips.push({
              id: stableId('dialog', elem.id),
              elementId: elem.id,
              trackId: 'dialog',
              type: 'dialog',
              name: (elem.characterName || 'UNKNOWN') + ': ' + ((elem.lines || [])[0] || '').slice(0, 40),
              startTime: sceneStart + localOffset,
              duration: clipDur,
              characterName: elem.characterName,
              characterId: elem.characterId,
              lines: elem.lines || [],
              color: charColor(elem.characterName || ''),
            });
            localOffset += clipDur + (audioDur !== null ? DIALOG_GAP : 0);
          } else if (elem.type === 'action') {
            clips.push({
              id: stableId('caption', elem.id),
              elementId: elem.id,
              trackId: 'subtitles',
              type: 'caption',
              name: (elem.content || '').slice(0, 50),
              startTime: sceneStart + localOffset,
              duration: clipDur,
              content: elem.content,
            });
            // Subtitles don't advance the timeline — they overlay other content
          } else if (elem.type === 'shot') {
            const hasVideo = !!videoMap[elem.id];
            clips.push({
              id: stableId('shot', elem.id),
              elementId: elem.id,
              trackId: 'visuals',
              type: hasVideo ? 'video' : 'image',
              name: (elem.shotText || elem.content || '').slice(0, 50),
              startTime: sceneStart + localOffset,
              duration: clipDur,
              content: elem.shotText || elem.content,
              filePath: hasVideo ? videoMap[elem.id] : undefined,
            });
            localOffset += clipDur;
          }
        }

        timeOffset += Math.max(localOffset, budget) + SCENE_GAP;
      }

      // Handle orphan elements
      const coveredIndices = new Set<number>();
      for (const r of sceneRanges) {
        for (let i = r.start; i < r.end; i++) coveredIndices.add(i);
      }
      for (let ei = 0; ei < project.elements.length; ei++) {
        if (coveredIndices.has(ei)) continue;
        const elem = project.elements[ei];
        if (!elem) continue;
        if (elem.type === 'dialogue') {
          const clipDur = 1;
          clips.push({
            id: stableId('dialog', elem.id),
            elementId: elem.id,
            trackId: 'dialog',
            type: 'dialog',
            name: (elem.characterName || 'UNKNOWN') + ': ' + ((elem.lines || [])[0] || '').slice(0, 40),
            startTime: timeOffset,
            duration: clipDur,
            characterName: elem.characterName,
            characterId: elem.characterId,
            lines: elem.lines || [],
            color: charColor(elem.characterName || ''),
          });
          timeOffset += clipDur;
        } else if (elem.type === 'action') {
          const clipDur = 0.5;
          clips.push({
            id: stableId('caption', elem.id),
            elementId: elem.id,
            trackId: 'subtitles',
            type: 'caption',
            name: (elem.content || '').slice(0, 50),
            startTime: timeOffset,
            duration: clipDur,
            content: elem.content,
          });
          // Subtitles don't advance the timeline
        }
      }
    }

    // ── Scene-grouped shots ───────────────────────────────
    if (project.scenes) {
      for (const scene of project.scenes) {
        if (!scene || !scene.shots) continue;
        for (const shot of scene.shots) {
          if (shot && shot.id) sceneGroupedShots.push(shot);
        }
      }
    }

    if ((project as any).previsualizations?.shots) {
      for (const s of (project as any).previsualizations.shots) {
        previsShots.push(s);
      }
    }

    const projectAssets = Array.isArray((project as any).assets)
      ? (project as any).assets
      : ((project as any).assets?.assets || []);
    for (const a of projectAssets) {
      if (a && (a.name || a.filePath)) assets.push(a);
    }

    const daAssets = (project as any).dialogueAudio?.assets;
    if (Array.isArray(daAssets)) {
      for (const a of daAssets) {
        if (a && a.filePath) assets.push(a);
      }
    }

    if (scenes.length === 0 && project.scenes) {
      project.scenes.forEach((sc, si) => {
        if (!sc || !sc.title) return;
        scenes.push({
          id: sc.id || ('scene-' + si),
          name: sc.title,
          duration: 0,
          startTime: 0,
          children: [],
          color: ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981'][si % 5],
        });
      });
    }

    for (const s of scenes) {
      const sceneClips = clips.filter(c => c.startTime >= s.startTime);
      if (sceneClips.length > 0) {
        const sceneEnd = Math.max(...sceneClips.filter(c => c.startTime < s.startTime + DEFAULT_SCENE_BUDGET * 3).map(c => c.startTime + c.duration));
        s.duration = Math.max(sceneEnd - s.startTime, DEFAULT_SCENE_BUDGET);
      } else {
        s.duration = DEFAULT_SCENE_BUDGET;
      }
    }

    const charMap: Record<string, EditorCharacter> = {};
    for (const c of characters) { if (!charMap[c.id]) charMap[c.id] = c; }
    const dedupedCharacters = Object.values(charMap);

    const previsMap: Record<string, string> = {};
    for (const a of assets) {
      if (a.type === 'previs-frame' && a.filePath && a.metadata?.shotElementId) {
        const eid = a.metadata.shotElementId;
        if (!previsMap[eid] || (previsMap[eid].startsWith('/tmp/') && !a.filePath.startsWith('/tmp/'))) {
          previsMap[eid] = a.filePath;
        }
      }
    }
    for (const pv of previsShots) {
      if (!pv.shotElementId) continue;
      if (pv._generatedFilePath) previsMap[pv.shotElementId] = pv._generatedFilePath;
    }

    for (const shot of sceneGroupedShots) {
      if (shot.previsPath) previsMap[shot.id] = shot.previsPath;
      if (shot.generations && shot.generations.length > 0) {
        const selected = shot.selectedGenerationId
          ? shot.generations.find(g => g.id === shot.selectedGenerationId)
          : shot.generations[shot.generations.length - 1];
        if (selected?.filePath) previsMap[shot.id] = selected.filePath;
      }
    }

    // Build videoMap: element ID → video file path (prefer selected video generation)
    const videoMap: Record<string, string> = {};
    for (const pv of previsShots) {
      if (!pv.shotElementId) continue;
      if (pv.videoGenerations && pv.videoGenerations.length > 0) {
        const selVideo = pv.selectedVideoGenerationId
          ? pv.videoGenerations.find((g: any) => g.id === pv.selectedVideoGenerationId)
          : pv.videoGenerations[pv.videoGenerations.length - 1];
        if (selVideo?.filePath) videoMap[pv.shotElementId] = selVideo.filePath;
      } else if (pv.videoPath) {
        videoMap[pv.shotElementId] = pv.videoPath;
      }
    }
    for (const shot of sceneGroupedShots) {
      if ((shot as any).videoPath && !videoMap[shot.id]) {
        videoMap[shot.id] = (shot as any).videoPath;
      }
    }

    const sceneStartTimeMap: Record<string, number> = {};
    if (project.scenes) {
      for (const sc of project.scenes) {
        if (!sc) continue;
        if (sc.elementRange) {
          const elements = project.elements || [];
          let earliestTime = Infinity;
          for (let ei = sc.elementRange[0]; ei < Math.min(sc.elementRange[1], elements.length); ei++) {
            const elem = elements[ei];
            if (!elem) continue;
            const matchClip = clips.find(c => c.elementId === elem.id);
            if (matchClip && matchClip.startTime < earliestTime) earliestTime = matchClip.startTime;
          }
          if (earliestTime < Infinity) sceneStartTimeMap[sc.id] = earliestTime;
        }
        if (sceneStartTimeMap[sc.id] === undefined) {
          const edScene = scenes.find(s => s.name === sc.title || s.id === sc.id);
          if (edScene) sceneStartTimeMap[sc.id] = edScene.startTime;
        }
      }
    }

    if (project.scenes) {
      for (const sc of project.scenes) {
        if (!sc || !sc.shots || sc.shots.length === 0) continue;
        const shotsWithPrevis = sc.shots.filter(shot => shot && shot.id && previsMap[shot.id]);
        if (shotsWithPrevis.length === 0) continue;

        const sceneStart = sceneStartTimeMap[sc.id] ?? 0;
        let sceneDur = DEFAULT_SCENE_BUDGET;
        if (sc.elementRange) {
          const elements = project.elements || [];
          let latestEnd = sceneStart;
          for (let ei = sc.elementRange[0]; ei < Math.min(sc.elementRange[1], elements.length); ei++) {
            const elem = elements[ei];
            if (!elem) continue;
            const matchClip = clips.find(c => c.elementId === elem.id);
            if (matchClip) {
              const clipEnd = matchClip.startTime + matchClip.duration;
              if (clipEnd > latestEnd) latestEnd = clipEnd;
            }
          }
          sceneDur = Math.max(latestEnd - sceneStart, DEFAULT_SCENE_BUDGET);
        }
        const userSetTotal = shotsWithPrevis.reduce((sum, s) => sum + (s.duration || 0), 0);
        const autoCount = shotsWithPrevis.filter(s => !s.duration).length;
        const remainingTime = Math.max(sceneDur - userSetTotal, autoCount * 1);
        const autoShotDur = autoCount > 0 ? remainingTime / autoCount : sceneDur / shotsWithPrevis.length;

        let shotOffset = 0;
        for (const shot of shotsWithPrevis) {
          const dur = shot.duration || autoShotDur;
          const hasVisualClip = clips.find(c => c.elementId === shot.id && c.trackId === 'visuals');
          if (!hasVisualClip) {
            const shotHasVideo = !!videoMap[shot.id];
            clips.push({
              id: stableId('shot', shot.id),
              elementId: shot.id,
              trackId: 'visuals',
              type: shotHasVideo ? 'video' : 'image',
              name: (shot.shotType || '') + ' — ' + (shot.description || '').slice(0, 40),
              startTime: sceneStart + shotOffset,
              duration: dur,
              content: shot.description,
              filePath: shotHasVideo ? videoMap[shot.id] : previsMap[shot.id],
            });
          }
          shotOffset += dur;
        }
      }
    }

    const visualClips = clips.filter(c => c.trackId === 'visuals');
    visualClips.sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < visualClips.length - 1; i++) {
      const clipEnd = visualClips[i].startTime + visualClips[i].duration;
      if (clipEnd > visualClips[i + 1].startTime) {
        visualClips[i].duration = visualClips[i + 1].startTime - visualClips[i].startTime;
      }
    }

    if (fillGaps) {
      const maxStretch = 60;
      for (let i = 0; i < visualClips.length - 1; i++) {
        const gap = visualClips[i + 1].startTime - (visualClips[i].startTime + visualClips[i].duration);
        if (gap > 0) {
          const stretch = Math.min(gap, maxStretch);
          visualClips[i].duration += stretch;
        }
      }
    }

    let loadedUserClips: Clip[] = [];
    // Load from project metadata (persisted to project.json) — primary source
    const metaClips = (project as any).metadata?.editorUserClips;
    if (Array.isArray(metaClips) && metaClips.length > 0) {
      loadedUserClips = metaClips;
    }
    // Fallback: load from legacy nodeData._editor
    if (loadedUserClips.length === 0 && appState?.nodeData?.['_editor']) {
      const edOut = appState.nodeData['_editor'].outputs || appState.nodeData['_editor'];
      if (edOut._editorUserClips && Array.isArray(edOut._editorUserClips)) {
        loadedUserClips = edOut._editorUserClips;
      }
    }

    for (const uc of loadedUserClips) {
      if (!clips.find(c => c.id === uc.id)) {
        clips.push(uc);
      }
    }

    const tracks = DEFAULT_TRACKS.map(t => ({ ...t }));
    const duration = Math.max(60, timeOffset + 10);

    return {
      clips,
      scenes,
      characters: dedupedCharacters,
      assets,
      tracks,
      duration,
      previsMap,
      videoMap,
      dialogAudioMap,
      dialogDurationMap,
      userClips: loadedUserClips,
    };
}
