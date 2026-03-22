/**
 * DialogueAudioContext — provider for dialogue audio generation state.
 * Tracks which dialogues have audio and which are generating,
 * so individual DialogueBlocks update without a full pipeline reload.
 */
import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { usePipeline } from './sdk';

interface DialogueAudioState {
  /** elementId → filePath for rendered audio */
  audioPaths: Record<string, string>;
  /** elementId → true while generating */
  generatingIds: Record<string, boolean>;
  /** Generate audio for a single dialogue element */
  generateAudio: (params: {
    elementId: string;
    text: string;
    voiceId: string;
    characterName: string;
    characterId: string;
  }) => Promise<{ success: boolean; filePath?: string }>;
  /** Generate audio for all dialogues in a scene */
  renderScene: (dialogues: Array<{
    elementId: string;
    lines: string[];
    characterName: string;
    characterId: string;
    voiceId: string | null;
  }>) => Promise<{ success: number; total: number }>;
}

const DialogueAudioContext = createContext<DialogueAudioState | null>(null);

export function DialogueAudioProvider({ children }: { children: React.ReactNode }) {
  const { pipelineId, project } = usePipeline();
  const [audioPaths, setAudioPaths] = useState<Record<string, string>>({});
  const [generatingIds, setGeneratingIds] = useState<Record<string, boolean>>({});

  // Seed audio paths from project data on load
  useEffect(() => {
    const paths: Record<string, string> = {};
    const assets = (project as any)?.dialogueAudio?.assets;
    if (Array.isArray(assets)) {
      for (const a of assets) {
        if (a?.metadata?.dialogueElementId && a?.filePath) {
          paths[a.metadata.dialogueElementId] = a.filePath;
        }
      }
    }
    setAudioPaths(prev => {
      // Merge: keep any locally-generated paths that aren't in project yet
      return { ...paths, ...prev };
    });
  }, [project]);

  const generateAudio = useCallback(async (params: {
    elementId: string; text: string; voiceId: string; characterName: string; characterId: string;
  }) => {
    setGeneratingIds(prev => ({ ...prev, [params.elementId]: true }));
    try {
      const resp = await fetch(`/api/app/${encodeURIComponent(pipelineId)}/generate-dialogue-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await resp.json();
      if (data.success && data.filePath) {
        // Update local state immediately — no reload needed
        setAudioPaths(prev => ({ ...prev, [params.elementId]: data.filePath }));
      }
      return { success: data.success, filePath: data.filePath };
    } catch (err: any) {
      console.error('generate-dialogue-audio failed:', err);
      return { success: false };
    } finally {
      setGeneratingIds(prev => ({ ...prev, [params.elementId]: false }));
    }
  }, [pipelineId]);

  const renderScene = useCallback(async (dialogues: Array<{
    elementId: string; lines: string[]; characterName: string; characterId: string; voiceId: string | null;
  }>) => {
    let success = 0;
    const total = dialogues.length;

    for (const d of dialogues) {
      if (!d.voiceId) continue;
      const text = d.lines.join(' ').trim();
      if (!text) continue;

      const result = await generateAudio({
        elementId: d.elementId,
        text,
        voiceId: d.voiceId,
        characterName: d.characterName,
        characterId: d.characterId,
      });
      if (result.success) success++;
    }

    return { success, total };
  }, [generateAudio]);

  return (
    <DialogueAudioContext.Provider value={{ audioPaths, generatingIds, generateAudio, renderScene }}>
      {children}
    </DialogueAudioContext.Provider>
  );
}

export function useDialogueAudio() {
  const ctx = useContext(DialogueAudioContext);
  if (!ctx) throw new Error('useDialogueAudio must be used within DialogueAudioProvider');
  return ctx;
}
