/**
 * ScreenplayView — Renders screenplay data grouped by scene.
 * Each scene contains its own dialogue, actions, shots, and character list.
 * Uses project.scenes[] (computed by buildScenes) as the data source.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePipeline, ImageZoom } from './sdk';
import type { Character, Location, SceneData, SceneShot, SceneDialogue, PrevisGeneration, Element } from './sdk';
import { DialogueAudioProvider, useDialogueAudio } from './DialogueAudioContext';

// ── Aspect Ratio Options ─────────────────────────────────────

const ASPECT_RATIOS = ['9:16', '2.39:1', '21:9', '4:3', '1:1', '16:9'] as const;
type AspectRatio = typeof ASPECT_RATIOS[number];

const ASPECT_LABELS: Record<string, string> = {
  '9:16': '9:16 (Vertical)',
  '2.39:1': '2.39:1 (Scope)',
  '21:9': '21:9 (Ultra)',
  '4:3': '4:3 (Classic)',
  '1:1': '1:1 (Square)',
  '16:9': '16:9 (Horizontal)',
};

// Inject spinner keyframe once
if (typeof document !== 'undefined' && !document.getElementById('previs-spinner-css')) {
  const style = document.createElement('style');
  style.id = 'previs-spinner-css';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

// ── Character color hash ─────────────────────────────────────

function charColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#f472b6','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#38bdf8','#a3e635','#e879f9','#fb923c'];
  return colors[Math.abs(hash) % colors.length];
}

// ── Scene Strip ──────────────────────────────────────────────

function SceneStrip({ scenes, activeScene, onSelect }: {
  scenes: { id: string; title: string; actTitle?: string }[];
  activeScene: string | null;
  onSelect: (id: string) => void;
}) {
  let lastAct = '';
  return (
    <div role="tablist" aria-label="Scenes" className="flex overflow-x-auto gap-1 py-2 px-1 bg-[#0c0e14] border-b border-[#1e2130]" style={{ scrollbarWidth: 'thin', alignItems: 'center' }}>
      {scenes.map((s, idx) => {
        const showActLabel = s.actTitle && s.actTitle !== lastAct;
        if (s.actTitle) lastAct = s.actTitle;
        return (
          <React.Fragment key={s.id}>
            {showActLabel && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase',
                letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
                padding: '2px 6px', marginLeft: idx > 0 ? 8 : 0,
                borderLeft: idx > 0 ? '1px solid rgba(139,92,246,0.2)' : 'none',
                paddingLeft: idx > 0 ? 12 : 6,
              }}>
                {s.actTitle}
              </span>
            )}
            <button
              role="tab"
              aria-selected={activeScene === s.id}
              onClick={() => onSelect(s.id)}
              className={`px-3 py-1 rounded text-[11px] whitespace-nowrap flex-shrink-0 transition-all ${
                activeScene === s.id
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-white/[0.02] text-slate-500 border border-transparent hover:bg-white/[0.04] hover:text-slate-300'
              }`}
            >
              {s.title.length > 20 ? s.title.substring(0, 20) + '...' : s.title}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Shot detection regex (must match fountainParser.ts) ─────

const SHOT_PATTERN = /^(WIDE SHOT|MEDIUM SHOT|CLOSE-UP|EXTREME CLOSE-UP|TWO SHOT|INSERT|ANGLE ON|POV|TRACKING SHOT|ESTABLISHING SHOT|AERIAL SHOT|MEDIUM CLOSE-UP)\s*[—–-]\s*(.*)/i;

// ── Editable Action Block ────────────────────────────────────

function EditableAction({ element, onSave }: { element: Element; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(element.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    if (text !== element.content) onSave(text);
  };

  if (editing) {
    return (
      <div className="my-2 px-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Escape') { setText(element.content || ''); setEditing(false); } }}
          className="w-full text-sm text-slate-300 leading-relaxed bg-transparent border border-indigo-500/30 rounded px-2 py-1 outline-none resize-none"
          style={{ minHeight: 28 }}
        />
      </div>
    );
  }

  return (
    <div className="my-2 px-4 group/action cursor-text" onClick={() => setEditing(true)}>
      <p className="text-sm text-slate-400 leading-relaxed group-hover/action:text-slate-300 transition-colors">
        {element.content || <span className="italic text-slate-600">Click to add description...</span>}
      </p>
    </div>
  );
}

// ── Drop Zone indicator ─────────────────────────────────────

function DropZone({ onDrop, label }: { onDrop: () => void; label?: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(); }}
      style={{
        height: over ? 32 : 4,
        margin: '0 16px',
        borderRadius: 4,
        background: over ? 'rgba(99,102,241,0.15)' : 'transparent',
        border: over ? '2px dashed rgba(99,102,241,0.4)' : '2px dashed transparent',
        transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {over && <span style={{ fontSize: 10, color: '#818cf8' }}>{label || 'Drop here'}</span>}
    </div>
  );
}

// ── Paste Zone (click-to-paste target, always visible when a shot is cut) ──

function PasteZone({ onPaste, label }: { onPaste: () => void; label?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onPaste}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 28,
        margin: '2px 16px',
        borderRadius: 4,
        background: hovered ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.04)',
        border: `1px dashed ${hovered ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.2)'}`,
        transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 10, color: hovered ? '#fbbf24' : '#b45309', fontWeight: 500 }}>
        {label || '📋 Paste here'}
      </span>
    </div>
  );
}

// ── Scene Elements (in document order, with editing & drag) ──

function SceneElements({ scene, charMap, pipelineId, globalAspectRatio }: { scene: SceneData; charMap: Record<string, Character>; pipelineId: string; globalAspectRatio?: string }) {
  const pipeline = usePipeline();
  const { project, updateElement, updateProject } = pipeline;
  const elements = project?.elements || [];
  const [dragElemId, setDragElemId] = useState<string | null>(null);
  const [generatingSet, setGeneratingSet] = useState<Set<string>>(new Set());

  // Handle previs generation for a specific shot
  const handleGeneratePrevis = useCallback(async (shotId: string) => {
    setGeneratingSet(prev => new Set(prev).add(shotId));
    try {
      const shotObj = scene.shots.find(s => s.id === shotId);
      const ratio = shotObj?.aspectRatio || globalAspectRatio || '9:16';
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-previs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elementId: shotId,
          sceneId: scene.id,
          sceneLocation: scene.location,
          sceneLocationId: scene.locationId,
          aspectRatio: ratio,
        }),
      });
      await pipeline.reload();
    } catch (err) {
      console.error('Previs generation failed:', err);
    }
    setGeneratingSet(prev => { const next = new Set(prev); next.delete(shotId); return next; });
  }, [pipelineId, scene, globalAspectRatio, pipeline]);

  // Build a map of element ID → SceneShot for inline previs rendering
  const shotMap = useMemo(() => {
    const map: Record<string, SceneShot> = {};
    for (const shot of scene.shots) {
      map[shot.id] = shot;
    }
    return map;
  }, [scene.shots]);

  // Build map of afterElementId → shots to render after that element
  const shotsAfterElement = useMemo(() => {
    const map: Record<string, SceneShot[]> = {};
    for (const shot of scene.shots) {
      const anchor = (shot as any).afterElementId;
      if (anchor) {
        if (!map[anchor]) map[anchor] = [];
        map[anchor].push(shot);
      }
    }
    return map;
  }, [scene.shots]);

  // Track which shots were rendered inline (to avoid duplicating in Camera Shots section)
  const renderedShotIds = useRef(new Set<string>());
  renderedShotIds.current.clear();

  // Move element: remove from current position, insert before target
  const moveElementBefore = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId || !project?.elements) return;
    const elems = [...project.elements];
    const srcIdx = elems.findIndex(e => e.id === sourceId);
    if (srcIdx < 0) return;
    const [moved] = elems.splice(srcIdx, 1);
    const tgtIdx = elems.findIndex(e => e.id === targetId);
    if (tgtIdx < 0) { elems.push(moved); } else { elems.splice(tgtIdx, 0, moved); }
    updateProject({ elements: elems });
  }, [project?.elements, updateProject]);

  // Move element to end of scene
  const moveElementToEnd = useCallback((sourceId: string) => {
    if (!project?.elements || !scene.elementRange) return;
    const elems = [...project.elements];
    const srcIdx = elems.findIndex(e => e.id === sourceId);
    if (srcIdx < 0) return;
    const [moved] = elems.splice(srcIdx, 1);
    // Insert at the end of the scene's element range (adjusted for removal)
    const endIdx = Math.min(scene.elementRange[1] - (srcIdx < scene.elementRange[1] ? 1 : 0), elems.length);
    elems.splice(endIdx, 0, moved);
    updateProject({ elements: elems });
  }, [project?.elements, scene.elementRange, updateProject]);

  // Split dialogue at a given line index
  const splitDialogue = useCallback((elemId: string, splitAfterLine: number) => {
    if (!project?.elements) return;
    const elems = [...project.elements];
    const idx = elems.findIndex(e => e.id === elemId);
    if (idx < 0) return;
    const orig = elems[idx];
    if (!orig.lines || orig.lines.length <= 1) return;

    const firstLines = orig.lines.slice(0, splitAfterLine + 1);
    const secondLines = orig.lines.slice(splitAfterLine + 1);
    if (secondLines.length === 0) return;

    // Update original element with first portion
    elems[idx] = { ...orig, lines: firstLines, content: firstLines.join('\n') };

    // Create new element for second portion
    const newElem: Element = {
      id: orig.id + '_split_' + Date.now().toString(36),
      type: 'dialogue',
      content: secondLines.join('\n'),
      characterName: orig.characterName,
      characterId: orig.characterId,
      lines: secondLines,
      modifiers: orig.modifiers,
    };
    elems.splice(idx + 1, 0, newElem);
    updateProject({ elements: elems });
  }, [project?.elements, updateProject]);

  // Save action text
  const handleSaveAction = useCallback((elemId: string, newText: string) => {
    updateElement(elemId, { content: newText });
  }, [updateElement]);

  // Save dialogue lines
  const handleSaveDialogue = useCallback((elemId: string, newLines: string[]) => {
    updateElement(elemId, { lines: newLines, content: newLines.join('\n') });
  }, [updateElement]);

  // Add new action/description element after a given element
  const addActionAfter = useCallback((afterElemId: string) => {
    if (!project?.elements) return;
    const elems = [...project.elements];
    const idx = elems.findIndex(e => e.id === afterElemId);
    const newElem: Element = {
      id: 'action_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'action',
      content: '',
    };
    elems.splice(idx + 1, 0, newElem);
    updateProject({ elements: elems });
  }, [project?.elements, updateProject]);

  // Save shot duration to scene.shots[]
  const handleShotDuration = useCallback((shotId: string, seconds: number) => {
    if (!project?.scenes) return;
    const newScenes = project.scenes.map(sc => {
      if (sc.id !== scene.id) return sc;
      return {
        ...sc,
        shots: sc.shots.map(s => s.id === shotId ? { ...s, duration: seconds > 0 ? seconds : undefined } : s),
      };
    });
    updateProject({ scenes: newScenes });
  }, [project?.scenes, scene.id, updateProject]);

  // Save per-shot aspect ratio
  const handleShotAspectRatio = useCallback((shotId: string, aspectRatio: string) => {
    if (!project?.scenes) return;
    const newScenes = project.scenes.map(sc => {
      if (sc.id !== scene.id) return sc;
      return {
        ...sc,
        shots: sc.shots.map(s => s.id === shotId ? { ...s, aspectRatio: aspectRatio || undefined } : s),
      };
    });
    updateProject({ scenes: newScenes });
  }, [project?.scenes, scene.id, updateProject]);

  // If we have elementRange, render elements in their natural order
  if (scene.elementRange) {
    const [start, end] = scene.elementRange;
    const sceneElems: Element[] = [];
    for (let i = start; i < Math.min(end, elements.length); i++) {
      const elem = elements[i];
      if (elem && elem.type !== 'scene-heading') sceneElems.push(elem);
    }

    // Helper to render anchored shots after an element
    const renderAnchoredShots = (elemId: string) => {
      const anchored = shotsAfterElement[elemId];
      if (!anchored || anchored.length === 0) return null;
      return anchored.map(shot => {
        renderedShotIds.current.add(shot.id);
        let previsImgPath = shot.previsPath;
        if (shot.generations && shot.generations.length > 0) {
          const selected = shot.selectedGenerationId
            ? shot.generations.find(g => g.id === shot.selectedGenerationId)
            : shot.generations[shot.generations.length - 1];
          if (selected?.filePath) previsImgPath = selected.filePath;
        }
        return (
          <div key={shot.id}>
            <InlineShotCard
              shotType={shot.shotType}
              description={shot.description}
              previsPath={previsImgPath}
              characters={shot.characterIds?.map(cid => charMap[cid]).filter(Boolean) || []}
              duration={shot.duration}
              onDurationChange={(sec) => handleShotDuration(shot.id, sec)}
              shot={shot}
              pipelineId={pipelineId}
              onRegenerate={() => handleGeneratePrevis(shot.id)}
              isGenerating={generatingSet.has(shot.id)}
              globalAspectRatio={globalAspectRatio}
              onAspectRatioChange={(ar) => handleShotAspectRatio(shot.id, ar)}
            />
          </div>
        );
      });
    };

    if (sceneElems.length > 0) {
      return (
        <>
          {sceneElems.map((elem, i) => {
            const isDragging = dragElemId === elem.id;

            if (elem.type === 'dialogue') {
              const dlg: SceneDialogue = {
                elementId: elem.id,
                characterId: elem.characterId || '',
                characterName: elem.characterName || 'UNKNOWN',
                lines: elem.lines || [elem.content],
                modifiers: elem.modifiers,
              };
              return (
                <React.Fragment key={elem.id || `elem-${i}`}>
                  {dragElemId && <DropZone onDrop={() => { moveElementBefore(dragElemId, elem.id); setDragElemId(null); }} />}
                  <DialogueBlock
                    dialogue={dlg}
                    character={charMap[elem.characterId || '']}
                    pipelineId={pipelineId}
                    onSaveLines={(lines) => handleSaveDialogue(elem.id, lines)}
                    onSplit={(lineIdx) => splitDialogue(elem.id, lineIdx)}
                    onAddActionAfter={() => addActionAfter(elem.id)}
                    draggable
                    onDragStart={() => setDragElemId(elem.id)}
                    onDragEnd={() => setDragElemId(null)}
                    isDragging={isDragging}
                  />
                  {renderAnchoredShots(elem.id)}
                </React.Fragment>
              );
            } else if (elem.type === 'action' || elem.type === 'transition') {
              // Check if this action is a shot description
              const shotMatch = elem.content?.match(SHOT_PATTERN);
              const linkedShot = shotMap[elem.id];

              if (shotMatch || linkedShot) {
                renderedShotIds.current.add(elem.id);
                const shotType = shotMatch ? shotMatch[1].toUpperCase() : linkedShot?.shotType || '';
                const description = shotMatch ? shotMatch[2] : linkedShot?.description || elem.content;
                const previsPath = linkedShot?.previsPath;
                const generations = linkedShot?.generations;
                const selectedGen = linkedShot?.selectedGenerationId;

                let previsImgPath = previsPath;
                if (generations && generations.length > 0) {
                  const selected = selectedGen
                    ? generations.find(g => g.id === selectedGen)
                    : generations[generations.length - 1];
                  if (selected?.filePath) previsImgPath = selected.filePath;
                }

                return (
                  <React.Fragment key={elem.id || `elem-${i}`}>
                    {dragElemId && <DropZone onDrop={() => { moveElementBefore(dragElemId, elem.id); setDragElemId(null); }} />}
                    <div
                      draggable
                      onDragStart={() => setDragElemId(elem.id)}
                      onDragEnd={() => setDragElemId(null)}
                      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab' }}
                    >
                      <InlineShotCard
                        shotType={shotType}
                        description={description}
                        previsPath={previsImgPath}
                        characters={linkedShot?.characterIds?.map(cid => charMap[cid]).filter(Boolean) || []}
                        duration={linkedShot?.duration}
                        onDurationChange={linkedShot ? (sec) => handleShotDuration(linkedShot.id, sec) : undefined}
                        shot={linkedShot}
                        pipelineId={pipelineId}
                        onRegenerate={linkedShot ? () => handleGeneratePrevis(linkedShot.id) : undefined}
                        isGenerating={generatingSet.has(elem.id) || (linkedShot ? generatingSet.has(linkedShot.id) : false)}
                        globalAspectRatio={globalAspectRatio}
                        onAspectRatioChange={linkedShot ? (ar) => handleShotAspectRatio(linkedShot.id, ar) : undefined}
                      />
                    </div>
                    {renderAnchoredShots(elem.id)}
                  </React.Fragment>
                );
              }

              // Regular action/transition — editable
              return (
                <React.Fragment key={elem.id || `elem-${i}`}>
                  {dragElemId && <DropZone onDrop={() => { moveElementBefore(dragElemId, elem.id); setDragElemId(null); }} />}
                  <EditableAction element={elem} onSave={(text) => handleSaveAction(elem.id, text)} />
                  {renderAnchoredShots(elem.id)}
                </React.Fragment>
              );
            }
            return null;
          })}
          {/* Final drop zone at end of scene */}
          {dragElemId && <DropZone onDrop={() => { moveElementToEnd(dragElemId); setDragElemId(null); }} label="Drop at end" />}
        </>
      );
    }
  }

  // Fallback: render actions then dialogue (old behavior for scenes without elementRange)
  return (
    <>
      {scene.actions.map((text, i) => (
        <div key={`action-${i}`} className="my-2 px-4">
          <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
        </div>
      ))}
      {scene.dialogue.map((d, i) => (
        <DialogueBlock key={d.elementId || `dlg-${i}`} dialogue={d} character={charMap[d.characterId]} pipelineId={pipelineId} />
      ))}
    </>
  );
}

