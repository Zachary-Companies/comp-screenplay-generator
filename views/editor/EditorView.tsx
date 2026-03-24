/**
 * EditorView — React-based StoryCut nonlinear timeline editor.
 * Complete port of the vanilla JS editor with all features:
 *  - Audio playback engine (dialog, music, sfx, ambience)
 *  - Keyframe animation system
 *  - File drag-and-drop import with server upload
 *  - Dialog audio generation
 *  - Render engine (POST to render-video)
 *  - Save modal
 *  - User clip persistence
 *  - Undo/redo
 *  - Mouse wheel zoom on preview + timeline
 *  - App sidebar collapse toggle
 *  - Keyboard shortcuts
 */
import React, {
  useReducer, useCallback, useEffect, useRef, useMemo, createContext, useContext, memo,
  useState,
  type Dispatch, type ReactNode, type MouseEvent as RMouseEvent,
} from 'react';
import { usePipeline } from './sdk';
import { useDataExtraction } from './useDataExtraction';
import {
  type EditorState, type EditorAction, type Clip, type Track, type Keyframe, type EditorScene,
  editorReducer, initialEditorState,
  formatTimecode, parseTimecodeToSeconds,
  timeToPx, pxToTime, pxPerSec,
  charColor, imgSrc, genId, getClipAtTime, evaluateKeyframes,
  primarySelectedClipId, isClipSelected,
  MEDIA_COLORS, TRACK_HEIGHT, SCENE_LANE_HEIGHT, PX_PER_SEC, KEYFRAMEABLE,
} from './editorStore';

// ── Context ──────────────────────────────────────────────────

interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  pipelineId: string;
  audioEngine: React.RefObject<AudioEngine | null>;
  persistUserClips: () => void;
  showToast: (msg: string, type?: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be inside EditorView');
  return ctx;
}

// ── Audio Engine (imperative, via ref) ────────────────────────

interface AudioEngine {
  dialogAudio: HTMLAudioElement | null;
  dialogClipId: string | null;
  musicAudio: HTMLAudioElement | null;
  musicClipId: string | null;
  stopDialog: () => void;
  stopMusic: () => void;
  stopAll: () => void;
  playDialog: (clip: Clip, dialogAudioMap: Record<string, string>, currentTime: number) => void;
  playMusic: (clip: Clip, currentTime: number) => void;
  updateMusicVolume: (clip: Clip, currentTime: number) => void;
}

function createAudioEngine(): AudioEngine {
  const engine: AudioEngine = {
    dialogAudio: null,
    dialogClipId: null,
    musicAudio: null,
    musicClipId: null,

    stopDialog() {
      if (engine.dialogAudio) {
        try { engine.dialogAudio.pause(); } catch {}
        engine.dialogAudio = null;
        engine.dialogClipId = null;
      }
    },

    stopMusic() {
      if (engine.musicAudio) {
        try { engine.musicAudio.pause(); } catch {}
        engine.musicAudio = null;
        engine.musicClipId = null;
      }
    },

    stopAll() {
      engine.stopDialog();
      engine.stopMusic();
    },

    playDialog(clip: Clip, dialogAudioMap: Record<string, string>, currentTime: number) {
      if (!clip || clip.type !== 'dialog') return;
      if (engine.dialogClipId === clip.id) return;
      engine.stopDialog();
      const audioPath = dialogAudioMap[clip.elementId || ''];
      if (!audioPath) return;
      const url = '/api/file?path=' + encodeURIComponent(audioPath);
      const audio = new Audio(url);
      const offset = currentTime - clip.startTime;
      if (offset > 0.1) audio.currentTime = offset;
      audio.play().catch(() => {});
      engine.dialogAudio = audio;
      engine.dialogClipId = clip.id;
    },

    playMusic(clip: Clip, currentTime: number) {
      if (!clip) return;
      const src = (clip as any)._objectUrl || clip.filePath;
      if (!src) return;
      if (engine.musicClipId === clip.id) return;
      engine.stopMusic();
      const url = (clip as any)._objectUrl || ('/api/file?path=' + encodeURIComponent(clip.filePath!));
      const audio = new Audio(url);
      const offset = currentTime - clip.startTime;
      if (offset > 0.1) audio.currentTime = offset;
      audio.volume = Math.min(1, (clip.volume ?? 100) / 100);
      audio.play().catch(() => {});
      engine.musicAudio = audio;
      engine.musicClipId = clip.id;
    },

    updateMusicVolume(clip: Clip, currentTime: number) {
      if (!engine.musicAudio || engine.musicClipId !== clip.id) return;
      const elapsed = currentTime - clip.startTime;
      const remaining = (clip.startTime + clip.duration) - currentTime;
      const baseVol = evaluateKeyframes(clip, 'volume', elapsed) / 100;
      let fadeMul = 1;
      const fadeInVal = evaluateKeyframes(clip, 'fadeIn', elapsed);
      const fadeOutVal = evaluateKeyframes(clip, 'fadeOut', elapsed);
      if (fadeInVal > 0 && elapsed < fadeInVal) fadeMul = Math.max(0, elapsed / fadeInVal);
      if (fadeOutVal > 0 && remaining < fadeOutVal) fadeMul = Math.min(fadeMul, Math.max(0, remaining / fadeOutVal));
      engine.musicAudio.volume = Math.min(1, Math.max(0, baseVol * fadeMul));
    },
  };
  return engine;
}

// ── Undo/Redo History ─────────────────────────────────────────

interface UndoStack {
  past: EditorState[];
  future: EditorState[];
}

// ── Toast Helper ──────────────────────────────────────────────

function showToastGlobal(msg: string, type = 'info') {
  if (typeof (window as any).toast === 'function') {
    (window as any).toast(msg, type);
  }
}

// ── Main Component ────────────────────────────────────────────

interface EditorViewProps {
  pipelineId?: string;
  appState?: any;
}

