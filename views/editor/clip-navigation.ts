/**
 * Pure utility functions for clip-based timeline navigation.
 * Simple approach: sort all start times, find where we are, move forward or back.
 */

/**
 * Given a sorted list of unique clip start times and the current playhead position,
 * return the next start time after the current position.
 * Returns null if already at or past the last clip.
 */
export function findNextClipStart(clipStarts: number[], currentTime: number): number | null {
  const sorted = [...new Set(clipStarts)].sort((a, b) => a - b);
  for (const t of sorted) {
    if (t > currentTime + 0.01) return t;
  }
  return null;
}

/**
 * Given a sorted list of unique clip start times and the current playhead position,
 * return the previous start time before the current position.
 * If we're currently sitting on a clip start, go to the one before it.
 * Returns 0 if there's nothing before.
 */
export function findPrevClipStart(clipStarts: number[], currentTime: number): number {
  const sorted = [...new Set(clipStarts)].sort((a, b) => a - b);
  let prev = 0;
  for (const t of sorted) {
    if (t >= currentTime - 0.01) break;
    prev = t;
  }
  return prev;
}
