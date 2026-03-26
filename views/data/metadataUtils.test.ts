/**
 * Tests for MetadataView utility functions — tag parsing, stat calculations,
 * completeness tracking, production details, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  tagList,
  countTotalShots,
  countPrevisShots,
  countTotalDialogue,
  computeCompleteness,
  formatDraftDate,
  buildProductionDetails,
} from './metadataUtils.js';

// ── tagList ─────────────────────────────────────────────────────

describe('tagList', () => {
  it('should return empty array for null/undefined', () => {
    expect(tagList(null)).toEqual([]);
    expect(tagList(undefined)).toEqual([]);
    expect(tagList('')).toEqual([]);
    expect(tagList(0)).toEqual([]);
  });

  it('should wrap a single string in an array', () => {
    expect(tagList('Drama')).toEqual(['Drama']);
    expect(tagList('Sci-Fi')).toEqual(['Sci-Fi']);
  });

  it('should pass through a string array', () => {
    expect(tagList(['Drama', 'Thriller'])).toEqual(['Drama', 'Thriller']);
  });

  it('should extract .name from object arrays', () => {
    expect(tagList([{ name: 'Drama' }, { name: 'Comedy' }])).toEqual(['Drama', 'Comedy']);
  });

  it('should extract .label from object arrays when .name is missing', () => {
    expect(tagList([{ label: 'PG-13' }, { label: 'R' }])).toEqual(['PG-13', 'R']);
  });

  it('should prefer .name over .label', () => {
    expect(tagList([{ name: 'Drama', label: 'D' }])).toEqual(['Drama']);
  });

  it('should stringify numbers passed as the value', () => {
    expect(tagList(42)).toEqual(['42']);
  });

  it('should stringify objects without name or label', () => {
    expect(tagList([{ id: 1 }])).toEqual(['[object Object]']);
  });

  it('should filter out empty strings from arrays', () => {
    expect(tagList(['Drama', '', 'Comedy'])).toEqual(['Drama', 'Comedy']);
  });

  it('should handle mixed arrays (strings and objects)', () => {
    expect(tagList(['Drama', { name: 'Comedy' }, { label: 'Thriller' }])).toEqual([
      'Drama',
      'Comedy',
      'Thriller',
    ]);
  });

  it('should handle false-y boolean', () => {
    expect(tagList(false)).toEqual([]);
  });
});

// ── countTotalShots ─────────────────────────────────────────────

describe('countTotalShots', () => {
  it('should return 0 for empty scenes', () => {
    expect(countTotalShots([])).toBe(0);
  });

  it('should count shots across scenes', () => {
    const scenes = [
      { shots: [{ id: '1' }, { id: '2' }] },
      { shots: [{ id: '3' }] },
    ];
    expect(countTotalShots(scenes)).toBe(3);
  });

  it('should handle scenes without shots', () => {
    const scenes = [{ id: 'scene-1' }, { shots: [{ id: '1' }] }];
    expect(countTotalShots(scenes)).toBe(1);
  });

  it('should handle scenes with empty shots array', () => {
    const scenes = [{ shots: [] }, { shots: [{ id: '1' }] }];
    expect(countTotalShots(scenes)).toBe(1);
  });
});

// ── countPrevisShots ────────────────────────────────────────────

describe('countPrevisShots', () => {
  it('should return 0 for empty scenes', () => {
    expect(countPrevisShots([])).toBe(0);
  });

  it('should count only shots with previsPath', () => {
    const scenes = [
      {
        shots: [
          { id: '1', previsPath: '/img/1.png' },
          { id: '2' },
          { id: '3', previsPath: '/img/3.png' },
        ],
      },
      {
        shots: [{ id: '4' }, { id: '5', previsPath: '' }],
      },
    ];
    // previsPath: '' is falsy, so only 2 count
    expect(countPrevisShots(scenes)).toBe(2);
  });

  it('should handle scenes without shots', () => {
    const scenes = [{ id: 'scene-1' }];
    expect(countPrevisShots(scenes)).toBe(0);
  });
});

// ── countTotalDialogue ──────────────────────────────────────────

describe('countTotalDialogue', () => {
  it('should return 0 for empty scenes', () => {
    expect(countTotalDialogue([])).toBe(0);
  });

  it('should count dialogue entries', () => {
    const scenes = [
      { dialogue: ['line 1', 'line 2'] },
      { dialogue: ['line 3'] },
    ];
    expect(countTotalDialogue(scenes)).toBe(3);
  });

  it('should handle scenes without dialogue', () => {
    const scenes = [{ id: 'scene-1' }, { dialogue: ['hello'] }];
    expect(countTotalDialogue(scenes)).toBe(1);
  });
});

// ── computeCompleteness ─────────────────────────────────────────

describe('computeCompleteness', () => {
  it('should return all zeros for empty data', () => {
    const result = computeCompleteness([], [], 0, 0);
    expect(result).toHaveLength(4);
    result.forEach(item => {
      expect(item.done).toBe(0);
      expect(item.total).toBe(0);
    });
  });

  it('should count enriched characters (description > 20 chars)', () => {
    const characters = [
      { id: '1', description: 'A brave warrior who fights for justice and honor in battle.' },
      { id: '2', description: 'Short' },
      { id: '3', description: '' },
      { id: '4' },
    ];
    const result = computeCompleteness(characters, [], 0, 0);
    const enriched = result.find(r => r.label === 'Characters enriched')!;
    expect(enriched.done).toBe(1);
    expect(enriched.total).toBe(4);
  });

  it('should count character images', () => {
    const characters = [
      { id: '1', imagePath: '/img/char1.png' },
      { id: '2', imagePath: '' },
      { id: '3' },
    ];
    const result = computeCompleteness(characters, [], 0, 0);
    const images = result.find(r => r.label === 'Character images')!;
    expect(images.done).toBe(1);
    expect(images.total).toBe(3);
  });

  it('should count location images', () => {
    const locations = [
      { id: '1', imagePath: '/img/loc1.png' },
      { id: '2', imagePath: '/img/loc2.png' },
      { id: '3' },
    ];
    const result = computeCompleteness([], locations, 0, 0);
    const images = result.find(r => r.label === 'Location images')!;
    expect(images.done).toBe(2);
    expect(images.total).toBe(3);
  });

  it('should pass through previs counts', () => {
    const result = computeCompleteness([], [], 15, 100);
    const previs = result.find(r => r.label === 'Shots prevised')!;
    expect(previs.done).toBe(15);
    expect(previs.total).toBe(100);
  });

  it('should handle a full project with mixed completeness', () => {
    const characters = [
      { id: '1', description: 'A detailed description that is quite long', imagePath: '/img/1.png' },
      { id: '2', description: 'Short', imagePath: '/img/2.png' },
    ];
    const locations = [
      { id: '1', imagePath: '/img/loc.png' },
      { id: '2' },
    ];
    const result = computeCompleteness(characters, locations, 50, 200);
    expect(result).toEqual([
      { label: 'Characters enriched', done: 1, total: 2 },
      { label: 'Character images', done: 2, total: 2 },
      { label: 'Location images', done: 1, total: 2 },
      { label: 'Shots prevised', done: 50, total: 200 },
    ]);
  });
});

// ── formatDraftDate ─────────────────────────────────────────────

describe('formatDraftDate', () => {
  it('should return empty string for null/undefined', () => {
    expect(formatDraftDate(null)).toBe('');
    expect(formatDraftDate(undefined)).toBe('');
  });

  it('should slice ISO date string to YYYY-MM-DD', () => {
    expect(formatDraftDate('2026-03-23T00:40:54.373Z')).toBe('2026-03-23');
  });

  it('should return short string as-is', () => {
    expect(formatDraftDate('2026-03')).toBe('2026-03');
  });

  it('should stringify non-string values', () => {
    expect(formatDraftDate(12345)).toBe('12345');
  });
});

// ── buildProductionDetails ──────────────────────────────────────

describe('buildProductionDetails', () => {
  it('should return empty array for empty metadata', () => {
    expect(buildProductionDetails({})).toEqual([]);
  });

  it('should include only fields that have values', () => {
    const meta = { runtimeMinutes: 12, language: 'en-US' };
    const details = buildProductionDetails(meta);
    expect(details).toHaveLength(2);
    expect(details[0]).toEqual({ label: 'Runtime', value: '12 min', icon: '⏱' });
    expect(details[1]).toEqual({ label: 'Language', value: 'en-US', icon: '🌐' });
  });

  it('should include all fields when fully populated', () => {
    const meta = {
      runtimeMinutes: 120,
      estimatedPages: 110,
      draftDate: '2026-03-23T00:40:54.373Z',
      version: '2.0',
      language: 'en-US',
    };
    const details = buildProductionDetails(meta);
    expect(details).toHaveLength(5);
    expect(details.map(d => d.label)).toEqual(['Runtime', 'Pages', 'Draft Date', 'Version', 'Language']);
    expect(details[0].value).toBe('120 min');
    expect(details[1].value).toBe('110');
    expect(details[2].value).toBe('2026-03-23');
    expect(details[3].value).toBe('2.0');
    expect(details[4].value).toBe('en-US');
  });

  it('should exclude null/0/undefined fields', () => {
    const meta = { runtimeMinutes: 0, estimatedPages: null, version: undefined };
    expect(buildProductionDetails(meta)).toEqual([]);
  });

  it('should format numeric pages as string', () => {
    const meta = { estimatedPages: 42 };
    const details = buildProductionDetails(meta);
    expect(details[0].value).toBe('42');
  });
});

// ── Integration: realistic project data ─────────────────────────

describe('Integration: realistic project data', () => {
  const metadata = {
    title: 'Stories for Tomorrow',
    logline: 'A terminally ill father races against time to create an AI system that will continue telling bedtime stories to his children after he\'s gone.',
    author: 'Andrew Porter',
    genre: ['Drama', 'Sci-Fi'],
    tone: ['Emotional', 'Hopeful'],
    audience: 'General',
    runtimeMinutes: 12,
    estimatedPages: 12,
    draftDate: '2026-03-23T00:40:54.373Z',
    version: '1.0',
    language: 'en-US',
  };

  const characters = [
    { id: 'c1', displayName: 'DAVID', description: 'A terminally ill father, software engineer, working on AI', imagePath: '/img/david.png' },
    { id: 'c2', displayName: 'SARAH', description: 'Short' },
  ];

  const locations = [
    { id: 'l1', name: 'Home Office', imagePath: '/img/office.png' },
    { id: 'l2', name: 'Hospital' },
    { id: 'l3', name: 'Park', imagePath: '/img/park.png' },
  ];

  const scenes = [
    {
      id: 's1',
      shots: [
        { id: 'sh1', previsPath: '/img/sh1.png' },
        { id: 'sh2' },
        { id: 'sh3', previsPath: '/img/sh3.png' },
      ],
      dialogue: ['line1', 'line2'],
    },
    {
      id: 's2',
      shots: [{ id: 'sh4', previsPath: '/img/sh4.png' }],
      dialogue: ['line3'],
    },
    {
      id: 's3',
      shots: [{ id: 'sh5' }, { id: 'sh6' }],
    },
  ];

  it('should extract genres as string array', () => {
    expect(tagList(metadata.genre)).toEqual(['Drama', 'Sci-Fi']);
  });

  it('should extract audience as single-item array', () => {
    expect(tagList(metadata.audience)).toEqual(['General']);
  });

  it('should count 6 total shots', () => {
    expect(countTotalShots(scenes)).toBe(6);
  });

  it('should count 3 previs shots', () => {
    expect(countPrevisShots(scenes)).toBe(3);
  });

  it('should count 3 dialogue entries', () => {
    expect(countTotalDialogue(scenes)).toBe(3);
  });

  it('should build correct completeness', () => {
    const previs = countPrevisShots(scenes);
    const total = countTotalShots(scenes);
    const result = computeCompleteness(characters, locations, previs, total);
    expect(result).toEqual([
      { label: 'Characters enriched', done: 1, total: 2 },
      { label: 'Character images', done: 1, total: 2 },
      { label: 'Location images', done: 2, total: 3 },
      { label: 'Shots prevised', done: 3, total: 6 },
    ]);
  });

  it('should produce 5 production details', () => {
    const details = buildProductionDetails(metadata);
    expect(details).toHaveLength(5);
  });

  it('should format draft date correctly', () => {
    expect(formatDraftDate(metadata.draftDate)).toBe('2026-03-23');
  });
});
