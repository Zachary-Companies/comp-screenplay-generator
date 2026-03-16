/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptKind: string - Script type
 * @input title: string - Script title
 * @input genre: string - Script genre
 * @input authorName: string - Author name
 * @input logline: string - Script logline
 * @output metadata: string - Complete ScriptMetadata object
 */
export async function execute(
  inputs: { scriptKind: string; title: string; genre: string; authorName: string; logline: string },
  context: ScriptContext,
): Promise<{ metadata: string }> {
  const { scriptKind, title, genre, authorName, logline } = inputs;

  try {
    // Generate current date for draft metadata
    const now = new Date();
    const draftDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Create base metadata object
    const metadata: ScriptMetadata = {
      title,
      subtitle: undefined,
      logline: logline || undefined,
      author: [{
        name: authorName,
        role: "writer" as CreditRole
      }],
      genre: Array.isArray(genre) ? genre : [genre],
      tone: undefined,
      audience: undefined,
      language: "en",
      runtimeMinutes: undefined,
      draftName: "First Draft",
      draftDate,
      version: "1.0"
    };

    // Add series metadata for TV kinds
    if (scriptKind === "tv-episode" || scriptKind === "tv-pilot") {
      const seriesPrompt = `Based on this ${scriptKind} titled "${title}" in the ${genre} genre with logline: "${logline}", generate series metadata including:
      - Series title (if different from episode title)
      - Season number (default 1)
      - Episode number (default 1 for pilot, 2+ for episode)
      - Network or platform
      - Show format (drama, comedy, etc)
      - Episode synopsis
      
      Return as JSON with fields: seriesTitle, seasonNumber, episodeNumber, network, showFormat, episodeSynopsis`;
      
      const seriesData = await context.llm.generateJSON(seriesPrompt);
      
      metadata.seriesMetadata = {
        seriesTitle: seriesData.seriesTitle || title,
        seasonNumber: seriesData.seasonNumber || 1,
        episodeNumber: seriesData.episodeNumber || (scriptKind === "tv-pilot" ? 1 : 2),
        network: seriesData.network || "TBD",
        showFormat: seriesData.showFormat || genre,
        episodeSynopsis: seriesData.episodeSynopsis || logline
      };
    }

    // Add commercial metadata for commercial kind
    if (scriptKind === "commercial") {
      const commercialPrompt = `Based on this commercial script titled "${title}" in the ${genre} genre with logline: "${logline}", generate commercial metadata including:
      - Brand name
      - Product being advertised
      - Campaign name
      - Spot length in seconds (15, 30, or 60)
      - Aspect ratio (16:9, 1:1, 9:16)
      - Call to action
      - Deliverables list
      
      Return as JSON with fields: brand, product, campaign, spotLengthSeconds, aspectRatio, callToAction, deliverables`;
      
      const commercialData = await context.llm.generateJSON(commercialPrompt);
      
      metadata.commercialMetadata = {
        brand: commercialData.brand || "Brand Name",
        product: commercialData.product || "Product",
        campaign: commercialData.campaign || title,
        spotLengthSeconds: commercialData.spotLengthSeconds || 30,
        aspectRatio: commercialData.aspectRatio || "16:9",
        callToAction: commercialData.callToAction || "Learn more",
        deliverables: commercialData.deliverables || ["30s spot", "15s cutdown"]
      };
    }

    // Estimate runtime based on script kind
    if (!metadata.runtimeMinutes) {
      switch (scriptKind) {
        case "commercial":
          metadata.runtimeMinutes = metadata.commercialMetadata?.spotLengthSeconds ? 
            Math.ceil(metadata.commercialMetadata.spotLengthSeconds / 60) : 1;
          break;
        case "short-film":
          metadata.runtimeMinutes = 15;
          break;
        case "tv-episode":
          metadata.runtimeMinutes = genre.toLowerCase().includes("comedy") ? 22 : 44;
          break;
        case "tv-pilot":
          metadata.runtimeMinutes = 44;
          break;
        case "feature-film":
          metadata.runtimeMinutes = 90;
          break;
        default:
          metadata.runtimeMinutes = 30;
      }
    }

    // Generate tone and audience if not provided
    if (!metadata.tone || !metadata.audience) {
      const toneAudiencePrompt = `Based on a ${scriptKind} titled "${title}" in the ${genre} genre with logline: "${logline}", suggest:
      - 2-3 tone descriptors (e.g., "dramatic", "comedic", "suspenseful", "heartwarming")
      - 2-3 target audience descriptors (e.g., "adults 18-34", "families", "genre fans")
      
      Return as JSON with fields: tone (array), audience (array)`;
      
      const toneAudienceData = await context.llm.generateJSON(toneAudiencePrompt);
      
      metadata.tone = toneAudienceData.tone || [genre.toLowerCase()];
      metadata.audience = toneAudienceData.audience || ["general audience"];
    }

    context.log(`Generated metadata for ${scriptKind}: ${title}`);
    
    return { metadata: JSON.stringify(metadata) };
    
  } catch (error) {
    context.log(`Error generating script metadata: ${error}`);
    
    // Return minimal fallback metadata
    const fallbackMetadata: ScriptMetadata = {
      title,
      author: [{ name: authorName, role: "writer" as CreditRole }],
      genre: [genre],
      language: "en",
      draftName: "First Draft",
      draftDate: new Date().toISOString().split('T')[0],
      version: "1.0",
      runtimeMinutes: 30
    };
    
    if (logline) {
      fallbackMetadata.logline = logline;
    }
    
    return { metadata: JSON.stringify(fallbackMetadata) };
  }
}