// ── Inline Shot Card ────────────────────────────────────────

function InlineShotCard({ shotType, description, previsPath, characters, duration, onDurationChange, shot, pipelineId, onRegenerate, isGenerating, globalAspectRatio, onAspectRatioChange }: {
  shotType: string;
  description: string;
  previsPath?: string;
  characters: Character[];
  duration?: number;
  onDurationChange?: (seconds: number) => void;
  shot?: SceneShot;
  pipelineId?: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
  globalAspectRatio?: string;
  onAspectRatioChange?: (aspectRatio: string) => void;
}) {
  const pipeline = usePipeline();
  const [showGallery, setShowGallery] = useState(false);
  const genCount = shot?.generations?.length || 0;

  const handleSelectGeneration = async (generationId: string) => {
    if (!pipelineId || !shot) return;
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/select-previs-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId: shot.id, generationId }),
      });
      await pipeline.reload();
    } catch (err) {
      console.error('Select generation failed:', err);
    }
    setShowGallery(false);
  };
  const shotTypeColors: Record<string, string> = {
    'WIDE SHOT': '#3b82f6',
    'ESTABLISHING SHOT': '#3b82f6',
    'AERIAL SHOT': '#3b82f6',
    'MEDIUM SHOT': '#8b5cf6',
    'MEDIUM CLOSE-UP': '#8b5cf6',
    'TWO SHOT': '#8b5cf6',
    'CLOSE-UP': '#ec4899',
    'EXTREME CLOSE-UP': '#ef4444',
    'INSERT': '#f59e0b',
    'POV': '#10b981',
    'TRACKING SHOT': '#06b6d4',
    'ANGLE ON': '#6366f1',
  };
  const color = shotTypeColors[shotType] || '#6366f1';

  return (
    <>
      <div style={{
        margin: '8px 16px', borderRadius: 8, overflow: 'hidden',
        border: `1px solid ${color}25`,
        background: `linear-gradient(135deg, ${color}08, ${color}04)`,
        opacity: isGenerating ? 0.7 : 1, transition: 'opacity 0.2s',
      }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {/* Previs image or generating placeholder */}
          {(previsPath || isGenerating) && (
            <div style={{ width: 140, flexShrink: 0, position: 'relative' }}>
              {previsPath ? (
                <ImageZoom
                  src={`/api/file?path=${encodeURIComponent(previsPath)}`}
                  alt={description}
                  style={{ width: '100%', height: '100%', minHeight: 80, objectFit: 'cover', opacity: isGenerating ? 0.4 : 1 }}
                />
              ) : (
                <div style={{
                  width: '100%', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(139,92,246,0.08)',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa',
                    animation: 'spin 1s linear infinite',
                  }} />
                </div>
              )}
              {/* Generation count badge */}
              {genCount > 1 && !isGenerating && (
                <button
                  onClick={e => { e.stopPropagation(); setShowGallery(true); }}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(139,92,246,0.9)', color: '#fff',
                    fontSize: 9, fontWeight: 700, borderRadius: 8,
                    padding: '1px 6px', minWidth: 18, textAlign: 'center',
                    border: 'none', cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  }}
                  title={`${genCount} versions — click to browse`}
                >
                  {genCount}
                </button>
              )}
              {isGenerating && previsPath && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.3)',
                }}>
                  <span style={{ fontSize: 10, color: '#c4b5fd', fontWeight: 500 }}>Generating...</span>
                </div>
              )}
            </div>
          )}

          {/* Shot info */}
          <div style={{ flex: 1, padding: '8px 12px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                padding: '2px 6px', borderRadius: 3,
                background: `${color}20`, color, textTransform: 'uppercase',
              }}>
                {shotType}
              </span>
              {characters.length > 0 && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {characters.slice(0, 3).map(c => (
                    c.imagePath ? (
                      <img
                        key={c.id}
                        src={`/api/file?path=${encodeURIComponent(c.imagePath)}`}
                        alt={c.name}
                        style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                    ) : (
                      <span key={c.id} style={{
                        width: 18, height: 18, borderRadius: '50%', fontSize: 8,
                        background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#94a3b8',
                      }}>
                        {(c.name || '?').charAt(0)}
                      </span>
                    )
                  ))}
                </div>
              )}
              {/* Spacer */}
              <div style={{ flex: 1 }} />
              {/* Regen button */}
              {onRegenerate && !isGenerating && (
                <button
                  onClick={e => { e.stopPropagation(); onRegenerate(); }}
                  style={{
                    fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                    background: previsPath ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.15)',
                    border: `1px solid rgba(139,92,246,${previsPath ? '0.15' : '0.3'})`,
                    color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                  title={previsPath ? 'Generate another version' : 'Generate previs image'}
                >
                  {previsPath ? '🔄 Regen' : '🎬 Generate'}
                </button>
              )}
              {isGenerating && (
                <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 500 }}>⏳...</span>
              )}
              {/* Gallery button */}
              {genCount > 1 && !isGenerating && (
                <button
                  onClick={e => { e.stopPropagation(); setShowGallery(true); }}
                  style={{
                    fontSize: 10, color: '#7c3aed', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline',
                  }}
                >
                  {genCount} versions
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              {description}
            </p>
            {/* Duration + Aspect Ratio row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {/* Duration input */}
              {onDurationChange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 9, color: '#64748b' }}>Duration:</span>
                  <input
                    type="number"
                    min={0.5}
                    max={300}
                    step={0.5}
                    value={duration ?? ''}
                    placeholder="auto"
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (v > 0 && isFinite(v)) onDurationChange(v);
                    }}
                    style={{
                      width: 52, padding: '2px 4px', borderRadius: 4, fontSize: 10,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#e2e8f0', textAlign: 'center', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 9, color: '#64748b' }}>sec</span>
                  {duration && (
                    <button
                      onClick={() => onDurationChange(0)}
                      style={{ fontSize: 8, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                      title="Reset to auto"
                    >✕</button>
                  )}
                </div>
              )}
              {/* Aspect ratio selector */}
              {shot && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 9, color: '#64748b' }}>Ratio:</span>
                  <select
                    value={shot.aspectRatio || ''}
                    onChange={e => onAspectRatioChange?.(e.target.value)}
                    title={`Aspect ratio: ${shot.aspectRatio || globalAspectRatio || '9:16'}${!shot.aspectRatio ? ' (global)' : ''}`}
                    style={{
                      fontSize: 10, padding: '2px 4px', borderRadius: 4, cursor: 'pointer',
                      background: shot.aspectRatio ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${shot.aspectRatio ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      color: shot.aspectRatio ? '#c4b5fd' : '#94a3b8',
                      outline: 'none',
                    }}
                  >
                    <option value="">⬜ {globalAspectRatio || '9:16'} (global)</option>
                    {ASPECT_RATIOS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Gallery modal */}
      {showGallery && shot && genCount > 0 && pipelineId && (
        <PrevisGalleryModal
          shot={shot}
          pipelineId={pipelineId}
          onClose={() => setShowGallery(false)}
          onSelect={handleSelectGeneration}
        />
      )}
    </>
  );
}

