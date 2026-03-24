/// <reference path="../woodbury.d.ts" />

/**
 * FFmpeg Filter Builder Utilities
 *
 * Pure functions that convert motion graphic specs into FFmpeg filter chain strings.
 * Shared utility (prefixed with _) — not a pipeline node.
 *
 * NOTE: For zoompan (Ken Burns) filters, the input image should be at least 2x
 * the target output resolution to maintain quality during zoom/pan operations.
 * For example, targeting 1920x1080 output requires a 3840x2160 source image.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KenBurnsSpec {
  shotElementId: string;
  cameraMovement: string;
  frameSize: string;
  durationSeconds: number;
  zoomStart: number;
  zoomEnd: number;
  panDirection: 'none' | 'left' | 'right' | 'up' | 'down';
  panAmount: number; // 0.0 to 1.0
  easing: 'linear' | 'ease-in' | 'ease-out';
}

export interface CaptionSpec {
  elementId: string;
  characterName: string;
  text: string;
  words: { word: string; startPct: number; endPct: number }[];
  style: 'shorts' | 'video' | 'film';
  position: 'center' | 'bottom-third';
  fontSize: number;
}

export interface LowerThirdSpec {
  id: string;
  type: 'character' | 'location';
  primaryText: string;
  secondaryText?: string;
  triggerElementId: string;
  durationSeconds: number;
  animation: 'slide-in-left' | 'fade-in';
}

export interface TitleCardSpec {
  id: string;
  type: 'main-title' | 'scene-transition' | 'chapter';
  lines: string[];
  durationSeconds: number;
  background: 'black' | 'dark-overlay';
}

export interface TransitionSpec {
  fromElementId: string;
  toElementId: string;
  type: 'cut' | 'dissolve' | 'fade' | 'wipe';
  durationSeconds: number;
  xfadeType: string;
}

export interface EffectSpec {
  type: 'grain' | 'vignette' | 'letterbox';
  intensity: number; // 0.0 to 1.0
  scope: 'global' | 'scene';
  sceneId?: string;
}

export interface VideoGenSpec {
  shotElementId: string;
  approach: 'ken-burns' | 'ai-video' | 'hybrid';
  cameraMovement: string;
  frameSize: string;
  durationSeconds: number;
  hasExistingVideo: boolean;
}

// ---------------------------------------------------------------------------
// Ken Burns camera-movement mapping
// ---------------------------------------------------------------------------

export const KEN_BURNS_MAP: Record<
  string,
  {
    zoomStart: number;
    zoomEnd: number;
    panDirection: string;
    panAmount: number;
    easing: string;
  }
> = {
  STATIC: { zoomStart: 1.0, zoomEnd: 1.05, panDirection: 'none', panAmount: 0, easing: 'linear' },
  'PUSH IN': { zoomStart: 1.0, zoomEnd: 1.2, panDirection: 'none', panAmount: 0, easing: 'ease-in' },
  'SLOW PUSH IN': { zoomStart: 1.0, zoomEnd: 1.1, panDirection: 'none', panAmount: 0, easing: 'linear' },
  'PULL BACK': { zoomStart: 1.2, zoomEnd: 1.0, panDirection: 'none', panAmount: 0, easing: 'ease-out' },
  PAN: { zoomStart: 1.1, zoomEnd: 1.1, panDirection: 'right', panAmount: 0.3, easing: 'linear' },
  TILT: { zoomStart: 1.05, zoomEnd: 1.05, panDirection: 'down', panAmount: 0.15, easing: 'linear' },
  DOLLY: { zoomStart: 1.05, zoomEnd: 1.05, panDirection: 'right', panAmount: 0.4, easing: 'linear' },
  TRACKING: { zoomStart: 1.05, zoomEnd: 1.05, panDirection: 'right', panAmount: 0.4, easing: 'linear' },
  CRANE: { zoomStart: 1.0, zoomEnd: 1.1, panDirection: 'up', panAmount: 0.2, easing: 'ease-out' },
  HANDHELD: { zoomStart: 1.0, zoomEnd: 1.03, panDirection: 'none', panAmount: 0, easing: 'linear' },
  STEADICAM: { zoomStart: 1.0, zoomEnd: 1.08, panDirection: 'right', panAmount: 0.1, easing: 'linear' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape text for FFmpeg drawtext filter (colons, backslashes, single-quotes). */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "'\\\\\\''");
}

// ---------------------------------------------------------------------------
// 1. Ken Burns (zoompan)
// ---------------------------------------------------------------------------

