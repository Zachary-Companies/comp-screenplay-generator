import React, { useState, useEffect, useCallback } from 'react';
import { usePipeline } from './sdk';

interface ProxyStatus {
  running: boolean;
  port: number;
  enabled: boolean;
  baseURL: string | null;
  availableBackends: Record<string, boolean>;
  stats?: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUSD: number;
    avgLatencyMs: number;
    byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; costUSD: number }>;
  };
  health?: { status: string; version: string };
}

const MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', provider: 'Anthropic', backend: 'anthropic' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', provider: 'Anthropic', backend: 'anthropic' },
  { id: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5', provider: 'Anthropic', backend: 'anthropic' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', backend: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', backend: 'openai' },
  { id: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B', provider: 'Groq', backend: 'groq' },
];

export function SettingsView() {
  const pipeline = usePipeline();
  const pipelineId = pipeline.pipelineId;

  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const [toast, setToast] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/llm-proxy/status`);
      if (resp.ok) {
        const data = await resp.json();
        setStatus(data);
      }
    } catch {}
    setLoading(false);
  }, [pipelineId]);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 15000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const handleToggle = useCallback(async () => {
    if (!status) return;
    setToggling(true);
    try {
      const resp = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/llm-proxy/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setStatus(prev => prev ? { ...prev, running: result.running, enabled: result.enabled } : prev);
        showToast(result.enabled ? 'Proxy enabled' : 'Proxy disabled');
        setTimeout(fetchStatus, 2000);
      }
    } catch (err: any) {
      showToast('Error: ' + err.message);
    }
    setToggling(false);
  }, [status, pipelineId, fetchStatus]);

  const handleModelChange = useCallback(async (model: string) => {
    setSelectedModel(model);
    try {
      await fetch(`/api/app/${encodeURIComponent(pipelineId)}/llm-proxy/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      showToast(`Model set to ${model}`);
    } catch {}
  }, [pipelineId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const formatTokens = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
  const formatCost = (n: number) => '$' + n.toFixed(4);

  if (loading) {
    return <div className="stv-container"><div className="stv-loading">Loading settings...</div></div>;
  }

  const backends = status?.availableBackends || {};
  const stats = status?.stats;

  return (
    <div className="stv-container">
      {toast && <div className="stv-toast">{toast}</div>}

      <h2 className="stv-title">Pipeline Settings</h2>

      {/* LLM Proxy Section */}
      <section className="stv-section">
        <div className="stv-section-header">
          <h3>LLM Proxy</h3>
          <div className="stv-status-badge" data-running={status?.running ? 'true' : 'false'}>
            <span className="stv-status-dot" />
            {status?.running ? `Running on port ${status.port}` : 'Stopped'}
          </div>
        </div>

        <div className="stv-toggle-row">
          <label className="stv-toggle-label">
            <span>Enable LLM Proxy</span>
            <span className="stv-toggle-desc">Route all pipeline LLM calls through the proxy for logging, cost tracking, and multi-model routing</span>
          </label>
          <button
            className={`stv-toggle ${status?.enabled ? 'stv-toggle--on' : ''}`}
            onClick={handleToggle}
            disabled={toggling}
            aria-label="Toggle proxy"
          >
            <span className="stv-toggle-knob" />
          </button>
        </div>

        {status?.health && (
          <div className="stv-info-row">
            <span className="stv-info-label">Version</span>
            <span className="stv-info-value">{status.health.version}</span>
          </div>
        )}
        {status?.baseURL && (
          <div className="stv-info-row">
            <span className="stv-info-label">Base URL</span>
            <span className="stv-info-value stv-mono">{status.baseURL}</span>
          </div>
        )}
      </section>

      {/* Available Backends */}
      <section className="stv-section">
        <h3>Available Backends</h3>
        <div className="stv-backends-grid">
          {Object.entries(backends).map(([name, hasKey]) => (
            <div key={name} className={`stv-backend-card ${hasKey ? 'stv-backend-card--active' : ''}`}>
              <span className="stv-backend-icon">{hasKey ? '✅' : '❌'}</span>
              <span className="stv-backend-name">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
              <span className="stv-backend-status">{hasKey ? 'API key set' : 'No API key'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Model Selection */}
      <section className="stv-section">
        <h3>Pipeline Model</h3>
        <p className="stv-section-desc">Select the model used for pipeline LLM calls (script generation, enrichment, etc.)</p>
        <div className="stv-model-grid">
          {MODELS.filter(m => backends[m.backend] !== false).map(m => (
            <button
              key={m.id}
              className={`stv-model-card ${selectedModel === m.id ? 'stv-model-card--selected' : ''} ${!backends[m.backend] ? 'stv-model-card--disabled' : ''}`}
              onClick={() => backends[m.backend] && handleModelChange(m.id)}
              disabled={!backends[m.backend]}
            >
              <span className="stv-model-name">{m.label}</span>
              <span className="stv-model-provider">{m.provider}</span>
              {selectedModel === m.id && <span className="stv-model-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Usage Stats */}
      {stats && stats.totalRequests > 0 && (
        <section className="stv-section">
          <h3>Usage Statistics</h3>
          <div className="stv-stats-summary">
            <div className="stv-stat-card">
              <span className="stv-stat-value">{stats.totalRequests}</span>
              <span className="stv-stat-label">Requests</span>
            </div>
            <div className="stv-stat-card">
              <span className="stv-stat-value">{formatTokens(stats.totalInputTokens + stats.totalOutputTokens)}</span>
              <span className="stv-stat-label">Total Tokens</span>
            </div>
            <div className="stv-stat-card">
              <span className="stv-stat-value">{formatCost(stats.totalCostUSD)}</span>
              <span className="stv-stat-label">Estimated Cost</span>
            </div>
            <div className="stv-stat-card">
              <span className="stv-stat-value">{Math.round(stats.avgLatencyMs)}ms</span>
              <span className="stv-stat-label">Avg Latency</span>
            </div>
          </div>

          {Object.keys(stats.byModel).length > 0 && (
            <table className="stv-stats-table">
              <thead>
                <tr><th>Model</th><th>Requests</th><th>Input</th><th>Output</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {Object.entries(stats.byModel).map(([model, ms]) => (
                  <tr key={model}>
                    <td className="stv-mono">{model}</td>
                    <td>{ms.requests}</td>
                    <td>{formatTokens(ms.inputTokens)}</td>
                    <td>{formatTokens(ms.outputTokens)}</td>
                    <td>{formatCost(ms.costUSD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Proxy Logs (collapsible) */}
      {status?.running && (
        <section className="stv-section">
          <details>
            <summary className="stv-details-summary">Proxy Logs</summary>
            <div className="stv-log-container">
              <button className="stv-btn-sm" onClick={fetchStatus}>Refresh</button>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
