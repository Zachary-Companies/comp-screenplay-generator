/**
 * Test fixtures for screenplay generator pipeline tests
 */

// Valid ScriptGeneratorInput
export const validScriptInput = {
  kind: 'short-film',
  concept: 'A marine archivist returns to her hometown harbor',
  title: 'Glass Harbor',
  genre: ['drama', 'mystery'],
  tone: ['melancholic', 'atmospheric'],
  audience: ['adult'],
  setting: 'Coastal New England',
  style: 'cinematic watercolor realism',
  targetRuntimeMinutes: 15,
};

export const validScriptInputJSON = JSON.stringify(validScriptInput);

// Valid metadata
export const validMetadata = {
  title: 'Glass Harbor',
  subtitle: 'A story about memory and tide',
  logline: 'A marine archivist returns to her hometown harbor to confront the memories she buried.',
  author: [{ name: 'Andrew Porter', role: 'writer' }],
  language: 'en-US',
  runtimeMinutes: 15,
  estimatedPages: 15,
  genre: ['drama', 'mystery'],
  tone: ['melancholic', 'atmospheric'],
  audience: ['adult'],
  draftName: 'First Draft',
  draftDate: '2024-01-15',
  version: '1.0',
};

export const validMetadataJSON = JSON.stringify(validMetadata);

// Valid character
export const validCharacter = {
  id: 'char_mara',
  name: 'MARA',
  displayName: 'Mara',
  ageRange: '30s',
  gender: 'female',
  description: 'A guarded marine archivist',
  voiceDescription: 'Soft, measured, with occasional sharp edges',
  wardrobeNotes: 'Practical clothing, weathered jacket',
};

export const validCharacterJSON = JSON.stringify(validCharacter);

// Valid location
export const validLocation = {
  id: 'loc_harbor',
  name: 'Old Harbor',
  description: 'Foggy, weather-beaten marina at dawn',
  recurring: true,
};

export const validLocationJSON = JSON.stringify(validLocation);

// Valid section
export const validSection = {
  id: 'scene_1',
  type: 'scene',
  order: 1,
  title: 'Opening',
  heading: {
    prefix: 'EXT',
    location: 'OLD HARBOR',
    timeOfDay: 'DAWN',
  },
  beats: [
    { id: 'shot_1', type: 'shot', text: 'WIDE SHOT - the harbor swallowed in fog.' },
    { id: 'action_1', type: 'action', text: 'Mara steps onto the dock.' },
  ],
  locationId: 'loc_harbor',
};

export const validSectionJSON = JSON.stringify(validSection);

// Valid script element
export const validElement = {
  id: 'dialogue_1',
  type: 'dialogue',
  characterId: 'char_mara',
  characterName: 'MARA',
  lines: ['I told myself I\'d never come back here.'],
};

export const validElementJSON = JSON.stringify(validElement);

// Valid asset
export const validAsset = {
  id: 'asset_headshot_mara',
  type: 'character-headshot',
  name: 'Mara Headshot',
  collectionName: 'Glass Harbor',
  prompt: 'Portrait headshot of Mara, guarded marine archivist',
  visualizationStyle: 'cinematic watercolor realism',
  characterId: 'char_mara',
  status: 'planned',
};

export const validAssetJSON = JSON.stringify(validAsset);

// Valid asset collection
export const validAssetCollection = {
  id: 'assets_glass_harbor',
  name: 'Glass Harbor',
  assets: [validAsset],
};

export const validAssetCollectionJSON = JSON.stringify(validAssetCollection);

// Valid previs shot
export const validPrevisShot = {
  id: 'previs_1',
  sceneId: 'scene_1',
  shotElementId: 'shot_1',
  shotText: 'WIDE SHOT - the harbor swallowed in fog.',
  order: 1,
  locationId: 'loc_harbor',
  description: 'Establishing frame for the harbor setting.',
  cameraIntent: 'establishing',
  composition: 'very wide',
  lighting: 'cold dawn fog',
  assetId: 'asset_previs_scene1_shot1',
};

export const validPrevisShotJSON = JSON.stringify(validPrevisShot);

// Valid previs plan
export const validPrevisPlan = {
  collectionName: 'Glass Harbor',
  shots: [validPrevisShot],
};

export const validPrevisPlanJSON = JSON.stringify(validPrevisPlan);

// Valid production metadata
export const validProductionMetadata = {
  intendedFormat: 'screenplay',
  pageLockMode: 'none',
  estimatedBudgetTier: 'low',
  targetPlatform: ['film-festival'],
  notes: [],
};

export const validProductionMetadataJSON = JSON.stringify(validProductionMetadata);

// Valid revision metadata
export const validRevisionMetadata = {
  color: 'white',
  revisionDate: '2024-01-15',
  revisionLabel: 'First Draft',
  changedPages: [],
  notes: [],
};

export const validRevisionMetadataJSON = JSON.stringify(validRevisionMetadata);

// Valid script document
export const validScriptDocument = {
  kind: 'short-film',
  metadata: validMetadata,
  cast: [validCharacter],
  locations: [validLocation],
  sections: [validSection],
  production: validProductionMetadata,
  revision: validRevisionMetadata,
};

export const validScriptDocumentJSON = JSON.stringify(validScriptDocument);

// Valid generator rules
export const validGeneratorRules = {
  requireDialogueForNarrativeKinds: true,
  requireHeadshotForEachNamedCharacter: true,
  requireLandscapeForEachLocation: true,
  requirePrevisForEveryShot: true,
};

export const validGeneratorRulesJSON = JSON.stringify(validGeneratorRules);

// Empty/minimal valid inputs for edge case testing
export const minimalScriptInput = {
  kind: 'short-film',
  concept: 'A simple story',
};

export const minimalScriptInputJSON = JSON.stringify(minimalScriptInput);
