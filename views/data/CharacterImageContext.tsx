/**
 * CharacterImageContext — provider for character image generation,
 * versioning, and selection. Centralizes API calls and state so
 * individual CharacterCards don't each manage their own fetch logic.
 */
import React, { createContext, useContext, useCallback, useState } from 'react';
import { usePipeline } from './sdk';

interface GeneratingState {
  [characterId: string]: boolean;
}

interface CharacterImageContextValue {
  /** Which characters are currently regenerating */
  generatingIds: GeneratingState;
  /** Generate a new headshot version for a character */
  regenerate: (characterId: string, character: any) => Promise<void>;
  /** Switch the active image version for a character */
  selectVersion: (characterId: string, version: number) => Promise<void>;
}

const CharacterImageContext = createContext<CharacterImageContextValue | null>(null);

export function CharacterImageProvider({ children }: { children: React.ReactNode }) {
  const { pipelineId, reload } = usePipeline();
  const [generatingIds, setGeneratingIds] = useState<GeneratingState>({});

  const regenerate = useCallback(async (characterId: string, character: any) => {
    setGeneratingIds(prev => ({ ...prev, [characterId]: true }));
    try {
      const res = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-character-headshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, character }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Generation failed');
      }
      await reload();
    } catch (err: any) {
      console.error('Regenerate failed:', err);
      alert('Regenerate failed: ' + (err.message || String(err)));
    } finally {
      setGeneratingIds(prev => ({ ...prev, [characterId]: false }));
    }
  }, [pipelineId, reload]);

  const selectVersion = useCallback(async (characterId: string, version: number) => {
    try {
      const res = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/set-character-image-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, version }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Version switch failed');
      }
      await reload();
    } catch (err: any) {
      console.error('Version switch failed:', err);
    }
  }, [pipelineId, reload]);

  return (
    <CharacterImageContext.Provider value={{ generatingIds, regenerate, selectVersion }}>
      {children}
    </CharacterImageContext.Provider>
  );
}

export function useCharacterImages() {
  const ctx = useContext(CharacterImageContext);
  if (!ctx) throw new Error('useCharacterImages must be used within CharacterImageProvider');
  return ctx;
}
