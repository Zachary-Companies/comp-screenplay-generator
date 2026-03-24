import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

// Reference values from _ffmpeg-filters.ts KEN_BURNS_MAP
const KB_PAN = { zoomStart: 1.1, zoomEnd: 1.1, panDirection: 'right', panAmount: 0.3, easing: 'linear' };
const KB_DOLLY = { zoomStart: 1.05, zoomEnd: 1.05, panDirection: 'right', panAmount: 0.4, easing: 'linear' };
const KB_STATIC = { zoomStart: 1.0, zoomEnd: 1.05, panDirection: 'none', panAmount: 0, easing: 'linear' };
const KB_CRANE = { zoomStart: 1.0, zoomEnd: 1.1, panDirection: 'up', panAmount: 0.2, easing: 'ease-out' };

async function run(inputs: Record<string, any>) {
  const { context } = createMockContext();
  const { execute } = await import('./motion-graphics-generation.js');
  const result = await execute(
    {
      elements: inputs.elements ?? [],
      previsualizationPlan: inputs.previsualizationPlan ?? { shots: [] },
      characters: inputs.characters ?? [],
      locations: inputs.locations ?? [],
      metadata: inputs.metadata ?? {},
      processedSections: inputs.processedSections ?? [],
    },
    context,
  );
  return result as any;
}

async function runPlan(inputs: Record<string, any>) {
  const result = await run(inputs);
  return result.motionGraphicsPlan;
}

