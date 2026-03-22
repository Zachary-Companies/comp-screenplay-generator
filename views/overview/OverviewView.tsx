/**
 * OverviewView — cinematic project dashboard with hero section, stats, and showcases.
 */
import React, { useMemo } from 'react';
import { usePipeline } from './sdk';

interface OverviewViewProps {
  schema: any | null;
  appState: any | null;
}

export function OverviewView({ schema, appState }: OverviewViewProps) {
  const { project: projectData, pipelineName, pipelineId, projectFolder } = usePipeline();

  const title = projectData?.metadata?.title || pipelineName || 'Pipeline';
  const logline = projectData?.metadata?.logline;
  const characters = projectData?.characters || [];
  const locations = projectData?.locations || [];
  const elements = projectData?.elements || [];
  const sections = projectData?.sections || [];
  const metadata = projectData?.metadata;
  const previsShots = projectData?.previsualizations?.shots || [];

  // Count scenes
  const sceneCount = useMemo(() => {
    let count = 0;
    function walk(secs: any[]) {
      for (const s of secs) {
        if (s.type === 'scene') count++;
        if (s.children) walk(s.children);
      }
    }
    walk(sections);
    return count;
  }, [sections]);

  // Get featured characters (ones with images)
  const featuredChars = useMemo(() =>
    characters.filter((c: any) => c.imagePath).slice(0, 8),
  [characters]);

  // Get featured locations (ones with images)
  const featuredLocs = useMemo(() =>
    locations.filter((l: any) => l.imagePath).slice(0, 6),
  [locations]);

  // Get featured previs shots
  const featuredPrevis = useMemo(() =>
    previsShots.filter((s: any) => s.filePath).slice(0, 8),
  [previsShots]);

  // Genre/tone pills
  const genres = metadata?.genre || [];
  const tones = metadata?.tone || [];

  // Node stats
  const nodeData = appState?.nodeData || {};
  const staleNodes = appState?.staleNodes || [];
  const schemaSections = schema?.sections || [];

  // Hero background — use first previs shot or first location image
  const heroBg = useMemo(() => {
    const firstPrevis = previsShots.find((s: any) => s.filePath);
    if (firstPrevis) return `/api/file?path=${encodeURIComponent(firstPrevis.filePath)}`;
    const firstLoc = locations.find((l: any) => l.imagePath);
    if (firstLoc) return `/api/file?path=${encodeURIComponent(firstLoc.imagePath)}`;
    return null;
  }, [previsShots, locations]);

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
      {/* ── Hero Section ────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 280 }}>
        {/* Background image */}
        {heroBg && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${heroBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
              filter: 'blur(1px) brightness(0.35) saturate(1.3)',
            }}
          />
        )}
        {/* Gradient overlays */}
        <div className="absolute inset-0" style={{
          background: heroBg
            ? 'linear-gradient(180deg, rgba(15,21,42,0.4) 0%, rgba(15,21,42,0.85) 70%, #0f172a 100%)'
            : 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(56,189,248,0.08) 50%, transparent 100%)',
        }} />
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 60% 80% at 20% 20%, rgba(124,58,237,0.2), transparent 60%)',
        }} />

        {/* Content */}
        <div className="relative z-10 px-8 pt-10 pb-8">
          {/* Genre/Tone pills */}
          {(genres.length > 0 || tones.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {genres.map((g: string) => (
                <span key={g} style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)',
                  color: '#c4b5fd',
                }}>{g}</span>
              ))}
              {tones.map((t: string) => (
                <span key={t} style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)',
                  color: '#7dd3fc',
                }}>{t}</span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 style={{
            fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15,
            background: 'linear-gradient(135deg, #fff 20%, #c4b5fd 60%, #7dd3fc 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', marginBottom: 8,
          }}>{title}</h1>

          {/* Logline */}
          {logline && (
            <p style={{
              fontSize: 15, color: '#94a3b8', fontStyle: 'italic',
              maxWidth: 640, lineHeight: 1.6, marginBottom: 8,
            }}>{logline}</p>
          )}

          {/* Author & Runtime */}
          <div className="flex items-center gap-4 mt-2">
            {metadata?.author?.length > 0 && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                By {metadata.author.map((a: any) => a.name).join(' & ')}
              </span>
            )}
            {metadata?.runtimeMinutes && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {metadata.runtimeMinutes} min
              </span>
            )}
            {metadata?.estimatedPages && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {metadata.estimatedPages} pages
              </span>
            )}
            {metadata?.draftDate && (
              <span style={{ fontSize: 12, color: '#475569' }}>
                Draft {new Date(metadata.draftDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Row ───────────────────────────────────────────── */}
      <div className="px-8 -mt-2 mb-8">
        <div className="grid grid-cols-5 gap-3">
          <GlassStatCard value={sceneCount} label="Scenes" icon="🎬" color="#a78bfa" />
          <GlassStatCard value={characters.length} label="Characters" icon="👥" color="#38bdf8" />
          <GlassStatCard value={locations.length} label="Locations" icon="📍" color="#f472b6" />
          <GlassStatCard value={elements.length} label="Elements" icon="📝" color="#34d399" />
          <GlassStatCard value={previsShots.length} label="Previs Shots" icon="🖼" color="#fbbf24" />
        </div>
      </div>

      {/* ── Cast ────────────────────────────────────────────────── */}
      {featuredChars.length > 0 && (
        <div className="px-8 mb-8">
          <SectionHeader title="Cast" count={characters.length} />
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {featuredChars.map((char: any) => (
              <CharacterCard key={char.id} character={char} pipelineId={pipelineId} />
            ))}
            {characters.length > featuredChars.length && (
              <div className="flex-shrink-0 flex items-center justify-center rounded-xl border border-dashed border-white/10"
                style={{ width: 120, minHeight: 160, color: '#475569', fontSize: 12 }}>
                +{characters.length - featuredChars.length} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Locations ───────────────────────────────────────────── */}
      {featuredLocs.length > 0 && (
        <div className="px-8 mb-8">
          <SectionHeader title="Locations" count={locations.length} />
          <div className="grid grid-cols-3 gap-3">
            {featuredLocs.map((loc: any) => (
              <LocationCard key={loc.id} location={loc} pipelineId={pipelineId} />
            ))}
          </div>
        </div>
      )}

      {/* ── Previsualization ────────────────────────────────────── */}
      {featuredPrevis.length > 0 && (
        <div className="px-8 mb-8">
          <SectionHeader title="Previsualization" count={previsShots.length} />
          <div className="grid grid-cols-4 gap-2">
            {featuredPrevis.map((shot: any, i: number) => (
              <PrevisCard key={shot.shotElementId || i} shot={shot} pipelineId={pipelineId} />
            ))}
          </div>
        </div>
      )}

      {/* ── Story Structure ─────────────────────────────────────── */}
      {sections.length > 0 && (
        <div className="px-8 mb-8">
          <SectionHeader title="Story Structure" />
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {sections.map((act: any) => (
              <ActCard key={act.id || act.title} act={act} />
            ))}
          </div>
        </div>
      )}

      {/* ── Pipeline Health ─────────────────────────────────────── */}
      {schemaSections.length > 0 && (
        <div className="px-8 mb-8">
          <SectionHeader title="Pipeline Nodes" />
          <div className="grid grid-cols-4 gap-2">
            {schemaSections.map((section: any) => {
              const hasData = !!(section.nodeId && nodeData[section.nodeId]);
              const isStale = staleNodes.includes(section.nodeId);
              return (
                <NodeCard key={section.id} section={section} hasData={hasData} isStale={isStale} />
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  );
}


// ── Components ─────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 style={{
        fontSize: 14, fontWeight: 700, color: '#e2e8f0',
        letterSpacing: '-0.01em',
      }}>{title}</h2>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 600, color: '#64748b',
          background: 'rgba(100,116,139,0.15)', padding: '2px 8px',
          borderRadius: 999,
        }}>{count}</span>
      )}
      <div style={{ flex: 1, height: 1, background: 'rgba(139,92,246,0.1)' }} />
    </div>
  );
}

function GlassStatCard({ value, label, icon, color }: { value: number; label: string; icon: string; color: string }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '16px 16px', borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(12px)',
      transition: 'all 0.2s',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.borderColor = `${color}44`;
      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
    }}
    >
      {/* Glow accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}88, transparent)`,
        opacity: 0.6,
      }} />
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {value.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

function CharacterCard({ character, pipelineId }: { character: any; pipelineId: string }) {
  const imgSrc = character.imagePath
    ? `/api/file?path=${encodeURIComponent(character.imagePath)}`
    : null;

  return (
    <div style={{
      flexShrink: 0, width: 120, borderRadius: 14, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      transition: 'all 0.2s', cursor: 'default',
    }}>
      {imgSrc ? (
        <div style={{
          width: '100%', height: 140,
          backgroundImage: `url(${imgSrc})`,
          backgroundSize: 'cover', backgroundPosition: 'center top',
        }} />
      ) : (
        <div style={{
          width: '100%', height: 140,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, color: '#475569',
        }}>👤</div>
      )}
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#e2e8f0',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{character.displayName || character.name}</div>
        {character.role && (
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{character.role}</div>
        )}
      </div>
    </div>
  );
}

function LocationCard({ location, pipelineId }: { location: any; pipelineId: string }) {
  const imgSrc = location.imagePath
    ? `/api/file?path=${encodeURIComponent(location.imagePath)}`
    : null;

  return (
    <div style={{
      position: 'relative', borderRadius: 14, overflow: 'hidden',
      height: 130, cursor: 'default',
      background: imgSrc ? undefined : 'linear-gradient(135deg, rgba(244,114,182,0.1), rgba(56,189,248,0.08))',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {imgSrc && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${imgSrc})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 14px',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: '#f8fafc',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}>{location.name}</div>
        {location.type && (
          <span style={{
            fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '2px 6px', borderRadius: 4,
            background: location.type === 'EXTERIOR' ? 'rgba(56,189,248,0.25)' : 'rgba(251,191,36,0.25)',
            color: location.type === 'EXTERIOR' ? '#7dd3fc' : '#fde68a',
          }}>{location.type}</span>
        )}
      </div>
    </div>
  );
}

function PrevisCard({ shot, pipelineId }: { shot: any; pipelineId: string }) {
  const imgSrc = shot.filePath
    ? `/api/file?path=${encodeURIComponent(shot.filePath)}`
    : null;

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden', height: 100, position: 'relative',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {imgSrc && (
        <div style={{
          width: '100%', height: '100%',
          backgroundImage: `url(${imgSrc})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
      )}
    </div>
  );
}

function ActCard({ act }: { act: any }) {
  const sceneChildren = act.children?.filter((c: any) => c.type === 'scene') || [];
  return (
    <div style={{
      flexShrink: 0, width: 220, borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)',
      padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: '#a78bfa', marginBottom: 8,
      }}>{act.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {sceneChildren.slice(0, 5).map((scene: any) => (
          <div key={scene.id || scene.title} style={{
            fontSize: 11, color: '#94a3b8', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <span style={{ color: '#475569', marginRight: 4 }}>•</span>
            {scene.title}
          </div>
        ))}
        {sceneChildren.length > 5 && (
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
            +{sceneChildren.length - 5} more scenes
          </div>
        )}
      </div>
    </div>
  );
}

function NodeCard({ section, hasData, isStale }: { section: any; hasData: boolean; isStale: boolean }) {
  const dotColor = isStale ? '#fbbf24' : hasData ? '#34d399' : '#334155';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 8,
      background: hasData ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)',
      border: `1px solid ${isStale ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)'}`,
      opacity: hasData ? 1 : 0.5,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: dotColor,
        boxShadow: hasData && !isStale ? '0 0 6px rgba(52,211,153,0.4)' : undefined,
      }} />
      <span style={{
        fontSize: 11, color: '#94a3b8', fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{section.label}</span>
    </div>
  );
}
