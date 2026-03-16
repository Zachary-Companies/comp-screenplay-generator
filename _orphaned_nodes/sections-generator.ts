/// <reference path="./woodbury.d.ts" />

/**
 * @input scriptKind: string - Script type
 * @input metadata: string - Script metadata
 * @input locations: string[] - Location definitions
 * @output sections: string[] - Array of ScriptSection objects
 */
export async function execute(
  inputs: { scriptKind: string; metadata: string; locations: string[] },
  context: ScriptContext,
): Promise<{ sections: string[] }> {
  const { scriptKind, metadata, locations } = inputs;

  try {
    // Parse metadata and locations
    const scriptMetadata = JSON.parse(metadata);
    const locationDefinitions = locations.map(loc => JSON.parse(loc));

    context.log(`Generating sections for ${scriptKind} script: ${scriptMetadata.title}`);

    let sections: any[] = [];
    let sectionCounter = 1;
    let sceneCounter = 1;

    switch (scriptKind) {
      case 'commercial':
        // Single scene or montage for commercial
        sections = [
          {
            id: `section_${sectionCounter++}`,
            type: 'scene',
            title: 'Main Commercial Scene',
            order: 1,
            sceneNumber: sceneCounter++,
            heading: {
              prefix: 'INT.',
              location: locationDefinitions[0]?.name || 'STUDIO',
              sublocation: null,
              timeOfDay: 'DAY'
            },
            synopsis: `Main commercial scene showcasing ${scriptMetadata.commercialMetadata?.product || 'the product'}`,
            beats: [],
            estimatedDurationSeconds: scriptMetadata.commercialMetadata?.spotLengthSeconds || 30,
            locationId: locationDefinitions[0]?.id || 'loc_studio'
          }
        ];
        break;

      case 'tv-episode':
        // Teaser/cold-open + acts + tag
        sections = [
          {
            id: `section_${sectionCounter++}`,
            type: 'teaser',
            title: 'Teaser',
            order: 1,
            children: [
              {
                id: `section_${sectionCounter++}`,
                type: 'scene',
                title: 'Teaser Scene',
                order: 1,
                sceneNumber: sceneCounter++,
                heading: {
                  prefix: locationDefinitions[0] ? 'INT.' : 'EXT.',
                  location: locationDefinitions[0]?.name || 'UNKNOWN LOCATION',
                  sublocation: null,
                  timeOfDay: 'DAY'
                },
                synopsis: 'Opening teaser scene to hook the audience',
                beats: [],
                estimatedDurationSeconds: 180,
                locationId: locationDefinitions[0]?.id || 'loc_unknown'
              }
            ]
          },
          {
            id: `section_${sectionCounter++}`,
            type: 'act',
            title: 'Act One',
            order: 2,
            children: locationDefinitions.slice(0, 3).map((loc, idx) => ({
              id: `section_${sectionCounter++}`,
              type: 'scene',
              title: `Act One Scene ${idx + 1}`,
              order: idx + 1,
              sceneNumber: sceneCounter++,
              heading: {
                prefix: 'INT.',
                location: loc.name,
                sublocation: null,
                timeOfDay: idx % 2 === 0 ? 'DAY' : 'NIGHT'
              },
              synopsis: `Scene at ${loc.name}`,
              beats: [],
              estimatedDurationSeconds: 300,
              locationId: loc.id
            }))
          },
          {
            id: `section_${sectionCounter++}`,
            type: 'act',
            title: 'Act Two',
            order: 3,
            children: locationDefinitions.slice(3, 6).map((loc, idx) => ({
              id: `section_${sectionCounter++}`,
              type: 'scene',
              title: `Act Two Scene ${idx + 1}`,
              order: idx + 1,
              sceneNumber: sceneCounter++,
              heading: {
                prefix: 'EXT.',
                location: loc.name,
                sublocation: null,
                timeOfDay: idx % 2 === 0 ? 'DAY' : 'NIGHT'
              },
              synopsis: `Scene at ${loc.name}`,
              beats: [],
              estimatedDurationSeconds: 400,
              locationId: loc.id
            }))
          },
          {
            id: `section_${sectionCounter++}`,
            type: 'tag',
            title: 'Tag',
            order: 4,
            children: [
              {
                id: `section_${sectionCounter++}`,
                type: 'scene',
                title: 'Tag Scene',
                order: 1,
                sceneNumber: sceneCounter++,
                heading: {
                  prefix: 'INT.',
                  location: locationDefinitions[locationDefinitions.length - 1]?.name || 'FINAL LOCATION',
                  sublocation: null,
                  timeOfDay: 'NIGHT'
                },
                synopsis: 'Final tag scene',
                beats: [],
                estimatedDurationSeconds: 120,
                locationId: locationDefinitions[locationDefinitions.length - 1]?.id || 'loc_final'
              }
            ]
          }
        ];
        break;

      case 'tv-pilot':
        // Cold-open + acts
        sections = [
          {
            id: `section_${sectionCounter++}`,
            type: 'cold-open',
            title: 'Cold Open',
            order: 1,
            children: [
              {
                id: `section_${sectionCounter++}`,
                type: 'scene',
                title: 'Cold Open Scene',
                order: 1,
                sceneNumber: sceneCounter++,
                heading: {
                  prefix: 'EXT.',
                  location: locationDefinitions[0]?.name || 'ESTABLISHING LOCATION',
                  sublocation: null,
                  timeOfDay: 'DAY'
                },
                synopsis: 'Pilot opening scene to establish world and characters',
                beats: [],
                estimatedDurationSeconds: 240,
                locationId: locationDefinitions[0]?.id || 'loc_establishing'
              }
            ]
          },
          {
            id: `section_${sectionCounter++}`,
            type: 'act',
            title: 'Act One',
            order: 2,
            children: locationDefinitions.slice(0, 4).map((loc, idx) => ({
              id: `section_${sectionCounter++}`,
              type: 'scene',
              title: `Act One Scene ${idx + 1}`,
              order: idx + 1,
              sceneNumber: sceneCounter++,
              heading: {
                prefix: idx % 2 === 0 ? 'INT.' : 'EXT.',
                location: loc.name,
                sublocation: null,
                timeOfDay: 'DAY'
              },
              synopsis: `Pilot scene at ${loc.name}`,
              beats: [],
              estimatedDurationSeconds: 360,
              locationId: loc.id
            }))
          },
          {
            id: `section_${sectionCounter++}`,
            type: 'act',
            title: 'Act Two',
            order: 3,
            children: locationDefinitions.slice(4, 8).map((loc, idx) => ({
              id: `section_${sectionCounter++}`,
              type: 'scene',
              title: `Act Two Scene ${idx + 1}`,
              order: idx + 1,
              sceneNumber: sceneCounter++,
              heading: {
                prefix: idx % 2 === 0 ? 'EXT.' : 'INT.',
                location: loc.name,
                sublocation: null,
                timeOfDay: idx % 2 === 0 ? 'NIGHT' : 'DAY'
              },
              synopsis: `Pilot scene at ${loc.name}`,
              beats: [],
              estimatedDurationSeconds: 420,
              locationId: loc.id
            }))
          }
        ];
        break;

      case 'feature-film':
        // Acts with scenes
        const actCount = 3;
        const scenesPerAct = Math.ceil(locationDefinitions.length / actCount);
        
        for (let actNum = 1; actNum <= actCount; actNum++) {
          const startIdx = (actNum - 1) * scenesPerAct;
          const endIdx = Math.min(startIdx + scenesPerAct, locationDefinitions.length);
          const actLocations = locationDefinitions.slice(startIdx, endIdx);
          
          sections.push({
            id: `section_${sectionCounter++}`,
            type: 'act',
            title: `Act ${actNum === 1 ? 'One' : actNum === 2 ? 'Two' : 'Three'}`,
            order: actNum,
            children: actLocations.map((loc, idx) => ({
              id: `section_${sectionCounter++}`,
              type: 'scene',
              title: `Act ${actNum} Scene ${idx + 1}`,
              order: idx + 1,
              sceneNumber: sceneCounter++,
              heading: {
                prefix: idx % 2 === 0 ? 'INT.' : 'EXT.',
                location: loc.name,
                sublocation: null,
                timeOfDay: actNum === 1 ? 'DAY' : actNum === 2 ? (idx % 2 === 0 ? 'DAY' : 'NIGHT') : 'NIGHT'
              },
              synopsis: `Feature film scene at ${loc.name}`,
              beats: [],
              estimatedDurationSeconds: actNum === 2 ? 480 : 360,
              locationId: loc.id
            }))
          });
        }
        break;

      case 'short-film':
        // Scenes only
        sections = locationDefinitions.map((loc, idx) => ({
          id: `section_${sectionCounter++}`,
          type: 'scene',
          title: `Scene ${idx + 1}`,
          order: idx + 1,
          sceneNumber: sceneCounter++,
          heading: {
            prefix: idx % 2 === 0 ? 'INT.' : 'EXT.',
            location: loc.name,
            sublocation: null,
            timeOfDay: idx < locationDefinitions.length / 2 ? 'DAY' : 'NIGHT'
          },
          synopsis: `Short film scene at ${loc.name}`,
          beats: [],
          estimatedDurationSeconds: 180,
          locationId: loc.id
        }));
        break;

      default:
        throw new Error(`Unknown script kind: ${scriptKind}`);
    }

    context.log(`Generated ${sections.length} sections for ${scriptKind}`);

    // Convert sections to JSON strings
    const sectionsAsStrings = sections.map(section => JSON.stringify(section));

    return { sections: sectionsAsStrings };

  } catch (error) {
    context.log(`Error generating sections: ${error.message}`);
    throw error;
  }
}