/**
 * VoicesView — professional voice assignment panel for character TTS.
 * Features: voice search/filter, category tabs, preview playback,
 * voice description display, per-character assignment with visual feedback.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePipeline } from './sdk';
import type { Character } from './sdk';

interface VoiceOption {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  description?: string;
}

interface Binding {
  id: string;
  type: string;
  source: { entityType: string; entityId: string };
  target: { entityType: string; entityId: string };
  confidence: number;
  origin: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

// ── Styles ──────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex', flexDirection: 'column' as const, height: '100%', overflow: 'hidden',
    background: '#0a0e17',
  },
  header: {
    flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 16, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.01em',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  subtitle: {
    fontSize: 11, color: '#64748b', marginTop: 4,
  },
  statsBar: {
    display: 'flex', gap: 16, marginTop: 12,
  },
  stat: {
    fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4,
  },
  statValue: {
    fontWeight: 600, color: '#e2e8f0', fontSize: 12,
  },
  content: {
    flex: 1, overflowY: 'auto' as const, padding: '12px 16px',
  },
  card: {
    borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
    background: 'linear-gradient(135deg, rgba(15,23,42,0.8), rgba(15,23,42,0.4))',
    marginBottom: 8, overflow: 'hidden', transition: 'border-color 0.15s',
  },
  cardActive: {
    borderColor: 'rgba(99,102,241,0.3)',
  },
  cardRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer',
  },
  avatar: {
    width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' as const,
    border: '2px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
    background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
    border: '2px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontWeight: 600, color: '#94a3b8',
  },
  charInfo: {
    flex: 1, minWidth: 0,
  },
  charName: {
    fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.01em',
  },
  charDesc: {
    fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: '1.4',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  voiceBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
    flexShrink: 0,
  },
  voiceAssigned: {
    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)',
    color: '#6ee7b7',
  },
  voiceUnassigned: {
    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.12)',
    color: '#fbbf24',
  },
  assignBtn: {
    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#94a3b8', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
  },
  // Voice picker panel
  picker: {
    borderTop: '1px solid rgba(255,255,255,0.04)', padding: '12px 16px 14px',
    background: 'rgba(0,0,0,0.2)',
  },
  searchRow: {
    display: 'flex', gap: 8, marginBottom: 10,
  },
  searchInput: {
    flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#e2e8f0', outline: 'none',
  },
  categoryTabs: {
    display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' as const,
  },
  categoryTab: {
    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    color: '#64748b', cursor: 'pointer', transition: 'all 0.15s',
  },
  categoryTabActive: {
    background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.25)',
    color: '#a5b4fc',
  },
  voiceGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 6, maxHeight: 220, overflowY: 'auto' as const,
  },
  voiceItem: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
    borderRadius: 6, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
    color: '#cbd5e1',
  },
  voiceItemSelected: {
    background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.3)',
    color: '#c7d2fe',
  },
  voiceItemHover: {
    background: 'rgba(255,255,255,0.05)',
  },
  playBtn: {
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', cursor: 'pointer',
    fontSize: 9, flexShrink: 0, transition: 'all 0.15s',
  },
  voiceMeta: {
    fontSize: 9, color: '#475569', marginTop: 1,
  },
  removeBtn: {
    padding: '5px 10px', borderRadius: 6, fontSize: 10,
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)',
    color: '#fca5a5', cursor: 'pointer', transition: 'all 0.15s',
  },
};

export function VoicesView() {
  const { project: projectData, pipelineId } = usePipeline();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/extensions/elevenlabs/voices')
      .then(r => r.json())
      .then(data => { setVoices(data.voices || []); setLoadingVoices(false); })
      .catch(() => {
        // Fallback to direct endpoint
        fetch('/api/elevenlabs/voices')
          .then(r => r.json())
          .then(data => { setVoices(data.voices || []); setLoadingVoices(false); })
          .catch(() => setLoadingVoices(false));
      });

    if (pipelineId) {
      // Load project-scoped voice bindings
      fetch(`/api/app/${encodeURIComponent(pipelineId)}/voice-bindings`)
        .then(r => r.json())
        .then(data => {
          setBindings(data.bindings || []);
          (window as any).appBindings = { bindings: data.bindings || [] };
        })
        .catch(() => {});
    }
  }, [pipelineId]);

  const characters = projectData?.characters || [];

  const getAssignedVoice = useCallback((charId: string): VoiceOption | null => {
    const binding = bindings.find(b =>
      b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId === charId
    );
    if (!binding) return null;
    return voices.find(v => v.voice_id === binding.target?.entityId) || null;
  }, [bindings, voices]);

  const handleAssignVoice = useCallback(async (charId: string, voiceId: string, voiceName?: string) => {
    const newBindings = bindings.filter(b =>
      !(b.type === 'voice' && b.source?.entityType === 'character' && b.source?.entityId === charId)
    );
    if (voiceId) {
      const now = new Date().toISOString();
      newBindings.push({
        id: `voice-${charId}-${Date.now()}`,
        type: 'voice',
        source: { entityType: 'character', entityId: charId },
        target: { entityType: 'voice', entityId: voiceId },
        confidence: 1.0,
        origin: 'manual',
        createdAt: now,
        updatedAt: now,
        metadata: voiceName ? { voiceName } : undefined,
      });
    }
    setBindings(newBindings);
    // Sync to window for editor
    (window as any).appBindings = { bindings: newBindings };

    // Save to project-scoped voice bindings
    await fetch(`/api/app/${encodeURIComponent(pipelineId)}/voice-bindings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bindings: newBindings }),
    });
  }, [pipelineId, bindings]);

  const playPreview = useCallback((url: string, voiceId: string) => {
    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingPreview === voiceId) {
      setPlayingPreview(null);
      return;
    }
    setPlayingPreview(voiceId);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { setPlayingPreview(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingPreview(null); audioRef.current = null; };
    audio.play().catch(() => { setPlayingPreview(null); audioRef.current = null; });
  }, [playingPreview]);

  // Auto-assign voices: client calls LLM, validates, then saves
  const [autoAssigning, setAutoAssigning] = useState(false);
  const handleAutoAssign = useCallback(async () => {
    if (voices.length === 0 || characters.length === 0) return;
    setAutoAssigning(true);

    try {
      // Find unassigned characters and unused voices
      const assignedCharIds = new Set(bindings.filter(b => b.type === 'voice').map(b => b.source?.entityId));
      const usedVoiceIds = new Set(bindings.filter(b => b.type === 'voice').map(b => b.target?.entityId));
      const unassigned = characters.filter(c => !assignedCharIds.has(c.id));
      const availableVoices = voices.filter(v => !usedVoiceIds.has(v.voice_id));

      if (unassigned.length === 0) {
        if (typeof (window as any).toast === 'function') (window as any).toast('All characters already assigned', 'info');
        setAutoAssigning(false);
        return;
      }

      // Build prompt with EXACT voice IDs
      const charLines = unassigned.map(c => {
        const parts = [(c as any).gender, (c as any).ageRange, (c as any).voiceDescription, (c.description || '').substring(0, 80)].filter(Boolean);
        return `  "${c.id}": ${c.displayName || c.name} (${parts.join(', ')})`;
      }).join('\n');

      const voiceLines = availableVoices.slice(0, 50).map(v => {
        const labels = v.labels || {};
        const meta = [labels.gender, labels.age, labels.accent, labels.use_case].filter(Boolean).join(', ');
        return `  "${v.voice_id}": ${v.name} (${meta || v.description || ''})`;
      }).join('\n');

      const prompt = `Match characters to voice actors. Return a JSON array.

Characters needing voices:
${charLines}

Available voices (use the EXACT quoted voice_id string):
${voiceLines}

Rules: best personality/gender/age match, each voice used only ONCE.
Return ONLY a JSON array: [{"characterId":"char-1","voiceId":"EXAVITQu4vr...","voiceName":"George"}]`;

      const llmRes = await fetch('/api/chat/one-shot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const llmData = await llmRes.json();
      const responseText = llmData.response || llmData.text || '';

      let assignments: Array<{ characterId: string; voiceId: string; voiceName: string }> = [];
      try {
        const match = responseText.match(/\[[\s\S]*\]/);
        if (match) assignments = JSON.parse(match[0]);
      } catch (e) {
        console.error('Failed to parse LLM response:', e, responseText);
      }

      // Validate against actual IDs
      const validCharIds = new Set(unassigned.map(c => c.id));
      const validVoiceIds = new Set(availableVoices.map(v => v.voice_id));
      const newUsedVoices = new Set<string>();
      let newBindings = [...bindings];
      let applied = 0;

      for (const a of assignments) {
        if (!a.characterId || !a.voiceId) continue;
        if (!validCharIds.has(a.characterId)) continue;
        if (!validVoiceIds.has(a.voiceId)) continue;
        if (newUsedVoices.has(a.voiceId)) continue;
        newUsedVoices.add(a.voiceId);

        const now = new Date().toISOString();
        newBindings.push({
          id: `voice-${a.characterId}-${Date.now()}-${applied}`,
          type: 'voice',
          source: { entityType: 'character', entityId: a.characterId },
          target: { entityType: 'voice', entityId: a.voiceId },
          confidence: 0.8,
          origin: 'auto:llm',
          createdAt: now,
          updatedAt: now,
          metadata: { voiceName: a.voiceName },
        });
        applied++;
      }

      setBindings(newBindings);
      (window as any).appBindings = { bindings: newBindings };

      // Save via voice-bindings route
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/voice-bindings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bindings: newBindings }),
      });

      if (typeof (window as any).toast === 'function') {
        (window as any).toast(`Auto-assigned ${applied} voice${applied !== 1 ? 's' : ''} of ${unassigned.length} characters`, applied > 0 ? 'success' : 'warning');
      }
    } catch (err: any) {
      console.error('Auto-assign failed:', err);
      if (typeof (window as any).toast === 'function') {
        (window as any).toast('Auto-assign failed: ' + (err.message || String(err)), 'error');
      }
    }
    setAutoAssigning(false);
  }, [voices, characters, bindings, pipelineId]);

  // Stats
  const assignedCount = characters.filter(c => getAssignedVoice(c.id)).length;
  const totalDialogLines = characters.reduce((sum, c) => {
    const elems = projectData?.elements || [];
    return sum + elems.filter(e => e.type === 'dialogue' && e.characterId === c.id).length;
  }, 0);

  if (!projectData) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569', fontSize: 13 }}>
      No project loaded
    </div>
  );

  return (
    <div style={S.root} role="main" aria-label="Voice assignment manager">
      {/* Header */}
      <div style={S.header} role="banner">
        <div style={S.title}>
          <span style={{ fontSize: 18 }} aria-hidden="true">🎙</span>
          Voice Assignments
        </div>
        <div style={S.subtitle}>
          Assign ElevenLabs voices to characters for dialogue TTS generation
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <div style={S.statsBar}>
            <div style={S.stat}>
              <span>Characters</span>
              <span style={S.statValue}>{characters.length}</span>
            </div>
            <div style={S.stat}>
              <span>Assigned</span>
              <span style={{ ...S.statValue, color: assignedCount === characters.length && characters.length > 0 ? '#6ee7b7' : '#fbbf24' }}>
                {assignedCount}/{characters.length}
              </span>
            </div>
            <div style={S.stat}>
              <span>Dialog lines</span>
              <span style={S.statValue}>{totalDialogLines}</span>
            </div>
            <div style={S.stat}>
              <span>Voices available</span>
              <span style={S.statValue}>{loadingVoices ? '...' : voices.length}</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleAutoAssign}
            disabled={autoAssigning || loadingVoices || voices.length === 0 || characters.length === 0}
            aria-busy={autoAssigning}
            aria-label={autoAssigning
              ? 'AI is analyzing characters and selecting optimal voice matches'
              : `Use AI to automatically assign the best voice to each of the ${characters.length - assignedCount} unassigned characters`}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: autoAssigning ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              color: autoAssigning ? '#a78bfa' : '#c4b5fd',
              cursor: autoAssigning ? 'wait' : 'pointer',
              opacity: (loadingVoices || voices.length === 0) ? 0.4 : 1,
              transition: 'background 0.15s, opacity 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {autoAssigning ? 'Analyzing characters...' : 'Auto-Assign Voices'}
          </button>
        </div>
      </div>

      {/* Character list */}
      <div style={S.content} role="list" aria-label="Characters and their voice assignments">
        {characters.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '40px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>🎭</div>
            No characters found. Import a script first.
          </div>
        ) : (
          characters.map(char => (
            <CharacterVoiceCard
              key={char.id}
              character={char}
              assignedVoice={getAssignedVoice(char.id)}
              voices={voices}
              loadingVoices={loadingVoices}
              playingPreview={playingPreview}
              dialogCount={(projectData?.elements || []).filter(e => e.type === 'dialogue' && e.characterId === char.id).length}
              onAssign={(voiceId, voiceName) => handleAssignVoice(char.id, voiceId, voiceName)}
              onPreview={playPreview}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Character Voice Card ────────────────────────────────────────

function CharacterVoiceCard({ character, assignedVoice, voices, loadingVoices, playingPreview, dialogCount, onAssign, onPreview }: {
  character: Character;
  assignedVoice: VoiceOption | null;
  voices: VoiceOption[];
  loadingVoices: boolean;
  playingPreview: string | null;
  dialogCount: number;
  onAssign: (voiceId: string, voiceName?: string) => void;
  onPreview: (url: string, voiceId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  // Voice categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const v of voices) {
      if (v.category) cats.add(v.category);
      if (v.labels?.accent) cats.add(v.labels.accent);
    }
    return ['all', ...Array.from(cats).sort()];
  }, [voices]);

  // Filtered voices
  const filteredVoices = useMemo(() => {
    let filtered = voices;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.labels && Object.values(v.labels).some(l => l.toLowerCase().includes(q)))
      );
    }
    if (category !== 'all') {
      filtered = filtered.filter(v =>
        v.category === category || v.labels?.accent === category
      );
    }
    return filtered;
  }, [voices, search, category]);

  const imgSrc = character.imagePath
    ? `/api/file?path=${encodeURIComponent(character.imagePath)}`
    : null;

  return (
    <div style={{ ...S.card, ...(expanded ? S.cardActive : {}) }} role="listitem" aria-label={`${character.displayName || character.name}${assignedVoice ? `, voice: ${assignedVoice.name}` : ', no voice assigned'}, ${dialogCount} dialog lines`}>
      {/* Main row */}
      <div
        style={S.cardRow}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${character.displayName || character.name} — ${assignedVoice ? `assigned to ${assignedVoice.name}` : 'no voice'} — click to ${expanded ? 'close' : 'open'} voice picker`}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
      >
        {/* Avatar */}
        {imgSrc ? (
          <img src={imgSrc} alt="" style={S.avatar} />
        ) : (
          <div style={S.avatarPlaceholder}>
            {(character.displayName || character.name || '?').charAt(0).toUpperCase()}
          </div>
        )}

        {/* Character info */}
        <div style={S.charInfo}>
          <div style={S.charName}>{character.displayName || character.name}</div>
          <div style={S.charDesc}>
            {character.voiceDescription || (dialogCount > 0 ? `${dialogCount} dialog lines` : 'No dialog')}
          </div>
        </div>

        {/* Voice status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {assignedVoice ? (
            <>
              <div style={{ ...S.voiceBadge, ...S.voiceAssigned }}>
                🎙 {assignedVoice.name}
              </div>
              {assignedVoice.preview_url && (
                <button
                  style={S.playBtn}
                  onClick={e => { e.stopPropagation(); onPreview(assignedVoice.preview_url!, assignedVoice.voice_id); }}
                  aria-label={playingPreview === assignedVoice.voice_id ? `Stop preview of ${assignedVoice.name}` : `Preview ${assignedVoice.name} voice`}
                  aria-pressed={playingPreview === assignedVoice.voice_id}
                >
                  {playingPreview === assignedVoice.voice_id ? '⏹' : '▶'}
                </button>
              )}
            </>
          ) : (
            <div style={{ ...S.voiceBadge, ...S.voiceUnassigned }}>
              ⚠ No voice
            </div>
          )}
          <button
            style={S.assignBtn}
            aria-expanded={expanded}
            aria-label={expanded ? `Close voice picker for ${character.name}` : assignedVoice ? `Change voice for ${character.name}` : `Assign voice to ${character.name}`}
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? '▲ Close' : assignedVoice ? '✎ Change' : '▼ Assign'}
          </button>
        </div>
      </div>

      {/* Voice picker */}
      {expanded && (
        <div style={S.picker}>
          {loadingVoices ? (
            <div style={{ color: '#64748b', fontSize: 11, padding: 8 }}>Loading voices from ElevenLabs...</div>
          ) : voices.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 11, padding: 8 }}>
              No voices available. Set your ElevenLabs API key in Settings.
            </div>
          ) : (
            <>
              {/* Search + remove */}
              <div style={S.searchRow}>
                <input
                  style={S.searchInput}
                  placeholder="Search voices by name, accent, or style..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Search voices for ${character.name}`}
                />
                {assignedVoice && (
                  <button
                    style={S.removeBtn}
                    aria-label={`Remove ${assignedVoice.name} from ${character.name}`}
                    onClick={e => { e.stopPropagation(); onAssign(''); setExpanded(false); }}
                  >
                    ✕ Remove
                  </button>
                )}
              </div>

              {/* Category tabs */}
              {categories.length > 2 && (
                <div style={S.categoryTabs} role="tablist" aria-label="Voice categories">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      role="tab"
                      aria-selected={category === cat}
                      style={{ ...S.categoryTab, ...(category === cat ? S.categoryTabActive : {}) }}
                      onClick={e => { e.stopPropagation(); setCategory(cat); }}
                    >
                      {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>
              )}

              {/* Voice grid */}
              <div style={S.voiceGrid} role="listbox" aria-label={`${filteredVoices.length} voices available${category !== 'all' ? ` in ${category} category` : ''}`}>
                {filteredVoices.map(v => (
                  <VoiceItem
                    key={v.voice_id}
                    voice={v}
                    isSelected={assignedVoice?.voice_id === v.voice_id}
                    isPlaying={playingPreview === v.voice_id}
                    onSelect={() => { onAssign(v.voice_id, v.name); setExpanded(false); }}
                    onPreview={() => v.preview_url && onPreview(v.preview_url, v.voice_id)}
                  />
                ))}
                {filteredVoices.length === 0 && (
                  <div style={{ gridColumn: '1/-1', color: '#475569', fontSize: 11, padding: '12px 0', textAlign: 'center' }}>
                    No voices match "{search}"
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Voice Item ──────────────────────────────────────────────────

function VoiceItem({ voice, isSelected, isPlaying, onSelect, onPreview }: {
  voice: VoiceOption;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const [hover, setHover] = useState(false);

  const labels = voice.labels || {};
  const meta = [labels.accent, labels.age, labels.gender, labels.use_case]
    .filter(Boolean).join(' · ');

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-label={`${voice.name}${meta ? ` — ${meta}` : ''}${isSelected ? ' (currently assigned)' : ''}`}
      tabIndex={0}
      style={{
        ...S.voiceItem,
        ...(isSelected ? S.voiceItemSelected : {}),
        ...(hover && !isSelected ? S.voiceItemHover : {}),
      }}
      onClick={e => { e.stopPropagation(); onSelect(); }}
      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onSelect(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Preview button */}
      {voice.preview_url && (
        <button
          style={{
            ...S.playBtn,
            background: isPlaying ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
            color: isPlaying ? '#a5b4fc' : '#94a3b8',
          }}
          onClick={e => { e.stopPropagation(); onPreview(); }}
          aria-label={isPlaying ? `Stop preview of ${voice.name}` : `Preview ${voice.name}`}
          aria-pressed={isPlaying}
        >
          {isPlaying ? '⏹' : '▶'}
        </button>
      )}

      {/* Voice info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: isSelected ? 600 : 400,
          color: isSelected ? '#c7d2fe' : '#cbd5e1',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {voice.name}
        </div>
        {meta && <div style={S.voiceMeta}>{meta}</div>}
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <span aria-hidden="true" style={{ fontSize: 11, color: '#6ee7b7', flexShrink: 0 }}>✓</span>
      )}
    </div>
  );
}
