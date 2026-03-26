/**
 * Pure utility functions for the Metadata view.
 * Extracted for testability — no React or DOM dependencies.
 */

/** Normalize any tag-like value into a string array. */
export function tagList(v: any): string[] {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v))
    return v
      .map((x: any) => (typeof x === 'string' ? x : x?.name || x?.label || String(x)))
      .filter(Boolean);
  return [String(v)];
}

/** Count total shots across all scenes. */
export function countTotalShots(scenes: any[]): number {
  return scenes.reduce((sum: number, s: any) => sum + (s.shots?.length || 0), 0);
}

/** Count shots that have a previs image. */
export function countPrevisShots(scenes: any[]): number {
  return scenes.reduce(
    (sum: number, s: any) => sum + (s.shots?.filter((sh: any) => sh.previsPath)?.length || 0),
    0,
  );
}

/** Count total dialogue entries across all scenes. */
export function countTotalDialogue(scenes: any[]): number {
  return scenes.reduce((sum: number, s: any) => sum + (s.dialogue?.length || 0), 0);
}

/** Compute completeness items for the sidebar progress bars. */
export function computeCompleteness(
  characters: any[],
  locations: any[],
  previsCount: number,
  totalShots: number,
) {
  return [
    {
      label: 'Characters enriched',
      done: characters.filter((c: any) => c.description && c.description.length > 20).length,
      total: characters.length,
    },
    {
      label: 'Character images',
      done: characters.filter((c: any) => c.imagePath).length,
      total: characters.length,
    },
    {
      label: 'Location images',
      done: locations.filter((l: any) => l.imagePath).length,
      total: locations.length,
    },
    {
      label: 'Shots prevised',
      done: previsCount,
      total: totalShots,
    },
  ];
}

/** Format a draft date for display (YYYY-MM-DD). */
export function formatDraftDate(d: any): string {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return String(d);
}

/** Build production detail items from metadata. */
export function buildProductionDetails(metadata: any) {
  return [
    { label: 'Runtime', value: metadata.runtimeMinutes ? `${metadata.runtimeMinutes} min` : null, icon: '⏱' },
    { label: 'Pages', value: metadata.estimatedPages ? String(metadata.estimatedPages) : null, icon: '📄' },
    { label: 'Draft Date', value: metadata.draftDate ? formatDraftDate(metadata.draftDate) : null, icon: '📅' },
    { label: 'Version', value: metadata.version ? String(metadata.version) : null, icon: '🏷' },
    { label: 'Language', value: metadata.language || null, icon: '🌐' },
  ].filter(d => d.value);
}