// ── Dialogue Block ───────────────────────────────────────────

function DialogueBlock({ dialogue, character, pipelineId, onAudioGenerated, onSaveLines, onSplit, onAddActionAfter, draggable: isDraggable, onDragStart, onDragEnd, isDragging }: {
  dialogue: SceneDialogue;
  character?: Character;
  pipelineId?: string;
  onAudioGenerated?: () => void;
  onSaveLines?: (lines: string[]) => void;
  onSplit?: (afterLineIdx: number) => void;
  onAddActionAfter?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const { audioPaths, generatingIds: ctxGenerating, generateAudio } = useDialogueAudio();
  const name = dialogue.characterName || 'UNKNOWN';
  const color = charColor(name);
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<string[]>(dialogue.lines);
  const [showMenu, setShowMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generating = ctxGenerating[dialogue.elementId] || false;
  const resolvedAudioPath = audioPaths[dialogue.elementId] || null;
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Start editing
  const startEditing = useCallback(() => {
    setEditLines([...dialogue.lines]);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [dialogue.lines]);

  // Save editing
  const saveEditing = useCallback(() => {
    setEditing(false);
    if (onSaveLines && JSON.stringify(editLines) !== JSON.stringify(dialogue.lines)) {
      onSaveLines(editLines);
    }
  }, [editLines, dialogue.lines, onSaveLines]);

  // Check if voice is assigned
  const voiceBinding = useMemo(() => {
    const bindings = (window as any).appBindings;
    if (!bindings?.bindings || !dialogue.characterId) return null;
    for (const b of bindings.bindings) {
      if (b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId === dialogue.characterId) {
        return {
          voiceId: b.target?.entityId,
          voiceName: (b.metadata?.voiceName as string) || 'Assigned',
        };
      }
    }
    return null;
  }, [dialogue.characterId]);

  const handleGenerateAudio = useCallback(async () => {
    if (!voiceBinding?.voiceId) return;
    const text = dialogue.lines.join(' ');
    if (!text.trim()) return;

    await generateAudio({
      elementId: dialogue.elementId,
      text,
      voiceId: voiceBinding.voiceId,
      characterName: dialogue.characterName,
      characterId: dialogue.characterId,
    });
    onAudioGenerated?.();
  }, [voiceBinding, dialogue, generateAudio, onAudioGenerated]);

  const handlePlayAudio = useCallback(() => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (!resolvedAudioPath) return;
    const audio = new Audio('/api/file?path=' + encodeURIComponent(resolvedAudioPath));
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => { setPlaying(false); audioRef.current = null; };
    audio.onerror = () => { setPlaying(false); audioRef.current = null; };
    audio.play().catch(() => { setPlaying(false); audioRef.current = null; });
  }, [resolvedAudioPath, playing]);

  return (
    <div
      className="my-3 ml-16 group"
      style={{ position: 'relative', opacity: isDragging ? 0.4 : 1 }}
      draggable={isDraggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragEnd={() => onDragEnd?.()}
    >
      {/* Drag handle + character header */}
      <div className="flex items-center gap-2 mb-0.5" style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
        {isDraggable && (
          <span style={{ cursor: 'grab', color: '#475569', fontSize: 10, marginRight: -4 }} title="Drag to reorder">⠿</span>
        )}
        {character?.imagePath && (
          <ImageZoom
            src={`/api/file?path=${encodeURIComponent(character.imagePath)}`}
            className="w-6 h-6 rounded-full object-cover border border-white/10 flex-shrink-0"
            alt={character.name}
          />
        )}
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
          {name}
        </span>
        {dialogue.modifiers && dialogue.modifiers.length > 0 && (
          <span className="text-[10px] text-slate-500 italic">
            ({dialogue.modifiers.join(', ')})
          </span>
        )}
        {/* Action buttons */}
        <span style={{ display: 'inline-flex', gap: 3, marginLeft: 'auto', alignItems: 'center' }}>
          {/* Context menu toggle */}
          <span style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              aria-expanded={showMenu}
              aria-haspopup="true"
              aria-label="Dialogue options"
              style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, border: 'none', background: 'rgba(255,255,255,0.04)', color: '#64748b', cursor: 'pointer' }}
            >⋯</button>
            {showMenu && (
              <div style={{
                position: 'absolute', right: 0, top: 20, zIndex: 50,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <button onClick={() => { startEditing(); setShowMenu(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'none', color: '#cbd5e1', fontSize: 11, cursor: 'pointer', borderRadius: 4 }}
                  onMouseEnter={e => (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                >✏️ Edit dialogue</button>
                {dialogue.lines.length > 1 && (
                  <button onClick={() => { onSplit?.(Math.floor(dialogue.lines.length / 2) - 1); setShowMenu(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'none', color: '#cbd5e1', fontSize: 11, cursor: 'pointer', borderRadius: 4 }}
                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                  >✂️ Split dialogue</button>
                )}
                <button onClick={() => { onAddActionAfter?.(); setShowMenu(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'none', color: '#cbd5e1', fontSize: 11, cursor: 'pointer', borderRadius: 4 }}
                  onMouseEnter={e => (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                >📝 Add description after</button>
              </div>
            )}
          </span>
          {/* Audio controls */}
          {pipelineId && (
            <>
              {resolvedAudioPath ? (
                <button
                  onClick={handlePlayAudio}
                  aria-label={playing ? 'Stop audio' : 'Play audio'}
                  aria-pressed={playing}
                  style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 9, border: 'none',
                    background: playing ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)',
                    color: playing ? '#fca5a5' : '#6ee7b7', cursor: 'pointer',
                  }}
                >
                  {playing ? '⏹ Stop' : '▶ Play'}
                </button>
              ) : null}
              {voiceBinding ? (
                <button
                  onClick={handleGenerateAudio}
                  disabled={generating}
                  aria-label={generating ? 'Generating audio' : resolvedAudioPath ? 'Regenerate audio' : 'Generate audio'}
                  aria-busy={generating}
                  style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 9, border: 'none',
                    background: generating ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.12)',
                    color: '#c4b5fd', cursor: generating ? 'wait' : 'pointer',
                    opacity: generating ? 0.6 : 1,
                  }}
                >
                  {generating ? '⏳' : resolvedAudioPath ? '🔄' : '🎙'}
                </button>
              ) : (
                <span style={{ fontSize: 8, color: '#64748b' }}>no voice</span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Dialogue lines — editable or display */}
      <div className="ml-[13px] pl-3 text-[13px] text-slate-300 leading-relaxed">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={editLines.join('\n')}
            onChange={e => setEditLines(e.target.value.split('\n'))}
            onBlur={saveEditing}
            onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); } }}
            className="w-full bg-transparent border border-indigo-500/30 rounded px-2 py-1 outline-none resize-none text-[13px] text-slate-300"
            style={{ minHeight: 40 }}
            autoFocus
          />
        ) : (
          <div onClick={onSaveLines ? startEditing : undefined} style={{ cursor: onSaveLines ? 'text' : 'default' }}>
            {dialogue.lines.map((line, i) => (
              <p key={i} className="mb-0.5">{line}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Previs Gallery Modal ─────────────────────────────────────

function PrevisGalleryModal({ shot, pipelineId, onClose, onSelect }: {
  shot: SceneShot;
  pipelineId: string;
  onClose: () => void;
  onSelect: (generationId: string) => void;
}) {
  const generations = shot.generations || [];
  const selectedId = shot.selectedGenerationId || (generations.length > 0 ? generations[generations.length - 1].id : '');

  // For <=2 images: side-by-side, each taking half width. For 3+: 2-col grid with large images.
  const count = generations.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="previs-gallery-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
    >
      {/* Header bar — compact */}
      <div
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 id="previs-gallery-title" style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>
            {shot.shotType} — {count} Generation{count !== 1 ? 's' : ''}
          </h3>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
            {shot.description?.substring(0, 200)}{(shot.description?.length || 0) > 200 ? '...' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginLeft: 16,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#94a3b8', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Image area — fills remaining space */}
      <div
        style={{
          flex: 1, overflow: 'auto', padding: 12,
          display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          alignItems: 'stretch',
          width: '100%',
          height: '100%',
        }}>
          {generations.map((gen, i) => {
            const isSelected = gen.id === selectedId;

            return (
              <div
                key={gen.id}
                onClick={() => onSelect(gen.id)}
                style={{
                  position: 'relative', borderRadius: 8, overflow: 'hidden',
                  border: isSelected ? '3px solid #a78bfa' : '3px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                  background: '#0c1018',
                  display: 'flex', flexDirection: 'column',
                  flex: '1 1 0',
                  minWidth: 0,
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,92,246,0.5)'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
              >
                <img
                  src={`/api/file?path=${encodeURIComponent(gen.filePath)}`}
                  alt={`Generation ${i + 1}`}
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 0,
                    objectFit: 'contain',
                    display: 'block',
                    background: '#0c1018',
                  }}
                />
                {/* Selected badge */}
                {isSelected && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    background: '#a78bfa', color: '#fff',
                    fontSize: 10, fontWeight: 700, borderRadius: 4,
                    padding: '3px 8px',
                  }}>
                    ✓ SELECTED
                  </div>
                )}
                {/* Generation number */}
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', color: '#e2e8f0',
                  fontSize: 10, fontWeight: 600, borderRadius: 4,
                  padding: '3px 8px',
                }}>
                  #{i + 1}
                </div>
                {/* Info bar at bottom */}
                <div style={{
                  flexShrink: 0, padding: '6px 10px',
                  background: 'rgba(0,0,0,0.4)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      {gen.generatedAt ? new Date(gen.generatedAt).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      }) : 'Unknown'}
                    </span>
                    {gen.generationModel && <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>{gen.generationModel}</span>}
                    {gen.aspectRatio && <span style={{ fontSize: 10, color: '#64748b' }}>{gen.aspectRatio}</span>}
                    {!isSelected && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a78bfa', fontWeight: 500 }}>Click to select</span>
                    )}
                  </div>
                  {gen.generationPrompt && (
                    <p style={{ margin: '4px 0 0', fontSize: 9, color: '#94a3b8', lineHeight: 1.4, wordBreak: 'break-word', maxHeight: 60, overflow: 'auto' }}>
                      {gen.generationPrompt}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Shot Block ───────────────────────────────────────────────

function ShotBlock({ shot, charMap, onGenerate, isGenerating, globalAspectRatio, onAspectRatioChange, pipelineId, draggable: isDraggable, onDragStart, onDragEnd, isDragging, isCut, onCut, onCancelCut }: {
  shot: SceneShot;
  charMap?: Record<string, Character>;
  onGenerate?: (shotId: string, aspectRatio?: string) => void;
  isGenerating?: boolean;
  globalAspectRatio?: string;
  onAspectRatioChange?: (shotId: string, aspectRatio: string) => void;
  pipelineId: string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  isCut?: boolean;
  onCut?: () => void;
  onCancelCut?: () => void;
}) {
  const pipeline = usePipeline();
  const [hovered, setHovered] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const imgPath = shot.previsPath;
  const effectiveRatio = shot.aspectRatio || globalAspectRatio || '9:16';
  const genCount = shot.generations?.length || 0;

  const handleSelectGeneration = async (generationId: string) => {
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/select-previs-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId: shot.id, generationId }),
      });
      await pipeline.reload();
    } catch (err) {
      console.error('Select generation failed:', err);
    }
    setShowGallery(false);
  };

  // Resolve referenced characters — from explicit IDs or by text-matching the description
  let refChars: Character[] = [];
  if (shot.characterIds && shot.characterIds.length > 0 && charMap) {
    refChars = shot.characterIds.map(id => charMap[id]).filter(Boolean);
  } else if (charMap && shot.description) {
    // Fallback: match character names mentioned in the description
    const desc = shot.description.toUpperCase();
    const seen = new Set<string>();
    for (const c of Object.values(charMap)) {
      if (seen.has(c.id)) continue;
      const name = (c.name || '').toUpperCase();
      const display = (c.displayName || '').toUpperCase();
      if ((name.length > 1 && desc.includes(name)) || (display.length > 1 && desc.includes(display))) {
        refChars.push(c);
        seen.add(c.id);
      }
    }
  }

  return (
    <div
      className="my-2 px-4"
      draggable={isDraggable}
      onDragStart={e => { if (onDragStart) { e.dataTransfer.effectAllowed = 'move'; onDragStart(); } }}
      onDragEnd={() => onDragEnd?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: isDraggable ? 'grab' : undefined,
        transition: 'all 0.15s',
        borderLeft: isCut ? '3px solid #a78bfa' : '3px solid transparent',
        background: isCut ? 'rgba(139,92,246,0.06)' : undefined,
        borderRadius: isCut ? 6 : undefined,
        paddingLeft: isCut ? 13 : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Previs thumbnail or loading */}
        {(imgPath || isGenerating) && (
          <div style={{ flexShrink: 0, position: 'relative' }}>
            {imgPath ? (
              <ImageZoom
                src={`/api/file?path=${encodeURIComponent(imgPath)}`}
                alt={shot.description || 'Shot'}
                style={{
                  width: 160, height: 90, objectFit: 'cover', borderRadius: 6,
                  border: '1px solid rgba(139,92,246,0.2)',
                  opacity: isGenerating ? 0.4 : 1, transition: 'opacity 0.3s',
                }}
              />
            ) : (
              <div style={{
                width: 160, height: 90, borderRadius: 6,
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa',
                  animation: 'spin 1s linear infinite',
                }} />
              </div>
            )}
            {/* Generation count badge — click to open gallery */}
            {genCount > 1 && !isGenerating && (
              <button
                onClick={e => { e.stopPropagation(); setShowGallery(true); }}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  background: 'rgba(139,92,246,0.9)', color: '#fff',
                  fontSize: 9, fontWeight: 700, borderRadius: 8,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center',
                  border: 'none', cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                }}
                title={`${genCount} versions — click to browse`}
              >
                {genCount}
              </button>
            )}
            {isGenerating && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)', borderRadius: 6,
              }}>
                <span style={{ fontSize: 10, color: '#c4b5fd', fontWeight: 500 }}>Generating...</span>
              </div>
            )}
          </div>
        )}
        {/* Shot description + character references */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, color: isGenerating ? '#c4b5fd' : '#94a3b8', lineHeight: 1.6, fontStyle: 'italic', transition: 'color 0.3s' }}>
            <span style={{ color: '#a78bfa', fontWeight: 600, fontStyle: 'normal' }}>
              {shot.shotType}
            </span>
            <span> — {shot.description}</span>
          </p>
          {/* Character references + aspect ratio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' as const }}>
            {refChars.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px 2px 2px' }}>
                {c.imagePath ? (
                  <img
                    src={`/api/file?path=${encodeURIComponent(c.imagePath)}`}
                    alt={c.name}
                    style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: 18, height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
                    <span style={{ color: '#64748b' }}>?</span>
                  </div>
                )}
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{c.displayName || c.name}</span>
              </div>
            ))}
            {/* Per-shot aspect ratio */}
            <select
              value={shot.aspectRatio || ''}
              onChange={e => onAspectRatioChange?.(shot.id, e.target.value)}
              title={`Aspect ratio: ${effectiveRatio}${!shot.aspectRatio ? ' (global)' : ''}`}
              style={{
                fontSize: 10, padding: '2px 4px', borderRadius: 4, cursor: 'pointer',
                background: shot.aspectRatio ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${shot.aspectRatio ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
                color: shot.aspectRatio ? '#c4b5fd' : '#64748b',
                marginLeft: refChars.length > 0 ? 4 : 0,
              }}
            >
              <option value="">⬜ {globalAspectRatio || '9:16'} (global)</option>
              {ASPECT_RATIOS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {/* Browse gallery button (text link, when > 0 generations) */}
            {genCount > 1 && (
              <button
                onClick={() => setShowGallery(true)}
                style={{
                  fontSize: 10, color: '#7c3aed', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, textDecoration: 'underline',
                }}
              >
                {genCount} versions
              </button>
            )}
          </div>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignItems: 'flex-end' }}>
          {onGenerate && !isGenerating && (
            <button
              onClick={() => onGenerate(shot.id, effectiveRatio)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                background: imgPath ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.12)',
                border: `1px solid rgba(139,92,246,${imgPath ? '0.15' : '0.25'})`,
                color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                opacity: hovered || !imgPath ? 1 : 0, transition: 'opacity 0.15s',
              }}
              title={imgPath ? 'Generate another version' : 'Generate previs image'}
            >
              {imgPath ? '🎬 Generate' : '🎬 Previs'}
            </button>
          )}
          {isGenerating && (
            <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 500, padding: '3px 10px' }}>
              ⏳ Generating...
            </span>
          )}
          {/* Cut / Cancel cut button */}
          {isCut ? (
            <button
              onClick={e => { e.stopPropagation(); onCancelCut?.(); }}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#fca5a5', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ✕ Cancel
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onCut?.(); }}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                color: '#fbbf24', cursor: 'pointer', whiteSpace: 'nowrap',
                opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
              }}
              title="Select this shot to move it"
            >
              ✂ Move
            </button>
          )}
        </div>
      </div>
      {/* Gallery modal */}
      {showGallery && genCount > 0 && (
        <PrevisGalleryModal
          shot={shot}
          pipelineId={pipelineId}
          onClose={() => setShowGallery(false)}
          onSelect={handleSelectGeneration}
        />
      )}
    </div>
  );
}

