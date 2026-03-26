import React, { useState, useCallback, useRef } from 'react';
import { usePipeline } from './sdk';

export function ExportView() {
  const { project: projectData, pipelineId } = usePipeline();
  const [fountainStatus, setFountainStatus] = useState<string | null>(null);
  const [lookbookStatus, setLookbookStatus] = useState<string | null>(null);
  const [lookbookHtml, setLookbookHtml] = useState<string | null>(null);
  const [lookbookFilePath, setLookbookFilePath] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const scenes = projectData?.scenes || [];
  const characters = projectData?.characters || [];
  const locations = projectData?.locations || [];
  const totalShots = scenes.reduce((sum: number, s: any) => sum + (s.shots?.length || 0), 0);
  const previsCount = scenes.reduce((sum: number, s: any) => sum + (s.shots?.filter((sh: any) => sh.previsPath)?.length || 0), 0);

  const handleExportFountain = useCallback(async () => {
    setFountainStatus('Exporting...');
    try {
      const resp = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/export-fountain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await resp.json();
      if (data.text && data.filename) {
        // Create blob download (avoids /api/file MIME type issues)
        const blob = new Blob([data.text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        setFountainStatus(`Exported: ${data.filename}`);
      } else {
        setFountainStatus('Export failed');
      }
    } catch (err: any) {
      setFountainStatus(`Error: ${err.message}`);
    }
    setTimeout(() => setFountainStatus(null), 4000);
  }, [pipelineId]);

  const handleExportLookbook = useCallback(async () => {
    setLookbookStatus('Generating lookbook...');
    try {
      const resp = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/export-lookbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await resp.json();
      if (data.error) {
        setLookbookStatus(`Error: ${data.error}`);
      } else if (data.filePath) {
        setLookbookFilePath(data.filePath);
        // Load HTML via /api/file to avoid large JSON payloads
        const fileUrl = `/api/file?path=${encodeURIComponent(data.filePath)}`;
        setLookbookHtml(fileUrl);
        setLookbookStatus(`Generated: ${data.filename}`);
      } else {
        setLookbookStatus('Export failed');
      }
    } catch (err: any) {
      setLookbookStatus(`Error: ${err.message}`);
    }
    setTimeout(() => setLookbookStatus(null), 4000);
  }, [pipelineId]);

  const handlePrintLookbook = useCallback(() => {
    if (lookbookFilePath) {
      window.open(`/api/file?path=${encodeURIComponent(lookbookFilePath)}&print=1`, '_blank');
    }
  }, [lookbookFilePath]);

  const handleOpenLookbook = useCallback(() => {
    if (lookbookFilePath) {
      window.open(`/api/file?path=${encodeURIComponent(lookbookFilePath)}`, '_blank');
    }
  }, [lookbookFilePath]);

  if (!projectData || scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
        <p className="text-sm">No screenplay data. Import a script or run the pipeline first.</p>
      </div>
    );
  }

  const title = projectData.metadata?.title || 'Untitled';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-white">Export</h1>
        <p className="text-xs text-slate-400 mt-1">{title} — {scenes.length} scenes, {characters.length} characters, {locations.length} locations, {totalShots} shots, {previsCount} previs frames</p>
      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0 px-4 py-3 flex gap-3 flex-wrap items-center">
        <button
          onClick={handleExportFountain}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: '#fdba74', cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(249,115,22,0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(249,115,22,0.1)')}
        >
          📄 Export Fountain
        </button>
        <button
          onClick={handleExportLookbook}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd', cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.1)')}
        >
          📸 Generate Lookbook
        </button>
        {lookbookFilePath && (
          <>
            <button
              onClick={handlePrintLookbook}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.1)')}
            >
              🖨 Print to PDF
            </button>
            <button
              onClick={handleOpenLookbook}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: '#cbd5e1', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.1)')}
            >
              ↗ Open Lookbook
            </button>
          </>
        )}
        {fountainStatus && <span className="text-xs text-orange-300">{fountainStatus}</span>}
        {lookbookStatus && <span className="text-xs text-violet-300">{lookbookStatus}</span>}
      </div>

      {/* Description */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="text-xs text-slate-500 max-w-2xl">
          <strong className="text-slate-400">Fountain</strong> — Industry-standard screenplay format. Opens in Highland, WriterSolo, Final Draft, and other screenwriting apps.
          <br />
          <strong className="text-slate-400">Lookbook</strong> — Visual pitch document with characters, locations, and key frames. Print to PDF from the browser for a polished deck.
        </div>
      </div>

      {/* Lookbook preview */}
      {lookbookHtml && (
        <div className="flex-1 px-4 pb-4 overflow-hidden">
          <div className="h-full border border-white/10 rounded-lg overflow-hidden">
            <iframe
              ref={iframeRef}
              src={lookbookHtml}
              title="Lookbook Preview"
              style={{ width: '100%', height: '100%', border: 'none', background: '#0f0d1a' }}
            />
          </div>
        </div>
      )}

      {/* Empty state when no lookbook yet */}
      {!lookbookHtml && (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          Click "Generate Lookbook" to preview your pitch deck here
        </div>
      )}
    </div>
  );
}
