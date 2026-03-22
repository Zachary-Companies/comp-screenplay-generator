/**
 * ReferencePicker — searchable dropdown for inserting art styles, artists, and emotions
 * into the prompt prefix or other text fields.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { referenceCategories, ReferenceCategory } from './referenceData';

interface ReferencePickerProps {
  onInsert: (text: string) => void;
}

export function ReferencePicker({ onInsert }: ReferencePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(referenceCategories[0].key);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const handleInsert = useCallback((item: string) => {
    // Strip master artist works suffix for cleaner insertion
    const clean = item.includes(' — ') ? item.split(' — ')[0] : item;
    onInsert(clean);
  }, [onInsert]);

  const lowerSearch = search.toLowerCase();

  // When searching, show results across all categories
  const isSearching = lowerSearch.length > 0;
  let searchResults: { category: string; item: string }[] = [];
  if (isSearching) {
    for (const cat of referenceCategories) {
      for (const item of cat.items) {
        if (item.toLowerCase().includes(lowerSearch)) {
          searchResults.push({ category: cat.label, item });
        }
      }
    }
  }

  const currentCategory = referenceCategories.find(c => c.key === activeCategory) || referenceCategories[0];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
          background: open ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
          color: open ? '#a5b4fc' : '#94a3b8', cursor: 'pointer',
          transition: 'all 150ms',
        }}
      >
        🎨 References
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
          width: 480, maxHeight: 420,
          background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search styles, artists, emotions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </div>

          {/* Category tabs (hidden during search) */}
          {!isSearching && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {referenceCategories.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500,
                    background: activeCategory === cat.key ? 'rgba(99,102,241,0.15)' : 'transparent',
                    border: activeCategory === cat.key ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                    color: activeCategory === cat.key ? '#a5b4fc' : '#64748b',
                    cursor: 'pointer', transition: 'all 100ms',
                  }}
                >
                  {cat.label} ({cat.items.length})
                </button>
              ))}
            </div>
          )}

          {/* Items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
            {isSearching ? (
              searchResults.length === 0 ? (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                  No matches
                </div>
              ) : (
                searchResults.map(({ category, item }, i) => (
                  <ItemRow
                    key={`${category}-${i}`}
                    item={item}
                    subtitle={category}
                    onClick={() => handleInsert(item)}
                  />
                ))
              )
            ) : (
              currentCategory.items.map((item, i) => (
                <ItemRow
                  key={i}
                  item={item}
                  onClick={() => handleInsert(item)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, subtitle, onClick }: { item: string; subtitle?: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '5px 10px', borderRadius: 5, fontSize: 12,
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: 'none', color: '#cbd5e1', cursor: 'pointer',
        textAlign: 'left', transition: 'background 100ms',
      }}
    >
      <span>
        {item}
        {subtitle && <span style={{ marginLeft: 8, fontSize: 10, color: '#475569' }}>{subtitle}</span>}
      </span>
      {hovered && <span style={{ fontSize: 10, color: '#6366f1', flexShrink: 0 }}>+ Insert</span>}
    </button>
  );
}