// ── Scene Card ───────────────────────────────────────────────

// ── Scene Dialogue Render Button ────────────────────────────

function SceneDialogueButton({ scene, pipelineId }: { scene: SceneData; pipelineId: string }) {
  const { renderScene } = useDialogueAudio();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  const handleRender = useCallback(async () => {
    const bindings = (window as any).appBindings;
    if (!bindings?.bindings) {
      if (typeof (window as any).toast === 'function') (window as any).toast('Load voice bindings first (visit Voices tab)', 'warning');
      return;
    }

    // Resolve voice for each dialogue
    const dialogWithVoice = scene.dialogue.map(d => {
      let voiceId: string | null = null;
      for (const b of bindings.bindings) {
        if (b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId === d.characterId) {
          voiceId = b.target?.entityId;
          break;
        }
      }
      return { ...d, voiceId };
    });

    const missing = dialogWithVoice.filter(d => !d.voiceId);
    if (missing.length > 0) {
      const names = [...new Set(missing.map(d => d.characterName))].join(', ');
      if (typeof (window as any).toast === 'function') (window as any).toast(`Missing voices: ${names}`, 'warning');
      return;
    }

    setGenerating(true);
    setProgress(`0/${dialogWithVoice.length}`);
    const { success, total } = await renderScene(dialogWithVoice);
    setGenerating(false);
    setProgress('');
    if (typeof (window as any).toast === 'function') {
      (window as any).toast(`${success}/${total} dialog audio rendered`, success > 0 ? 'success' : 'error');
    }
  }, [scene, renderScene]);

  return (
    <button
      onClick={handleRender}
      disabled={generating}
      aria-busy={generating}
      aria-label={generating ? `Rendering dialogue ${progress}` : `Render dialogue for ${scene.dialogue.length} lines`}
      style={{
        padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
        background: generating ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.25)',
        color: '#fbbf24', cursor: generating ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        opacity: generating ? 0.7 : 1,
      }}
    >
      {generating ? `🔄 ${progress}` : `🔊 Render Dialog (${scene.dialogue.length})`}
    </button>
  );
}

