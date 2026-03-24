import { describe, it, expect } from 'vitest';
import {
  buildKenBurnsFilter,
  buildCaptionFilter,
  buildLowerThirdFilter,
  buildTitleCardSegment,
  buildTransitionFilter,
  buildEffectFilters,
  defaultFontPath,
  KEN_BURNS_MAP,
  type KenBurnsSpec,
  type CaptionSpec,
  type LowerThirdSpec,
  type TitleCardSpec,
  type TransitionSpec,
  type EffectSpec,
} from './_ffmpeg-filters.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKenBurnsSpec(overrides: Partial<KenBurnsSpec> = {}): KenBurnsSpec {
  return {
    shotElementId: 'shot-1',
    cameraMovement: 'STATIC',
    frameSize: 'WIDE',
    durationSeconds: 4,
    zoomStart: 1.0,
    zoomEnd: 1.05,
    panDirection: 'none',
    panAmount: 0,
    easing: 'linear',
    ...overrides,
  };
}

function makeCaptionSpec(overrides: Partial<CaptionSpec> = {}): CaptionSpec {
  return {
    elementId: 'dl-1',
    characterName: 'EMMA',
    text: 'Hello world',
    words: [
      { word: 'Hello', startPct: 0, endPct: 0.5 },
      { word: 'world', startPct: 0.5, endPct: 1.0 },
    ],
    style: 'shorts',
    position: 'bottom-third',
    fontSize: 48,
    ...overrides,
  };
}

function makeLowerThirdSpec(overrides: Partial<LowerThirdSpec> = {}): LowerThirdSpec {
  return {
    id: 'lt-1',
    type: 'character',
    primaryText: 'MARCUS CHEN',
    triggerElementId: 'shot-1',
    durationSeconds: 3,
    animation: 'slide-in-left',
    ...overrides,
  };
}

function makeTitleCardSpec(overrides: Partial<TitleCardSpec> = {}): TitleCardSpec {
  return {
    id: 'tc-1',
    type: 'main-title',
    lines: ['Act One', 'The Beginning'],
    durationSeconds: 4,
    background: 'black',
    ...overrides,
  };
}

