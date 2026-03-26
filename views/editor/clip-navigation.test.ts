import { describe, it, expect } from 'vitest';
import { findPrevClipStart, findNextClipStart } from './clip-navigation';

// Typical timeline: clips at 0s, 1s, 3.5s, 7s, 12s
const clips = [0, 1, 3.5, 7, 12];

describe('findNextClipStart — forward button', () => {
  it('from 0s goes to 1s', () => {
    expect(findNextClipStart(clips, 0)).toBe(1);
  });

  it('from 1s goes to 3.5s', () => {
    expect(findNextClipStart(clips, 1)).toBe(3.5);
  });

  it('from 3.5s goes to 7s', () => {
    expect(findNextClipStart(clips, 3.5)).toBe(7);
  });

  it('from 7s goes to 12s', () => {
    expect(findNextClipStart(clips, 7)).toBe(12);
  });

  it('from 12s (last clip) returns null', () => {
    expect(findNextClipStart(clips, 12)).toBeNull();
  });

  it('from between clips (2s) goes to 3.5s', () => {
    expect(findNextClipStart(clips, 2)).toBe(3.5);
  });

  it('from between clips (5s) goes to 7s', () => {
    expect(findNextClipStart(clips, 5)).toBe(7);
  });

  it('handles empty list', () => {
    expect(findNextClipStart([], 0)).toBeNull();
  });

  it('handles single clip — at it returns null', () => {
    expect(findNextClipStart([0], 0)).toBeNull();
  });

  it('handles single clip — before it returns it', () => {
    expect(findNextClipStart([5], 0)).toBe(5);
  });

  it('handles duplicates', () => {
    expect(findNextClipStart([0, 0, 3, 3, 7], 0)).toBe(3);
  });

  it('handles unsorted input', () => {
    expect(findNextClipStart([7, 0, 12, 3, 1], 1)).toBe(3);
  });

  it('before all clips goes to first', () => {
    expect(findNextClipStart([5, 10, 15], 0)).toBe(5);
  });

  it('past all clips returns null', () => {
    expect(findNextClipStart([5, 10], 20)).toBeNull();
  });
});

describe('findPrevClipStart — back button', () => {
  it('from 0s stays at 0', () => {
    expect(findPrevClipStart(clips, 0)).toBe(0);
  });

  it('from 1s goes back to 0s', () => {
    expect(findPrevClipStart(clips, 1)).toBe(0);
  });

  it('from 3.5s goes back to 1s', () => {
    expect(findPrevClipStart(clips, 3.5)).toBe(1);
  });

  it('from 7s goes back to 3.5s', () => {
    expect(findPrevClipStart(clips, 7)).toBe(3.5);
  });

  it('from 12s goes back to 7s', () => {
    expect(findPrevClipStart(clips, 12)).toBe(7);
  });

  it('from between clips (2s) goes to 1s', () => {
    expect(findPrevClipStart(clips, 2)).toBe(1);
  });

  it('from between clips (5s) goes to 3.5s', () => {
    expect(findPrevClipStart(clips, 5)).toBe(3.5);
  });

  it('handles empty list — returns 0', () => {
    expect(findPrevClipStart([], 5)).toBe(0);
  });

  it('before all clips returns 0', () => {
    expect(findPrevClipStart([5, 10], 2)).toBe(0);
  });

  it('handles duplicates', () => {
    expect(findPrevClipStart([0, 0, 3, 3, 7, 7], 7)).toBe(3);
  });

  it('handles unsorted input', () => {
    expect(findPrevClipStart([12, 7, 0, 3.5, 1], 7)).toBe(3.5);
  });

  it('past all clips returns last clip', () => {
    expect(findPrevClipStart([0, 5, 10], 20)).toBe(10);
  });
});
