/// <reference path="./woodbury.d.ts" />

/**
 * @input cast: string[] - Character definitions
 * @input title: string - Script title for collection name
 * @input visualizationStyle: string - Visual style for prompts
 * @output headshotAssets: string[] - Array of character headshot VisualAssets
 */
export async function execute(
  inputs: { cast: string[]; title: string; visualizationStyle: string },
  context: ScriptContext,
): Promise<{ headshotAssets: string[] }> {
  const { cast, title, visualizationStyle } = inputs;

  const headshotAssets: string[] = [];

  for (const characterDefJson of cast) {
    try {
      const character = JSON.parse(characterDefJson);
      
      // Create headshot prompt incorporating the character details and visualization style
      const headshotPrompt = `${visualizationStyle} style portrait headshot of ${character.displayName || character.name}, ${character.description}. Age range: ${character.ageRange}. Gender: ${character.gender}. ${character.wardrobeNotes ? `Wardrobe: ${character.wardrobeNotes}.` : ''} Professional headshot composition, clear facial features, neutral background.`;
      
      // Create VisualAsset for character headshot
      const headshotAsset = {
        id: `asset_headshot_${character.id}`,
        type: "character-headshot" as const,
        name: `${character.displayName || character.name} Headshot`,
        collectionName: title,
        prompt: headshotPrompt,
        visualizationStyle: visualizationStyle,
        characterId: character.id,
        metadata: {
          characterName: character.displayName || character.name,
          ageRange: character.ageRange,
          gender: character.gender,
          description: character.description
        }
      };
      
      headshotAssets.push(JSON.stringify(headshotAsset));
      
      context.log(`Generated headshot asset for character: ${character.displayName || character.name}`);
      
    } catch (error) {
      context.log(`Error processing character definition: ${error}`);
      continue;
    }
  }
  
  context.log(`Generated ${headshotAssets.length} character headshot assets`);
  
  return { headshotAssets };
}