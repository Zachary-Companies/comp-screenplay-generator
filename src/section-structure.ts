/// <reference path="./woodbury.d.ts" />

/**
 * @input validatedInput: object - Validated script input
 * @input metadata: object - Script metadata
 * @input characters: object[] - Character definitions
 * @input locations: object[] - Location definitions
 * @output sections: object[] - Array of ScriptSection objects
 */
export async function execute(
  inputs: { validatedInput: any; metadata: any; characters: any[]; locations: any[] },
  context: ScriptContext,
): Promise<{ sections: object[] }> {
  const { validatedInput, metadata, characters, locations } = inputs;

  try {
    // Parse inputs (handle both string and object inputs)
    const scriptInput = typeof validatedInput === 'string' ? JSON.parse(validatedInput) : validatedInput;
    const scriptMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const characterDefs = Array.isArray(characters)
      ? characters.map(c => typeof c === 'string' ? JSON.parse(c) : c)
      : [];
    const locationDefs = Array.isArray(locations)
      ? locations.map(l => typeof l === 'string' ? JSON.parse(l) : l)
      : [];

    context.log(`Generating section structure for ${scriptInput.kind} script`);

    // Build prompt for section structure generation
    const prompt = `Generate a comprehensive section structure for a ${scriptInput.kind} script with the following specifications:

Script Details:
- Title: ${scriptMetadata.title}
- Kind: ${scriptInput.kind}
- Genre: ${scriptInput.genre?.join(', ') || 'Not specified'}
- Tone: ${scriptInput.tone?.join(', ') || 'Not specified'}
- Runtime: ${scriptMetadata.runtimeMinutes} minutes
- Logline: ${scriptMetadata.logline}

Characters Available:
${characterDefs.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Locations Available:
${locationDefs.map(l => `- ${l.name}: ${l.description}`).join('\n')}

Generate a JSON array of ScriptSection objects with the following structure:

{
  "id": "unique-section-id",
  "type": "teaser|cold-open|act|scene|montage|sequence|tag|blackout|end-credits",
  "title": "Section Title",
  "order": number,
  "children": [] // Array of nested ScriptSection objects for container sections
}

Rules:
1. For TV episodes: Include teaser, acts (typically 4-6), and tag
2. For TV pilots: Include teaser, acts (typically 4-6), and tag
3. For feature films: Include acts (typically 3), scenes within acts
4. For short films: Include scenes, possibly acts
5. For commercials: Include scenes or montages as appropriate
6. For YouTube shorts: Keep to a single punchy scene or montage (under 60 seconds)
7. For YouTube videos: Include an intro hook, main content segments, and outro/CTA
8. Container sections (teaser, act, montage, sequence) should have children arrays with nested scenes
9. Scene sections should be leaf nodes (no children)
10. Ensure logical flow and pacing appropriate for the runtime
11. Include blackout or end-credits as final section if appropriate

Return ONLY the JSON array of ScriptSection objects.`;

    const sectionsResponse = await context.llm.generateJSON(prompt);

    // Validate and process the response
    let sectionsArray;
    if (Array.isArray(sectionsResponse)) {
      sectionsArray = sectionsResponse;
    } else if (sectionsResponse.sections && Array.isArray(sectionsResponse.sections)) {
      sectionsArray = sectionsResponse.sections;
    } else {
      throw new Error('Invalid sections response format');
    }

    // Validate each section has required fields
    const validatedSections = sectionsArray.map((section, index) => {
      if (!section.id) {
        section.id = `section-${index + 1}`;
      }
      if (!section.type) {
        section.type = 'scene';
      }
      if (!section.title) {
        section.title = `Section ${index + 1}`;
      }
      if (typeof section.order !== 'number') {
        section.order = index + 1;
      }
      if (!Array.isArray(section.children)) {
        section.children = [];
      }

      // Recursively validate children
      if (section.children.length > 0) {
        section.children = section.children.map((child, childIndex) => {
          if (!child.id) {
            child.id = `${section.id}-child-${childIndex + 1}`;
          }
          if (!child.type) {
            child.type = 'scene';
          }
          if (!child.title) {
            child.title = `Scene ${childIndex + 1}`;
          }
          if (typeof child.order !== 'number') {
            child.order = childIndex + 1;
          }
          if (!Array.isArray(child.children)) {
            child.children = [];
          }
          return child;
        });
      }

      return section;
    });

    context.log(`Generated ${validatedSections.length} sections with nested structure`);

    return { sections: validatedSections };

  } catch (error) {
    context.log(`Error in section structure generation: ${error.message}`);

    // Fallback: Generate basic structure based on script kind
    const safeInput = typeof validatedInput === 'string'
      ? (() => { try { return JSON.parse(validatedInput); } catch { return { kind: 'short-film' }; } })()
      : (validatedInput || { kind: 'short-film' });
    const fallbackSections = generateFallbackSections(safeInput.kind);

    return { sections: fallbackSections };
  }
}