describe('Motion Graphics Generation', () => {
  // ── 1. Ken Burns from previs shots ────────────────────────────────────
  it('should generate Ken Burns specs from previs shots', async () => {
    const plan = await runPlan({
      previsualizationPlan: {
        shots: [
          { id: 'shot-1', cameraMovement: 'PAN', frameSize: 'MEDIUM', durationSeconds: 4 },
          { id: 'shot-2', cameraMovement: 'DOLLY', frameSize: 'MEDIUM', durationSeconds: 5 },
          { id: 'shot-3', cameraMovement: 'STATIC', frameSize: 'MEDIUM', durationSeconds: 3 },
        ],
      },
    });

    expect(plan.kenBurns).toHaveLength(3);

    // PAN (MEDIUM = scaleFactor 1, no adjustment)
    const pan = plan.kenBurns[0];
    expect(pan.shotElementId).toBe('shot-1');
    expect(pan.zoomStart).toBe(KB_PAN.zoomStart);
    expect(pan.zoomEnd).toBe(KB_PAN.zoomEnd);
    expect(pan.panAmount).toBe(KB_PAN.panAmount);
    expect(pan.panDirection).toBe('right');
    expect(pan.durationSeconds).toBe(4);

    // DOLLY
    const dolly = plan.kenBurns[1];
    expect(dolly.zoomStart).toBe(KB_DOLLY.zoomStart);
    expect(dolly.zoomEnd).toBe(KB_DOLLY.zoomEnd);

    // STATIC: minimal zoom
    const stat = plan.kenBurns[2];
    expect(stat.zoomStart).toBe(1.0);
    expect(stat.zoomEnd).toBe(KB_STATIC.zoomEnd);
  });

  // ── 2. CLOSE-UP reduces zoom range ───────────────────────────────────
  it('should reduce zoom range by 50% for CLOSE-UP frame size', async () => {
    const plan = await runPlan({
      previsualizationPlan: {
        shots: [
          { id: 'shot-cu', cameraMovement: 'DOLLY', frameSize: 'CLOSE-UP', durationSeconds: 3 },
        ],
      },
    });

    const kb = plan.kenBurns[0];
    // zoomFactor 0.5: zoomStart = 1 + (1.05-1)*0.5 = 1.025
    const expectedStart = 1 + (KB_DOLLY.zoomStart - 1) * 0.5;
    const expectedEnd = 1 + (KB_DOLLY.zoomEnd - 1) * 0.5;
    expect(kb.zoomStart).toBeCloseTo(expectedStart, 3);
    expect(kb.zoomEnd).toBeCloseTo(expectedEnd, 3);
    expect(kb.panAmount).toBeCloseTo(KB_DOLLY.panAmount * 0.5, 3);
  });

  // ── 3. Caption from dialogue elements ─────────────────────────────────
  it('should generate captions with proportional word timing', async () => {
    const plan = await runPlan({
      elements: [
        { id: 'dlg-1', type: 'dialogue', characterId: 'c1', lines: ['Hello world'] },
      ],
      metadata: { genre: 'Drama' },
    });

    expect(plan.captions).toHaveLength(1);
    const cap = plan.captions[0];
    expect(cap.elementId).toBe('dlg-1');
    expect(cap.text).toBe('Hello world');
    expect(cap.words).toHaveLength(2);
    expect(cap.words[0].word).toBe('Hello');
    expect(cap.words[0].startPct).toBe(0);
    expect(cap.words[0].endPct).toBeGreaterThan(0);
    expect(cap.words[1].word).toBe('world');
    expect(cap.words[1].endPct).toBe(1);
    // Proportional: "Hello" is 5 chars, "world" is 5 chars -> split at 0.5
    expect(cap.words[0].endPct).toBeCloseTo(0.5, 2);
    expect(cap.words[1].startPct).toBeCloseTo(0.5, 2);
  });

  // ── 4. Caption style from project type ────────────────────────────────
  it('should set shorts style when genre/title hints at short', async () => {
    const plan = await runPlan({
      elements: [{ id: 'd1', type: 'dialogue', lines: ['Test'] }],
      metadata: { genre: 'YouTube Short' },
    });

    expect(plan.captions[0].style).toBe('shorts');
    expect(plan.captions[0].fontSize).toBe(48);
    expect(plan.captions[0].position).toBe('center');
  });

  it('should set video style for standard genres', async () => {
    const plan = await runPlan({
      elements: [{ id: 'd1', type: 'dialogue', lines: ['Test'] }],
      metadata: { genre: 'Drama' },
    });

    expect(plan.captions[0].style).toBe('video');
    expect(plan.captions[0].fontSize).toBe(28);
    expect(plan.captions[0].position).toBe('bottom-third');
  });

  // ── 5. Lower thirds on first appearance ───────────────────────────────
  it('should create only one lower third per character', async () => {
    const plan = await runPlan({
      elements: [
        { id: 'd1', type: 'dialogue', characterId: 'marcus', lines: ['Line one'] },
        { id: 'd2', type: 'dialogue', characterId: 'marcus', lines: ['Line two'] },
        { id: 'd3', type: 'dialogue', characterId: 'elena', lines: ['Hi'] },
      ],
      characters: [
        { id: 'marcus', name: 'Marcus Reed', displayName: 'MARCUS' },
        { id: 'elena', name: 'Elena Voss', displayName: 'ELENA' },
      ],
    });

    const charLT = plan.lowerThirds.filter((lt: any) => lt.type === 'character');
    expect(charLT).toHaveLength(2);
    expect(charLT[0].primaryText).toBe('Marcus Reed');
    expect(charLT[0].animation).toBe('slide-in-left');
    expect(charLT[0].durationSeconds).toBe(3.5);
    expect(charLT[1].primaryText).toBe('Elena Voss');
  });

  // ── 6. Location lower thirds ──────────────────────────────────────────
  it('should create location lower thirds from scene-heading elements', async () => {
    const plan = await runPlan({
      elements: [
        { id: 'sh-1', type: 'scene-heading', locationId: 'loc-park', content: 'EXT. PARK - DAY' },
        { id: 'sh-2', type: 'scene-heading', locationId: 'loc-park', content: 'EXT. PARK - NIGHT' },
        { id: 'sh-3', type: 'scene-heading', locationId: 'loc-office', content: 'INT. OFFICE - DAY' },
      ],
      locations: [
        { id: 'loc-park', name: 'City Park' },
        { id: 'loc-office', name: 'Downtown Office' },
      ],
    });

    const locLT = plan.lowerThirds.filter((lt: any) => lt.type === 'location');
    expect(locLT).toHaveLength(2);
    expect(locLT[0].primaryText).toBe('City Park');
    expect(locLT[0].animation).toBe('fade-in');
    expect(locLT[1].primaryText).toBe('Downtown Office');
  });

  // ── 7. Main title card from metadata ──────────────────────────────────
  it('should generate main title card from metadata', async () => {
    const plan = await runPlan({
      metadata: { title: 'The Last Crossing', logline: 'A journey into the unknown' },
    });

    const mainTitle = plan.titleCards.find((tc: any) => tc.type === 'main-title');
    expect(mainTitle).toBeDefined();
    expect(mainTitle.lines[0]).toBe('The Last Crossing');
    expect(mainTitle.lines[1]).toBe('A journey into the unknown');
    expect(mainTitle.durationSeconds).toBe(4);
  });

  // ── 8. Transition mapping ─────────────────────────────────────────────
  it('should map transition elements to correct xfade types', async () => {
    const plan = await runPlan({
      elements: [
        { id: 't1', type: 'transition', transitionType: 'CUT TO:' },
        { id: 't2', type: 'transition', transitionType: 'DISSOLVE TO:' },
        { id: 't3', type: 'transition', transitionType: 'FADE OUT:' },
        { id: 't4', type: 'transition', transitionType: 'WIPE TO:' },
      ],
    });

    expect(plan.transitions).toHaveLength(4);

    expect(plan.transitions[0].type).toBe('cut');
    expect(plan.transitions[0].xfadeType).toBe('');
    expect(plan.transitions[0].durationSeconds).toBe(0.5);

    expect(plan.transitions[1].type).toBe('dissolve');
    expect(plan.transitions[1].xfadeType).toBe('fade');
    expect(plan.transitions[1].durationSeconds).toBe(1);

    expect(plan.transitions[2].type).toBe('fade');
    expect(plan.transitions[2].xfadeType).toBe('fade');
    expect(plan.transitions[2].durationSeconds).toBe(2);

    expect(plan.transitions[3].type).toBe('wipe');
    expect(plan.transitions[3].xfadeType).toBe('wipeleft');
    expect(plan.transitions[3].durationSeconds).toBe(1);
  });

  // ── 9. Genre to effects mapping ───────────────────────────────────────
  it('should map drama to grain + vignette', async () => {
    const plan = await runPlan({ metadata: { genre: 'Drama' } });
    expect(plan.effects).toEqual([
      { type: 'grain', intensity: 0.3, scope: 'global' },
      { type: 'vignette', intensity: 0.5, scope: 'global' },
    ]);
  });

  it('should map comedy to vignette only', async () => {
    const plan = await runPlan({ metadata: { genre: 'Comedy' } });
    expect(plan.effects).toEqual([
      { type: 'vignette', intensity: 0.3, scope: 'global' },
    ]);
  });

  it('should map horror to high grain + vignette', async () => {
    const plan = await runPlan({ metadata: { genre: 'Horror' } });
    expect(plan.effects).toEqual([
      { type: 'grain', intensity: 0.5, scope: 'global' },
      { type: 'vignette', intensity: 0.7, scope: 'global' },
    ]);
  });

  // ── 10. Empty inputs ──────────────────────────────────────────────────
  it('should handle empty inputs without crashing', async () => {
    const plan = await runPlan({});

    expect(plan.version).toBe('1.0');
    expect(plan.kenBurns).toEqual([]);
    expect(plan.captions).toEqual([]);
    expect(plan.lowerThirds).toEqual([]);
    expect(plan.titleCards).toEqual([]);
    expect(plan.transitions).toEqual([]);
    // Default effect (vignette) still applied
    expect(plan.effects.length).toBeGreaterThanOrEqual(1);
  });

  // ── 11. Complete pipeline ─────────────────────────────────────────────
  it('should process a realistic mix of all element types', async () => {
    const plan = await runPlan({
      elements: [
        { id: 'sh-1', type: 'scene-heading', locationId: 'loc-bridge', content: 'EXT. BRIDGE - DAWN' },
        { id: 'dlg-1', type: 'dialogue', characterId: 'marcus', lines: ['I cannot turn back now.'] },
        { id: 'act-1', type: 'action', content: 'Marcus stares across the river.' },
        { id: 'dlg-2', type: 'dialogue', characterId: 'elena', lines: ['Then we go together.'] },
        { id: 'trans-1', type: 'transition', transitionType: 'DISSOLVE TO:' },
        { id: 'sh-2', type: 'scene-heading', locationId: 'loc-office', content: 'INT. OFFICE - DAY' },
        { id: 'dlg-3', type: 'dialogue', characterId: 'marcus', lines: ['It is over.'] },
      ],
      previsualizationPlan: {
        shots: [
          { id: 'ps-1', cameraMovement: 'CRANE', frameSize: 'WIDE', durationSeconds: 5 },
          { id: 'ps-2', cameraMovement: 'STATIC', frameSize: 'CLOSE-UP', durationSeconds: 3 },
        ],
      },
      characters: [
        { id: 'marcus', name: 'Marcus Reed', displayName: 'MARCUS' },
        { id: 'elena', name: 'Elena Voss', displayName: 'ELENA' },
      ],
      locations: [
        { id: 'loc-bridge', name: 'City Bridge' },
        { id: 'loc-office', name: 'Downtown Office' },
      ],
      metadata: { title: 'The Last Crossing', logline: 'A story of redemption', genre: 'Thriller' },
      processedSections: [
        { id: 'act-1', type: 'act', title: 'Act One' },
      ],
    });

    expect(plan.version).toBe('1.0');
    expect(plan.kenBurns).toHaveLength(2);
    expect(plan.captions).toHaveLength(3); // 3 dialogue elements
    expect(plan.lowerThirds.filter((lt: any) => lt.type === 'character')).toHaveLength(2); // marcus, elena
    expect(plan.lowerThirds.filter((lt: any) => lt.type === 'location')).toHaveLength(2); // bridge, office
    expect(plan.titleCards.find((tc: any) => tc.type === 'main-title')).toBeDefined();
    expect(plan.titleCards.filter((tc: any) => tc.type === 'scene-transition')).toHaveLength(2);
    expect(plan.titleCards.filter((tc: any) => tc.type === 'chapter')).toHaveLength(1);
    expect(plan.transitions).toHaveLength(1);
    // thriller -> grain + vignette
    expect(plan.effects).toHaveLength(2);
  });

  // ── 12. Video generation specs ──────────────────────────────────────
  it('should generate videoSpecs from previs shots', async () => {
    const result = await run({
      previsualizationPlan: {
        shots: [
          { id: 'shot-1', cameraMovement: 'PAN', frameSize: 'WIDE', durationSeconds: 4 },
          { id: 'shot-2', cameraMovement: 'DOLLY', frameSize: 'CLOSE-UP', durationSeconds: 5 },
          { id: 'shot-3', cameraMovement: 'STATIC', frameSize: 'MEDIUM' },
        ],
      },
    });

    expect(result.videoSpecs).toHaveLength(3);

    const spec0 = result.videoSpecs[0];
    expect(spec0.shotElementId).toBe('shot-1');
    expect(spec0.approach).toBe('ken-burns');
    expect(spec0.cameraMovement).toBe('PAN');
    expect(spec0.frameSize).toBe('WIDE');
    expect(spec0.durationSeconds).toBe(4);
    expect(spec0.hasExistingVideo).toBe(false);

    const spec1 = result.videoSpecs[1];
    expect(spec1.cameraMovement).toBe('DOLLY');
    expect(spec1.frameSize).toBe('CLOSE-UP');
    expect(spec1.durationSeconds).toBe(5);

    // Default duration when not specified
    const spec2 = result.videoSpecs[2];
    expect(spec2.durationSeconds).toBe(6);
  });

  it('should return empty videoSpecs when no shots exist', async () => {
    const result = await run({});
    expect(result.videoSpecs).toEqual([]);
  });
});