export function EditorView({ pipelineId: propPipelineId, appState: propAppState }: EditorViewProps) {
  const pipeline = usePipeline();
  const pipelineId = propPipelineId || pipeline.pipelineId;
  const project = pipeline.project;

  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Audio engine via ref (imperative, no re-renders)
  const audioEngineRef = useRef<AudioEngine>(createAudioEngine());

  // Undo/redo stack
  const undoStackRef = useRef<UndoStack>({ past: [], future: [] });
  const lastStateRef = useRef<EditorState | null>(null);

  // Track state changes for undo (throttled)
  useEffect(() => {
    if (lastStateRef.current && lastStateRef.current !== state) {
      // Only push significant changes (not time updates during playback)
      if (lastStateRef.current.clips !== state.clips ||
          lastStateRef.current.selectedClipIds !== state.selectedClipIds ||
          lastStateRef.current.userClips !== state.userClips) {
        undoStackRef.current.past.push(lastStateRef.current);
        if (undoStackRef.current.past.length > 50) undoStackRef.current.past.shift();
        undoStackRef.current.future = [];
      }
    }
    lastStateRef.current = state;
  }, [state]);

  // ── Client-side audio duration detection ──────────────────
  // When dialogue audio files exist but have no stored duration metadata,
  // probe them via HTML5 Audio to get actual durations. These get fed back
  // into useDataExtraction as `extraDurations`, causing a full re-extraction
  // with correct timing for ALL clips (dialog, subtitles, visuals, etc.).
  const [detectedDurations, setDetectedDurations] = useState<Record<string, number>>({});
  const hasDetectedRef = useRef(false);
  const backfillTriggeredRef = useRef(false);

  // Extract data from project — with detected durations fed back in
  const extracted = useDataExtraction(project, propAppState, state.fillGaps, detectedDurations, state.compactTimeline);

  // Sync extracted data into state
  const prevExtractedRef = useRef<typeof extracted | null>(null);
  useEffect(() => {
    if (extracted !== prevExtractedRef.current) {
      prevExtractedRef.current = extracted;
      dispatch({ type: 'SET_DATA', ...extracted });
    }
  }, [extracted]);

  // Playback interval via ref
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Auto-fill render output path
  useEffect(() => {
    if (!state.renderSettings.outputPath && propAppState?.nodeData) {
      for (const nid in propAppState.nodeData) {
        const out = propAppState.nodeData[nid].outputs || propAppState.nodeData[nid];
        if (out.metadata?.projectFolder) {
          dispatch({ type: 'SET_RENDER_SETTINGS', settings: { outputPath: out.metadata.projectFolder + '/renders' } });
          break;
        }
      }
    }
  }, [propAppState]);

  // Detect missing audio durations and feed them back into extraction
  useEffect(() => {
    if (hasDetectedRef.current) return;
    const { dialogAudioMap, dialogDurationMap } = state;
    // Find elements with audio but no duration
    const missing: string[] = [];
    for (const elemId of Object.keys(dialogAudioMap)) {
      if (!dialogDurationMap[elemId] && !detectedDurations[elemId]) missing.push(elemId);
    }
    if (missing.length === 0) return;
    hasDetectedRef.current = true;

    // Trigger server-side backfill to persist durations for next load
    if (pipelineId && !backfillTriggeredRef.current) {
      backfillTriggeredRef.current = true;
      fetch(`/api/app/${encodeURIComponent(pipelineId)}/backfill-audio-durations`, { method: 'POST' }).catch(() => {});
    }

    // Probe all missing durations via HTML5 Audio
    const promises = missing.map(elemId => {
      const filePath = dialogAudioMap[elemId];
      return getAudioDuration(filePath).then(dur => ({ elemId, dur }));
    });

    Promise.all(promises).then(results => {
      const newDurations: Record<string, number> = {};
      for (const { elemId, dur } of results) {
        if (dur > 0) newDurations[elemId] = dur;
      }
      if (Object.keys(newDurations).length > 0) {
        // Setting this triggers re-extraction with correct durations
        setDetectedDurations(prev => ({ ...prev, ...newDurations }));
      }
    });
  }, [state.dialogAudioMap, state.dialogDurationMap, detectedDurations, pipelineId]);

  useEffect(() => {
    if (state.playing) {
      const engine = audioEngineRef.current;
      // Start audio at playhead immediately (within user gesture chain)
      const s = stateRef.current;
      const musicClip = s.clips.find(c =>
        (c.trackId === 'music' || c.trackId === 'sfx' || c.trackId === 'ambience') &&
        s.currentTime >= c.startTime && s.currentTime < c.startTime + c.duration &&
        !s.tracks.find(t => t.id === c.trackId)?.muted
      );
      if (musicClip && (musicClip.filePath || (musicClip as any)._objectUrl)) {
        engine.playMusic(musicClip, s.currentTime);
      }
      const dialogClip = getClipAtTime(s.clips, s.currentTime, 'dialog');
      if (dialogClip) engine.playDialog(dialogClip, s.dialogAudioMap, s.currentTime);

      playIntervalRef.current = setInterval(() => {
        const s = stateRef.current;
        const newTime = s.currentTime + 1 / s.fps;
        if (newTime >= s.duration) {
          dispatch({ type: 'SET_TIME', time: 0 });
          dispatch({ type: 'STOP_PLAY' });
          engine.stopAll();
          return;
        }
        dispatch({ type: 'SET_TIME', time: newTime });

        // Audio sync
        const dialogClip = getClipAtTime(s.clips, newTime, 'dialog');
        if (dialogClip) {
          engine.playDialog(dialogClip, s.dialogAudioMap, newTime);
        } else {
          engine.stopDialog();
        }

        const musicClip = s.clips.find(c =>
          (c.trackId === 'music' || c.trackId === 'sfx' || c.trackId === 'ambience') &&
          newTime >= c.startTime && newTime < c.startTime + c.duration &&
          !s.tracks.find(t => t.id === c.trackId)?.muted
        );
        if (musicClip && (musicClip.filePath || (musicClip as any)._objectUrl)) {
          engine.playMusic(musicClip, newTime);
          engine.updateMusicVolume(musicClip, newTime);
        } else {
          engine.stopMusic();
        }
      }, 1000 / state.fps);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      audioEngineRef.current.stopAll();
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [state.playing, state.fps]);

  // Persist user clips debounced
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistUserClips = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const s = stateRef.current;
      const clipData = s.userClips.map(c => ({
        id: c.id, name: c.name, trackId: c.trackId,
        startTime: c.startTime, duration: c.duration,
        type: c.type, source: c.source, color: c.color,
        filePath: c.filePath, fileName: c.fileName,
        volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut,
        keyframes: c.keyframes || undefined,
      }));
      // Save to project metadata (persists to project.json)
      fetch(`/api/app/${encodeURIComponent(pipelineId)}/editor-clips`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: clipData }),
      }).catch(err => console.warn('[editor] Failed to persist user clips:', err));
      // Also save to legacy state endpoint for backward compat
      fetch(`/api/app/${encodeURIComponent(pipelineId)}/state/_editor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: { _editorUserClips: clipData } }),
      }).catch(() => {});
    }, 500);
  }, [pipelineId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        setSaveModalOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Undo — not easily done with useReducer, but we track history
        const stack = undoStackRef.current;
        if (stack.past.length > 0) {
          const prev = stack.past.pop()!;
          stack.future.push(stateRef.current);
          // We can't dispatch to restore full state with current reducer,
          // but we can dispatch SET_DATA with the old state's data
          dispatch({ type: 'SET_DATA', clips: prev.clips, scenes: prev.scenes, characters: prev.characters, assets: prev.assets, tracks: prev.tracks, duration: prev.duration, previsMap: prev.previsMap, dialogAudioMap: prev.dialogAudioMap, dialogDurationMap: prev.dialogDurationMap || {}, userClips: prev.userClips });
          dispatch({ type: 'SET_SELECTION', clipIds: prev.selectedClipIds || [] });
        }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' && e.shiftKey || e.key === 'y')) {
        e.preventDefault();
        const stack = undoStackRef.current;
        if (stack.future.length > 0) {
          const next = stack.future.pop()!;
          stack.past.push(stateRef.current);
          dispatch({ type: 'SET_DATA', clips: next.clips, scenes: next.scenes, characters: next.characters, assets: next.assets, tracks: next.tracks, duration: next.duration, previsMap: next.previsMap, dialogAudioMap: next.dialogAudioMap, dialogDurationMap: next.dialogDurationMap || {}, userClips: next.userClips });
          dispatch({ type: 'SET_SELECTION', clipIds: next.selectedClipIds || [] });
        }
      }
      // Select All: Cmd/Ctrl+A
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isInput) {
        e.preventDefault();
        dispatch({ type: 'SELECT_ALL' });
      }
      // Copy: Cmd/Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isInput) {
        e.preventDefault();
        dispatch({ type: 'COPY_SELECTED' });
      }
      // Cut: Cmd/Ctrl+X
      if ((e.metaKey || e.ctrlKey) && e.key === 'x' && !isInput) {
        e.preventDefault();
        dispatch({ type: 'CUT_SELECTED' });
        persistUserClips();
      }
      // Paste: Cmd/Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !isInput) {
        e.preventDefault();
        dispatch({ type: 'PASTE', atTime: stateRef.current.currentTime });
        persistUserClips();
      }
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_PLAY' });
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInput && stateRef.current.selectedClipIds.length > 0) {
          dispatch({ type: 'DELETE_SELECTED' });
          persistUserClips();
        }
      }
      if (e.key === 'Home' && !isInput) {
        dispatch({ type: 'SET_TIME', time: 0 });
      }
      if (e.key === 'End' && !isInput) {
        dispatch({ type: 'SET_TIME', time: stateRef.current.duration });
      }
      // J/K/L transport (Premiere-style)
      if (e.key === 'k' && !isInput) {
        dispatch({ type: 'STOP_PLAY' });
      }
      if (e.key === 'l' && !isInput) {
        if (!stateRef.current.playing) dispatch({ type: 'TOGGLE_PLAY' });
      }
      // Arrow keys: frame step
      if (e.key === 'ArrowLeft' && !isInput) {
        dispatch({ type: 'SET_TIME', time: stateRef.current.currentTime - 1 / stateRef.current.fps });
      }
      if (e.key === 'ArrowRight' && !isInput) {
        dispatch({ type: 'SET_TIME', time: stateRef.current.currentTime + 1 / stateRef.current.fps });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [persistUserClips]);

  // Load editor CSS
  useEffect(() => {
    const cssId = 'editor-view-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = cssId;
      link.href = `/api/app/${encodeURIComponent(pipelineId)}/view-file/editor/view.css`;
      document.head.appendChild(link);
    }
  }, [pipelineId]);

  // Load voice bindings
  useEffect(() => {
    fetch(`/api/app/${encodeURIComponent(pipelineId)}/bindings`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) (window as any).appBindings = data; })
      .catch(() => {});
  }, [pipelineId]);

  const ctx = useMemo(() => ({
    state, dispatch, pipelineId,
    audioEngine: audioEngineRef,
    persistUserClips,
    showToast: showToastGlobal,
  }), [state, dispatch, pipelineId, persistUserClips]);

  return (
    <EditorContext.Provider value={ctx}>
      <div className="ed-root">
        <EditorTopBar onSave={() => setSaveModalOpen(true)} />
        <div className="ed-workspace">
          {!state.sidebarCollapsed && <EditorSidebar />}
          <PanelToggle side="left" collapsed={state.sidebarCollapsed} onToggle={() => dispatch({ type: 'TOGGLE_SIDEBAR' })} />
          <div className="ed-center-inspector">
            <ProgramMonitor />
          </div>
          <PanelToggle side="right" collapsed={state.inspectorCollapsed} onToggle={() => dispatch({ type: 'TOGGLE_INSPECTOR' })} />
          {!state.inspectorCollapsed && <ClipInspector />}
        </div>
        <TimelineResizeHandle />
        <div className="ed-timeline-wrap" style={{ height: state.timelineHeight }}>
          <TimelinePanel />
        </div>
      </div>
      {saveModalOpen && <SaveModal onClose={() => setSaveModalOpen(false)} />}
    </EditorContext.Provider>
  );
}

// ── Top Bar ─────────────────────────────────────────────────

const EditorTopBar = memo(function EditorTopBar({ onSave }: { onSave: () => void }) {
  const { state, dispatch, showToast } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const isAudio = /^(mp3|wav|ogg|aac|flac|m4a|wma|opus)$/.test(ext);
      const isVideo = /^(mp4|mov|avi|webm|mkv)$/.test(ext);
      const trackId = isAudio ? 'music' : isVideo ? 'gen-motion' : 'visuals';
      dispatch({
        type: 'ADD_CLIP',
        clip: {
          id: genId(), trackId,
          type: isAudio ? 'music' : isVideo ? 'video' : 'image',
          name: file.name, fileName: file.name,
          startTime: state.duration - 10 + (i * 0.5),
          duration: 30, volume: 100, fadeIn: 0, fadeOut: 0,
        },
      });
    }
    showToast(`Imported ${files.length} file(s)`, 'success');
    e.target.value = '';
  }, [dispatch, state.duration, showToast]);

  return (
    <div className="ed-topbar">
      <input ref={fileInputRef} type="file" multiple accept="audio/*,video/*,image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
      <div className="ed-topbar-left">
        <div className="ed-topbar-logo">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="3" width="14" height="10" rx="2"/><path d="M5 3V1h6v2"/>
          </svg>
        </div>
        <div className="ed-topbar-project">
          <span className="ed-topbar-project-name">StoryCut</span>
          <span className="ed-topbar-sep">/</span>
          <span className="ed-topbar-sequence">{state.scenes.length > 0 ? state.scenes[0].name : 'Sequence 1'}</span>
          <button className="ed-topbar-save-btn" onClick={onSave} title="Save to project folder (⌘S)">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13 15H3a1 1 0 01-1-1V2a1 1 0 011-1h7l3 3v10a1 1 0 01-1 1z"/>
              <path d="M11 15V9H5v6"/><path d="M5 1v4h5"/>
            </svg>
            <span className="ed-save-label">Save</span>
          </button>
        </div>
      </div>

      <div className="ed-topbar-center">
        <div className="ed-transport">
          <button className={`ed-transport-btn${state.snapEnabled ? ' active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_SNAP' })} title="Snap" aria-label="Snap to grid" aria-pressed={state.snapEnabled}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1v14"/><path d="M4 5h8M4 11h8"/></svg>
          </button>
          <div className="ed-transport-divider" />
          <button className="ed-transport-btn" onClick={() => dispatch({ type: 'SET_TIME', time: 0 })} title="Skip to start" aria-label="Skip to start">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3 3h2v10H3zM7 8l7-5v10z"/></svg>
          </button>
          <button className={`ed-transport-btn ed-transport-play${state.playing ? ' playing' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_PLAY' })} title="Play/Pause (Space)" aria-label={state.playing ? 'Pause' : 'Play'} aria-pressed={state.playing}>
            {state.playing ? (
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4 2l10 6-10 6z"/></svg>
            )}
          </button>
          <button className="ed-transport-btn" onClick={() => dispatch({ type: 'SET_TIME', time: state.duration })} title="Skip to end" aria-label="Skip to end">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M11 3h2v10h-2zM2 3l7 5-7 5z"/></svg>
          </button>
          <div className="ed-transport-divider" />
          <div className="ed-timecode">{formatTimecode(state.currentTime, state.fps)}</div>
          <div className="ed-transport-divider" />
          <select className="ed-transport-select" value={state.resolution} onChange={e => dispatch({ type: 'SET_RESOLUTION', resolution: e.target.value })} aria-label="Resolution">
            {['1920x1080','3840x2160','1280x720','1080x1920'].map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="ed-transport-select" value={state.fps} onChange={e => dispatch({ type: 'SET_FPS', fps: parseInt(e.target.value) })} aria-label="Frame rate">
            {[24,25,30,60].map(f => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </div>
      </div>

      <div className="ed-topbar-right">
        <button className="ed-topbar-action" onClick={handleImport}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2v8M5 7l3 3 3-3"/><path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/>
          </svg> Import
        </button>
        <button className="ed-topbar-action ed-topbar-action--ai" onClick={() => showToast('Generate modal coming soon', 'info')}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1l2 4 4 1-3 3 1 5-4-2-4 2 1-5-3-3 4-1z"/>
          </svg> Generate
        </button>
        <button className="ed-topbar-action" onClick={() => { dispatch({ type: 'SET_SIDEBAR_TAB', tab: 'render' }); if (state.sidebarCollapsed) dispatch({ type: 'TOGGLE_SIDEBAR' }); }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/><path d="M8 10V2M5 5l3-3 3 3"/>
          </svg> Export
        </button>
      </div>
    </div>
  );
});

// ── Panel Toggle ─────────────────────────────────────────────

function PanelToggle({ side, collapsed, onToggle }: { side: 'left' | 'right'; collapsed: boolean; onToggle: () => void }) {
  const isLeft = side === 'left';
  const path = isLeft
    ? (collapsed ? 'M1 1l4 4-4 4' : 'M5 1l-4 4 4 4')
    : (collapsed ? 'M5 1l-4 4 4 4' : 'M1 1l4 4-4 4');
  return (
    <button
      className={`ed-panel-toggle ed-panel-toggle--${side}${collapsed ? ' collapsed' : ''}`}
      onClick={onToggle}
      title={collapsed ? `Show ${isLeft ? 'sidebar' : 'inspector'}` : `Hide ${isLeft ? 'sidebar' : 'inspector'}`}
    >
      <svg viewBox="0 0 6 10" width="8" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d={path}/></svg>
    </button>
  );
}

// ── Sidebar ─────────────────────────────────────────────────

const SIDEBAR_TABS = ['story','assets','characters','scenes','audio','render'] as const;

const EditorSidebar = memo(function EditorSidebar() {
  const { state, dispatch } = useEditor();
  return (
    <div className={`ed-sidebar${state.sidebarCollapsed ? ' collapsed' : ''}`}>
      <div className="ed-sidebar-tabs" role="tablist" aria-label="Sidebar tabs">
        {SIDEBAR_TABS.map(tab => (
          <button key={tab} className={`ed-sidebar-tab${state.sidebarTab === tab ? ' active' : ''}`}
            role="tab" aria-selected={state.sidebarTab === tab}
            onClick={() => dispatch({ type: 'SET_SIDEBAR_TAB', tab })}>
            {tab === 'render' ? '🎬 Render' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div className="ed-sidebar-content">
        {state.sidebarTab === 'story' && <StoryTab />}
        {state.sidebarTab === 'assets' && <AssetsTab />}
        {state.sidebarTab === 'characters' && <CharactersTab />}
        {state.sidebarTab === 'scenes' && <ScenesTab />}
        {state.sidebarTab === 'audio' && <AudioTab />}
        {state.sidebarTab === 'render' && <RenderTab />}
      </div>
    </div>
  );
});

function StoryTab() {
  const { state, dispatch } = useEditor();
  if (state.scenes.length === 0) return <div className="ed-sidebar-empty">No scenes found. Run the pipeline to populate story structure.</div>;
  return (
    <div className="ed-story-tree">
      {state.scenes.map((scene, si) => (
        <StorySceneItem key={scene.id} scene={scene} index={si} />
      ))}
    </div>
  );
}

function StorySceneItem({ scene, index }: { scene: EditorScene; index: number }) {
  const { state, dispatch } = useEditor();
  const sceneClips = state.clips.filter(c => c.startTime >= scene.startTime && c.startTime < scene.startTime + scene.duration);
  const dialogClips = sceneClips.filter(c => c.trackId === 'dialog');
  const hasAllAudio = dialogClips.length > 0 && dialogClips.every(c => c.elementId && state.dialogAudioMap[c.elementId]);
  const { generate, generating, progress, missingVoices } = useGenerateSceneAudio(scene);

  return (
    <div onClick={() => dispatch({ type: 'SET_TIME', time: scene.startTime })}>
      <div className="ed-story-scene-head">
        <span className="ed-story-scene-color" style={{ background: scene.color }} />
        <span className="ed-story-scene-num">Scene {index + 1}</span>
        <span className="ed-story-scene-name">{scene.name}</span>
        <span className="ed-story-scene-dur">{formatTimecode(scene.duration)}</span>
      </div>
      {dialogClips.length > 0 && (
        <div className="ed-story-scene-actions" onClick={e => e.stopPropagation()} style={{ padding: '2px 8px 4px 24px', display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            disabled={generating}
            onClick={generate}
            style={{
              fontSize: '0.7em', padding: '2px 8px', borderRadius: 4, border: 'none', cursor: generating ? 'wait' : 'pointer',
              background: hasAllAudio ? '#065f46' : '#7c3aed', color: '#fff',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? `🔄 ${progress}` : hasAllAudio ? '✅ Regenerate Audio' : `🎙 Generate Audio (${dialogClips.length})`}
          </button>
          {missingVoices.length > 0 && (
            <span style={{ fontSize: '0.65em', color: '#f59e0b' }}>⚠ {missingVoices.length} unassigned</span>
          )}
        </div>
      )}
      {sceneClips.slice(0, 8).map(clip => (
        <div key={clip.id} className="ed-story-clip" onClick={e => { e.stopPropagation(); dispatch({ type: 'SET_SELECTED_CLIP', clipId: clip.id }); dispatch({ type: 'SET_TIME', time: clip.startTime }); }}>
          <span className="ed-story-clip-type" style={{ color: (MEDIA_COLORS[clip.type] || MEDIA_COLORS.image).accent }}>
            {clip.type === 'dialog' ? '🎤' : clip.type === 'image' ? '🖼' : clip.type === 'text' ? '📝' : '🎵'}
          </span>
          <span className="ed-story-clip-name">{clip.name.slice(0, 36)}</span>
          <span className="ed-story-clip-dur">{clip.duration.toFixed(1)}s</span>
          {clip.type === 'dialog' && clip.elementId && state.dialogAudioMap[clip.elementId] && (
            <span style={{ fontSize: '0.6em', color: '#34d399', marginLeft: 4 }}>🔊</span>
          )}
        </div>
      ))}
    </div>
  );
}

function AssetsTab() {
  const { state } = useEditor();
  return (
    <div className="ed-assets">
      <div className="ed-assets-search"><input type="text" className="ed-assets-search-input" placeholder="Search assets..." /></div>
      <div className="ed-assets-filters">
        {['All','Images','Video','Audio','Text','Generated'].map(f => <button key={f} className="ed-assets-filter">{f}</button>)}
      </div>
      <div className="ed-assets-grid">
        {state.assets.length === 0 && <div className="ed-sidebar-empty">No assets yet. Import media or generate from the pipeline.</div>}
        {state.assets.map((asset, i) => (
          <div key={asset.id || i} className="ed-asset-card" draggable>
            {asset.filePath?.match(/\.(png|jpg|jpeg|webp)$/i) ? (
              <div className="ed-asset-thumb" style={{ backgroundImage: `url(${imgSrc(asset.filePath!)})` }} />
            ) : (
              <div className="ed-asset-thumb ed-asset-thumb--placeholder">{asset.type === 'audio' ? '🎵' : '📄'}</div>
            )}
            <div className="ed-asset-label">{asset.name || 'Untitled'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Voice binding helpers ─────────────────────────────────────

function getVoiceBinding(characterId: string | undefined): { voiceId: string; voiceName: string } | null {
  if (!characterId) return null;
  const bindings = (window as any).appBindings;
  if (!bindings?.bindings) return null;
  for (const b of bindings.bindings) {
    if (b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId === characterId) {
      return { voiceId: b.target?.entityId, voiceName: b.metadata?.voiceName || 'Assigned' };
    }
  }
  return null;
}

// ── Scene Audio Generation ───────────────────────────────────

function useGenerateSceneAudio(scene: { id: string; name: string; startTime: number; duration: number }) {
  const { state, dispatch, pipelineId, showToast } = useEditor();
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  const sceneDialogClips = useMemo(() => {
    return state.clips
      .filter(c => c.trackId === 'dialog' && c.startTime >= scene.startTime && c.startTime < scene.startTime + scene.duration)
      .sort((a, b) => a.startTime - b.startTime);
  }, [state.clips, scene.startTime, scene.duration]);

  // Check which dialog clips are missing voice bindings
  const missingVoices = useMemo(() => {
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const clip of sceneDialogClips) {
      if (!clip.characterId || seen.has(clip.characterId)) continue;
      seen.add(clip.characterId);
      if (!getVoiceBinding(clip.characterId)) {
        missing.push(clip.characterName || clip.characterId);
      }
    }
    return missing;
  }, [sceneDialogClips]);

  const generate = useCallback(async () => {
    if (sceneDialogClips.length === 0) {
      showToast('No dialog in this scene', 'warning');
      return;
    }
    if (missingVoices.length > 0) {
      showToast(`Missing voices: ${missingVoices.join(', ')}. Assign voices in the Voices tab.`, 'warning');
      return;
    }

    setGenerating(true);
    const audioDurations: Record<string, number> = {};
    let success = 0;
    let failed = 0;

    for (let i = 0; i < sceneDialogClips.length; i++) {
      const clip = sceneDialogClips[i];
      const text = (clip.lines || []).join(' ');
      if (!text.trim()) continue;

      const binding = getVoiceBinding(clip.characterId);
      if (!binding) { failed++; continue; }

      setProgress(`${i + 1}/${sceneDialogClips.length} — ${clip.characterName || 'dialog'}`);

      try {
        const resp = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-dialogue-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elementId: clip.elementId,
            text,
            voiceId: binding.voiceId,
            characterName: clip.characterName || '',
            characterId: clip.characterId || '',
          }),
        }).then(r => r.json());

        if (resp.success && resp.filePath) {
          dispatch({ type: 'SET_DIALOG_AUDIO', elementId: clip.elementId!, filePath: resp.filePath });
          // Get audio duration
          const dur = await getAudioDuration(resp.filePath);
          if (dur > 0) audioDurations[clip.elementId!] = dur;
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    // Auto-adjust scene timing based on audio durations
    if (Object.keys(audioDurations).length > 0) {
      dispatch({ type: 'ADJUST_SCENE_TIMING', sceneId: scene.id, audioDurations });
    }

    setGenerating(false);
    setProgress('');
    showToast(
      `Scene "${scene.name}": ${success} audio${success !== 1 ? 's' : ''} generated` +
      (failed > 0 ? `, ${failed} failed` : ''),
      failed > 0 ? 'warning' : 'success'
    );
  }, [sceneDialogClips, missingVoices, pipelineId, scene, dispatch, showToast]);

  return { generate, generating, progress, sceneDialogClips, missingVoices };
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio('/api/file?path=' + encodeURIComponent(filePath));
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration));
    audio.addEventListener('error', () => resolve(0));
    // Timeout fallback
    setTimeout(() => resolve(0), 5000);
  });
}

function CharactersTab() {
  const { state } = useEditor();
  if (state.characters.length === 0) return <div className="ed-sidebar-empty">No characters found.</div>;
  return (
    <div className="ed-characters">
      {state.characters.map(ch => {
        const color = charColor(ch.name);
        const dialogCount = state.clips.filter(c => c.characterId === ch.id).length;
        const voice = getVoiceBinding(ch.id);
        return (
          <div key={ch.id} className="ed-character-card">
            <div className="ed-character-avatar" style={{ borderColor: color }}>
              {(ch.headshot || ch.image) ? <img src={imgSrc(ch.headshot || ch.image!)} alt={ch.name} /> : <span>{(ch.displayName || ch.name || '?').charAt(0)}</span>}
            </div>
            <div className="ed-character-info">
              <div className="ed-character-name">{ch.displayName || ch.name}</div>
              <div className="ed-character-meta">
                {dialogCount} lines
                {voice
                  ? <span style={{ color: '#34d399', marginLeft: 6, fontSize: '0.75em' }}>🎙 {voice.voiceName}</span>
                  : <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: '0.75em' }}>⚠ No voice</span>
                }
              </div>
            </div>
            <span className="ed-character-color" style={{ background: color }} />
          </div>
        );
      })}
    </div>
  );
}

function ScenesTab() {
  const { state, dispatch } = useEditor();
  return (
    <div className="ed-scenes-strip">
      {state.scenes.map((scene, i) => (
        <SceneCard key={scene.id} scene={scene} index={i} />
      ))}
    </div>
  );
}

function SceneCard({ scene, index }: { scene: EditorScene; index: number }) {
  const { state, dispatch } = useEditor();
  const dialogClips = state.clips.filter(c => c.trackId === 'dialog' && c.startTime >= scene.startTime && c.startTime < scene.startTime + scene.duration);
  const hasAllAudio = dialogClips.length > 0 && dialogClips.every(c => c.elementId && state.dialogAudioMap[c.elementId]);
  const { generate, generating, progress, missingVoices } = useGenerateSceneAudio(scene);

  return (
    <div className="ed-scene-card" onClick={() => dispatch({ type: 'SET_TIME', time: scene.startTime })}>
      <div className="ed-scene-card-color" style={{ background: scene.color }} />
      <div className="ed-scene-card-body">
        <div className="ed-scene-card-num">Scene {index + 1}</div>
        <div className="ed-scene-card-name">{scene.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ed-scene-card-dur">{formatTimecode(scene.duration)}</span>
          {dialogClips.length > 0 && (
            hasAllAudio
              ? <span style={{ fontSize: '0.65em', color: '#34d399' }}>🔊 {dialogClips.length}</span>
              : <span style={{ fontSize: '0.65em', color: '#94a3b8' }}>🎤 {dialogClips.length}</span>
          )}
        </div>
        {dialogClips.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
            <button
              disabled={generating}
              onClick={generate}
              style={{
                fontSize: '0.65em', padding: '3px 8px', borderRadius: 4, border: 'none', cursor: generating ? 'wait' : 'pointer', width: '100%',
                background: hasAllAudio ? '#065f46' : '#7c3aed', color: '#fff',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? `🔄 ${progress}` : hasAllAudio ? '✅ Regenerate' : '🎙 Generate Audio'}
            </button>
            {missingVoices.length > 0 && (
              <div style={{ fontSize: '0.6em', color: '#f59e0b', marginTop: 2 }}>⚠ {missingVoices.join(', ')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AudioTab() {
  const { state, dispatch } = useEditor();
  const audioClips = state.clips.filter(c => c.type === 'dialog' || c.type === 'music' || c.type === 'sfx' || c.type === 'ambience');
  if (audioClips.length === 0) return <div className="ed-sidebar-empty">No audio clips. Add dialog, music, or sound effects.</div>;
  return (
    <div className="ed-audio-list">
      {audioClips.map(clip => {
        const colors = MEDIA_COLORS[clip.type] || MEDIA_COLORS.dialog;
        return (
          <div key={clip.id} className="ed-audio-row" onClick={() => dispatch({ type: 'SET_SELECTED_CLIP', clipId: clip.id })}>
            <span className="ed-audio-type-dot" style={{ background: colors.accent }} />
            <span className="ed-audio-name">{clip.name.slice(0, 35)}</span>
            <span className="ed-audio-dur">{clip.duration.toFixed(1)}s</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Render Tab ───────────────────────────────────────────────

function RenderTab() {
  const { state, dispatch, pipelineId, showToast } = useEditor();
  const rs = state.renderSettings;
  const endTime = rs.frameEnd != null ? rs.frameEnd : state.duration;

  const handleRender = useCallback((rangeOnly: boolean) => {
    const startTime = rangeOnly ? rs.frameStart : 0;
    const endT = rangeOnly ? (rs.frameEnd ?? state.duration) : state.duration;

    const renderClips = state.clips
      .filter(c => {
        const clipEnd = c.startTime + c.duration;
        if (clipEnd <= startTime || c.startTime >= endT) return false;
        const track = state.tracks.find(t => t.id === c.trackId);
        if (track?.muted) return false;
        return true;
      })
      .map(c => ({
        id: c.id, type: c.type, trackId: c.trackId,
        startTime: c.startTime, duration: c.duration,
        filePath: c.filePath || null, elementId: c.elementId || null,
        volume: c.volume ?? 100, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0,
        name: c.name,
      }));

    dispatch({ type: 'SET_RENDER_STATUS', status: 'rendering', progress: 0, error: null });

    fetch(`/api/app/${encodeURIComponent(pipelineId)}/render-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          resolutionX: Math.round(rs.resolutionX * rs.resolutionPct / 100),
          resolutionY: Math.round(rs.resolutionY * rs.resolutionPct / 100),
          fps: rs.fps, format: rs.format, quality: rs.quality,
          startTime, endTime: endT,
        },
        clips: renderClips,
        mutedTracks: state.tracks.filter(t => t.muted).map(t => t.id),
        dialogAudioMap: state.dialogAudioMap,
      }),
    })
    .then(r => r.json())
    .then(resp => {
      if (resp.success) {
        dispatch({ type: 'SET_RENDER_STATUS', status: 'done', progress: 100, path: resp.videoPath });
        showToast(`Render complete! ${resp.fileSizeMB || ''}MB`, 'success');
      } else {
        dispatch({ type: 'SET_RENDER_STATUS', status: 'error', error: resp.error || 'Render failed' });
        showToast(resp.error || 'Render failed', 'error');
      }
    })
    .catch(err => {
      dispatch({ type: 'SET_RENDER_STATUS', status: 'error', error: err.message || 'Network error' });
      showToast('Render failed: ' + err.message, 'error');
    });
  }, [rs, state, pipelineId, dispatch, showToast]);

  return (
    <div className="ed-render-tab">
      <div className="ed-render-section">
        <div className="ed-render-section-head">▼ Format</div>
        <div className="ed-render-section-body">
          <div className="ed-render-row"><label>Resolution X</label>
            <input type="number" className="ed-render-input" value={rs.resolutionX} onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { resolutionX: parseInt(e.target.value) || rs.resolutionX } })} /><span className="ed-render-suffix">px</span></div>
          <div className="ed-render-row"><label>Resolution Y</label>
            <input type="number" className="ed-render-input" value={rs.resolutionY} onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { resolutionY: parseInt(e.target.value) || rs.resolutionY } })} /><span className="ed-render-suffix">px</span></div>
          <div className="ed-render-row"><label>%</label>
            <select className="ed-render-input" value={rs.resolutionPct} onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { resolutionPct: parseInt(e.target.value) } })}>
              {[25,50,75,100].map(p => <option key={p} value={p}>{p}%</option>)}
            </select></div>
          <div className="ed-render-row"><label>Frame Rate</label>
            <select className="ed-render-input" value={rs.fps} onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { fps: parseInt(e.target.value) } })}>
              {[24,25,30,60].map(f => <option key={f} value={f}>{f} fps</option>)}
            </select></div>
        </div>
      </div>
      <div className="ed-render-section">
        <div className="ed-render-section-head">▼ Frame Range</div>
        <div className="ed-render-section-body">
          <div className="ed-render-row"><label>Start</label>
            <input type="text" className="ed-render-input ed-render-tc" defaultValue={formatTimecode(rs.frameStart, rs.fps)}
              aria-label="Render start timecode"
              onBlur={e => {
                const v = parseTimecodeToSeconds(e.target.value, rs.fps);
                if (!isNaN(v) && v >= 0) dispatch({ type: 'SET_RENDER_SETTINGS', settings: { frameStart: v } });
                else e.target.value = formatTimecode(rs.frameStart, rs.fps);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="ed-render-row"><label>End</label>
            <input type="text" className="ed-render-input ed-render-tc" defaultValue={formatTimecode(endTime, rs.fps)}
              aria-label="Render end timecode"
              onBlur={e => {
                const v = parseTimecodeToSeconds(e.target.value, rs.fps);
                if (!isNaN(v) && v > rs.frameStart) dispatch({ type: 'SET_RENDER_SETTINGS', settings: { frameEnd: v } });
                else e.target.value = formatTimecode(endTime, rs.fps);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="ed-render-row"><label>Duration</label>
            <input type="text" className="ed-render-input ed-render-tc" defaultValue={formatTimecode(endTime - rs.frameStart, rs.fps)}
              aria-label="Render duration timecode"
              onBlur={e => {
                const v = parseTimecodeToSeconds(e.target.value, rs.fps);
                if (!isNaN(v) && v > 0) dispatch({ type: 'SET_RENDER_SETTINGS', settings: { frameEnd: rs.frameStart + v } });
                else e.target.value = formatTimecode(endTime - rs.frameStart, rs.fps);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="ed-render-row"><label>Frames</label><span className="ed-render-value">{Math.round((endTime - rs.frameStart) * rs.fps)}</span></div>
          <div className="ed-render-btn-row">
            <button className="ed-render-small-btn" onClick={() => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { frameStart: 0, frameEnd: null } })}>Full Sequence</button>
            <button className="ed-render-small-btn" onClick={() => {
              const sel = state.clips.find(c => c.id === primarySelectedClipId(state));
              if (sel) dispatch({ type: 'SET_RENDER_SETTINGS', settings: { frameStart: sel.startTime, frameEnd: sel.startTime + sel.duration } });
              else showToast('Select a clip first', 'info');
            }}>Use Selection</button>
          </div>
        </div>
      </div>
      <div className="ed-render-section">
        <div className="ed-render-section-head">▼ Output</div>
        <div className="ed-render-section-body">
          <div className="ed-render-row ed-render-row--path"><label>Path</label>
            <input type="text" className="ed-render-input ed-render-path" value={rs.outputPath} placeholder="/path/to/renders/"
              onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { outputPath: e.target.value } })} /></div>
          <div className="ed-render-row"><label>Format</label>
            <select className="ed-render-input" value={rs.format} onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { format: e.target.value } })}>
              <option value="mp4">MP4 (H.264)</option><option value="mov">MOV (QuickTime)</option><option value="webm">WebM (VP9)</option>
            </select></div>
          <div className="ed-render-row"><label>Quality</label>
            <select className="ed-render-input" value={rs.quality} onChange={e => dispatch({ type: 'SET_RENDER_SETTINGS', settings: { quality: e.target.value } })}>
              <option value="high">High (CRF 18)</option><option value="medium">Medium (CRF 23)</option><option value="low">Low (CRF 28)</option>
            </select></div>
        </div>
      </div>
      <div className="ed-render-section">
        <div className="ed-render-section-body">
          {state.renderStatus === 'rendering' ? (
            <>
              <div className="ed-render-progress">
                <div className="ed-render-progress-bar" role="progressbar" aria-valuenow={state.renderProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Render progress"><div className="ed-render-progress-fill" style={{ width: `${state.renderProgress}%` }} /></div>
                <div className="ed-render-progress-text">{state.renderProgress}% — Rendering...</div>
              </div>
              <button className="ed-render-main-btn ed-render-main-btn--secondary" onClick={() => {
                fetch(`/api/app/${encodeURIComponent(pipelineId)}/render-cancel`, { method: 'POST' }).catch(() => {});
                dispatch({ type: 'SET_RENDER_STATUS', status: null, progress: 0 });
              }}>Cancel</button>
            </>
          ) : (
            <>
              {state.renderStatus === 'done' && state.lastRenderPath && <div className="ed-render-done">✅ Render complete</div>}
              {state.renderStatus === 'error' && state.renderError && <div className="ed-render-error">❌ {state.renderError}</div>}
              <button className="ed-render-main-btn" onClick={() => handleRender(false)}>🎬 Render Full Sequence</button>
              <button className="ed-render-main-btn ed-render-main-btn--secondary" onClick={() => handleRender(true)}>✂ Render Range Only</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Program Monitor ──────────────────────────────────────────

const ProgramMonitor = memo(function ProgramMonitor() {
  const { state, dispatch } = useEditor();
  const scrubberRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const visualClip = useMemo(() => getClipAtTime(state.clips, state.currentTime, 'visuals'), [state.clips, state.currentTime]);
  const dialogClip = useMemo(() => getClipAtTime(state.clips, state.currentTime, 'dialog'), [state.clips, state.currentTime]);

  // Fall back to selected clip if nothing at playhead
  const selectedClip = primarySelectedClipId(state) ? state.clips.find(c => c.id === primarySelectedClipId(state)) : null;
  const showVisual = visualClip || (selectedClip?.type === 'image' ? selectedClip : null);
  const showDialog = dialogClip || (selectedClip?.type === 'dialog' ? selectedClip : null);

  const previewImgPath = useMemo(() => {
    if (showVisual?.type === 'image') return showVisual.filePath || state.previsMap[showVisual.elementId || ''];
    return null;
  }, [showVisual, state.previsMap]);

  const handleScrubStart = useCallback((e: RMouseEvent) => {
    const scrub = scrubberRef.current;
    if (!scrub) return;
    const scrubFn = (ev: { clientX: number }) => {
      const rect = scrub.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      dispatch({ type: 'SET_TIME', time: pct * state.duration });
    };
    scrubFn(e);
    const onMove = (ev: globalThis.MouseEvent) => scrubFn(ev);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [state.duration, dispatch]);

  // Mouse wheel zoom on preview (Ctrl/Cmd + scroll)
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const steps = [50, 100, 200];
      const cur = state.previewZoom === 'fit' ? 0 : Number(state.previewZoom);
      if (e.deltaY < 0) {
        if (state.previewZoom === 'fit') dispatch({ type: 'SET_PREVIEW_ZOOM', zoom: 50 });
        else if (cur < 200) {
          const idx = steps.indexOf(cur);
          dispatch({ type: 'SET_PREVIEW_ZOOM', zoom: idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : Math.min(200, cur + 50) });
        }
      } else {
        if (cur <= 50) dispatch({ type: 'SET_PREVIEW_ZOOM', zoom: 'fit' });
        else {
          const idx = steps.indexOf(cur);
          dispatch({ type: 'SET_PREVIEW_ZOOM', zoom: idx > 0 ? steps[idx - 1] : Math.max(50, cur - 50) });
        }
      }
    };
    wrap.addEventListener('wheel', handler, { passive: false });
    return () => wrap.removeEventListener('wheel', handler);
  }, [state.previewZoom, dispatch]);

  const pct = (state.currentTime / state.duration) * 100;

  return (
    <div className="ed-preview">
      <div className="ed-preview-toolbar">
        <span className="ed-preview-label">Program Monitor</span>
        <div className="ed-preview-toolbar-right">
          <select className="ed-preview-zoom-select" value={String(state.previewZoom)}
            onChange={e => dispatch({ type: 'SET_PREVIEW_ZOOM', zoom: e.target.value === 'fit' ? 'fit' : Number(e.target.value) })}
            aria-label="Preview zoom">
            <option value="fit">Fit</option><option value="50">50%</option><option value="100">100%</option><option value="200">200%</option>
          </select>
        </div>
      </div>
      <div ref={canvasWrapRef} className={`ed-preview-canvas-wrap${state.previewZoom !== 'fit' ? ' ed-preview-canvas-wrap--scrollable' : ''}`}>
        <div className="ed-preview-canvas" style={state.previewZoom !== 'fit' ? { width: Math.round(560 * (Number(state.previewZoom) / 100)), height: Math.round(315 * (Number(state.previewZoom) / 100)), maxWidth: 'none', flexShrink: 0 } : undefined}>
          {previewImgPath && <img className="ed-preview-image" src={imgSrc(previewImgPath)} alt="" />}
          {showDialog?.type === 'dialog' && (
            <div className="ed-preview-dialog-overlay">
              <div className="ed-preview-dialog-char" style={{ color: showDialog.color || charColor(showDialog.characterName || '') }}>{showDialog.characterName || ''}</div>
              <div className="ed-preview-dialog-text">{(showDialog.lines || []).join(' ')}</div>
            </div>
          )}
          {!previewImgPath && !showDialog && (
            <div className="ed-preview-empty">
              <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><rect x="4" y="8" width="40" height="28" rx="3"/><path d="M4 30l12-8 8 6 8-10 12 8"/><circle cx="14" cy="18" r="3"/></svg>
              <div>No clip at playhead</div>
            </div>
          )}
        </div>
      </div>
      <div className="ed-preview-controls">
        <button className="ed-preview-ctrl-btn" onClick={() => dispatch({ type: 'TOGGLE_PLAY' })} title="Play/Pause" aria-label={state.playing ? 'Pause' : 'Play'}>{state.playing ? '⏸' : '▶'}</button>
        <span className="ed-preview-tc">{formatTimecode(state.currentTime)} / {formatTimecode(state.duration)}</span>
        <div className="ed-preview-scrubber" ref={scrubberRef} onMouseDown={handleScrubStart}>
          <div className="ed-preview-scrubber-fill" style={{ width: `${pct}%` }} />
          <div className="ed-preview-scrubber-thumb" style={{ left: `${pct}%` }} />
        </div>
        <button className="ed-preview-ctrl-btn" onClick={() => {
          const cuts = state.clips.flatMap(c => [c.startTime, c.startTime + c.duration]).sort((a, b) => a - b);
          let prev = 0; for (const t of cuts) { if (t < state.currentTime - 0.05) prev = t; }
          dispatch({ type: 'SET_TIME', time: prev });
        }} title="Previous cut (↑)" aria-label="Previous cut">⏮</button>
        <button className="ed-preview-ctrl-btn" onClick={() => {
          const cuts = state.clips.flatMap(c => [c.startTime, c.startTime + c.duration]).sort((a, b) => a - b);
          for (const t of cuts) { if (t > state.currentTime + 0.05) { dispatch({ type: 'SET_TIME', time: t }); return; } }
        }} title="Next cut (↓)" aria-label="Next cut">⏭</button>
      </div>
    </div>
  );
});

// ── Clip Inspector ─────────────────────────────────────────

const ClipInspector = memo(function ClipInspector() {
  const { state, dispatch, pipelineId, audioEngine, persistUserClips, showToast } = useEditor();
  const selectedCount = state.selectedClipIds.length;
  const clip = selectedCount === 1 ? state.clips.find(c => c.id === state.selectedClipIds[0]) : null;

  if (selectedCount === 0) {
    return (
      <div className="ed-inspector" role="region" aria-label="Clip inspector">
        <div className="ed-inspector-empty">
          <div className="ed-inspector-empty-icon">🔍</div>
          <div>Select a clip to inspect its properties</div>
        </div>
      </div>
    );
  }

  // Multi-select summary
  if (selectedCount > 1) {
    const selectedClips = state.clips.filter(c => state.selectedClipIds.includes(c.id));
    const types = [...new Set(selectedClips.map(c => c.type))];
    const tracks = [...new Set(selectedClips.map(c => c.trackId))];
    const totalDuration = selectedClips.reduce((sum, c) => sum + c.duration, 0);
    const deletableCount = selectedClips.filter(c => state.userClips.some(uc => uc.id === c.id)).length;

    return (
      <div className="ed-inspector" role="region" aria-label="Multi-clip inspector">
        <div className="ed-inspector-header">
          <div className="ed-inspector-badge" style={{ background: '#8b5cf6', color: '#fff' }}>MULTI</div>
          <div className="ed-inspector-name">{selectedCount} clips selected</div>
        </div>
        <div className="ed-inspector-section">
          <div className="ed-inspector-section-head">SUMMARY</div>
          <div className="ed-inspector-section-body">
            <div className="ed-inspector-row"><span className="ed-inspector-label">Types</span><span className="ed-inspector-value">{types.join(', ')}</span></div>
            <div className="ed-inspector-row"><span className="ed-inspector-label">Tracks</span><span className="ed-inspector-value">{tracks.length}</span></div>
            <div className="ed-inspector-row"><span className="ed-inspector-label">Total Duration</span><span className="ed-inspector-value">{formatTimecode(totalDuration)}</span></div>
          </div>
        </div>
        <div className="ed-inspector-section">
          <div className="ed-inspector-section-body">
            {deletableCount > 0 && (
              <button className="ed-inspector-btn ed-inspector-btn--danger" onClick={() => { dispatch({ type: 'DELETE_SELECTED' }); persistUserClips(); }}>
                Delete {deletableCount} clip{deletableCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!clip) return null;

  const colors = MEDIA_COLORS[clip.type] || MEDIA_COLORS.image;
  const hasDialogAudio = !!(clip.elementId && state.dialogAudioMap[clip.elementId]);

  // Voice binding lookup
  const voiceBinding = useMemo(() => {
    const bindings = (window as any).appBindings;
    if (!bindings?.bindings) return null;
    for (const b of bindings.bindings) {
      if (b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId === clip.characterId) {
        return { voiceId: b.target?.entityId, voiceName: b.metadata?.voiceName };
      }
    }
    return null;
  }, [clip.characterId]);

  const handleGenerateDialogAudio = useCallback(() => {
    if (!voiceBinding?.voiceId) { showToast('No voice assigned. Assign one in the Voices tab.', 'warning'); return; }
    const text = (clip.lines || []).join(' ');
    if (!text.trim()) { showToast('No dialog text', 'warning'); return; }

    fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-dialogue-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elementId: clip.elementId, text,
        voiceId: voiceBinding.voiceId,
        characterName: clip.characterName || '',
        characterId: clip.characterId || '',
      }),
    })
    .then(r => r.json())
    .then(resp => {
      if (resp.success && resp.filePath) {
        dispatch({ type: 'SET_DIALOG_AUDIO', elementId: clip.elementId!, filePath: resp.filePath });
        showToast(`Audio generated for ${clip.characterName || 'dialog'}`, 'success');
      } else {
        showToast(resp.error || 'Audio generation failed', 'error');
      }
    })
    .catch(err => showToast('Audio generation failed: ' + err.message, 'error'));
  }, [clip, voiceBinding, pipelineId, dispatch, showToast]);

  const handlePlayDialogAudio = useCallback(() => {
    const engine = audioEngine.current;
    if (!engine) return;
    if (engine.dialogClipId === clip.id) {
      engine.stopDialog();
      return;
    }
    engine.stopDialog();
    const audioPath = state.dialogAudioMap[clip.elementId || ''];
    if (!audioPath) return;
    const audio = new Audio('/api/file?path=' + encodeURIComponent(audioPath));
    audio.play().catch(() => {});
    engine.dialogAudio = audio;
    engine.dialogClipId = clip.id;
    audio.addEventListener('ended', () => { engine.dialogAudio = null; engine.dialogClipId = null; });
  }, [clip, state.dialogAudioMap, audioEngine]);

  return (
    <div className="ed-inspector" role="region" aria-label={`Inspector: ${clip.name}`}>
      <div className="ed-inspector-header">
        <span className="ed-inspector-type-badge" style={{ background: colors.bg, borderColor: colors.border }}>{clip.type}</span>
        <div className="ed-inspector-name">{clip.name.slice(0, 40)}</div>
      </div>

      {/* Timing */}
      <div className="ed-inspector-section">
        <div className="ed-inspector-section-head">Clip</div>
        <div className="ed-inspector-section-body">
          <InspectorField label="Start" value={formatTimecode(clip.startTime)} onChange={val => {
            const t = parseTimecodeToSeconds(val); if (!isNaN(t) && t >= 0) { dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { startTime: t } }); persistUserClips(); }
          }} />
          <InspectorField label="Duration" value={clip.duration.toFixed(2)} suffix="s" onChange={val => {
            const d = parseFloat(val); if (!isNaN(d) && d > 0) { dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { duration: d } }); persistUserClips(); }
          }} />
          <div className="ed-inspector-field"><label className="ed-inspector-label">Track</label>
            <div className="ed-inspector-field-input">
              <select className="ed-inspector-input" value={clip.trackId} onChange={e => { dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { trackId: e.target.value } }); persistUserClips(); }}>
                {state.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Dialog */}
      {clip.type === 'dialog' && (
        <>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Speaker</div>
            <div className="ed-inspector-section-body">
              <div className="ed-inspector-row"><span className="ed-inspector-label">Character</span><span className="ed-inspector-value">{clip.characterName || 'Unknown'}</span></div>
              {voiceBinding?.voiceId ? (
                <div className="ed-inspector-row"><span className="ed-inspector-label">Voice</span><span className="ed-inspector-value" style={{ color: '#4ade80' }}>{voiceBinding.voiceName || 'Assigned'}</span></div>
              ) : (
                <div className="ed-inspector-row"><span className="ed-inspector-label">Voice</span><span className="ed-inspector-value" style={{ color: '#f97316' }}>Not assigned</span></div>
              )}
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Transcript</div>
            <div className="ed-inspector-section-body">
              <textarea className="ed-inspector-textarea" rows={4} defaultValue={(clip.lines || []).join('\n')} readOnly />
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Audio</div>
            <div className="ed-inspector-section-body">
              {hasDialogAudio ? (
                <>
                  <div className="ed-dialog-audio-status ed-dialog-audio-status--ready"><span className="ed-dialog-audio-icon">🔊</span><span>Audio generated</span></div>
                  <button className="ed-inspector-btn" onClick={handlePlayDialogAudio}>▶ Play Audio</button>
                </>
              ) : (
                <div className="ed-dialog-audio-status ed-dialog-audio-status--missing"><span className="ed-dialog-audio-icon">🔇</span><span>No audio generated</span></div>
              )}
              <button className="ed-inspector-generate-btn" onClick={handleGenerateDialogAudio}>✨ Generate Audio</button>
              {!voiceBinding?.voiceId && <div style={{ fontSize: 9, color: '#64748b', marginTop: 3 }}>Assign a voice in the Voices tab first</div>}
            </div>
          </div>
        </>
      )}

      {/* Image/Video Transform */}
      {(clip.type === 'image' || clip.type === 'video') && (
        <>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Transform</div>
            <div className="ed-inspector-section-body">
              <InspectorSliderField label="Position X" value={0} min={-2000} max={2000} suffix="px" clip={clip} fieldKey="positionX" />
              <InspectorSliderField label="Position Y" value={0} min={-2000} max={2000} suffix="px" clip={clip} fieldKey="positionY" />
              <InspectorSliderField label="Scale" value={100} min={0} max={400} suffix="%" clip={clip} fieldKey="scale" />
              <InspectorSliderField label="Rotation" value={0} min={-360} max={360} suffix="°" clip={clip} fieldKey="rotation" />
              <InspectorSliderField label="Opacity" value={100} min={0} max={100} suffix="%" clip={clip} fieldKey="opacity" />
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Motion</div>
            <div className="ed-inspector-section-body">
              <InspectorSliderField label="Speed" value={1} min={0.1} max={10} step={0.1} suffix="x" clip={clip} fieldKey="speed" />
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Image-to-Video</div>
            <div className="ed-inspector-section-body">
              <textarea className="ed-inspector-textarea" placeholder="Describe the motion..." rows={3} />
              <InspectorSliderField label="Strength" value={0.7} min={0} max={1} step={0.01} clip={clip} fieldKey="strength" />
              <InspectorSliderField label="Motion Intensity" value={5} min={0} max={100} clip={clip} fieldKey="motionIntensity" />
              <button className="ed-inspector-generate-btn" onClick={() => showToast('Motion generation coming soon', 'info')}>✨ Generate Take</button>
            </div>
          </div>
        </>
      )}

      {/* Text/Caption */}
      {(clip.type === 'text' || clip.type === 'caption') && (
        <>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Content</div>
            <div className="ed-inspector-section-body">
              <textarea className="ed-inspector-textarea" rows={3} defaultValue={clip.content || clip.name} />
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Typography</div>
            <div className="ed-inspector-section-body">
              <InspectorSliderField label="Font Size" value={32} min={1} max={200} suffix="px" clip={clip} fieldKey="fontSize" />
              <InspectorSliderField label="Line Height" value={1.4} min={0.5} max={5} step={0.1} clip={clip} fieldKey="lineHeight" />
              <InspectorSliderField label="Letter Spacing" value={0} min={-10} max={50} suffix="px" clip={clip} fieldKey="letterSpacing" />
            </div>
          </div>
        </>
      )}

      {/* Music/SFX/Ambience */}
      {(clip.type === 'music' || clip.type === 'sfx' || clip.type === 'ambience') && (
        <>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">File</div>
            <div className="ed-inspector-section-body">
              <div className="ed-inspector-row"><span className="ed-inspector-label">File</span><span className="ed-inspector-value">{clip.fileName || clip.name}</span></div>
              {clip.filePath && <div className="ed-inspector-row"><span className="ed-inspector-label">Path</span><span className="ed-inspector-value">{(clip.filePath || '').split('/').pop()}</span></div>}
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-head">Audio</div>
            <div className="ed-inspector-section-body">
              <InspectorSliderField label="Volume" value={clip.volume ?? 100} min={0} max={200} suffix="%" clip={clip} fieldKey="volume" />
              <InspectorSliderField label="Fade In" value={clip.fadeIn ?? 0} min={0} max={10} step={0.1} suffix="s" clip={clip} fieldKey="fadeIn" />
              <InspectorSliderField label="Fade Out" value={clip.fadeOut ?? 0} min={0} max={10} step={0.1} suffix="s" clip={clip} fieldKey="fadeOut" />
            </div>
          </div>
          <div className="ed-inspector-section">
            <div className="ed-inspector-section-body" style={{ display: 'flex', gap: 6 }}>
              {clip.filePath && <button className="ed-inspector-btn" onClick={() => {
                const engine = audioEngine.current; if (!engine) return;
                engine.stopDialog();
                const audio = new Audio('/api/file?path=' + encodeURIComponent(clip.filePath!));
                audio.volume = Math.min(1, (clip.volume ?? 100) / 100);
                audio.play().catch(() => {});
                engine.dialogAudio = audio; engine.dialogClipId = clip.id;
              }}>▶ Preview</button>}
              <button className="ed-inspector-btn ed-inspector-btn--danger" onClick={() => { dispatch({ type: 'DELETE_CLIP', clipId: clip.id }); persistUserClips(); }}>🗑 Remove</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// ── Inspector Fields ─────────────────────────────────────────

function InspectorField({ label, value, suffix, onChange }: { label: string; value: string; suffix?: string; onChange?: (val: string) => void }) {
  return (
    <div className="ed-inspector-field">
      <label className="ed-inspector-label">{label}</label>
      <div className="ed-inspector-field-input">
        <input type="text" className="ed-inspector-input" defaultValue={value}
          onBlur={e => onChange?.(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onChange?.((e.target as HTMLInputElement).value); }} />
        {suffix && <span className="ed-inspector-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

function InspectorSliderField({ label, value, min, max, step, suffix, clip, fieldKey, onChange: directOnChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  clip?: Clip; fieldKey?: string; onChange?: (val: number) => void;
}) {
  const { state, dispatch, persistUserClips } = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  const isKeyframeable = fieldKey ? !!KEYFRAMEABLE[fieldKey] : false;
  const localT = clip ? Math.max(0, state.currentTime - clip.startTime) : 0;
  const kfState = clip && fieldKey && isKeyframeable
    ? (clip.keyframes?.[fieldKey]?.some(kf => Math.abs(kf.time - localT) < 0.01) ? 'at'
      : (clip.keyframes?.[fieldKey]?.length ? 'between' : 'none'))
    : 'none';
  const displayVal = clip && fieldKey && isKeyframeable && kfState !== 'none'
    ? Math.round(evaluateKeyframes(clip, fieldKey, localT) * 100) / 100
    : value;

  const handleChange = useCallback((val: number) => {
    if (directOnChange) { directOnChange(val); return; }
    if (!clip || !fieldKey) return;
    dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { [fieldKey]: val } });
    persistUserClips();
  }, [clip, fieldKey, dispatch, persistUserClips, directOnChange]);

  const handleKeyframe = useCallback(() => {
    if (!clip || !fieldKey || !isKeyframeable) return;
    const kfs = clip.keyframes?.[fieldKey] || [];
    const hasKf = kfs.some(kf => Math.abs(kf.time - localT) < 0.01);
    let newKfs: Keyframe[];
    if (hasKf) {
      newKfs = kfs.filter(kf => Math.abs(kf.time - localT) >= 0.01);
    } else {
      const val = inputRef.current ? parseFloat(inputRef.current.value) : (displayVal || KEYFRAMEABLE[fieldKey]?.def || 0);
      newKfs = [...kfs, { time: localT, value: isNaN(val) ? 0 : val, easing: 'linear' as const }].sort((a, b) => a.time - b.time);
    }
    const newKeyframes = { ...(clip.keyframes || {}), [fieldKey]: newKfs };
    if (newKfs.length === 0) delete newKeyframes[fieldKey];
    dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { keyframes: Object.keys(newKeyframes).length ? newKeyframes : undefined } });
    persistUserClips();
  }, [clip, fieldKey, isKeyframeable, localT, displayVal, dispatch, persistUserClips]);

  return (
    <div className="ed-inspector-field">
      <label className="ed-inspector-label">{label}</label>
      <div className="ed-inspector-field-input">
        {clip && isKeyframeable && (
          <button className={`ed-kf-diamond ed-kf-diamond--${kfState}`} onClick={handleKeyframe} title={kfState === 'at' ? 'Remove keyframe' : 'Add keyframe'}>◆</button>
        )}
        <input ref={sliderRef} type="range" className="ed-inspector-slider" min={min} max={max} step={step ?? 1} defaultValue={displayVal}
          onInput={e => { const v = parseFloat((e.target as HTMLInputElement).value); if (inputRef.current) inputRef.current.value = String(v); handleChange(v); }} />
        <input ref={inputRef} type="number" className={`ed-inspector-input${kfState === 'at' ? ' ed-kf-active' : kfState === 'between' ? ' ed-kf-between' : ''}`}
          defaultValue={displayVal} onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { handleChange(v); if (sliderRef.current) sliderRef.current.value = String(v); } }} />
        {suffix && <span className="ed-inspector-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Save Modal ──────────────────────────────────────────────

function SaveModal({ onClose }: { onClose: () => void }) {
  const { pipelineId, showToast } = useEditor();
  const [savePath, setSavePath] = useState('');
  const [saveName, setSaveName] = useState('My Project');
  const [saveDesc, setSaveDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/compositions/${encodeURIComponent(pipelineId)}`)
      .then(r => r.json())
      .then(resp => {
        const comp = resp?.composition || resp;
        const folder = comp?.metadata?.projectFolder;
        if (folder) {
          setSavePath(folder);
          setSaveName(folder.split('/').pop() || 'My Project');
        }
      })
      .catch(() => {});
  }, [pipelineId]);

  const handleSave = useCallback(() => {
    if (!savePath.trim()) { showToast('Please select a folder', 'error'); return; }
    setSaving(true);

    // Update project folder
    fetch(`/api/compositions/${encodeURIComponent(pipelineId)}`)
      .then(r => r.json())
      .then(resp => {
        const comp = resp?.composition || resp;
        if (comp) {
          comp.metadata = comp.metadata || {};
          comp.metadata.projectFolder = savePath;
          return fetch(`/api/compositions/${encodeURIComponent(pipelineId)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ composition: comp }),
          });
        }
      })
      .catch(() => {});

    fetch(`/api/app/${encodeURIComponent(pipelineId)}/saves`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveName, description: saveDesc }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      onClose();
      showToast('Saved to ' + savePath, 'success');
    })
    .catch(err => {
      setSaving(false);
      showToast('Save failed: ' + (err.message || err), 'error');
    });
  }, [savePath, saveName, saveDesc, pipelineId, onClose, showToast]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Save Project" style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>Save Project</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18 }}>
          <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Save Location</label>
          <input type="text" value={savePath} onChange={e => setSavePath(e.target.value)} placeholder="Enter folder path..."
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '9px 12px', color: '#e2e8f0', fontSize: '0.72rem', fontFamily: 'monospace', outline: 'none', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Project Name</label>
          <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '9px 12px', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Description <span style={{ color: '#475569', fontWeight: 400 }}>(optional)</span></label>
          <input type="text" value={saveDesc} onChange={e => setSaveDesc(e.target.value)} placeholder="e.g. Final draft, v2 edits..."
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '9px 12px', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: 6, padding: '8px 16px', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '8px 22px', color: '#a5b4fc', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Timeline Resize Handle ───────────────────────────────────