function makeTransitionSpec(overrides: Partial<TransitionSpec> = {}): TransitionSpec {
  return {
    fromElementId: 'shot-1',
    toElementId: 'shot-2',
    type: 'dissolve',
    durationSeconds: 1,
    xfadeType: 'fade',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ken Burns tests
// ---------------------------------------------------------------------------

describe('buildKenBurnsFilter', () => {
  const fps = 24;
  const resX = 1920;
  const resY = 1080;
  const font = '/test/font.ttf';

  it('STATIC produces zoompan with gentle zoom (1.0 to 1.05)', () => {
    const spec = makeKenBurnsSpec({
      ...KEN_BURNS_MAP['STATIC'],
      panDirection: KEN_BURNS_MAP['STATIC'].panDirection as KenBurnsSpec['panDirection'],
      easing: KEN_BURNS_MAP['STATIC'].easing as KenBurnsSpec['easing'],
    });
    const result = buildKenBurnsFilter(spec, fps, resX, resY);

    expect(result).toContain('zoompan=');
    expect(result).toContain("z='1+0.05");
    expect(result).toContain(`s=${resX}x${resY}`);
    expect(result).toContain(`fps=${fps}`);
  });

  it('PUSH IN produces zoompan with zoom in (1.0 to 1.2) and ease-in', () => {
    const mapping = KEN_BURNS_MAP['PUSH IN'];
    const spec = makeKenBurnsSpec({
      zoomStart: mapping.zoomStart,
      zoomEnd: mapping.zoomEnd,
      panDirection: mapping.panDirection as KenBurnsSpec['panDirection'],
      panAmount: mapping.panAmount,
      easing: mapping.easing as KenBurnsSpec['easing'],
    });
    const result = buildKenBurnsFilter(spec, fps, resX, resY);

    expect(result).toContain('zoompan=');
    // Ease-in uses quadratic: progress*progress
    expect(result).toMatch(/\(on\/\d+\)\*\(on\/\d+\)/);
    // zDiff is 0.2 (may have floating-point representation)
    expect(result).toMatch(/1\+0\.(?:2|19999999999999996)/);
  });

  it('PAN produces zoompan with horizontal pan expression', () => {
    const mapping = KEN_BURNS_MAP['PAN'];
    const spec = makeKenBurnsSpec({
      zoomStart: mapping.zoomStart,
      zoomEnd: mapping.zoomEnd,
      panDirection: mapping.panDirection as KenBurnsSpec['panDirection'],
      panAmount: mapping.panAmount,
      easing: mapping.easing as KenBurnsSpec['easing'],
    });
    const result = buildKenBurnsFilter(spec, fps, resX, resY);

    expect(result).toContain('zoompan=');
    // Pan right: x expression includes iw-based travel
    expect(result).toContain('iw-iw/zoom');
    expect(result).toContain(`0.3`);
  });

  it('PULL BACK produces reverse zoom (1.2 to 1.0) with ease-out', () => {
    const mapping = KEN_BURNS_MAP['PULL BACK'];
    const spec = makeKenBurnsSpec({
      zoomStart: mapping.zoomStart,
      zoomEnd: mapping.zoomEnd,
      panDirection: mapping.panDirection as KenBurnsSpec['panDirection'],
      panAmount: mapping.panAmount,
      easing: mapping.easing as KenBurnsSpec['easing'],
    });
    const result = buildKenBurnsFilter(spec, fps, resX, resY);

    expect(result).toContain('zoompan=');
    // zoomStart=1.2 + zDiff=-0.2 * ease-out expression (floating-point)
    expect(result).toMatch(/1\.2\+-0\.(?:2|19999999999999996)/);
    // Ease-out uses (2*t - t*t)
    expect(result).toMatch(/2\*\(on\/\d+\)/);
  });

  it('filter string contains valid zoompan syntax', () => {
    const spec = makeKenBurnsSpec();
    const result = buildKenBurnsFilter(spec, fps, resX, resY);

    // Must start with zoompan=
    expect(result).toMatch(/^zoompan=/);
    // Must contain all required params
    expect(result).toMatch(/z='/);
    expect(result).toMatch(/x='/);
    expect(result).toMatch(/y='/);
    expect(result).toMatch(/d=\d+/);
    expect(result).toMatch(/s=\d+x\d+/);
    expect(result).toMatch(/fps=\d+/);
  });

  it('output resolution matches requested dimensions', () => {
    const spec = makeKenBurnsSpec();
    const result = buildKenBurnsFilter(spec, 30, 1280, 720);

    expect(result).toContain('s=1280x720');
    expect(result).toContain('fps=30');
  });

  it('total frames computed from duration and fps', () => {
    const spec = makeKenBurnsSpec({ durationSeconds: 5 });
    const result = buildKenBurnsFilter(spec, 24, 1920, 1080);

    // 5 * 24 = 120 frames
    expect(result).toContain('d=120');
  });

  it('up pan produces vertical pan expression', () => {
    const spec = makeKenBurnsSpec({ panDirection: 'up', panAmount: 0.2 });
    const result = buildKenBurnsFilter(spec, fps, resX, resY);

    expect(result).toContain('ih-ih/zoom');
    expect(result).toContain('0.2');
  });
});

// ---------------------------------------------------------------------------
// Caption tests
// ---------------------------------------------------------------------------

describe('buildCaptionFilter', () => {
  const resX = 1920;
  const resY = 1080;
  const font = '/test/font.ttf';

  it('single word produces base text and one highlight drawtext', () => {
    const spec = makeCaptionSpec({
      text: 'Hello',
      words: [{ word: 'Hello', startPct: 0, endPct: 1.0 }],
    });
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);
    const parts = result.split(',drawtext=');

    // base layer + 1 highlight = 2 drawtext filters
    expect(parts.length).toBe(2);
  });

  it('multiple words produce base text plus highlight layers', () => {
    const spec = makeCaptionSpec(); // 2 words by default
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);
    const parts = result.split(',drawtext=');

    // base layer + 2 highlight layers = 3 drawtext filters
    expect(parts.length).toBe(3);
  });

  it('enable timestamps are computed correctly from clip start and percentages', () => {
    const spec = makeCaptionSpec({
      words: [
        { word: 'Hello', startPct: 0, endPct: 0.5 },
        { word: 'world', startPct: 0.5, endPct: 1.0 },
      ],
    });
    const clipStart = 10;
    const clipDuration = 4;
    const result = buildCaptionFilter(spec, clipStart, clipDuration, resX, resY, font);

    // Word 1: start=10+0*4=10, end=10+0.5*4=12
    expect(result).toContain('between(t,10,12)');
    // Word 2: start=10+0.5*4=12, end=10+1.0*4=14
    expect(result).toContain('between(t,12,14)');
  });

  it('font size is applied from spec', () => {
    const spec = makeCaptionSpec({ fontSize: 72 });
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);

    expect(result).toContain('fontsize=72');
  });

  it('position center uses (h-th)/2', () => {
    const spec = makeCaptionSpec({ position: 'center' });
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);

    expect(result).toContain('y=(h-th)/2');
  });

  it('position bottom-third uses h-80', () => {
    const spec = makeCaptionSpec({ position: 'bottom-third' });
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);

    expect(result).toContain('y=h-80');
  });

  it('base layer uses gray@0.5 color', () => {
    const spec = makeCaptionSpec();
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);

    expect(result).toContain('fontcolor=gray@0.5');
  });

  it('highlight layers use white color', () => {
    const spec = makeCaptionSpec();
    const result = buildCaptionFilter(spec, 0, 4, resX, resY, font);

    expect(result).toContain('fontcolor=white');
  });
});

