/**
 * useDataExtraction — React hook wrapper around extractData.
 * Memoizes the extraction result for React component rendering.
 */
import { useMemo } from 'react';
import type { ProjectData } from './sdk';
import { extractData, type ExtractionResult } from './extractData';

export { extractData, type ExtractionResult } from './extractData';

export function useDataExtraction(
  project: ProjectData | null,
  appState: any | null,
  fillGaps: boolean,
  extraDurations?: Record<string, number>,
  compactTimeline?: boolean,
): ExtractionResult {
  return useMemo(() => extractData(project, appState, fillGaps, extraDurations, compactTimeline), [project, appState, fillGaps, extraDurations, compactTimeline]);
}
