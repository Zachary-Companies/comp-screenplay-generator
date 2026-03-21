/**
 * CharacterCard — cinematic character card with headshot hero image,
 * role badge, traits, version strip, and action buttons.
 * Uses React.memo to skip re-renders when character data hasn't changed.
 */
import React, { useState, useCallback } from 'react';
import { useAIOperations, usePipeline } from './sdk';
import type { Character } from './sdk';
import { CharacterEditor } from './CharacterEditor';

const ROLE_STYLES: Record<string, string> = {
  main: 'bg-amber-400/90 text-black',
  supporting: 'bg-sky-400/80 text-black',
  minor: 'bg-slate-400/70 text-black',
};

export const CharacterCard = React.memo(function CharacterCard({ character, pipelineId }: { character: Character; pipelineId: string }) {
  const { enrichCharacter } = useAIOperations();
  const { reload } = usePipeline();
  const [enriching, setEnriching] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const hasDescription = character.description && character.description.length > 20;

  const versions: any[] = character.imageVersions || [];
  const activeVersion = character.activeImageVersion || versions.length || 0;

  const imgSrc = character.imagePath
    ? `/api/file?path=${encodeURIComponent(character.imagePath)}`
    : null;

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      await enrichCharacter(character.id);
    } catch (err: any) {
      console.error('Enrich failed:', err);
    }
    setEnriching(false);
  };

  const handleRegenerate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRegenerating(true);
    try {
      const res = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-character-headshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id, character }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Generation failed');
      }
      await reload();
    } catch (err: any) {
      console.error('Regenerate failed:', err);
      alert('Regenerate failed: ' + (err.message || String(err)));
    }
    setRegenerating(false);
  }, [pipelineId, character.id, reload]);

  const handleSelectVersion = useCallback(async (version: number) => {
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/set-character-image-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id, version }),
      });
      await reload();
    } catch (err: any) {
      console.error('Version switch failed:', err);
    }
  }, [pipelineId, character.id, reload]);

  const roleBadge = character.role || 'minor';
  const meta = [character.ageRange, character.gender].filter(Boolean).join(' \u00b7 ');

  return (
    <div
      className="group relative rounded-xl overflow-hidden bg-[#0c1018] border border-white/[0.06] transition-all duration-300 ease-out hover:border-white/[0.15] hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1.5 hover:scale-[1.02]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hero image area — click to open lightbox */}
      <div
        className="relative h-48 bg-gradient-to-b from-slate-800/40 to-[#0c1018] overflow-hidden cursor-pointer"
        onClick={() => imgSrc && setShowLightbox(true)}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={character.name}
            className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800/30 to-slate-900/50">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1018] via-[#0c1018]/70 via-30% to-transparent pointer-events-none" />

        {/* Regenerate button — visible on hover, top-left */}
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="absolute top-2.5 left-2.5 z-10"
          style={{
            padding: '4px 8px', borderRadius: 8, fontSize: 10, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4,
            background: regenerating ? 'rgba(99,102,241,0.3)' : 'rgba(0,0,0,0.6)',
            color: regenerating ? '#c7d2fe' : '#cbd5e1',
            border: regenerating ? '1px solid rgba(129,140,248,0.3)' : '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
            cursor: regenerating ? 'wait' : 'pointer',
            opacity: regenerating ? 1 : undefined,
            transition: 'opacity 200ms, background 200ms',
          }}
        >
          {regenerating ? (
            <>
              <svg style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regen
            </>
          )}
        </button>

        {/* Version count badge — top-left below regen, or top-left if versions exist */}
        {versions.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowVersions(true); }}
            className="absolute top-2.5 right-12 z-10"
            style={{
              padding: '3px 7px', borderRadius: 6, fontSize: 9, fontWeight: 600,
              background: 'rgba(0,0,0,0.6)', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(8px)', cursor: 'pointer',
            }}
          >
            v{activeVersion}/{versions.length}
          </button>
        )}

        {/* Role badge — top right */}
        <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider pointer-events-none ${ROLE_STYLES[roleBadge] || ROLE_STYLES.minor}`}>
          {roleBadge}
        </span>

        {/* Name + meta overlay at bottom of image */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pointer-events-none">
          <h3 className="text-[15px] font-bold text-white leading-tight tracking-wide drop-shadow-lg">
            {character.name}
          </h3>
          {character.displayName && character.displayName !== character.name && (
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{character.displayName}</p>
          )}
          {meta && (
            <p className="text-[11px] text-slate-500 mt-0.5">{meta}</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-4 flex flex-col gap-2.5">
        {/* Description */}
        {character.description && (
          <p className="text-[11px] text-slate-400 leading-[1.6] line-clamp-3">
            {character.description}
          </p>
        )}

        {/* Traits */}
        {character.traits && character.traits.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {character.traits.slice(0, 5).map((trait, i) => (
              <span key={i} className="px-2 py-[3px] rounded text-[10px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.05]">
                {trait}
              </span>
            ))}
            {character.traits.length > 5 && (
              <span className="px-2 py-[3px] rounded text-[10px] text-slate-600">
                +{character.traits.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Voice description */}
        {character.voiceDescription && (
          <p className="text-[10px] text-slate-500 leading-relaxed italic border-l-2 border-slate-700/50 pl-2.5">
            {character.voiceDescription}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          {!hasDescription ? (
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/25 transition-colors disabled:opacity-50"
            >
              {enriching ? 'Enriching\u2026' : 'Enrich with AI'}
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500/70 font-medium">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Enriched
            </span>
          )}
          <button
            onClick={() => setShowEditor(true)}
            className="px-3 py-1.5 rounded-lg text-[11px] text-slate-500 border border-white/[0.06] hover:text-slate-300 hover:bg-white/[0.04] transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Editor modal */}
      {showEditor && <CharacterEditor character={character} onClose={() => setShowEditor(false)} />}

      {/* Image lightbox */}
      {showLightbox && imgSrc && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-pointer"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)]">
            <button
              onClick={e => { e.stopPropagation(); setShowLightbox(false); }}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-slate-900/90 border border-white/15 text-slate-300 text-xl flex items-center justify-center hover:text-white hover:bg-slate-800 transition-colors z-10"
            >
              &times;
            </button>
            <img
              src={imgSrc}
              alt={character.name}
              className="max-w-full max-h-[calc(100vh-6rem)] object-contain rounded-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg pointer-events-none">
              <p className="text-lg font-bold text-white drop-shadow-lg">{character.name}</p>
              {meta && <p className="text-sm text-slate-300">{meta}</p>}
              {versions.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">Version {activeVersion} of {versions.length}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version comparison modal */}
      {showVersions && versions.length > 0 && (
        <VersionCompare
          character={character}
          versions={versions}
          activeVersion={activeVersion}
          onSelect={handleSelectVersion}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}, (prev, next) => {
  const p = prev.character, n = next.character;
  return p.id === n.id
    && p.imagePath === n.imagePath
    && p.description === n.description
    && p.name === n.name
    && p.role === n.role
    && p.voiceDescription === n.voiceDescription
    && p.activeImageVersion === n.activeImageVersion
    && JSON.stringify(p.traits) === JSON.stringify(n.traits)
    && JSON.stringify(p.imageVersions) === JSON.stringify(n.imageVersions)
    && prev.pipelineId === next.pipelineId;
});

// ── Version comparison modal ─────────────────────────────────

function VersionCompare({
  character,
  versions,
  activeVersion,
  onSelect,
  onClose,
}: {
  character: any;
  versions: any[];
  activeVersion: number;
  onSelect: (v: number) => Promise<void>;
  onClose: () => void;
}) {
  const [selecting, setSelecting] = useState<number | null>(null);

  const handleSelect = async (v: number) => {
    setSelecting(v);
    await onSelect(v);
    setSelecting(null);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10002,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(12px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#141820',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          boxShadow: '0 25px 50px rgba(0,0,0,0.7)',
          width: '90vw', maxWidth: 960,
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>
              {character.name} — Image Versions
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
              {versions.length} version{versions.length !== 1 ? 's' : ''} — click "Use This" to set as active
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', cursor: 'pointer',
            }}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Version grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}>
          {versions.map((v: any) => {
            const isActive = v.version === activeVersion;
            const thumbSrc = `/api/file?path=${encodeURIComponent(v.filePath)}`;
            const date = new Date(v.generatedAt);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={v.version}
                style={{
                  borderRadius: 12, overflow: 'hidden',
                  border: isActive ? '2px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.06)',
                  background: isActive ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                  transition: 'border-color 150ms, background 150ms',
                }}
              >
                {/* Image */}
                <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', cursor: 'pointer' }}>
                  <img
                    src={thumbSrc}
                    alt={`Version ${v.version}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(99,102,241,0.85)', color: '#fff',
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      Active
                    </div>
                  )}
                </div>

                {/* Info bar */}
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                      Version {v.version}
                    </p>
                    <p style={{ margin: '1px 0 0', fontSize: 9, color: '#64748b' }}>
                      {dateStr}
                    </p>
                  </div>
                  {!isActive && (
                    <button
                      onClick={() => handleSelect(v.version)}
                      disabled={selecting === v.version}
                      style={{
                        padding: '5px 10px', borderRadius: 6,
                        fontSize: 10, fontWeight: 600,
                        background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
                        border: '1px solid rgba(99,102,241,0.25)',
                        cursor: selecting === v.version ? 'wait' : 'pointer',
                        opacity: selecting === v.version ? 0.5 : 1,
                      }}
                    >
                      {selecting === v.version ? 'Setting...' : 'Use This'}
                    </button>
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
