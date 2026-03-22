/**
 * DataView — displays characters and locations as card grids with enrich/generate actions.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { usePipeline } from './sdk';
import { CharacterCard } from './CharacterCard';
import { LocationCard } from './LocationCard';
import { CharacterImageProvider } from './CharacterImageContext';
import { ReferencePicker } from './ReferencePicker';

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
          <div role="tabpanel" id="tabpanel-metadata" aria-labelledby="tab-metadata" className="max-w-2xl">
            <MetadataView metadata={projectData.metadata} />
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

function MetadataView({ metadata }: { metadata: any }) {
  if (!metadata) return <p className="text-slate-500 text-sm" role="status">No metadata</p>;

  const fields = [
    ['Title', metadata.title],
    ['Subtitle', metadata.subtitle],
    ['Logline', metadata.logline],
    ['Author', metadata.author?.map((a: any) => a.name).join(', ')],
    ['Genre', metadata.genre?.join(', ')],
    ['Tone', metadata.tone?.join(', ')],
    ['Runtime', metadata.runtimeMinutes ? `${metadata.runtimeMinutes} min` : null],
    ['Pages', metadata.estimatedPages],
    ['Draft Date', metadata.draftDate],
    ['Version', metadata.version],
    ['Language', metadata.language],
  ].filter(([, v]) => v);

  return (
    <dl className="space-y-2" aria-label="Project metadata">
      {fields.map(([label, value]) => (
        <div key={label as string} className="flex gap-3">
          <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
          <dd className="text-xs text-slate-300">{value as string}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Sections View ────────────────────────────────────────────

function SectionsView({ sections }: { sections: any[] }) {
  function renderSection(sec: any, depth: number) {
    return (
      <li key={sec.id || sec.title} style={{ marginLeft: depth * 16 }} className="mb-1" role="treeitem" aria-expanded={sec.children?.length > 0 ? true : undefined}>
        <div className={`flex items-center gap-2 py-1 ${depth === 0 ? 'text-indigo-300 font-semibold' : 'text-slate-400'}`}>
          <span className="text-[10px]" aria-hidden="true">{sec.type === 'act' ? '\uD83D\uDCC1' : '\uD83C\uDFAC'}</span>
          <span className="text-xs">{sec.title}</span>
          {sec.timeOfDay && <span className="text-[9px] text-slate-600">({sec.timeOfDay})</span>}
        </div>
        {sec.children?.length > 0 && (
          <ul role="group">
            {sec.children.map((child: any) => renderSection(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <ul role="tree" aria-label="Screenplay structure">
      {sections.map(sec => renderSection(sec, 0))}
    </ul>
  );
}
