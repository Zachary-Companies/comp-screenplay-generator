/// <reference path="./woodbury.d.ts" />

/**
 * Input Validation Node
 *
 * Takes simple, user-friendly inputs and validates/combines them into
 * the internal ScriptGeneratorInput format.
 *
 * @input projectType: string - What type of project? (e.g., "Short Film", "TV Episode")
 * @input storyIdea: string - Your story idea in a few sentences
 * @input title: string - Working title for your project (optional)
 * @input genre: string - Main genre (e.g., "Drama", "Comedy", "Horror")
 * @input mood: string - The feeling/tone (e.g., "Dark and suspenseful", "Light and fun")
 * @input targetAudience: string - Who is this for? (e.g., "Adults", "Families", "Teens")
 * @input visualStyle: string - How should it look? (e.g., "Cinematic", "Animated", "Documentary")
 * @input length: string - Approximate length (e.g., "15 minutes", "30 minutes", "2 hours")
 * @input authorName: string - Your name (for credits)
 * @input seriesName: string - Series name (only for TV projects)
 * @input seasonNumber: string - Season number (only for TV projects)
 * @input episodeNumber: string - Episode number (only for TV projects)
 * @input brandName: string - Brand name (only for commercials)
 * @input productName: string - Product name (only for commercials)
 * @input spotLength: string - Commercial length in seconds (only for commercials)
 * @input callToAction: string - What should viewers do? (only for commercials)
 * @input additionalNotes: string - Any other details or requirements
 * @output validatedInput: object - Validated and normalized ScriptGeneratorInput
 */