// ---------------------------------------------------------------------------
// Lower third tests
// ---------------------------------------------------------------------------

describe('buildLowerThirdFilter', () => {
  const resX = 1920;
  const resY = 1080;
  const font = '/test/font.ttf';

  it('slide-in-left produces expression-based x position', () => {
    const spec = makeLowerThirdSpec({ animation: 'slide-in-left' });
    const result = buildLowerThirdFilter(spec, 5, resX, resY, font);

    // Should contain conditional slide expression
    expect(result).toContain('if(lt(t-5,0.5)');
    expect(result).toContain('tw+20');
    expect(result).toContain('tw+40');
  });

  it('fade-in produces fontcolor_expr', () => {
    const spec = makeLowerThirdSpec({ animation: 'fade-in' });
    const result = buildLowerThirdFilter(spec, 5, resX, resY, font);

    expect(result).toContain("fontcolor_expr='white@min(1,(t-5)/0.5)'");
  });

  it('secondary text adds second drawtext filter', () => {
    const spec = makeLowerThirdSpec({ secondaryText: 'Detective' });
    const result = buildLowerThirdFilter(spec, 0, resX, resY, font);
    const parts = result.split(',drawtext=');

    // primary + secondary = 2 drawtext filters
    expect(parts.length).toBe(2);
    expect(result).toContain('Detective');
  });

  it('no secondary text produces single drawtext filter', () => {
    const spec = makeLowerThirdSpec();
    const result = buildLowerThirdFilter(spec, 0, resX, resY, font);
    const parts = result.split(',drawtext=');

    expect(parts.length).toBe(1);
  });

  it('enable range matches clip start and duration', () => {
    const spec = makeLowerThirdSpec({ durationSeconds: 5 });
    const result = buildLowerThirdFilter(spec, 10, resX, resY, font);

    // enable should be between(t,10,15)
    expect(result).toContain('between(t,10,15)');
  });

  it('includes background box styling', () => {
    const spec = makeLowerThirdSpec();
    const result = buildLowerThirdFilter(spec, 0, resX, resY, font);

    expect(result).toContain('box=1');
    expect(result).toContain('boxcolor=black@0.6');
    expect(result).toContain('boxborderw=10');
  });

  it('secondary text uses smaller font size', () => {
    const spec = makeLowerThirdSpec({ secondaryText: 'Subtitle' });
    const result = buildLowerThirdFilter(spec, 0, resX, resY, font);

    expect(result).toContain('fontsize=36');
    expect(result).toContain('fontsize=24');
  });
});

