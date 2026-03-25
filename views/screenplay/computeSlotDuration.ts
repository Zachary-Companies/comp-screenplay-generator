/**
 * computeSlotDuration — Pure function to calculate a shot's slot duration
 * from the dialogue audio durations of its child elements.
 *
 * A shot's slot = sum of (dialogueDuration + DIALOG_GAP) for each dialogue
 * element between this shot and the next, with a minimum of SHOT_MIN_DUR.
 */

const DIALOG_GAP = 0.15; // seconds gap between dialogue items (matches compact-timing)
const SHOT_MIN_DUR = 0.5; // minimum shot duration

export interface DialogueAudioAsset {
  type?: string;
  filePath?: string;
  metadata?: {
    dialogueElementId?: string;
    duration?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ContentElement {
  id: string;
  type: string;
  [key: string]: any;
}

/**
 * Build a map of elementId → audio duration from project.dialogueAudio.assets
 */
export function buildDialogueDurationMap(assets: DialogueAudioAsset[] | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  if (!Array.isArray(assets)) return map;
  for (const a of assets) {
    const elemId = a?.metadata?.dialogueElementId;
    const dur = a?.metadata?.duration;
    if (elemId && typeof dur === 'number' && dur > 0) {
      map[elemId] = dur;
    }
  }
  return map;
}

/**
 * Calculate the slot duration for a shot based on its following content elements.
 * Returns 0 if no dialogue audio is available (meaning duration is unknown).
 */
export function computeSlotDuration(
  contentElems: ContentElement[],
  dialogDurationMap: Record<string, number>,
): number {
  let totalDur = 0;
  let hasAnyAudio = false;

  for (const elem of contentElems) {
    if (elem.type === 'dialogue') {
      const dur = dialogDurationMap[elem.id];
      if (dur != null && dur > 0) {
        totalDur += dur + DIALOG_GAP;
        hasAnyAudio = true;
      }
    }
  }

  if (!hasAnyAudio) return 0; // no audio data → can't calculate
  return Math.max(totalDur, SHOT_MIN_DUR);
}

/**
 * Compute the gap info for a shot's video chain vs its slot duration.
 */
export function computeVideoGapInfo(
  videoGenerations: Array<{ id: string; duration?: number; actualDuration?: number; [key: string]: any }> | undefined,
  videoChain: string[] | undefined,
  selectedVideoGenerationId: string | undefined,
  slotDuration: number,
): {
  totalVideoDur: number;
  slotDuration: number;
  gap: number;
  fillPercent: number;
  isFilled: boolean;
  chainLength: number;
} {
  const vGens = videoGenerations || [];
  const chainIds = videoChain || [];

  // Resolve chain to actual generations
  let chainGens: Array<{ duration?: number; actualDuration?: number }>;
  if (chainIds.length > 0) {
    const genMap = new Map(vGens.map(g => [g.id, g]));
    chainGens = chainIds.map(id => genMap.get(id)).filter(Boolean) as any[];
  } else {
    // Single video: selected or latest
    const sel = selectedVideoGenerationId
      ? vGens.find(g => g.id === selectedVideoGenerationId)
      : vGens[vGens.length - 1];
    chainGens = sel ? [sel] : [];
  }

  const totalVideoDur = chainGens.reduce(
    (sum, g) => sum + (g.actualDuration || g.duration || 0), 0
  );

  const gap = slotDuration > 0 ? Math.max(0, slotDuration - totalVideoDur) : 0;
  const fillPercent = slotDuration > 0 ? Math.min(100, (totalVideoDur / slotDuration) * 100) : 100;
  const isFilled = slotDuration > 0 ? totalVideoDur >= slotDuration - 0.01 : true;

  return {
    totalVideoDur,
    slotDuration,
    gap,
    fillPercent,
    isFilled,
    chainLength: chainGens.length,
  };
}