export async function execute(
  inputs: {
    projectType: string;
    storyIdea: string;
    title?: string;
    genre?: string;
    mood?: string;
    targetAudience?: string;
    visualStyle?: string;
    length?: string;
    authorName?: string;
    seriesName?: string;
    seasonNumber?: string;
    episodeNumber?: string;
    brandName?: string;
    productName?: string;
    spotLength?: string;
    callToAction?: string;
    additionalNotes?: string;
  },
  context: ScriptContext,
): Promise<{ validatedInput: object }> {
  const {
    projectType,
    storyIdea,
    title,
    genre,
    mood,
    targetAudience,
    visualStyle,
    length,
    authorName,
    seriesName,
    seasonNumber,
    episodeNumber,
    brandName,
    productName,
    spotLength,
    callToAction,
    additionalNotes,
  } = inputs;

  try {
    // Validate required fields with friendly error messages
    if (!projectType || projectType.trim() === '') {
      throw new Error('Please select a project type (e.g., "Short Film", "TV Episode", "Commercial")');
    }

    if (!storyIdea || storyIdea.trim() === '') {
      throw new Error('Please describe your story idea - even a few sentences is enough to get started!');
    }

    // Map user-friendly project types to internal kinds
    const projectTypeMap: Record<string, string> = {
      'short film': 'short-film',
      'short': 'short-film',
      'feature film': 'feature-film',
      'feature': 'feature-film',
      'movie': 'feature-film',
      'tv episode': 'tv-episode',
      'episode': 'tv-episode',
      'tv pilot': 'tv-pilot',
      'pilot': 'tv-pilot',
      'commercial': 'commercial',
      'ad': 'commercial',
      'advertisement': 'commercial',
      'youtube short': 'youtube-short',
      'yt short': 'youtube-short',
      'shorts': 'youtube-short',
      'youtube video': 'youtube-video',
      'yt video': 'youtube-video',
      'youtube': 'youtube-video',
    };

    const normalizedType = projectType.toLowerCase().trim();
    const kind = projectTypeMap[normalizedType] || normalizedType;

    // Validate kind
    const validKinds = ['commercial', 'tv-episode', 'tv-pilot', 'feature-film', 'short-film', 'youtube-short', 'youtube-video'];
    if (!validKinds.includes(kind)) {
      throw new Error(
        `"${projectType}" isn't a recognized project type. Try one of these:\n` +
        '• Short Film\n• Feature Film\n• TV Episode\n• TV Pilot\n• Commercial\n• YouTube Short\n• YouTube Video'
      );
    }

    // Parse length into minutes
    let targetRuntimeMinutes: number | null = null;
    if (length && length.trim() !== '') {
      const lengthStr = length.toLowerCase().trim();

      // Handle various formats: "15 minutes", "15 min", "15m", "1 hour", "1.5 hours", "90"
      const hourMatch = lengthStr.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/);
      const minMatch = lengthStr.match(/(\d+)\s*(?:minute|min|m)?/);

      if (hourMatch) {
        targetRuntimeMinutes = Math.round(parseFloat(hourMatch[1]) * 60);
      } else if (minMatch) {
        targetRuntimeMinutes = parseInt(minMatch[1], 10);
      }
    }

    // Set defaults based on project type if length not specified
    if (!targetRuntimeMinutes) {
      switch (kind) {
        case 'commercial':
          targetRuntimeMinutes = 0.5; // 30 seconds
          break;
        case 'short-film':
          targetRuntimeMinutes = 15;
          break;
        case 'tv-episode':
        case 'tv-pilot':
          targetRuntimeMinutes = 45;
          break;
        case 'feature-film':
          targetRuntimeMinutes = 100;
          break;
        case 'youtube-short':
          targetRuntimeMinutes = 1; // ~60 seconds
          break;
        case 'youtube-video':
          targetRuntimeMinutes = 12;
          break;
      }
    }

    // Parse genre into array
    const genreArray: string[] = [];
    if (genre && genre.trim() !== '') {
      // Split by comma, "and", or slash
      const genres = genre.split(/[,\/]|\band\b/i).map(g => g.trim()).filter(g => g);
      genreArray.push(...genres);
    }

    // Parse mood/tone into array
    const toneArray: string[] = [];
    if (mood && mood.trim() !== '') {
      const tones = mood.split(/[,\/]|\band\b/i).map(t => t.trim()).filter(t => t);
      toneArray.push(...tones);
    }

    // Parse audience into array
    const audienceArray: string[] = [];
    if (targetAudience && targetAudience.trim() !== '') {
      const audiences = targetAudience.split(/[,\/]|\band\b/i).map(a => a.trim()).filter(a => a);
      audienceArray.push(...audiences);
    }

    // Build TV series metadata if applicable
    let seriesMetadata: any = null;
    if (kind === 'tv-episode' || kind === 'tv-pilot') {
      if (seriesName && seriesName.trim() !== '') {
        seriesMetadata = {
          seriesTitle: seriesName.trim(),
          seasonNumber: seasonNumber ? parseInt(seasonNumber, 10) || 1 : 1,
          episodeNumber: episodeNumber ? parseInt(episodeNumber, 10) || 1 : 1,
        };
      }
    }

    // Build commercial metadata if applicable
    let commercialMetadata: any = null;
    if (kind === 'commercial') {
      commercialMetadata = {};
      if (brandName && brandName.trim() !== '') {
        commercialMetadata.brandName = brandName.trim();
      }
      if (productName && productName.trim() !== '') {
        commercialMetadata.productName = productName.trim();
      }
      if (spotLength && spotLength.trim() !== '') {
        const seconds = parseInt(spotLength.replace(/\D/g, ''), 10);
        if (seconds > 0) {
          commercialMetadata.targetDurationSeconds = seconds;
        }
      }
      if (callToAction && callToAction.trim() !== '') {
        commercialMetadata.callToAction = callToAction.trim();
      }
      // Only include if we have any data
      if (Object.keys(commercialMetadata).length === 0) {
        commercialMetadata = null;
      }
    }

    // Build the validated input object
    const validatedInput = {
      kind,
      concept: storyIdea.trim(),
      title: title && title.trim() !== '' ? title.trim() : null,
      genre: genreArray,
      tone: toneArray,
      audience: audienceArray,
      setting: null, // Could be extracted from story idea in future
      style: visualStyle && visualStyle.trim() !== '' ? visualStyle.trim() : 'cinematic',
      targetRuntimeMinutes,
      targetPageCount: targetRuntimeMinutes ? Math.round(targetRuntimeMinutes) : null, // ~1 page per minute
      seriesMetadata,
      commercialMetadata,
      notes: additionalNotes && additionalNotes.trim() !== '' ? additionalNotes.trim() : null,
      authorName: authorName && authorName.trim() !== '' ? authorName.trim() : 'Anonymous',
    };

    context.log(`Validated ${kind} project: "${validatedInput.concept.substring(0, 50)}..."`);

    return { validatedInput };

  } catch (error: any) {
    context.log(`Validation failed: ${error.message}`);

    // Return a fallback validation result instead of re-throwing
    const fallbackInput = {
      kind: 'short-film',
      concept: storyIdea?.trim() || 'A story waiting to be told.',
      title: title?.trim() || null,
      genre: [],
      tone: [],
      audience: [],
      setting: null,
      style: 'cinematic',
      targetRuntimeMinutes: 15,
      targetPageCount: 15,
      seriesMetadata: null,
      commercialMetadata: null,
      notes: `Validation error: ${error.message}`,
      authorName: 'Anonymous',
    };

    return { validatedInput: fallbackInput };
  }
}