// ---------------------------------------------------------------------------
// Title card tests
// ---------------------------------------------------------------------------

describe('buildTitleCardSegment', () => {
  const fps = 24;
  const resX = 1920;
  const resY = 1080;
  const font = '/test/font.ttf';

  it('returns color source input and drawtext filters', () => {
    const spec = makeTitleCardSpec({ lines: ['Title'] });
    const result = buildTitleCardSegment(spec, fps, resX, resY, font);

    expect(result.inputs.length).toBe(1);
    expect(result.inputs[0]).toContain('color=c=black');
    expect(result.inputs[0]).toContain(`s=${resX}x${resY}`);
    expect(result.filters.length).toBeGreaterThanOrEqual(1);
    expect(result.filters[0]).toContain('drawtext=');
  });

  it('multiple lines produce multiple drawtext filters', () => {
    const spec = makeTitleCardSpec({ lines: ['Act One', 'The Beginning', 'A Story'] });
    const result = buildTitleCardSegment(spec, fps, resX, resY, font);

    expect(result.filters.length).toBe(3);
  });

  it('first line uses larger font size than subsequent lines', () => {
    const spec = makeTitleCardSpec({ lines: ['Title', 'Subtitle'] });
    const result = buildTitleCardSegment(spec, fps, resX, resY, font);

    expect(result.filters[0]).toContain('fontsize=48');
    expect(result.filters[1]).toContain('fontsize=28');
  });

  it('duration matches spec', () => {
    const spec = makeTitleCardSpec({ durationSeconds: 6 });
    const result = buildTitleCardSegment(spec, fps, resX, resY, font);

    expect(result.inputs[0]).toContain('d=6');
    expect(result.inputs[0]).toContain(`r=${fps}`);
  });

  it('includes fade in and fade out expressions', () => {
    const spec = makeTitleCardSpec({ durationSeconds: 4 });
    const result = buildTitleCardSegment(spec, fps, resX, resY, font);

    // Should have fade-in (min(1,t/0.5)) and fade-out (min(1,(dur-t)/0.5))
    expect(result.filters[0]).toContain('min(1,t/0.5)');
    expect(result.filters[0]).toContain('min(1,(4-t)/0.5)');
  });

  it('text is horizontally centered', () => {
    const spec = makeTitleCardSpec({ lines: ['Centered Title'] });
    const result = buildTitleCardSegment(spec, fps, resX, resY, font);

    expect(result.filters[0]).toContain('x=(w-tw)/2');
  });
});

// ---------------------------------------------------------------------------
// Transition tests
// ---------------------------------------------------------------------------

describe('buildTransitionFilter', () => {
  it('dissolve maps to xfade transition=fade', () => {
    const spec = makeTransitionSpec({ type: 'dissolve' });
    const result = buildTransitionFilter(spec, 'v0', 'v1', 3.5);

    expect(result).toContain('xfade=transition=fade');
    expect(result).toContain('duration=1');
    expect(result).toContain('offset=3.5');
    expect(result).toContain('[v0][v1]');
  });

  it('fade maps to xfade transition=fade', () => {
    const spec = makeTransitionSpec({ type: 'fade', durationSeconds: 0.5 });
    const result = buildTransitionFilter(spec, 'a', 'b', 10);

    expect(result).toContain('xfade=transition=fade');
    expect(result).toContain('duration=0.5');
  });

  it('wipe maps to xfade transition=wipeleft', () => {
    const spec = makeTransitionSpec({ type: 'wipe' });
    const result = buildTransitionFilter(spec, 'v0', 'v1', 5);

    expect(result).toContain('xfade=transition=wipeleft');
  });

  it('cut returns empty string (no filter needed)', () => {
    const spec = makeTransitionSpec({ type: 'cut' });
    const result = buildTransitionFilter(spec, 'v0', 'v1', 5);

    expect(result).toBe('');
  });

  it('offset is correctly passed', () => {
    const spec = makeTransitionSpec({ type: 'dissolve', durationSeconds: 2 });
    const result = buildTransitionFilter(spec, 'clip0', 'clip1', 7.25);

    expect(result).toContain('offset=7.25');
    expect(result).toContain('duration=2');
  });

  it('labels are correctly wrapped in brackets', () => {
    const spec = makeTransitionSpec({ type: 'dissolve' });
    const result = buildTransitionFilter(spec, 'seg0', 'seg1', 0);

    expect(result).toMatch(/^\[seg0\]\[seg1\]/);
  });
});