const SceneCard = React.memo(function SceneCard({ scene, charMap, locMap, pipelineId, globalAspectRatio }: {
  scene: SceneData;
  charMap: Record<string, Character>;
  locMap: Record<string, Location>;
  pipelineId: string;
  globalAspectRatio: string;
}) {
  const pipeline = usePipeline();
  const location = scene.locationId ? locMap[scene.locationId] : (scene.location ? (locMap[scene.location] || locMap[scene.location.toUpperCase()]) : null);
  const [generatingSet, setGeneratingSet] = useState<Set<string>>(new Set());
  const [genStatus, setGenStatus] = useState<string | null>(null);

  const handleGeneratePrevis = async (shotId: string, aspectRatio?: string) => {
    setGeneratingSet(prev => new Set(prev).add(shotId));
    try {
      // Find the shot to get its per-shot aspect ratio if not explicitly passed
      const shotObj = scene.shots.find(s => s.id === shotId);
      const ratio = aspectRatio || shotObj?.aspectRatio || globalAspectRatio || '9:16';
      // Send scene context along with the shot ID for better reference resolution
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-previs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elementId: shotId,
          sceneId: scene.id,
          sceneLocation: scene.location,
          sceneLocationId: scene.locationId,
          aspectRatio: ratio,
        }),
      });
      await pipeline.reload();
    } catch {}
    setGeneratingSet(prev => { const next = new Set(prev); next.delete(shotId); return next; });
  };

  // Generate shot descriptions for this scene using AI
  const handleGenerateShotDescriptions = async () => {
    setGenStatus('Generating shot descriptions...');
    try {
      const sceneText = [
        ...scene.actions,
        ...scene.dialogue.map(d => `${d.characterName}: ${d.lines.join(' ')}`),
      ].join('\n');

      const charNames = scene.characterIds
        .map(id => charMap[id]?.name)
        .filter(Boolean);

      // Build numbered element list for positional anchoring
      const elemRange = scene.elementRange;
      const numberedLines: string[] = [];
      if (elemRange && pipeline.project?.elements) {
        const [s, e] = elemRange;
        for (let i = s; i < Math.min(e, pipeline.project.elements.length); i++) {
          const el = pipeline.project.elements[i];
          if (!el) continue;
          const tag = el.type === 'dialogue' ? `[${el.characterName || 'CHAR'}]` : '';
          numberedLines.push(`#${el.id}: ${tag} ${(el.content || '').substring(0, 120)}`);
        }
      }

      const prompt = `You are a cinematographer breaking down a screenplay scene into camera shots for pre-visualization.

Scene: ${scene.title}
Location: ${scene.location}
Characters present: ${charNames.join(', ') || 'unknown'}

Scene elements (each prefixed with its ID):
${numberedLines.length > 0 ? numberedLines.join('\n') : sceneText.substring(0, 2000)}

Generate 3-6 camera shot descriptions as a JSON array. Each entry has:
- "shot": the shot type (WIDE SHOT, MEDIUM SHOT, CLOSE-UP, EXTREME CLOSE-UP, TWO SHOT, etc.)
- "description": vivid description of what the camera captures (lighting, depth, composition, character actions/emotions)
- "characters": array of character names visible in this shot (use EXACT names from the characters list above)
- "afterElementId": the element ID (e.g. "elem-38") after which this shot should appear in the screenplay. Pick the element that this shot visually covers or follows.

Rules:
- Cover the key dramatic beats of the scene
- Think cinematically — describe lighting, depth, composition
- Use ONLY character names from the list above
- Place each shot at the right moment by choosing the correct afterElementId

Return ONLY a JSON array, no markdown, no explanation.`;

      const res = await fetch('/api/chat/one-shot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();

      let shotEntries: Array<{ shot: string; description: string; characters?: string[]; afterElementId?: string }> = [];
      try {
        const match = (data.response || '').match(/\[[\s\S]*\]/);
        if (match) shotEntries = JSON.parse(match[0]);
      } catch {}

      if (shotEntries.length === 0) {
        setGenStatus('No shot descriptions generated');
        setTimeout(() => setGenStatus(null), 2000);
        return;
      }

      // Build character name→id map
      const charNameToId: Record<string, string> = {};
      for (const c of pipeline.project?.characters || []) {
        if (c.name) charNameToId[c.name.toUpperCase()] = c.id;
        if (c.displayName) charNameToId[c.displayName.toUpperCase()] = c.id;
      }

      // Create SceneShot objects with position anchoring
      const newShots: SceneShot[] = shotEntries.map((entry, i) => ({
        id: `shot_${scene.id}_${Date.now()}_${i}`,
        shotType: entry.shot,
        description: entry.description,
        characterIds: (entry.characters || [])
          .map(name => charNameToId[(name || '').toUpperCase()])
          .filter(Boolean),
        afterElementId: entry.afterElementId || undefined,
      } as SceneShot));

      // Update the scene's shots in project data
      const project = pipeline.project;
      if (project) {
        const updatedScenes = (project.scenes || []).map(s =>
          s.id === scene.id ? { ...s, shots: [...s.shots, ...newShots] } : s
        );
        const updatedProject = { ...project, scenes: updatedScenes };

        setGenStatus(`Added ${newShots.length} shots. Saving...`);
        await fetch(`/api/app/${encodeURIComponent(pipelineId)}/project`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: updatedProject }),
        });
        await pipeline.reload();
      }
      setGenStatus(null);
    } catch (err: any) {
      setGenStatus(`Error: ${err.message}`);
      setTimeout(() => setGenStatus(null), 3000);
    }
  };

  // Save per-shot aspect ratio to project data
  const handleShotAspectRatioChange = async (shotId: string, aspectRatio: string) => {
    const project = pipeline.project;
    if (!project) return;
    const updatedScenes = (project.scenes || []).map(s =>
      s.id === scene.id
        ? { ...s, shots: s.shots.map(sh => sh.id === shotId ? { ...sh, aspectRatio: aspectRatio || undefined } : sh) }
        : s
    );
    const updatedProject = { ...project, scenes: updatedScenes };
    await fetch(`/api/app/${encodeURIComponent(pipelineId)}/project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: updatedProject }),
    });
    await pipeline.reload();
  };

  // Cut/paste reorder — select a shot, scroll, then paste at new location
  const [cutShotId, setCutShotId] = useState<string | null>(null);

  // Drag-to-reorder shots
  const [dragShotId, setDragShotId] = useState<string | null>(null);

  const moveShotBefore = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const project = pipeline.project;
    if (!project) return;
    const updatedScenes = (project.scenes || []).map(s => {
      if (s.id !== scene.id) return s;
      const shots = [...s.shots];
      const srcIdx = shots.findIndex(sh => sh.id === sourceId);
      if (srcIdx < 0) return s;
      const [moved] = shots.splice(srcIdx, 1);
      const tgtIdx = shots.findIndex(sh => sh.id === targetId);
      if (tgtIdx < 0) { shots.push(moved); } else { shots.splice(tgtIdx, 0, moved); }
      return { ...s, shots };
    });
    const updatedProject = { ...project, scenes: updatedScenes };
    await fetch(`/api/app/${encodeURIComponent(pipelineId)}/project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: updatedProject }),
    });
    await pipeline.reload();
  };

  const moveShotToEnd = async (sourceId: string) => {
    const project = pipeline.project;
    if (!project) return;
    const updatedScenes = (project.scenes || []).map(s => {
      if (s.id !== scene.id) return s;
      const shots = [...s.shots];
      const srcIdx = shots.findIndex(sh => sh.id === sourceId);
      if (srcIdx < 0) return s;
      const [moved] = shots.splice(srcIdx, 1);
      shots.push(moved);
      return { ...s, shots };
    });
    const updatedProject = { ...project, scenes: updatedScenes };
    await fetch(`/api/app/${encodeURIComponent(pipelineId)}/project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: updatedProject }),
    });
    await pipeline.reload();
  };

  const hasShots = scene.shots.length > 0;

  return (
    <div className="mb-6 rounded-lg border border-white/5 bg-[#111827]/60 overflow-hidden" id={`scene-${scene.id}`}>
      {/* Location banner */}
      {location?.imagePath && (
        <div className="w-full h-[120px] overflow-hidden">
          <ImageZoom
            src={`/api/file?path=${encodeURIComponent(location.imagePath)}`}
            className="w-full h-full object-cover"
            style={{ opacity: 0.7 }}
            alt={scene.location || ''}
          />
        </div>
      )}

      {/* Previs strip — show generated previs images */}
      {scene.shots.some(s => s.previsPath) && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 12px', overflowX: 'auto', background: 'rgba(0,0,0,0.2)' }}>
          {scene.shots.filter(s => s.previsPath).map((shot, i) => (
            <ImageZoom
              key={shot.id}
              src={`/api/file?path=${encodeURIComponent(shot.previsPath!)}`}
              alt={shot.description || `Shot ${i + 1}`}
              style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid rgba(139,92,246,0.2)' }}
            />
          ))}
        </div>
      )}

      {/* Scene heading */}
      <div role="region" aria-label={scene.title} className="bg-[#1a1d2e] px-4 py-2.5 border-b border-white/5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">{scene.title}</h3>
          {scene.characterIds.length > 0 && (
            <div className="flex gap-1 mt-1">
              {scene.characterIds.slice(0, 6).map(cid => {
                const c = charMap[cid];
                return c ? (
                  <span key={cid} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-500">{c.name}</span>
                ) : null;
              })}
              {scene.characterIds.length > 6 && (
                <span className="text-[9px] px-1.5 py-0.5 text-slate-600">+{scene.characterIds.length - 6}</span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {genStatus && <span style={{ fontSize: 10, color: '#a78bfa' }}>{genStatus}</span>}
          {!genStatus && generatingSet.size > 0 && <span style={{ fontSize: 10, color: '#a78bfa' }}>⏳ {generatingSet.size} generating...</span>}
          {!genStatus && (
            <>
              <button
                onClick={handleGenerateShotDescriptions}
                style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                  color: '#c4b5fd', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                🎬 {hasShots ? 'Regen Shots' : 'Generate Shots'}
              </button>
              {hasShots && (
                <button
                  onClick={async () => {
                    setGenStatus(`Rendering ${scene.shots.length} shots...`);
                    for (let i = 0; i < scene.shots.length; i++) {
                      const s = scene.shots[i];
                      setGenStatus(`Rendering ${i + 1}/${scene.shots.length}...`);
                      await handleGeneratePrevis(s.id, s.aspectRatio || globalAspectRatio || '9:16');
                    }
                    setGenStatus(null);
                  }}
                  style={{
                    padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                    color: '#6ee7b7', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  🖼 Render Previs
                </button>
              )}
              {scene.dialogue.length > 0 && (
                <SceneDialogueButton scene={scene} pipelineId={pipelineId} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Scene content: elements in natural document order */}
      <div className="py-2">
        <SceneElements
          scene={scene}
          charMap={charMap}
          pipelineId={pipelineId}
          globalAspectRatio={globalAspectRatio}
        />

        {/* Camera Shots — only show shots that weren't rendered inline */}
        {(() => {
          // Exclude shots rendered inline: those matching element IDs or anchored via afterElementId
          const elemIds = new Set<string>();
          if (scene.elementRange && pipeline.project?.elements) {
            const [s, e] = scene.elementRange;
            for (let i = s; i < Math.min(e, pipeline.project.elements.length); i++) {
              const el = pipeline.project.elements[i];
              if (el) elemIds.add(el.id);
            }
          }
          const remainingShots = scene.shots.filter(shot =>
            !elemIds.has(shot.id) && !(shot as any).afterElementId
          );
          if (remainingShots.length === 0) return null;
          return (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="px-4 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Camera Shots</span>
              </div>
              {remainingShots.map(shot => (
                <React.Fragment key={shot.id}>
                  {dragShotId && (
                    <DropZone onDrop={() => { moveShotBefore(dragShotId, shot.id); setDragShotId(null); }} />
                  )}
                  {cutShotId && cutShotId !== shot.id && (
                    <PasteZone onPaste={() => { moveShotBefore(cutShotId, shot.id); setCutShotId(null); }} />
                  )}
                  <ShotBlock
                    shot={shot}
                    charMap={charMap}
                    onGenerate={handleGeneratePrevis}
                    isGenerating={generatingSet.has(shot.id)}
                    globalAspectRatio={globalAspectRatio}
                    onAspectRatioChange={handleShotAspectRatioChange}
                    pipelineId={pipelineId}
                    draggable
                    onDragStart={() => setDragShotId(shot.id)}
                    onDragEnd={() => setDragShotId(null)}
                    isDragging={dragShotId === shot.id}
                    isCut={cutShotId === shot.id}
                    onCut={() => setCutShotId(shot.id)}
                    onCancelCut={() => setCutShotId(null)}
                  />
                </React.Fragment>
              ))}
              {dragShotId && (
                <DropZone onDrop={() => { moveShotToEnd(dragShotId); setDragShotId(null); }} label="Drop at end" />
              )}
              {cutShotId && (
                <PasteZone onPaste={() => { moveShotToEnd(cutShotId); setCutShotId(null); }} label="📋 Paste at end" />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.scene.id === next.scene.id
    && prev.scene.shots.length === next.scene.shots.length
    && prev.scene.dialogue.length === next.scene.dialogue.length
    && prev.pipelineId === next.pipelineId
    && prev.globalAspectRatio === next.globalAspectRatio
    && JSON.stringify(prev.scene.shots.map(s => [s.aspectRatio, s.previsPath, s.generations?.length, s.selectedGenerationId]))
       === JSON.stringify(next.scene.shots.map(s => [s.aspectRatio, s.previsPath, s.generations?.length, s.selectedGenerationId]));
});

// ── Toolbar ──────────────────────────────────────────────────

function Toolbar({ projectData, onAction }: {
  projectData: any;
  onAction: (action: string) => void;
}) {
  const charCount = projectData?.characters?.length || 0;
  const locCount = projectData?.locations?.length || 0;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      <button onClick={() => onAction('show-characters')} aria-label={`Show characters (${charCount})`} className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.04] border border-white/8 text-slate-300 hover:bg-white/[0.08] transition-colors">
        👥 Characters ({charCount})
      </button>
      <button onClick={() => onAction('show-locations')} aria-label={`Show locations (${locCount})`} className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.04] border border-white/8 text-slate-300 hover:bg-white/[0.08] transition-colors">
        📍 Locations ({locCount})
      </button>
      <button onClick={() => onAction('enrich-characters')} aria-label="Enrich characters with AI" className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors">
        ✨ Enrich Characters
      </button>
      <button onClick={() => onAction('enrich-locations')} aria-label="Enrich locations with AI" className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors">
        ✨ Enrich Locations
      </button>
      <button onClick={() => onAction('generate-headshots')} aria-label="Generate character headshot images" className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors">
        🖼 Generate Headshots
      </button>
      <button onClick={() => onAction('generate-locations')} aria-label="Generate location images" className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors">
        🌍 Location Shots
      </button>
      <button onClick={() => onAction('generate-previs')} aria-label="Generate previsualization images for all shots" className="px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 transition-colors">
        🎬 Generate Previs
      </button>
      <button onClick={() => onAction('render-dialogue')} aria-label="Render audio for all dialogue" className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors">
        🔊 Render All Dialogue
      </button>
    </div>
  );
}

// ── Main ScreenplayView ──────────────────────────────────────

export function ScreenplayView() {
  return (
    <DialogueAudioProvider>
      <ScreenplayViewInner />
    </DialogueAudioProvider>
  );
}

function ScreenplayViewInner() {
  const pipeline = usePipeline();
  const { project: projectData, loading, error, pipelineId } = pipeline;
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [globalAspectRatio, setGlobalAspectRatio] = useState<string>('9:16');
  const [shotPrefix, setShotPrefix] = useState<string>(projectData?.metadata?.shotImagePromptPrefix || '');
  const [savingShotPrefix, setSavingShotPrefix] = useState(false);
  const [showShotPrefix, setShowShotPrefix] = useState(false);
  const shotPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sync prefix state when project data loads or reloads
  useEffect(() => {
    const saved = projectData?.metadata?.shotImagePromptPrefix || '';
    setShotPrefix(prev => prev || saved);
  }, [projectData?.metadata?.shotImagePromptPrefix]);

  const saveShotPrefix = useCallback(async (value: string) => {
    setSavingShotPrefix(true);
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/update-prompt-prefix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotImagePromptPrefix: value }),
      });
    } catch (err: any) {
      console.error('Failed to save shot prompt prefix:', err);
    }
    setSavingShotPrefix(false);
  }, [pipelineId]);

  const handleShotPrefixChange = useCallback((value: string) => {
    setShotPrefix(value);
    if (shotPrefixTimer.current) clearTimeout(shotPrefixTimer.current);
    shotPrefixTimer.current = setTimeout(() => saveShotPrefix(value), 800);
  }, [saveShotPrefix]);

  // Character/location lookup maps
  const charMap = useMemo(() => {
    const map: Record<string, Character> = {};
    for (const c of projectData?.characters || []) {
      map[c.id] = c;
      if (c.name) { map[c.name] = c; map[c.name.toUpperCase()] = c; }
      if (c.displayName) map[c.displayName] = c;
    }
    return map;
  }, [projectData?.characters]);

  const locMap = useMemo(() => {
    const map: Record<string, Location> = {};
    for (const l of projectData?.locations || []) {
      map[l.id] = l;
      if (l.name) { map[l.name] = l; map[l.name.toUpperCase()] = l; }
    }
    return map;
  }, [projectData?.locations]);

  // Use project.scenes directly
  const scenes = projectData?.scenes || [];

  // Handle toolbar actions
  const handleAction = useCallback(async (action: string) => {
    if (action === 'show-characters' || action === 'show-locations') {
      window.dispatchEvent(new CustomEvent('woodbury:switch-view', { detail: { view: 'data' } }));
      return;
    }

    setActionStatus(`Running: ${action}...`);
    try {
      switch (action) {
        case 'enrich-characters':
          for (const c of projectData?.characters || []) {
            if (!c.description || c.description.length < 20) {
              setActionStatus(`Enriching ${c.name}...`);
              await pipeline.enrichCharacter(c.id);
            }
          }
          break;
        case 'enrich-locations':
          for (const l of projectData?.locations || []) {
            if (!l.description || l.description.length < 20) {
              setActionStatus(`Enriching ${l.name}...`);
              await pipeline.enrichLocation(l.id);
            }
          }
          break;
        case 'generate-headshots':
          setActionStatus(`Generating headshots...`);
          await pipeline.generateCharacterImages();
          break;
        case 'generate-locations':
          setActionStatus(`Generating location shots...`);
          await pipeline.generateLocationImages();
          break;
        case 'generate-previs': {
          const allShotsWithScene = scenes.flatMap(s => s.shots.map(sh => ({ ...sh, sceneId: s.id, sceneLocation: s.location, sceneLocationId: s.locationId })));
          setActionStatus(`Generating previs for ${allShotsWithScene.length} shots...`);
          for (let i = 0; i < allShotsWithScene.length; i++) {
            const sh = allShotsWithScene[i];
            setActionStatus(`Previs ${i + 1}/${allShotsWithScene.length}...`);
            try {
              await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-previs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  elementId: sh.id,
                  sceneId: sh.sceneId,
                  sceneLocation: sh.sceneLocation,
                  sceneLocationId: sh.sceneLocationId,
                  aspectRatio: sh.aspectRatio || globalAspectRatio || '9:16',
                }),
              });
              await pipeline.reload();
            } catch {}
          }
          break;
        }
        case 'render-dialogue': {
          setActionStatus('Rendering dialogue audio...');
          const rdRes = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/render-dialogue`, { method: 'POST' });
          const rdData = await rdRes.json().catch(() => ({}));
          setActionStatus(`Rendered ${rdData.rendered || 0}/${rdData.total || 0} dialogue lines`);
          await pipeline.reload();
          setTimeout(() => setActionStatus(null), 2000);
          break;
        }
      }
      setActionStatus(null);
    } catch (err: any) {
      setActionStatus(`Error: ${err.message}`);
      setTimeout(() => setActionStatus(null), 3000);
    }
  }, [projectData, pipelineId, pipeline, scenes, globalAspectRatio]);

  const scrollToScene = useCallback((id: string) => {
    setActiveSceneId(id);
    const el = document.getElementById(`scene-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading screenplay...</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>;
  }
  if (!projectData || scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
        <p className="text-sm">No screenplay data. Import a script or run the pipeline.</p>
      </div>
    );
  }

  const title = projectData.metadata?.title || 'Untitled';
  const subtitle = projectData.metadata?.logline || '';
  const actCount = new Set(scenes.map(s => s.actTitle).filter(Boolean)).size;
  const totalShots = scenes.reduce((sum, s) => sum + s.shots.length, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 mt-1 italic">{subtitle}</p>}
        <div className="flex gap-3 mt-2 text-[11px] text-slate-500">
          {actCount > 0 && <span>{actCount} Acts</span>}
          <span>{scenes.length} Scenes</span>
          <span>{projectData.elements.length} Elements</span>
          <span>{projectData.characters.length} Characters</span>
          {totalShots > 0 && <span>{totalShots} Shots</span>}
        </div>
        {pipeline.projectFolder && (
          <div className="mt-1 text-[10px] text-indigo-400/50" title={pipeline.projectFolder}>
            📁 {pipeline.projectFolder}
          </div>
        )}
      </div>

      {/* Toolbar + Search */}
      <div className="flex-shrink-0 px-4 flex items-center gap-2">
        <div className="flex-1">
          <Toolbar projectData={projectData} onAction={handleAction} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">Ratio:</span>
          <select
            value={globalAspectRatio}
            onChange={e => setGlobalAspectRatio(e.target.value)}
            className="px-2 py-1.5 rounded-md text-xs bg-white/[0.04] border border-white/8 text-slate-300 outline-none cursor-pointer"
          >
            {ASPECT_RATIOS.map(r => (
              <option key={r} value={r}>{ASPECT_LABELS[r] || r}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search dialogue, characters, action..."
          className="w-52 px-3 py-1.5 rounded-md text-xs bg-white/[0.03] border border-white/5 text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/30"
        />
      </div>

      {/* Shot prompt prefix (collapsible) */}
      <div className="flex-shrink-0 px-4">
        <button
          onClick={() => setShowShotPrefix(!showShotPrefix)}
          aria-expanded={showShotPrefix}
          aria-label="Shot style prefix"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 10, color: '#64748b', padding: '4px 0',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{ transform: showShotPrefix ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
          Shot Style Prefix {shotPrefix ? '✓' : ''}
        </button>
        {showShotPrefix && (
          <div style={{ maxWidth: 720, marginBottom: 8 }}>
            <div className="flex items-start gap-2">
              <textarea
                value={shotPrefix}
                onChange={e => handleShotPrefixChange(e.target.value)}
                placeholder="e.g. Pixar 3D animation style, vibrant colors... (overrides default cinematic style)"
                rows={2}
                style={{
                  width: '100%', resize: 'vertical',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.5,
                  color: '#e2e8f0', outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
              {savingShotPrefix && <span style={{ fontSize: 10, color: '#475569', marginTop: 8, flexShrink: 0 }}>Saving...</span>}
            </div>
            <p style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
              Overrides the default "Cinematic previsualization frame, 35mm film..." style for all shot generation
            </p>
          </div>
        )}
      </div>

      {/* Status bar */}
      {actionStatus && (
        <div className="flex-shrink-0 px-4 py-1.5 bg-amber-500/10 border-y border-amber-500/15 text-xs text-amber-300">
          ⏳ {actionStatus}
        </div>
      )}

      {/* Scene strip */}
      <div className="flex-shrink-0">
        <SceneStrip
          scenes={scenes.map(s => ({ id: s.id, title: s.title, actTitle: s.actTitle }))}
          activeScene={activeSceneId}
          onSelect={scrollToScene}
        />
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-4 py-4">
        {(() => {
          let currentAct = '';
          const query = searchQuery.toLowerCase().trim();

          return scenes.map(scene => {
            // Filter by search query
            if (query) {
              const titleMatch = scene.title.toLowerCase().includes(query);
              const actionMatch = scene.actions.some(a => a.toLowerCase().includes(query));
              const dialogueMatch = scene.dialogue.some(d =>
                d.characterName.toLowerCase().includes(query) ||
                d.lines.some(l => l.toLowerCase().includes(query))
              );
              if (!titleMatch && !actionMatch && !dialogueMatch) return null;
            }

            const showActHeader = scene.actTitle && scene.actTitle !== currentAct;
            if (scene.actTitle) currentAct = scene.actTitle;

            return (
              <React.Fragment key={scene.id}>
                {showActHeader && (
                  <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mt-6 mb-3">
                    {scene.actTitle}
                  </h2>
                )}
                <SceneCard scene={scene} charMap={charMap} locMap={locMap} pipelineId={pipelineId} globalAspectRatio={globalAspectRatio} />
              </React.Fragment>
            );
          }).filter(Boolean);
        })()}
      </div>
    </div>
  );
}
