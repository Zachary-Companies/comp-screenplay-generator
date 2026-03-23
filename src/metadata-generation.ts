/// <reference path="./woodbury.d.ts" />

/**
 * @input validatedInput: object - Validated script input
 * @output metadata: object - Complete ScriptMetadata object
 */
export async function execute(
  inputs: { validatedInput: any },
  context: ScriptContext,
): Promise<{ metadata: object }> {
  const { validatedInput } = inputs;

  try {
    const input = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;

    // Generate comprehensive metadata using LLM
    const metadataPrompt = `Generate complete screenplay metadata for the following script input:

${JSON.stringify(input, null, 2)}

Generate a ScriptMetadata object with these fields:
- title: Creative, engaging title
- subtitle: Optional subtitle if appropriate
- logline: Compelling one-sentence summary
- author: Array of CreditPerson objects with name and role
- basedOn: Source material if applicable
- language: Default "en-US"
- series: SeriesMetadata if scriptKind is tv-episode or tv-pilot
- commercial: CommercialMetadata if scriptKind is commercial
- runtimeMinutes: Estimated runtime based on script kind
- estimatedPages: Estimated page count
- genre: Array of genres from input
- tone: Array of tones from input
- audience: Array of target audiences from input
- draftName: "First Draft"
- draftDate: Current date in ISO format
- version: "1.0"

For TV content, include series metadata with title, season, episode number, network, showrunner.
For commercials, include commercial metadata with brand, product, campaign, duration, format.

Return valid JSON only.`;

    const metadataResponse = await context.llm.generateJSON(metadataPrompt);

    // Ensure required fields and proper structure
    const metadata = {
      title: metadataResponse.title || input.title || "Untitled Script",
      subtitle: metadataResponse.subtitle || null,
      logline: metadataResponse.logline || "A compelling story unfolds.",
      author: metadataResponse.author || [{ name: "Anonymous", role: "Writer" }],
      basedOn: metadataResponse.basedOn || null,
      language: "en-US",
      series: input.scriptKind === "tv-episode" || input.scriptKind === "tv-pilot" ?
        (metadataResponse.series || {
          title: input.seriesMetadata?.title || metadataResponse.title + " Series",
          season: input.seriesMetadata?.season || 1,
          episode: input.seriesMetadata?.episode || 1,
          network: input.seriesMetadata?.network || "TBD",
          showrunner: input.seriesMetadata?.showrunner || "TBD"
        }) : null,
      commercial: input.scriptKind === "commercial" ?
        (metadataResponse.commercial || {
          brand: input.commercialMetadata?.brand || "Brand Name",
          product: input.commercialMetadata?.product || "Product",
          campaign: input.commercialMetadata?.campaign || "Campaign",
          duration: input.commercialMetadata?.duration || 30,
          format: input.commercialMetadata?.format || "video"
        }) : null,
      runtimeMinutes: metadataResponse.runtimeMinutes || getEstimatedRuntime(input.scriptKind),
      estimatedPages: metadataResponse.estimatedPages || getEstimatedPages(input.scriptKind),
      genre: input.genre || ["Drama"],
      tone: input.tone || ["Dramatic"],
      audience: input.audience || ["General"],
      draftName: "First Draft",
      draftDate: new Date().toISOString(),
      version: "1.0"
    };

    context.log(`Generated metadata for ${metadata.title} (${input.scriptKind})`);

    return { metadata };

  } catch (error) {
    context.log(`Error generating metadata: ${error.message}`);

    // Fallback metadata
    const fallbackMetadata = {
      title: "Untitled Script",
      subtitle: null,
      logline: "A story waiting to be told.",
      author: [{ name: "Anonymous", role: "Writer" }],
      basedOn: null,
      language: "en-US",
      series: null,
      commercial: null,
      runtimeMinutes: 90,
      estimatedPages: 90,
      genre: ["Drama"],
      tone: ["Dramatic"],
      audience: ["General"],
      draftName: "First Draft",
      draftDate: new Date().toISOString(),
      version: "1.0"
    };

    return { metadata: fallbackMetadata };
  }
}

function getEstimatedRuntime(scriptKind: string): number {
  switch (scriptKind) {
    case "commercial": return 1;
    case "short-film": return 15;
    case "tv-episode": return 45;
    case "tv-pilot": return 60;
    case "feature-film": return 120;
    case "youtube-short": return 1;
    case "youtube-video": return 12;
    default: return 90;
  }
}

function getEstimatedPages(scriptKind: string): number {
  switch (scriptKind) {
    case "commercial": return 1;
    case "short-film": return 15;
    case "tv-episode": return 45;
    case "tv-pilot": return 60;
    case "feature-film": return 120;
    case "youtube-short": return 1;
    case "youtube-video": return 12;
    default: return 90;
  }
}