function TimelineResizeHandle() {
  const { state, dispatch } = useEditor();
  const startRef = useRef({ y: 0, h: 0 });
  const onMouseDown = useCallback((e: RMouseEvent) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, h: state.timelineHeight };
    const onMove = (ev: globalThis.MouseEvent) => { dispatch({ type: 'SET_TIMELINE_HEIGHT', height: startRef.current.h + (startRef.current.y - ev.clientY) }); };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; };
    document.body.style.cursor = 'row-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [state.timelineHeight, dispatch]);
  return <div className="ed-timeline-resize-handle" onMouseDown={onMouseDown} />;
}

// ── Timeline Panel ─────────────────────────────────────────

const TimelinePanel = memo(function TimelinePanel() {
  const { state, dispatch, pipelineId, persistUserClips, showToast } = useEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrubberScrollRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  const totalWidth = timeToPx(state.duration, state.timelineZoom) + 200;
  const step = state.timelineZoom >= 2 ? 1 : state.timelineZoom >= 0.5 ? 5 : 10;

  // Scrubber seek
  const handleScrubberSeek = useCallback((e: RMouseEvent | globalThis.MouseEvent) => {
    const scroll = scrubberScrollRef.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const x = (e as any).clientX - rect.left + scroll.scrollLeft;
    dispatch({ type: 'SET_TIME', time: Math.max(0, Math.min(pxToTime(x, state.timelineZoom), state.duration)) });
  }, [state.timelineZoom, state.duration, dispatch]);

  const handleScrubberMouseDown = useCallback((e: RMouseEvent) => {
    e.preventDefault();
    handleScrubberSeek(e);
    const onMove = (ev: globalThis.MouseEvent) => handleScrubberSeek(ev);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [handleScrubberSeek]);

  // Scroll sync
  useEffect(() => {
    const scroll = scrollRef.current;
    const scrubber = scrubberScrollRef.current;
    const labels = labelsRef.current;
    if (!scroll) return;
    const onScroll = () => { if (scrubber) scrubber.scrollLeft = scroll.scrollLeft; if (labels) labels.scrollTop = scroll.scrollTop; };
    scroll.addEventListener('scroll', onScroll);
    return () => scroll.removeEventListener('scroll', onScroll);
  }, []);

  // Mouse wheel zoom on timeline (Ctrl/Cmd + scroll)
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) dispatch({ type: 'SET_TIMELINE_ZOOM', zoom: state.timelineZoom * 1.2 });
      else dispatch({ type: 'SET_TIMELINE_ZOOM', zoom: state.timelineZoom / 1.2 });
    };
    scroll.addEventListener('wheel', handler, { passive: false });
    return () => scroll.removeEventListener('wheel', handler);
  }, [state.timelineZoom, dispatch]);

  const ticks = useMemo(() => {
    const items: { time: number; x: number; major: boolean }[] = [];
    for (let t = 0; t <= state.duration; t += step) items.push({ time: t, x: timeToPx(t, state.timelineZoom), major: t % (step * 2) === 0 });
    return items;
  }, [state.duration, state.timelineZoom, step]);

  const playheadX = timeToPx(state.currentTime, state.timelineZoom);

  // File drop with server import
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('ed-timeline-body--dragover');
    const files = e.dataTransfer.files;
    if (!files?.length) return;

    const scrollEl = scrollRef.current;
    const scrollRect = scrollEl ? scrollEl.getBoundingClientRect() : { left: 0 };
    const scrollLeft = scrollEl?.scrollLeft || 0;
    const dropTime = Math.max(0, pxToTime(e.clientX - scrollRect.left + scrollLeft, state.timelineZoom));

    let addedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const isAudio = /^(mp3|wav|ogg|aac|flac|m4a|wma|opus)$/.test(ext);
      const isVideo = /^(mp4|mov|avi|webm|mkv)$/.test(ext);
      const isImage = /^(png|jpg|jpeg|gif|webp|bmp|tiff)$/.test(ext);
      const trackId = isAudio ? 'music' : isVideo ? 'gen-motion' : 'visuals';

      const newClip: Clip = {
        id: genId(), trackId,
        type: isAudio ? 'music' : isVideo ? 'video' : 'image',
        name: file.name, fileName: file.name,
        startTime: dropTime + (addedCount * 0.5),
        duration: 30, volume: 100, fadeIn: 0, fadeOut: 0,
      };

      // Try to get file path for server import
      let sourcePath: string | null = null;
      try {
        if ((window as any).woodburyElectron?.getFilePath) sourcePath = (window as any).woodburyElectron.getFilePath(file);
      } catch {}
      if (!sourcePath) sourcePath = (file as any).path || null;

      if (sourcePath && isAudio) {
        // Import via server — copy file to project, then persist with new path
        ((clip: Clip, sp: string) => {
          fetch(`/api/app/${encodeURIComponent(pipelineId)}/import-audio`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: sp }),
          })
          .then(r => r.json())
          .then(data => {
            if (data.success && data.filePath) {
              const updates: Partial<Clip> = { filePath: data.filePath };
              if (data.duration && data.duration > 0) updates.duration = data.duration;
              dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates });
              // Persist AFTER the imported path is set — ensures the project path is saved, not the source
              setTimeout(() => persistUserClips(), 100);
              showToast(`Imported ${data.fileName || file.name}`, 'success');
            }
          })
          .catch(() => {
            dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { filePath: sp } });
            setTimeout(() => persistUserClips(), 100);
          });
        })(newClip, sourcePath);
      } else if (sourcePath && !isAudio) {
        newClip.filePath = sourcePath;
      } else if (sourcePath && isAudio) {
        newClip.filePath = sourcePath;
      } else {
        // Fallback: use object URL for preview
        (newClip as any)._objectUrl = URL.createObjectURL(file);
      }

      dispatch({ type: 'ADD_CLIP', clip: newClip });
      addedCount++;
    }
    if (addedCount > 0) {
      showToast(`Added ${addedCount} clip${addedCount > 1 ? 's' : ''} to timeline`, 'success');
      // Don't persist here for audio — the import callback will persist after copying to project
      // For non-audio clips, persist immediately
      const hasAudioImport = Array.from(files).some(f => /\.(mp3|wav|ogg|aac|flac|m4a|wma|opus)$/i.test(f.name));
      if (!hasAudioImport) persistUserClips();
    }
  }, [state.timelineZoom, pipelineId, dispatch, persistUserClips, showToast]);

  return (
    <div className="ed-timeline">
      <div className="ed-timeline-header">
        <div className="ed-timeline-header-left"><span className="ed-timeline-title">Timeline</span></div>
        <div className="ed-timeline-header-right">
          <button className="ed-tl-btn" onClick={() => dispatch({ type: 'SET_TIMELINE_ZOOM', zoom: state.timelineZoom / 1.3 })} title="Zoom out">−</button>
          <span className="ed-tl-zoom-label">{Math.round(state.timelineZoom * 100)}%</span>
          <button className="ed-tl-btn" onClick={() => dispatch({ type: 'SET_TIMELINE_ZOOM', zoom: state.timelineZoom * 1.3 })} title="Zoom in">+</button>
          <div className="ed-transport-divider" />
          <button className={`ed-tl-btn${state.snapEnabled ? ' active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_SNAP' })} title="Snap">🧲</button>
          <button className={`ed-tl-btn${state.fillGaps ? ' active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_FILL_GAPS' })} title="Fill gaps">↔</button>
          <button className={`ed-tl-btn${state.compactTimeline ? ' active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_COMPACT_TIMELINE' })} title="Compact timeline — tighten timing to dialogue audio">⏩</button>
        </div>
      </div>

      <div className="ed-tl-scrubber-row">
        <div className="ed-tl-scrubber-label" />
        <div className="ed-tl-scrubber-scroll" ref={scrubberScrollRef}>
          <div className="ed-tl-scrubber" style={{ width: totalWidth }} onMouseDown={handleScrubberMouseDown}>
            {ticks.map(tick => (
              <div key={tick.time} className={`ed-tl-scrubber-tick${tick.major ? ' major' : ''}`} style={{ left: tick.x }}>
                {tick.major && <span>{formatTimecode(tick.time)}</span>}
              </div>
            ))}
            <div className="ed-tl-playhead" style={{ left: playheadX }}><div className="ed-tl-playhead-head" /></div>
          </div>
        </div>
      </div>

      <div className="ed-timeline-body"
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; (e.currentTarget as HTMLElement).classList.add('ed-timeline-body--dragover'); }}
        onDragLeave={e => (e.currentTarget as HTMLElement).classList.remove('ed-timeline-body--dragover')}
        onDrop={handleDrop}>
        <div className="ed-timeline-labels" ref={labelsRef}>
          <div className="ed-tl-label ed-tl-label--scene" style={{ height: SCENE_LANE_HEIGHT }}><span>Scenes</span></div>
          {state.tracks.map(track => {
            const colors = MEDIA_COLORS[track.type] || MEDIA_COLORS.image;
            return (
              <div key={track.id} className="ed-tl-label" style={{ height: TRACK_HEIGHT }}>
                <span className="ed-tl-label-color" style={{ background: colors.accent }} />
                <span className="ed-tl-label-icon">{track.locked ? '🔒' : ''}</span>
                <span className="ed-tl-label-name">{track.name}</span>
                <span className={`ed-tl-label-vis${track.muted ? ' muted' : ''}`}
                  onClick={() => dispatch({ type: 'SET_TRACK_MUTED', trackId: track.id, muted: !track.muted })}>
                  {track.muted ? '🔇' : '🔊'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="ed-timeline-scroll" ref={scrollRef}>
          <div className="ed-timeline-scroll-inner" style={{ width: totalWidth }}
            onClick={(e) => { if (e.target === e.currentTarget) dispatch({ type: 'SET_SELECTION', clipIds: [] }); }}>
            <div className="ed-tl-scene-lane" style={{ height: SCENE_LANE_HEIGHT, width: totalWidth }}>
              {state.scenes.map(scene => (
                <div key={scene.id} className="ed-tl-scene-block"
                  style={{ left: timeToPx(scene.startTime, state.timelineZoom), width: Math.max(timeToPx(scene.duration, state.timelineZoom), 20), background: scene.color + '22', borderColor: scene.color }}
                  onClick={() => dispatch({ type: 'SET_TIME', time: scene.startTime })}>
                  <span>{scene.name.slice(0, 16)}</span>
                </div>
              ))}
            </div>
            {state.tracks.map(track => <TrackLane key={track.id} track={track} totalWidth={totalWidth} />)}
            <div className="ed-tl-playhead-line" style={{ left: playheadX }} />
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Track Lane ──────────────────────────────────────────────

const TrackLane = memo(function TrackLane({ track, totalWidth }: { track: Track; totalWidth: number }) {
  const { state } = useEditor();
  const colors = MEDIA_COLORS[track.type] || MEDIA_COLORS.image;
  const trackClips = useMemo(() => state.clips.filter(c => c.trackId === track.id), [state.clips, track.id]);
  return (
    <div className="ed-tl-track" style={{ height: TRACK_HEIGHT, width: totalWidth }} role="row" aria-label={track.name}>
      {trackClips.map(clip => <TimelineClip key={clip.id} clip={clip} defaultColors={colors} />)}
    </div>
  );
});

// ── Timeline Clip (with keyframe diamonds) ───────────────────

const TimelineClip = memo(function TimelineClip({ clip, defaultColors }: { clip: Clip; defaultColors: { bg: string; border: string; accent: string } }) {
  const { state, dispatch, persistUserClips } = useEditor();
  const clipRef = useRef<HTMLDivElement>(null);

  const cx = timeToPx(clip.startTime, state.timelineZoom);
  const cw = timeToPx(clip.duration, state.timelineZoom);
  const clipColors = clip.color ? { bg: clip.color + '30', border: clip.color, accent: clip.color } : defaultColors;
  const isSelected = isClipSelected(state, clip.id);
  const isActive = state.currentTime >= clip.startTime && state.currentTime < clip.startTime + clip.duration;
  const isAudio = clip.type === 'dialog' || clip.type === 'music' || clip.type === 'sfx' || clip.type === 'ambience';

  // Keyframe diamonds
  const keyframeDiamonds = useMemo(() => {
    if (!clip.keyframes) return [];
    const diamonds: { x: number; prop: string }[] = [];
    for (const prop in clip.keyframes) {
      for (const kf of clip.keyframes[prop]) {
        diamonds.push({ x: timeToPx(kf.time, state.timelineZoom), prop });
      }
    }
    return diamonds;
  }, [clip.keyframes, state.timelineZoom]);

  const handleClick = useCallback((e: RMouseEvent) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) {
      dispatch({ type: 'TOGGLE_SELECTION', clipId: clip.id });
    } else if (e.shiftKey) {
      dispatch({ type: 'ADD_TO_SELECTION', clipId: clip.id });
    } else {
      dispatch({ type: 'SET_SELECTION', clipIds: [clip.id] });
    }
  }, [clip.id, dispatch]);

  const handleMouseDown = useCallback((e: RMouseEvent) => {
    if ((e.target as HTMLElement).closest('.ed-tl-clip-handle')) return;
    if (e.button !== 0) return;

    // Determine which clips to move
    const alreadySelected = isClipSelected(state, clip.id);
    if (!alreadySelected && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      dispatch({ type: 'SET_SELECTION', clipIds: [clip.id] });
    }
    const movingIds = alreadySelected ? state.selectedClipIds : [clip.id];
    const origStarts: Record<string, number> = {};
    for (const id of movingIds) {
      const c = state.clips.find(cl => cl.id === id);
      if (c) origStarts[id] = c.startTime;
    }

    const startX = e.clientX;
    let moved = false;
    let lastDt = 0;

    // Visual feedback: mark all moving clips as dragging
    const movingEls = movingIds.map(id =>
      document.querySelector(`[data-clip-id="${id}"]`) as HTMLElement
    ).filter(Boolean);
    movingEls.forEach(el => el.classList.add('ed-tl-clip-dragging'));

    const onMove = (ev: globalThis.MouseEvent) => {
      const dt = pxToTime(ev.clientX - startX, state.timelineZoom);
      lastDt = dt;
      // Apply snap based on primary clip
      let snapDt = dt;
      if (state.snapEnabled) {
        const snap = pxToTime(6, state.timelineZoom);
        let primaryNew = Math.max(0, (origStarts[clip.id] ?? 0) + dt);
        for (const o of state.clips) {
          if (movingIds.includes(o.id)) continue;
          const oEnd = o.startTime + o.duration;
          if (Math.abs(primaryNew - o.startTime) < snap) { snapDt = o.startTime - (origStarts[clip.id] ?? 0); break; }
          if (Math.abs(primaryNew - oEnd) < snap) { snapDt = oEnd - (origStarts[clip.id] ?? 0); break; }
          const nEnd = primaryNew + clip.duration;
          if (Math.abs(nEnd - o.startTime) < snap) { snapDt = (o.startTime - clip.duration) - (origStarts[clip.id] ?? 0); break; }
          if (Math.abs(nEnd - oEnd) < snap) { snapDt = (oEnd - clip.duration) - (origStarts[clip.id] ?? 0); break; }
        }
        lastDt = snapDt;
      }
      // Update visual positions for all moving clips
      for (const id of movingIds) {
        const el = document.querySelector(`[data-clip-id="${id}"]`) as HTMLElement;
        if (el) el.style.left = timeToPx(Math.max(0, (origStarts[id] ?? 0) + lastDt), state.timelineZoom) + 'px';
      }
      moved = true;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      movingEls.forEach(el => el.classList.remove('ed-tl-clip-dragging'));
      if (moved) {
        dispatch({ type: 'MOVE_SELECTED', deltaTime: lastDt });
        persistUserClips();
      }
    };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  }, [clip, state.timelineZoom, state.snapEnabled, state.clips, state.selectedClipIds, dispatch, persistUserClips]);

  const handleTrim = useCallback((side: 'left' | 'right', e: RMouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX; const origStart = clip.startTime; const origDur = clip.duration;
    const onMove = (ev: globalThis.MouseEvent) => {
      const dt = pxToTime(ev.clientX - startX, state.timelineZoom);
      if (side === 'left') {
        const ns = Math.max(0, origStart + dt); const nd = Math.max(0.1, origDur - (ns - origStart));
        if (clipRef.current) { clipRef.current.style.left = timeToPx(ns, state.timelineZoom) + 'px'; clipRef.current.style.width = Math.max(8, timeToPx(nd, state.timelineZoom)) + 'px'; }
      } else {
        const nd = Math.max(0.1, origDur + dt);
        if (clipRef.current) clipRef.current.style.width = Math.max(8, timeToPx(nd, state.timelineZoom)) + 'px';
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      if (clipRef.current) {
        dispatch({ type: 'UPDATE_CLIP', clipId: clip.id, updates: { startTime: pxToTime(parseFloat(clipRef.current.style.left), state.timelineZoom), duration: pxToTime(parseFloat(clipRef.current.style.width), state.timelineZoom) } });
        persistUserClips();
      }
    };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  }, [clip, state.timelineZoom, dispatch, persistUserClips]);

  return (
    <div ref={clipRef} data-clip-id={clip.id} className={`ed-tl-clip${isSelected ? ' selected' : ''}${isActive ? ' ed-tl-clip-active' : ''}`}
      style={{ left: cx, width: Math.max(cw, 8), background: clipColors.bg, borderColor: clipColors.border }}
      onClick={handleClick} onMouseDown={handleMouseDown}>
      {isAudio && <div className="ed-tl-clip-wave" />}
      <span className="ed-tl-clip-label">{clip.name.slice(0, 24)}</span>
      {keyframeDiamonds.map((d, i) => <div key={i} className="ed-tl-kf-diamond" style={{ left: d.x }} title={d.prop} />)}
      <div className="ed-tl-clip-handle ed-tl-clip-handle--left" onMouseDown={e => handleTrim('left', e)} />
      <div className="ed-tl-clip-handle ed-tl-clip-handle--right" onMouseDown={e => handleTrim('right', e)} />
    </div>
  );
});
