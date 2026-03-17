import { describe, it, expect } from 'vitest';
import { createMockContext } from './_test-helpers.js';

const { execute } = await import('./input-validation.js');

describe('Input Validation', () => {
  it('should validate a basic short film input', async () => {
    const { context } = createMockContext();
    
    const result = await execute({
      projectType: 'Short Film',
      storyIdea: 'A lonely astronaut discovers a message from Earth that changes everything.',
      title: 'Signal',
      genre: 'Sci-Fi, Drama',
      mood: 'Contemplative and hopeful',
      targetAudience: 'Adults',
      visualStyle: 'Cinematic, dark space visuals',
      length: '20 minutes',
      authorName: 'Jane Doe',
    }, context);
    
    // validatedInput is returned as an object, not a JSON string
    const validated = result.validatedInput as any;
    
    expect(validated.kind).toBe('short-film');
    expect(validated.concept).toBe('A lonely astronaut discovers a message from Earth that changes everything.');
    expect(validated.title).toBe('Signal');
    expect(validated.genre).toEqual(['Sci-Fi', 'Drama']);
    expect(validated.tone).toEqual(['Contemplative', 'hopeful']);
    expect(validated.targetRuntimeMinutes).toBe(20);
    expect(validated.authorName).toBe('Jane Doe');
  });

  it('should accept various project type formats', async () => {
    const { context } = createMockContext();
    
    // Test "movie" -> "feature-film"
    const result1 = await execute({
      projectType: 'movie',
      storyIdea: 'An epic adventure story.',
    }, context);
    expect((result1.validatedInput as any).kind).toBe('feature-film');
    
    // Test "TV Episode" -> "tv-episode"
    const result2 = await execute({
      projectType: 'TV Episode',
      storyIdea: 'A detective solves a case.',
    }, context);
    expect((result2.validatedInput as any).kind).toBe('tv-episode');
    
    // Test "ad" -> "commercial"
    const result3 = await execute({
      projectType: 'ad',
      storyIdea: 'A product showcase.',
    }, context);
    expect((result3.validatedInput as any).kind).toBe('commercial');
  });

  it('should parse length in various formats', async () => {
    const { context } = createMockContext();
    
    // Test "2 hours"
    const result1 = await execute({
      projectType: 'Feature Film',
      storyIdea: 'A story.',
      length: '2 hours',
    }, context);
    expect((result1.validatedInput as any).targetRuntimeMinutes).toBe(120);
    
    // Test "90 minutes"
    const result2 = await execute({
      projectType: 'Feature Film',
      storyIdea: 'A story.',
      length: '90 minutes',
    }, context);
    expect((result2.validatedInput as any).targetRuntimeMinutes).toBe(90);
    
    // Test "1.5 hours"
    const result3 = await execute({
      projectType: 'Feature Film',
      storyIdea: 'A story.',
      length: '1.5 hours',
    }, context);
    expect((result3.validatedInput as any).targetRuntimeMinutes).toBe(90);
  });

  it('should set default lengths based on project type', async () => {
    const { context } = createMockContext();
    
    // Commercial default
    const result1 = await execute({
      projectType: 'Commercial',
      storyIdea: 'A product ad.',
    }, context);
    expect((result1.validatedInput as any).targetRuntimeMinutes).toBe(0.5);
    
    // Short film default
    const result2 = await execute({
      projectType: 'Short Film',
      storyIdea: 'A short story.',
    }, context);
    expect((result2.validatedInput as any).targetRuntimeMinutes).toBe(15);
    
    // Feature film default
    const result3 = await execute({
      projectType: 'Feature Film',
      storyIdea: 'A long story.',
    }, context);
    expect((result3.validatedInput as any).targetRuntimeMinutes).toBe(100);
  });

  it('should handle TV series metadata', async () => {
    const { context } = createMockContext();
    
    const result = await execute({
      projectType: 'TV Episode',
      storyIdea: 'A detective investigates a murder.',
      seriesName: 'Cold Case Files',
      seasonNumber: '2',
      episodeNumber: '5',
    }, context);
    
    const validated = result.validatedInput as any;
    expect(validated.seriesMetadata).toEqual({
      seriesTitle: 'Cold Case Files',
      seasonNumber: 2,
      episodeNumber: 5,
    });
  });

  it('should handle commercial metadata', async () => {
    const { context } = createMockContext();
    
    const result = await execute({
      projectType: 'Commercial',
      storyIdea: 'A refreshing beverage ad.',
      brandName: 'FreshCo',
      productName: 'Sparkling Water',
      spotLength: '30',
      callToAction: 'Visit freshco.com',
    }, context);
    
    const validated = result.validatedInput as any;
    expect(validated.commercialMetadata).toEqual({
      brandName: 'FreshCo',
      productName: 'Sparkling Water',
      targetDurationSeconds: 30,
      callToAction: 'Visit freshco.com',
    });
  });

  it('should handle validation errors gracefully with fallback', async () => {
    const { context } = createMockContext();
    
    // Missing project type - returns fallback with error in notes
    const result1 = await execute({
      projectType: '',
      storyIdea: 'A story.',
    }, context);
    const validated1 = result1.validatedInput as any;
    expect(validated1.kind).toBe('short-film'); // fallback
    expect(validated1.notes).toContain('Please select a project type');
    
    // Missing story idea - returns fallback with error in notes
    const result2 = await execute({
      projectType: 'Short Film',
      storyIdea: '',
    }, context);
    const validated2 = result2.validatedInput as any;
    expect(validated2.notes).toContain('Please describe your story idea');
  });

  it('should handle invalid project types with fallback', async () => {
    const { context } = createMockContext();
    
    const result = await execute({
      projectType: 'podcast',
      storyIdea: 'A story.',
    }, context);
    
    const validated = result.validatedInput as any;
    expect(validated.kind).toBe('short-film'); // fallback
    expect(validated.notes).toContain("isn't a recognized project type");
  });

  it('should handle optional fields gracefully', async () => {
    const { context } = createMockContext();
    
    const result = await execute({
      projectType: 'Short Film',
      storyIdea: 'A minimal story.',
    }, context);
    
    const validated = result.validatedInput as any;
    expect(validated.title).toBeNull();
    expect(validated.genre).toEqual([]);
    expect(validated.tone).toEqual([]);
    expect(validated.audience).toEqual([]);
    expect(validated.style).toBe('cinematic'); // default
    expect(validated.authorName).toBe('Anonymous'); // default
  });
});