function generateFallbackSections(scriptKind: string): any[] {
  switch (scriptKind) {
    case 'tv-episode':
    case 'tv-pilot':
      return [
        {
          id: 'teaser',
          type: 'teaser',
          title: 'Teaser',
          order: 1,
          children: [
            {
              id: 'teaser-scene-1',
              type: 'scene',
              title: 'Opening Scene',
              order: 1,
              children: []
            }
          ]
        },
        {
          id: 'act-1',
          type: 'act',
          title: 'Act One',
          order: 2,
          children: [
            {
              id: 'act1-scene-1',
              type: 'scene',
              title: 'Scene 1',
              order: 1,
              children: []
            },
            {
              id: 'act1-scene-2',
              type: 'scene',
              title: 'Scene 2',
              order: 2,
              children: []
            }
          ]
        },
        {
          id: 'act-2',
          type: 'act',
          title: 'Act Two',
          order: 3,
          children: [
            {
              id: 'act2-scene-1',
              type: 'scene',
              title: 'Scene 1',
              order: 1,
              children: []
            }
          ]
        },
        {
          id: 'tag',
          type: 'tag',
          title: 'Tag',
          order: 4,
          children: [
            {
              id: 'tag-scene-1',
              type: 'scene',
              title: 'Tag Scene',
              order: 1,
              children: []
            }
          ]
        }
      ];

    case 'feature-film':
      return [
        {
          id: 'act-1',
          type: 'act',
          title: 'Act One',
          order: 1,
          children: [
            {
              id: 'act1-scene-1',
              type: 'scene',
              title: 'Opening Scene',
              order: 1,
              children: []
            }
          ]
        },
        {
          id: 'act-2',
          type: 'act',
          title: 'Act Two',
          order: 2,
          children: [
            {
              id: 'act2-scene-1',
              type: 'scene',
              title: 'Scene 1',
              order: 1,
              children: []
            }
          ]
        },
        {
          id: 'act-3',
          type: 'act',
          title: 'Act Three',
          order: 3,
          children: [
            {
              id: 'act3-scene-1',
              type: 'scene',
              title: 'Climax',
              order: 1,
              children: []
            }
          ]
        }
      ];

    case 'short-film':
      return [
        {
          id: 'scene-1',
          type: 'scene',
          title: 'Opening Scene',
          order: 1,
          children: []
        },
        {
          id: 'scene-2',
          type: 'scene',
          title: 'Middle Scene',
          order: 2,
          children: []
        },
        {
          id: 'scene-3',
          type: 'scene',
          title: 'Closing Scene',
          order: 3,
          children: []
        }
      ];

    case 'commercial':
      return [
        {
          id: 'main-sequence',
          type: 'sequence',
          title: 'Main Sequence',
          order: 1,
          children: [
            {
              id: 'commercial-scene-1',
              type: 'scene',
              title: 'Product Introduction',
              order: 1,
              children: []
            }
          ]
        }
      ];

    case 'youtube-short':
      return [
        {
          id: 'hook',
          type: 'scene',
          title: 'Hook',
          order: 1,
          children: []
        },
        {
          id: 'payoff',
          type: 'scene',
          title: 'Payoff',
          order: 2,
          children: []
        }
      ];

    case 'youtube-video':
      return [
        {
          id: 'intro-hook',
          type: 'sequence',
          title: 'Intro Hook',
          order: 1,
          children: [
            {
              id: 'intro-scene-1',
              type: 'scene',
              title: 'Cold Open',
              order: 1,
              children: []
            }
          ]
        },
        {
          id: 'main-content',
          type: 'sequence',
          title: 'Main Content',
          order: 2,
          children: [
            {
              id: 'main-scene-1',
              type: 'scene',
              title: 'Segment 1',
              order: 1,
              children: []
            },
            {
              id: 'main-scene-2',
              type: 'scene',
              title: 'Segment 2',
              order: 2,
              children: []
            }
          ]
        },
        {
          id: 'outro',
          type: 'sequence',
          title: 'Outro & CTA',
          order: 3,
          children: [
            {
              id: 'outro-scene-1',
              type: 'scene',
              title: 'Wrap-Up & Call to Action',
              order: 1,
              children: []
            }
          ]
        }
      ];

    default:
      return [
        {
          id: 'scene-1',
          type: 'scene',
          title: 'Scene 1',
          order: 1,
          children: []
        }
      ];
  }
}