// ---------------------------------------------------------------------------
// Effect tests
// ---------------------------------------------------------------------------

describe('buildEffectFilters', () => {
  it('grain produces noise filter with scaled intensity', () => {
    const effects: EffectSpec[] = [
      { type: 'grain', intensity: 0.5, scope: 'global' },
    ];
    const result = buildEffectFilters(effects, 'v0');

    expect(result).toContain('noise=alls=10:allf=t+u');
  });

  it('vignette produces vignette filter', () => {
    const effects: EffectSpec[] = [
      { type: 'vignette', intensity: 1.0, scope: 'global' },
    ];
    const result = buildEffectFilters(effects, 'v0');

    expect(result).toContain('vignette=PI/');
  });

  it('letterbox produces pad filter', () => {
    const effects: EffectSpec[] = [
      { type: 'letterbox', intensity: 1.0, scope: 'global' },
    ];
    const result = buildEffectFilters(effects, 'v0');

    expect(result).toContain('pad=iw:iw*2.35:0:(oh-ih)/2:black');
  });

  it('multiple effects are chained with comma separator', () => {
    const effects: EffectSpec[] = [
      { type: 'grain', intensity: 0.5, scope: 'global' },
      { type: 'vignette', intensity: 0.8, scope: 'global' },
    ];
    const result = buildEffectFilters(effects, 'v0');

    const parts = result.split(',');
    expect(parts.length).toBe(2);
    expect(parts[0]).toContain('noise=');
    expect(parts[1]).toContain('vignette=');
  });

  it('empty effects array returns empty string', () => {
    const result = buildEffectFilters([], 'v0');
    expect(result).toBe('');
  });

  it('grain intensity 1.0 produces strength 20', () => {
    const effects: EffectSpec[] = [
      { type: 'grain', intensity: 1.0, scope: 'global' },
    ];
    const result = buildEffectFilters(effects, 'v0');

    expect(result).toContain('noise=alls=20');
  });

  it('grain intensity 0 produces strength 0', () => {
    const effects: EffectSpec[] = [
      { type: 'grain', intensity: 0, scope: 'global' },
    ];
    const result = buildEffectFilters(effects, 'v0');

    expect(result).toContain('noise=alls=0');
  });
});

// ---------------------------------------------------------------------------
// Default font path
// ---------------------------------------------------------------------------

describe('defaultFontPath', () => {
  it('returns a non-empty string on supported platforms', () => {
    const result = defaultFontPath();
    // On macOS (darwin) or linux, should return a path
    if (process.platform === 'darwin' || process.platform === 'linux') {
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('/');
    }
  });
});

// ---------------------------------------------------------------------------
// KEN_BURNS_MAP
// ---------------------------------------------------------------------------

describe('KEN_BURNS_MAP', () => {
  it('has entries for all expected camera movements', () => {
    const expectedKeys = [
      'STATIC', 'PUSH IN', 'SLOW PUSH IN', 'PULL BACK', 'PAN',
      'TILT', 'DOLLY', 'TRACKING', 'CRANE', 'HANDHELD', 'STEADICAM',
    ];
    for (const key of expectedKeys) {
      expect(KEN_BURNS_MAP).toHaveProperty(key);
    }
  });

  it('all entries have required fields', () => {
    for (const [key, value] of Object.entries(KEN_BURNS_MAP)) {
      expect(value).toHaveProperty('zoomStart');
      expect(value).toHaveProperty('zoomEnd');
      expect(value).toHaveProperty('panDirection');
      expect(value).toHaveProperty('panAmount');
      expect(value).toHaveProperty('easing');
      expect(typeof value.zoomStart).toBe('number');
      expect(typeof value.zoomEnd).toBe('number');
    }
  });
});