export function buildKenBurnsFilter(
  spec: KenBurnsSpec,
  fps: number,
  resX: number,
  resY: number,
): string {
  const totalFrames = Math.round(spec.durationSeconds * fps);
  const zDiff = spec.zoomEnd - spec.zoomStart;

  // Build zoom expression
  let zExpr: string;
  const progress = `(on/${totalFrames})`;
  if (spec.easing === 'ease-in') {
    // quadratic ease-in: starts slow, accelerates
    zExpr = `${spec.zoomStart}+${zDiff}*${progress}*${progress}`;
  } else if (spec.easing === 'ease-out') {
    // quadratic ease-out: starts fast, decelerates
    zExpr = `${spec.zoomStart}+${zDiff}*(2*${progress}-${progress}*${progress})`;
  } else {
    // linear
    zExpr = `${spec.zoomStart}+${zDiff}*${progress}`;
  }

  // Build pan expressions — default is centered
  const centerX = `(iw-iw/zoom)/2`;
  const centerY = `(ih-ih/zoom)/2`;

  let xExpr: string;
  let yExpr: string;

  if (spec.panDirection === 'none' || spec.panAmount === 0) {
    xExpr = centerX;
    yExpr = centerY;
  } else {
    const travel = spec.panAmount;
    switch (spec.panDirection) {
      case 'left':
        xExpr = `(iw-iw/zoom)/2+${travel}*(iw-iw/zoom)/2*(1-2*${progress})`;
        yExpr = centerY;
        break;
      case 'right':
        xExpr = `(iw-iw/zoom)/2-${travel}*(iw-iw/zoom)/2*(1-2*${progress})`;
        yExpr = centerY;
        break;
      case 'up':
        xExpr = centerX;
        yExpr = `(ih-ih/zoom)/2+${travel}*(ih-ih/zoom)/2*(1-2*${progress})`;
        break;
      case 'down':
        xExpr = centerX;
        yExpr = `(ih-ih/zoom)/2-${travel}*(ih-ih/zoom)/2*(1-2*${progress})`;
        break;
      default:
        xExpr = centerX;
        yExpr = centerY;
    }
  }

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${resX}x${resY}:fps=${fps}`;
}

// ---------------------------------------------------------------------------
// 2. Captions (word-highlight drawtext)
// ---------------------------------------------------------------------------

export function buildCaptionFilter(
  spec: CaptionSpec,
  clipStartTime: number,
  clipDuration: number,
  resX: number,
  resY: number,
  fontPath?: string,
): string {
  const font = fontPath || defaultFontPath();
  const yPos = spec.position === 'center' ? `(h-th)/2` : `h-80`;

  const filters: string[] = [];

  // Base text layer — dim gray, always visible during clip
  const baseEnable = `between(t,${clipStartTime},${clipStartTime + clipDuration})`;
  const escapedText = escapeDrawtext(spec.text);
  const fontFile = font ? `fontfile='${font}':` : '';
  filters.push(
    `drawtext=${fontFile}text='${escapedText}':fontsize=${spec.fontSize}:fontcolor=gray@0.5:x=(w-tw)/2:y=${yPos}:enable='${baseEnable}'`,
  );

  // Per-word highlight layers
  for (const w of spec.words) {
    const wordStart = clipStartTime + w.startPct * clipDuration;
    const wordEnd = clipStartTime + w.endPct * clipDuration;
    const escapedWord = escapeDrawtext(w.word);
    filters.push(
      `drawtext=${fontFile}text='${escapedWord}':fontsize=${spec.fontSize}:fontcolor=white:x=(w-tw)/2:y=${yPos}:enable='between(t,${wordStart},${wordEnd})'`,
    );
  }

  return filters.join(',');
}

// ---------------------------------------------------------------------------
// 3. Lower third
// ---------------------------------------------------------------------------

export function buildLowerThirdFilter(
  spec: LowerThirdSpec,
  clipStartTime: number,
  resX: number,
  resY: number,
  fontPath?: string,
): string {
  const font = fontPath || defaultFontPath();
  const fontFile = font ? `fontfile='${font}':` : '';
  const endTime = clipStartTime + spec.durationSeconds;
  const enableExpr = `between(t,${clipStartTime},${endTime})`;

  const filters: string[] = [];

  // Primary text
  const escapedPrimary = escapeDrawtext(spec.primaryText);
  const primaryY = `h-100`;
  let animProps: string;

  if (spec.animation === 'slide-in-left') {
    const xExpr = `if(lt(t-${clipStartTime},0.5),-(tw+20)+(tw+40)*((t-${clipStartTime})/0.5),20)`;
    animProps = `fontcolor=white:x='${xExpr}'`;
  } else {
    // fade-in
    animProps = `x=20:fontcolor_expr='white@min(1,(t-${clipStartTime})/0.5)'`;
  }

  filters.push(
    `drawtext=${fontFile}text='${escapedPrimary}':fontsize=36:${animProps}:y=${primaryY}:box=1:boxcolor=black@0.6:boxborderw=10:enable='${enableExpr}'`,
  );

  // Secondary text (below primary)
  if (spec.secondaryText) {
    const escapedSecondary = escapeDrawtext(spec.secondaryText);
    const secondaryY = `h-60`;
    let secAnimProps: string;

    if (spec.animation === 'slide-in-left') {
      const xExpr = `if(lt(t-${clipStartTime},0.5),-(tw+20)+(tw+40)*((t-${clipStartTime})/0.5),20)`;
      secAnimProps = `fontcolor=white:x='${xExpr}'`;
    } else {
      secAnimProps = `x=20:fontcolor_expr='white@min(1,(t-${clipStartTime})/0.5)'`;
    }

    filters.push(
      `drawtext=${fontFile}text='${escapedSecondary}':fontsize=24:${secAnimProps}:y=${secondaryY}:box=1:boxcolor=black@0.6:boxborderw=10:enable='${enableExpr}'`,
    );
  }

  return filters.join(',');
}

// ---------------------------------------------------------------------------
// 4. Title card
// ---------------------------------------------------------------------------

export function buildTitleCardSegment(
  spec: TitleCardSpec,
  fps: number,
  resX: number,
  resY: number,
  fontPath?: string,
): { inputs: string[]; filters: string[] } {
  const font = fontPath || defaultFontPath();
  const fontFile = font ? `fontfile='${font}':` : '';

  const inputs = [
    `color=c=black:s=${resX}x${resY}:d=${spec.durationSeconds}:r=${fps}`,
  ];

  const filters: string[] = [];
  const lineCount = spec.lines.length;
  const titleFontSize = 48;
  const subtitleFontSize = 28;
  const lineSpacing = 20;

  // Total text block height for vertical centering
  const totalHeight =
    titleFontSize +
    (lineCount > 1
      ? lineSpacing + (lineCount - 1) * (subtitleFontSize + lineSpacing) - lineSpacing
      : 0);
  const startY = `(h-${totalHeight})/2`;

  for (let i = 0; i < spec.lines.length; i++) {
    const escaped = escapeDrawtext(spec.lines[i]);
    const fontSize = i === 0 ? titleFontSize : subtitleFontSize;
    const yOffset =
      i === 0
        ? 0
        : titleFontSize + lineSpacing + (i - 1) * (subtitleFontSize + lineSpacing);
    const yExpr = `${startY}+${yOffset}`;

    // Fade in during first 0.5s, fade out during last 0.5s
    const fadeIn = `min(1,t/0.5)`;
    const fadeOut = `min(1,(${spec.durationSeconds}-t)/0.5)`;
    const alpha = `${fadeIn}*${fadeOut}`;

    filters.push(
      `drawtext=${fontFile}text='${escaped}':fontsize=${fontSize}:fontcolor_expr='white@${alpha}':x=(w-tw)/2:y=${yExpr}`,
    );
  }

  return { inputs, filters };
}

// ---------------------------------------------------------------------------
// 5. Transitions (xfade)
// ---------------------------------------------------------------------------

const XFADE_TYPE_MAP: Record<string, string> = {
  dissolve: 'fade',
  fade: 'fade',
  wipe: 'wipeleft',
};

export function buildTransitionFilter(
  spec: TransitionSpec,
  label1: string,
  label2: string,
  offset: number,
): string {
  if (spec.type === 'cut') {
    return '';
  }

  const xfadeTransition = XFADE_TYPE_MAP[spec.type] || spec.xfadeType || 'fade';
  return `[${label1}][${label2}]xfade=transition=${xfadeTransition}:duration=${spec.durationSeconds}:offset=${offset}`;
}

// ---------------------------------------------------------------------------
// 6. Effects
// ---------------------------------------------------------------------------

export function buildEffectFilters(
  effects: EffectSpec[],
  inputLabel: string,
): string {
  const parts: string[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'grain': {
        const strength = Math.round(effect.intensity * 20);
        parts.push(`noise=alls=${strength}:allf=t+u`);
        break;
      }
      case 'vignette': {
        // intensity 0..1 maps vignette angle: higher intensity = stronger vignette
        const divisor = 4 / Math.max(effect.intensity, 0.01);
        parts.push(`vignette=PI/${divisor.toFixed(2)}`);
        break;
      }
      case 'letterbox': {
        parts.push(`pad=iw:iw*2.35:0:(oh-ih)/2:black`);
        break;
      }
    }
  }

  if (parts.length === 0) return '';
  return parts.join(',');
}

// ---------------------------------------------------------------------------
// 7. Default font path
// ---------------------------------------------------------------------------

export function defaultFontPath(): string {
  const platform =
    typeof process !== 'undefined' ? process.platform : 'linux';

  if (platform === 'darwin') {
    return '/System/Library/Fonts/Helvetica.ttc';
  }
  if (platform === 'linux') {
    return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  }
  return '';
}
