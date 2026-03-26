/**
 * DataView — displays characters and locations as card grids with enrich/generate actions.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { usePipeline } from './sdk';
import { CharacterCard } from './CharacterCard';
import { LocationCard } from './LocationCard';
import { CharacterImageProvider } from './CharacterImageContext';
import { ReferencePicker } from './ReferencePicker';
import { tagList, countTotalShots, countPrevisShots, countTotalDialogue, computeCompleteness, formatDraftDate, buildProductionDetails } from './metadataUtils';

type Tab = 'characters' | 'locations' | 'metadata' | 'sections';

const TAB_LABELS: Record<Tab, string> = {
  characters: 'Characters',
  locations: 'Locations',
  metadata: 'Metadata',
  sections: 'Sections',
};

export function DataView() {
  return (
    <CharacterImageProvider>
      <DataViewInner />
    </CharacterImageProvider>
  );
}

function DataViewInner() {
  const pipeline = usePipeline();
  const { project: projectData, pipelineId, loading } = pipeline;
  const [activeTab, setActiveTab] = useState<Tab>('characters');
  const [filter, setFilter] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ completed: number; total: number; name: string }>({ completed: 0, total: 0, name: '' });
  const [promptPrefix, setPromptPrefix] = useState<string>(projectData?.metadata?.imagePromptPrefix || '');
  const [locPromptPrefix, setLocPromptPrefix] = useState<string>(projectData?.metadata?.locationImagePromptPrefix || '');
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [savingLocPrefix, setSavingLocPrefix] = useState(false);
  const prefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync prefix state when project data loads or reloads
  useEffect(() => {
    const saved = projectData?.metadata?.imagePromptPrefix || '';
    setPromptPrefix(prev => prev || saved);
  }, [projectData?.metadata?.imagePromptPrefix]);

  useEffect(() => {
    const saved = projectData?.metadata?.locationImagePromptPrefix || '';
    setLocPromptPrefix(prev => prev || saved);
  }, [projectData?.metadata?.locationImagePromptPrefix]);

  const savePromptPrefix = useCallback(async (value: string) => {
    setSavingPrefix(true);
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/update-prompt-prefix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePromptPrefix: value }),
      });
    } catch (err: any) {
      console.error('Failed to save prompt prefix:', err);
    }
    setSavingPrefix(false);
  }, [pipelineId]);

  const saveLocPromptPrefix = useCallback(async (value: string) => {
    setSavingLocPrefix(true);
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/update-prompt-prefix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationImagePromptPrefix: value }),
      });
    } catch (err: any) {
      console.error('Failed to save location prompt prefix:', err);
    }
    setSavingLocPrefix(false);
  }, [pipelineId]);

  const handlePrefixChange = useCallback((value: string) => {
    setPromptPrefix(value);
    if (prefixTimer.current) clearTimeout(prefixTimer.current);
    prefixTimer.current = setTimeout(() => savePromptPrefix(value), 800);
  }, [savePromptPrefix]);

  const handleLocPrefixChange = useCallback((value: string) => {
    setLocPromptPrefix(value);
    if (locPrefixTimer.current) clearTimeout(locPrefixTimer.current);
    locPrefixTimer.current = setTimeout(() => saveLocPromptPrefix(value), 800);
  }, [saveLocPromptPrefix]);

  const handleReferenceInsert = useCallback((text: string) => {
    const next = promptPrefix ? (promptPrefix.trimEnd() + ', ' + text) : text;
    handlePrefixChange(next);
  }, [promptPrefix, handlePrefixChange]);

  const handleLocReferenceInsert = useCallback((text: string) => {
    const next = locPromptPrefix ? (locPromptPrefix.trimEnd() + ', ' + text) : text;
    handleLocPrefixChange(next);
  }, [locPromptPrefix, handleLocPrefixChange]);

  const handleGenerate = useCallback(async (type: 'characters' | 'locations') => {
    const items = type === 'characters' ? (projectData?.characters || []) : (projectData?.locations || []);
    setGenerating(type);
    setGenProgress({ completed: 0, total: items.length, name: '' });
    try {
      const genFn = type === 'characters' ? pipeline.generateCharacterImages : pipeline.generateLocationImages;
      if (typeof genFn !== 'function') {
        throw new Error(`pipeline.${type === 'characters' ? 'generateCharacterImages' : 'generateLocationImages'} is not available (type: ${typeof genFn})`);
      }
      await genFn((completed: number, name: string) => {
        setGenProgress(prev => ({ ...prev, completed, name }));
      });
    } catch (err: any) {
      console.error('Generation failed:', err);
      alert('Generation failed: ' + (err?.message || String(err)));
    }
    setGenerating(null);
    setGenProgress({ completed: 0, total: 0, name: '' });
  }, [pipeline, projectData]);

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500" role="status" aria-label="Loading project data">Loading...</div>;
  if (!projectData) return <div className="flex items-center justify-center h-full text-slate-500" role="alert">No data loaded</div>;

  const characters = projectData.characters || [];
  const locations = projectData.locations || [];
  const filteredChars = filter
    ? characters.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
    : characters;
  const filteredLocs = filter
    ? locations.filter(l => l.name.toLowerCase().includes(filter.toLowerCase()))
    : locations;

  return (
    <div className="flex flex-col h-full overflow-hidden" role="main" aria-label="Project data manager">
      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-white/5" role="tablist" aria-label="Data categories">
        {(['characters', 'locations', 'metadata', 'sections'] as Tab[]).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`tabpanel-${tab}`}
            id={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              activeTab === tab
                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:text-slate-300 hover:bg-white/[0.06]'
            }`}
          >
            {tab === 'characters' ? `Characters (${characters.length})` :
             tab === 'locations' ? `Locations (${locations.length})` :
             tab === 'metadata' ? 'Metadata' :
             `Sections (${projectData.sections?.length || 0})`}
          </button>
        ))}

        <div className="flex-1" />

        {/* Filter */}
        {(activeTab === 'characters' || activeTab === 'locations') && (
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label={`Filter ${activeTab} by name`}
            className="px-3 py-1 rounded-md text-xs bg-white/[0.03] border border-white/5 text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/30 w-40"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === 'characters' && (
          <div role="tabpanel" id="tabpanel-characters" aria-labelledby="tab-characters">
            {/* Prompt prefix */}
            <div className="mb-4" style={{ maxWidth: 720 }}>
              <div className="flex items-center gap-2 mb-1">
                <label htmlFor="char-prompt-prefix" className="text-[10px] font-medium text-slate-500">Image Prompt Prefix</label>
                <ReferencePicker onInsert={handleReferenceInsert} />
              </div>
              <div className="flex items-start gap-2">
                <textarea
                  id="char-prompt-prefix"
                  value={promptPrefix}
                  onChange={e => handlePrefixChange(e.target.value)}
                  placeholder="e.g. Pixar 3D animation style, vibrant colors, soft lighting..."
                  rows={2}
                  aria-describedby="char-prefix-desc"
                  style={{
                    width: '100%', resize: 'vertical',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.5,
                    color: '#e2e8f0', outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                />
                {savingPrefix && <span role="status" aria-live="polite" className="text-[10px] text-slate-600 mt-2 flex-shrink-0">Saving...</span>}
              </div>
              <p id="char-prefix-desc" className="text-[10px] text-slate-600 mt-1">Prepended to all character image generation prompts</p>
            </div>

            {/* Actions bar */}
            <div className="flex items-center gap-2 mb-4" role="toolbar" aria-label="Character image actions">
              <button
                onClick={() => handleGenerate('characters')}
                disabled={generating === 'characters'}
                aria-busy={generating === 'characters'}
                aria-label={generating === 'characters'
                  ? `Generating headshots: ${genProgress.completed} of ${genProgress.total} complete${genProgress.name ? `, currently ${genProgress.name}` : ''}`
                  : `Generate headshot images for all ${characters.length} characters`}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {generating === 'characters'
                  ? `Generating ${genProgress.completed}/${genProgress.total}${genProgress.name ? ` — ${genProgress.name}` : '...'}`
                  : 'Generate All Headshots'}
              </button>
              <span className="text-[10px] text-slate-600" aria-label={`${characters.filter(c => c.description && c.description.length > 20).length} of ${characters.length} characters enriched, ${characters.filter(c => c.imagePath).length} of ${characters.length} with images`}>
                {characters.filter(c => c.description && c.description.length > 20).length}/{characters.length} enriched
                {' \u2022 '}
                {characters.filter(c => c.imagePath).length}/{characters.length} with images
              </span>
            </div>

            {/* Card grid */}
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              role="list"
              aria-label={`${filteredChars.length} characters${filter ? ` matching "${filter}"` : ''}`}
            >
              {filteredChars.map(char => (
                <div key={char.id} role="listitem">
                  <CharacterCard character={char} pipelineId={pipelineId} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'locations' && (
          <div role="tabpanel" id="tabpanel-locations" aria-labelledby="tab-locations">
            {/* Location prompt prefix */}
            <div className="mb-4" style={{ maxWidth: 720 }}>
              <div className="flex items-center gap-2 mb-1">
                <label htmlFor="loc-prompt-prefix" className="text-[10px] font-medium text-slate-500">Location Image Prompt Prefix</label>
                <ReferencePicker onInsert={handleLocReferenceInsert} />
              </div>
              <div className="flex items-start gap-2">
                <textarea
                  id="loc-prompt-prefix"
                  value={locPromptPrefix}
                  onChange={e => handleLocPrefixChange(e.target.value)}
                  placeholder="e.g. Cinematic wide shot, dramatic lighting, film grain..."
                  rows={2}
                  aria-describedby="loc-prefix-desc"
                  style={{
                    width: '100%', resize: 'vertical',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.5,
                    color: '#e2e8f0', outline: 'none',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                />
                {savingLocPrefix && <span role="status" aria-live="polite" className="text-[10px] text-slate-600 mt-2 flex-shrink-0">Saving...</span>}
              </div>
              <p id="loc-prefix-desc" className="text-[10px] text-slate-600 mt-1">Overrides default location prompt when set</p>
            </div>

            <div className="flex items-center gap-2 mb-4" role="toolbar" aria-label="Location image actions">
              <button
                onClick={() => handleGenerate('locations')}
                disabled={generating === 'locations'}
                aria-busy={generating === 'locations'}
                aria-label={generating === 'locations'
                  ? `Generating location shots: ${genProgress.completed} of ${genProgress.total} complete`
                  : `Generate establishing shots for all ${locations.length} locations`}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {generating === 'locations'
                  ? `Generating ${genProgress.completed}/${genProgress.total}${genProgress.name ? ` — ${genProgress.name}` : '...'}`
                  : 'Generate All Location Shots'}
              </button>
              <span className="text-[10px] text-slate-600" aria-label={`${locations.filter(l => l.description && l.description.length > 20).length} of ${locations.length} locations enriched, ${locations.filter(l => l.imagePath).length} of ${locations.length} with images`}>
                {locations.filter(l => l.description && l.description.length > 20).length}/{locations.length} enriched
                {' \u2022 '}
                {locations.filter(l => l.imagePath).length}/{locations.length} with images
              </span>
            </div>

            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              role="list"
              aria-label={`${filteredLocs.length} locations${filter ? ` matching "${filter}"` : ''}`}
            >
              {filteredLocs.map(loc => (
                <div key={loc.id} role="listitem">
                  <LocationCard location={loc} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'metadata' && (
          <div role="tabpanel" id="tabpanel-metadata" aria-labelledby="tab-metadata">
            <MetadataView metadata={projectData.metadata} pipelineId={pipelineId} characters={projectData.characters || []} locations={projectData.locations || []} scenes={projectData.scenes || []} />
          </div>
        )}

        {activeTab === 'sections' && (
          <div role="tabpanel" id="tabpanel-sections" aria-labelledby="tab-sections">
            <SectionsView sections={projectData.sections || []} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metadata View ────────────────────────────────────────────

function MetadataView({ metadata, pipelineId, characters, locations, scenes }: { metadata: any; pipelineId: string; characters: any[]; locations: any[]; scenes: any[] }) {
  const [title, setTitle] = useState(metadata?.title || '');
  const [logline, setLogline] = useState(metadata?.logline || '');
  const [author, setAuthor] = useState(() => {
    const a = metadata?.author;
    if (!a) return '';
    if (typeof a === 'string') return a;
    if (Array.isArray(a)) return a.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean).join(', ');
    return String(a);
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loglineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from project data on reload
  useEffect(() => { if (metadata?.title) setTitle(metadata.title); }, [metadata?.title]);
  useEffect(() => { if (metadata?.logline) setLogline(metadata.logline); }, [metadata?.logline]);

  const saveField = useCallback(async (field: string, value: string) => {
    setSaving(field);
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/update-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
    } catch (err: any) {
      console.error(`Failed to save ${field}:`, err);
    }
    setSaving(null);
  }, [pipelineId]);

  const handleTitleChange = useCallback((value: string) => {
    setTitle(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => saveField('title', value), 800);
  }, [saveField]);

  const handleLoglineChange = useCallback((value: string) => {
    setLogline(value);
    if (loglineTimer.current) clearTimeout(loglineTimer.current);
    loglineTimer.current = setTimeout(() => saveField('logline', value), 800);
  }, [saveField]);

  const handleAuthorChange = useCallback((value: string) => {
    setAuthor(value);
    if (authorTimer.current) clearTimeout(authorTimer.current);
    authorTimer.current = setTimeout(() => saveField('author', value), 800);
  }, [saveField]);

  if (!metadata) return <p className="text-slate-500 text-sm" role="status">No metadata</p>;

  const genres = tagList(metadata.genre);
  const tones = tagList(metadata.tone);
  const audiences = tagList(metadata.audience);
  const totalShots = countTotalShots(scenes);
  const previsCount = countPrevisShots(scenes);
  const totalDialogue = countTotalDialogue(scenes);

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#f1f5f9',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  };

  // Inline editable field helper
  const EditableField = ({ field, value, onChange, display, placeholder, multiline, style }: {
    field: string; value: string; onChange: (v: string) => void; display: React.ReactNode; placeholder: string; multiline?: boolean; style?: React.CSSProperties;
  }) => (
    editingField === field ? (
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={() => setEditingField(null)}
            autoFocus
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', ...style }}
            onFocus={e => { e.target.style.borderColor = 'rgba(139,92,246,0.5)'; }}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyDown={e => e.key === 'Enter' && setEditingField(null)}
            autoFocus
            placeholder={placeholder}
            style={{ ...inputStyle, ...style }}
            onFocus={e => { e.target.style.borderColor = 'rgba(139,92,246,0.5)'; }}
          />
        )}
        {saving === field && <span className="text-[10px] text-violet-400 flex-shrink-0 mt-2">Saving...</span>}
      </div>
    ) : (
      <div onClick={() => setEditingField(field)} className="cursor-pointer group/field" title={`Click to edit ${field}`}>
        {display}
      </div>
    )
  );

  return (
    <div aria-label="Project metadata">
      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, minHeight: '70vh' }}>

        {/* ── Left column: Hero + details ── */}
        <div className="space-y-6">
          {/* Title */}
          <EditableField
            field="title" value={title} onChange={handleTitleChange} placeholder="Project title"
            style={{ fontSize: 32, fontWeight: 700, padding: '4px 12px', letterSpacing: '-0.02em' }}
            display={
              <div className="flex items-center gap-3 group/title">
                <h2 style={{ fontSize: 32, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title || 'Untitled'}</h2>
                <span className="text-slate-600 opacity-0 group-hover/title:opacity-100 transition-opacity text-base">✎</span>
              </div>
            }
          />

          {/* Tags row */}
          {(genres.length > 0 || tones.length > 0 || audiences.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {genres.map(g => (
                <span key={`g-${g}`} className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/20">{g}</span>
              ))}
              {tones.map(t => (
                <span key={`t-${t}`} className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">{t}</span>
              ))}
              {audiences.map(a => (
                <span key={`a-${a}`} className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/20">{a}</span>
              ))}
            </div>
          )}

          {/* Logline */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Logline</div>
            <EditableField
              field="logline" value={logline} onChange={handleLoglineChange} placeholder="Add a logline..." multiline
              style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.7 }}
              display={
                <div className="group/logline">
                  <p style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.7, color: '#cbd5e1' }}>
                    {logline || <span className="text-slate-600">Add a logline...</span>}
                    <span className="text-slate-600 opacity-0 group-hover/logline:opacity-100 transition-opacity ml-2 text-sm not-italic">✎</span>
                  </p>
                </div>
              }
            />
          </div>

          {/* Author */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Written by</span>
            <EditableField
              field="author" value={author} onChange={handleAuthorChange} placeholder="Author name"
              style={{ fontSize: 14 }}
              display={
                <div className="flex items-center gap-1.5 group/author">
                  <span className="text-sm font-medium text-slate-200">{author || <span className="text-slate-600">Unknown</span>}</span>
                  <span className="text-slate-600 opacity-0 group-hover/author:opacity-100 transition-opacity text-sm">✎</span>
                </div>
              }
            />
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Stats row — large format */}
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">Project Stats</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: 'Scenes', value: scenes.length, color: 'text-indigo-300' },
                { label: 'Characters', value: characters.length, color: 'text-emerald-300' },
                { label: 'Locations', value: locations.length, color: 'text-rose-300' },
                { label: 'Shots', value: totalShots, color: 'text-cyan-300' },
                { label: 'Previs', value: previsCount, color: 'text-amber-300' },
                { label: 'Dialogue', value: totalDialogue, color: 'text-violet-300' },
              ].map(stat => (
                <div key={stat.label} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column: Production details ── */}
        <div className="space-y-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Production Details</div>

          {/* Detail cards */}
          <div className="space-y-2">
            {buildProductionDetails(metadata).map(detail => (
              <div key={detail.label} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                <span className="text-base" aria-hidden="true">{detail.icon}</span>
                <div className="flex-1">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{detail.label}</div>
                  <div className="text-sm font-medium text-white">{detail.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Separator */}
          <div className="border-t border-white/5 my-2" />

          {/* Quick info */}
          {metadata.subtitle && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Subtitle</div>
              <div className="text-sm text-slate-300">{metadata.subtitle}</div>
            </div>
          )}

          {metadata.theme && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Theme</div>
              <div className="text-sm text-slate-300">{typeof metadata.theme === 'string' ? metadata.theme : tagList(metadata.theme).join(', ')}</div>
            </div>
          )}

          {metadata.setting && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Setting</div>
              <div className="text-sm text-slate-300">{typeof metadata.setting === 'string' ? metadata.setting : JSON.stringify(metadata.setting)}</div>
            </div>
          )}

          {/* Color-coded status */}
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Completeness</div>
            <div className="space-y-1.5">
              {computeCompleteness(characters, locations, previsCount, totalShots).map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${item.total > 0 ? (item.done / item.total) * 100 : 0}%`,
                        background: item.done === item.total && item.total > 0 ? '#34d399' : item.done > 0 ? '#818cf8' : 'transparent',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 w-16 text-right">{item.done}/{item.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sections View ────────────────────────────────────────────

function SectionsView({ sections }: { sections: any[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const walk = (items: any[]) => {
      items.forEach(s => {
        if (s.id && s.children?.length) { allIds.add(s.id); walk(s.children); }
      });
    };
    walk(sections);
    setExpandedIds(allIds);
  };

  const collapseAll = () => setExpandedIds(new Set());

  // Icons per element type
  const typeIcon = (type: string) => {
    switch (type) {
      case 'act': case 'sequence': return '📁';
      case 'scene': case 'teaser': case 'tag': return '🎬';
      case 'shot': return '📷';
      case 'dialogue': return '💬';
      case 'action': return '⚡';
      case 'montage': return '🎞';
      default: return '•';
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'act': case 'sequence': return 'text-indigo-300';
      case 'scene': case 'teaser': case 'tag': return 'text-cyan-300';
      case 'shot': return 'text-amber-300';
      case 'dialogue': return 'text-emerald-300';
      case 'action': return 'text-slate-400';
      default: return 'text-slate-500';
    }
  };

  function renderElement(el: any) {
    if (el.type === 'dialogue') {
      return (
        <div key={el.id} className="flex items-start gap-2 py-1 pl-4">
          <span className="text-[10px] mt-0.5" aria-hidden="true">💬</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wide">{el.characterName || 'UNKNOWN'}</span>
            {el.modifiers?.length > 0 && (
              <span className="text-[9px] text-slate-600 ml-1">({el.modifiers.join(', ')})</span>
            )}
            <p className="text-xs text-slate-400 leading-relaxed mt-0.5 line-clamp-2">{el.content || el.lines?.join(' ') || ''}</p>
          </div>
        </div>
      );
    }

    if (el.type === 'shot') {
      return (
        <div key={el.id} className="flex items-start gap-2 py-1 pl-4">
          <span className="text-[10px] mt-0.5" aria-hidden="true">📷</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {el.frameSize && <span className="text-[9px] font-semibold text-amber-400 uppercase">{el.frameSize}</span>}
              {el.cameraMovement && el.cameraMovement !== 'STATIC' && (
                <span className="text-[9px] text-amber-300/60">{el.cameraMovement}</span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{el.content || el.shotText || ''}</p>
          </div>
        </div>
      );
    }

    // action or other
    return (
      <div key={el.id} className="flex items-start gap-2 py-1 pl-4">
        <span className="text-[10px] mt-0.5" aria-hidden="true">{typeIcon(el.type)}</span>
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 flex-1 min-w-0">{el.content || el.title || ''}</p>
      </div>
    );
  }

  function renderSection(sec: any, depth: number) {
    const hasChildren = sec.children?.length > 0;
    const isSection = sec.title && (sec.type === 'act' || sec.type === 'scene' || sec.type === 'sequence' || sec.type === 'teaser' || sec.type === 'tag' || sec.type === 'montage' || hasChildren);
    const isExpanded = expandedIds.has(sec.id);

    // Leaf elements (shot, dialogue, action) — render inline
    if (!isSection) {
      return renderElement(sec);
    }

    // Count children by type
    const childCounts: Record<string, number> = {};
    (sec.children || []).forEach((c: any) => {
      childCounts[c.type] = (childCounts[c.type] || 0) + 1;
    });

    return (
      <div key={sec.id || sec.title} style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        <div
          className={`flex items-center gap-2 py-1.5 cursor-pointer rounded-md px-2 hover:bg-white/[0.03] transition-colors ${depth === 0 ? 'font-semibold' : ''}`}
          onClick={() => hasChildren && toggle(sec.id)}
        >
          {hasChildren && (
            <span className="text-[10px] text-slate-600 w-3 text-center select-none">{isExpanded ? '▼' : '▶'}</span>
          )}
          <span className="text-[11px]" aria-hidden="true">{typeIcon(sec.type)}</span>
          <span className={`text-xs flex-1 ${typeColor(sec.type)}`}>{sec.title}</span>
          {sec.timeOfDay && <span className="text-[9px] text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{sec.timeOfDay}</span>}
          {/* Child type badges */}
          {hasChildren && !isExpanded && (
            <div className="flex items-center gap-1.5">
              {childCounts['shot'] && <span className="text-[9px] text-amber-400/60">{childCounts['shot']} shots</span>}
              {childCounts['dialogue'] && <span className="text-[9px] text-emerald-400/60">{childCounts['dialogue']} dlg</span>}
              {childCounts['action'] && <span className="text-[9px] text-slate-500">{childCounts['action']} act</span>}
              {childCounts['scene'] && <span className="text-[9px] text-cyan-400/60">{childCounts['scene']} scenes</span>}
            </div>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="border-l border-white/[0.06] ml-3">
            {sec.children.map((child: any) => renderSection(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (!sections.length) return <p className="text-slate-500 text-sm">No sections</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={expandAll} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: '#94a3b8', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Expand All</button>
        <button onClick={collapseAll} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: '#94a3b8', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Collapse All</button>
        <span className="text-[10px] text-slate-600 ml-auto">{sections.length} top-level sections</span>
      </div>
      <div className="space-y-0.5" role="tree" aria-label="Screenplay structure">
        {sections.map(sec => renderSection(sec, 0))}
      </div>
    </div>
  );
}
