/**
 * CharacterEditor — sleek full-screen modal for editing character details.
 * Uses inline styles for backgrounds/colors since Tailwind arbitrary values
 * aren't available in the host app's CSS.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { usePipeline } from './sdk';
import type { Character } from './sdk';

const COLORS = {
  cardBg: '#1a1f2e',
  inputBg: '#0f1219',
  inputBorder: 'rgba(255,255,255,0.12)',
  inputFocusBorder: 'rgba(99,102,241,0.5)',
  label: '#94a3b8',       // slate-400
  sectionTitle: '#94a3b8',
  text: '#e2e8f0',        // slate-200
  textMuted: '#64748b',   // slate-500
  placeholder: 'rgba(100,116,139,0.6)',
  divider: 'rgba(255,255,255,0.06)',
  cancelBg: '#141824',
  cancelBorder: 'rgba(255,255,255,0.1)',
};

export function CharacterEditor({ character, onClose }: { character: Character; onClose: () => void }) {
  const { project: projectData, updateCharacter, saveProject } = usePipeline();
  const [form, setForm] = useState<Character>({ ...character });
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const animateOut = useCallback((cb: () => void) => {
    setVisible(false);
    setTimeout(cb, 200);
  }, []);

  const update = (field: keyof Character, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = useCallback(async () => {
    if (!projectData) return;
    setSaving(true);
    updateCharacter(form.id, form);
    await saveProject();
    setSaving(false);
    animateOut(onClose);
  }, [form, projectData, updateCharacter, saveProject, onClose, animateOut]);

  const imgSrc = form.imagePath
    ? `/api/file?path=${encodeURIComponent(form.imagePath)}`
    : null;

  const roleBadge = form.role || 'minor';
  const meta = [form.ageRange, form.gender].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: visible ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(12px)' : 'blur(0px)',
        transition: 'background-color 200ms ease, backdrop-filter 200ms ease',
      }}
      onClick={e => e.target === e.currentTarget && animateOut(onClose)}
    >
      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
          transition: 'opacity 200ms ease, transform 200ms ease',
          width: 680, maxWidth: '92vw', maxHeight: '88vh',
          borderRadius: 16, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          backgroundColor: COLORS.cardBg,
          border: `1px solid rgba(255,255,255,0.1)`,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header with image */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* Background blur image */}
          {imgSrc && (
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <img src={imgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.1)', filter: 'blur(24px)', opacity: 0.25 }} alt="" />
            </div>
          )}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 20, padding: '20px 24px' }}>
            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
              {imgSrc ? (
                <img
                  src={imgSrc}
                  style={{ width: 80, height: 96, borderRadius: 12, objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.1)' }}
                  alt=""
                />
              ) : (
                <div style={{ width: 80, height: 96, borderRadius: 12, background: 'linear-gradient(135deg, rgba(51,65,85,0.3), rgba(30,41,59,0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px rgba(255,255,255,0.05)' }}>
                  <svg style={{ width: 32, height: 32, color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
            {/* Title area */}
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{character.name}</h2>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  ...(roleBadge === 'main' ? { background: 'rgba(251,191,36,0.2)', color: '#fcd34d', boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.3)' } :
                     roleBadge === 'supporting' ? { background: 'rgba(56,189,248,0.15)', color: '#7dd3fc', boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.25)' } :
                     { background: 'rgba(100,116,139,0.15)', color: '#94a3b8', boxShadow: 'inset 0 0 0 1px rgba(100,116,139,0.25)' })
                }}>
                  {roleBadge}
                </span>
              </div>
              {meta && <p style={{ fontSize: 11, color: COLORS.textMuted, margin: '2px 0 0' }}>{meta}</p>}
            </div>
            {/* Close */}
            <button
              onClick={() => animateOut(onClose)}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', cursor: 'pointer', marginBottom: 'auto' }}
            >
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${COLORS.divider}, transparent)` }} />
        </div>

        {/* Scrollable form body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Identity section */}
            <Section title="Identity">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Name" value={form.name} onChange={v => update('name', v)} />
                <Field label="Display Name" value={form.displayName || ''} onChange={v => update('displayName', v)} placeholder="Uppercase screen name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                <Field label="Age Range" value={form.ageRange || ''} onChange={v => update('ageRange', v)} placeholder="e.g. 30-40" />
                <SelectField label="Gender" value={form.gender || ''} options={['', 'Male', 'Female', 'Non-binary']} onChange={v => update('gender', v)} />
                <SelectField label="Role" value={form.role || ''} options={['', 'main', 'supporting', 'minor']} onChange={v => update('role', v)} />
              </div>
            </Section>

            {/* Story section */}
            <Section title="Story">
              <TextArea label="Description" value={form.description || ''} onChange={v => update('description', v)} rows={3} placeholder="Who is this character?" />
              <TextArea label="Character Arc" value={form.arc || ''} onChange={v => update('arc', v)} rows={2} placeholder="How do they change over the story?" />
            </Section>

            {/* Presentation section */}
            <Section title="Presentation">
              <Field label="Voice Description" value={form.voiceDescription || ''} onChange={v => update('voiceDescription', v)} placeholder="Tone, accent, cadence..." />
              <div style={{ marginTop: 12 }}>
                <Field label="Wardrobe Notes" value={form.wardrobeNotes || ''} onChange={v => update('wardrobeNotes', v)} placeholder="Key wardrobe details..." />
              </div>
            </Section>

            {/* Tags section */}
            <Section title="Tags">
              <Field label="Traits" value={(form.traits || []).join(', ')} onChange={v => update('traits', v.split(',').map(t => t.trim()).filter(Boolean))} placeholder="Comma separated traits..." />
              <div style={{ marginTop: 12 }}>
                <Field label="Aliases" value={(form.aliases || []).join(', ')} onChange={v => update('aliases', v.split(',').map(t => t.trim()).filter(Boolean))} placeholder="Comma separated aliases..." />
              </div>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${COLORS.divider}, transparent)` }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
            <p style={{ fontSize: 10, color: COLORS.textMuted, margin: 0 }}>Changes are saved to the project file</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => animateOut(onClose)}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 11, fontWeight: 500, color: '#94a3b8', background: COLORS.cancelBg, border: `1px solid ${COLORS.cancelBorder}`, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(99,102,241,0.8)', border: '1px solid rgba(129,140,248,0.3)', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.2)', opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Form components ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.sectionTitle, marginBottom: 12, margin: '0 0 12px' }}>{title}</h4>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: COLORS.inputBg,
  border: `1px solid ${COLORS.inputBorder}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: COLORS.text,
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 500, color: COLORS.label, display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = COLORS.inputFocusBorder; }}
        onBlur={e => { e.target.style.borderColor = COLORS.inputBorder; }}
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 500, color: COLORS.label, display: 'block', marginBottom: 4 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as const }}
        onFocus={e => { (e.target as HTMLElement).style.borderColor = COLORS.inputFocusBorder; }}
        onBlur={e => { (e.target as HTMLElement).style.borderColor = COLORS.inputBorder; }}
      >
        {options.map(o => <option key={o} value={o}>{o || '\u2014'}</option>)}
      </select>
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 500, color: COLORS.label, display: 'block', marginBottom: 4 }}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
        onFocus={e => { e.target.style.borderColor = COLORS.inputFocusBorder; }}
        onBlur={e => { e.target.style.borderColor = COLORS.inputBorder; }}
      />
    </div>
  );
}
