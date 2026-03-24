# CLAUDE.md — Comprehensive Screenplay Generator

Instructions for AI assistants editing this Woodbury pipeline.

## What This Is

A Woodbury v2 file-backed pipeline. Script node files live in `src/`, bindings in `bindings/`.

Purpose: Generate complete screenplay packages with metadata, characters, locations, scenes, elements, assets, and previsualization

## Directory Structure

```
comp-screenplay-generator/
├── pipeline.json       # Graph manifest (DO NOT edit manually)
├── tsconfig.json       # TypeScript config (DO NOT edit)
├── woodbury.d.ts       # Type definitions (DO NOT edit)
├── package.json        # npm dependencies
├── CLAUDE.md           # This file — pipeline documentation
├── src/                # Script node files
│   ├── *.ts            # Node implementations (one per pipeline step)
│   ├── *.test.ts       # Colocated test files
│   └── _test-helpers.ts # Mock context for tests
├── actions/            # UI action behavior configs
│   └── generate-image.json  # Controls Regen/Generate Image button
├── bindings/           # Custom data connections
│   ├── bindings.json   # Entity-to-entity relationships
│   ├── rules.json      # Auto-binding rule definitions
│   └── views.json      # Custom view configurations
└── views/              # Custom pipeline views (loaded dynamically)
    └── {view-name}/
        ├── manifest.json   # { name, label, icon, description }
        ├── view.js         # REQUIRED: calls window.registerPipelineView({...})
        └── view.css        # Optional: custom styles
```

## Rules

1. **Always export `execute`** — `export async function execute(inputs, context)`
2. **Declare ports with JSDoc** — `@input name: type - description` and `@output name: type - description`
3. **Return all declared outputs**
4. **Use `context.llm` for AI** — `context.llm.generate(prompt)` / `context.llm.generateJSON(prompt)`
5. **Use `context.log()` for logging** — not `console.log`
6. **Use `context.progress` for long tasks**
7. **Keep the reference directive** — `/// <reference path="../woodbury.d.ts" />`
8. **Do NOT edit** — `pipeline.json`, `woodbury.d.ts`, `tsconfig.json`
9. **Use `require()`** for npm packages (CommonJS context)
10. **Prefix shared utils with `_`** — e.g. `src/_utils.ts` — these are not treated as nodes

## Actions (UI Button Behavior)

The `actions/` directory controls how UI buttons behave. Each action is a JSON config file that the Woodbury server reads at execution time. **Edit these files to change UI behavior without modifying server code.**

### actions/generate-image.json

Controls the **Regen** and **Generate Image** buttons on shot cards.

**Reference resolution** — determines which character/location images are passed to the AI image generator:

| Field | What it controls |
|-------|-----------------|
| `referenceResolution.characters.strategy` | `"binding-match"` = only characters bound to this shot. `"all"` = all characters |
| `referenceResolution.characters.fallback` | `"none"` = no fallback (strict). Default = use previs.characterIds |
| `referenceResolution.characters.autoCreateBindings` | `true` = auto-run binding rules if no bindings exist for this shot |
| `referenceResolution.characters.bindingType` | Which binding type to query (default: `"depicts"`) |
| `referenceResolution.locations` | Same pattern as characters, with `"set-in"` binding type |

**Prompt control:**

| Field | What it controls |
|-------|-----------------|
| `referenceInstruction` | Text prepended when reference images are included |
| `prompt.sections` | Ordered prompt template (references, scene, camera, lighting, style) |
| `frameSizeLensMap` | Maps frame sizes (WIDE, CLOSE-UP, etc.) to lens descriptions |
| `cameraMovementMap` | Maps movements (PAN, DOLLY, etc.) to technique descriptions |
| `generation.model` | Default model: `"flash"` or `"pro"` |
| `generation.aspectRatio` | Default aspect ratio: `"16:9"`, `"1:1"`, etc. |

**How the full stack works:**
1. User clicks Regen → client calls `POST /api/app/:id/generate-previs`
2. Server reads `actions/generate-image.json` from this pipeline
3. Resolves references per config (binding-match → query bindings → auto-run rules if needed)
4. Builds prompt from config templates + shot metadata
5. Calls nanobanana with prompt + matched reference images only

**Common changes a user might request:**
- "Only use characters mentioned in the shot" → set `characters.strategy: "binding-match"`, `characters.fallback: "none"`, ensure rules.json has a displayName matching rule
- "Change the style to anime" → edit the `style` section in `prompt.sections`
- "Use pro model" → set `generation.model: "pro"`
- "Include all characters always" → set `characters.strategy: "all"` or `characters.fallback: "all"`

## Bindings (Custom Data Connections)

The `bindings/` directory stores semantic relationships between entities across pipeline nodes.

### bindings.json

Explicit entity-to-entity connections. Example:

```json
{
  "version": "1.0",
  "pipelineId": "comp-screenplay-generator",
  "bindings": [
    {
      "id": "b1",
      "type": "depicts",
      "source": { "entityType": "shot", "entityId": "shot-ext-park-1" },
      "target": { "entityType": "character", "entityId": "char-emma" },
      "confidence": 1.0,
      "origin": "auto:character-in-shot"
    }
  ]
}
```

**Binding types:**
- `depicts` — character appears in a shot
- `set-in` — shot/scene is set in a location
- `voice` — dialogue is spoken by a character
- Custom types as needed

**How these are used:**
- Image generation (previs) uses `depicts` bindings to include only the correct character reference images
- Audio generation (future) uses `voice` bindings to select the correct character voice
- The NLE screenplay view shows reference images based on bindings

### rules.json

Auto-binding rules that populate bindings from node output data. Rules run against entity data to create bindings automatically.

**Current rules:**
1. **Character names in shot descriptions** — matches `shot.shotText` against `character.displayName` (e.g., "MARCUS" in "WIDE SHOT - Marcus a solitary figure...") → creates `depicts` binding
2. **Location names in shot descriptions** — matches `shot.shotText` against `location.name` (e.g., "City Bridge" in shot text) → creates `set-in` binding

**Important:** Character matching uses `displayName` (e.g., "MARCUS", "FERRYMAN") not `name` (e.g., "Marcus Chen") because shot descriptions use the display/uppercase form. If characters aren't matching, check that the `matchField` in the rule points to the right field.

**Rule structure:**
```json
{
  "source": { "entityType": "shot", "field": "shotText" },
  "target": { "entityType": "character", "matchField": "displayName" },
  "relationship": "depicts",
  "matchOptions": { "wholeWord": true, "caseSensitive": false }
}
```

Rules are executed by `POST /api/app/:id/rules/run` or auto-triggered by the generate-image action when bindings are missing.

### views.json

Custom view configurations for the app mode. Maps semantic data roles to specific pipeline node outputs.

### Managing bindings

- **Direct edit**: Modify `bindings/bindings.json` with `file_write`
- **API**: `POST /api/compositions/comp-screenplay-generator/bindings` to create, `GET` to list
- **Auto-rules**: `POST /api/compositions/comp-screenplay-generator/bindings/apply-rules`
- When the user mentions character/shot/location relationships, check and update bindings

## TODO.json

This pipeline has a `TODO.json` file for tracking tasks. When working on this pipeline:
1. Read TODO.json first to see what needs doing
2. Update item status as you work: "pending" → "in-progress" → "done"
3. Add new items when you discover more work
4. If something fails, set status to "failed" with an error message

## Custom Views

Custom views live in `views/{view-name}/` and are loaded dynamically into the app UI. **When asked to create or modify a view, always put the code here — never in Woodbury's source code.**

### Creating a View

1. Create `views/{view-name}/manifest.json`:
```json
{ "name": "my-view", "label": "My View", "description": "What it shows" }
```

2. Create `views/{view-name}/view.js` — must call `window.registerPipelineView()`:
```javascript
window.registerPipelineView({
  name: 'my-view',
  label: 'My View',
  detect: function(state) { /* return true if data supports this view */ },
  stitch: function(state) { /* walk state.nodeData, return unified data */ },
  render: function(data, state) { /* return HTML string */ },
  wireEvents: function(root, state) { /* attach click/input handlers */ },
});
```

3. Optional: Create `views/{view-name}/view.css` for styles.

### Available in view.js

- `state.nodeData[nodeId].outputs` — all node output data
- `compData.id` — current pipeline ID
- `compEscHtml(str)` / `compEscAttr(str)` — escape helpers
- `toast(msg, 'success'|'error')` — show notifications
- `appBindings` — entity bindings document
- `fetch('/api/app/' + compData.id + '/...')` — call any app API
- `'/api/file?path=' + encodeURIComponent(path)` — serve local files as images/media

### This Pipeline's Data Shape

The stitched state contains these key fields across nodes:
- `metadata` — { title, logline, genre, ... }
- `sections[]` — act/scene hierarchy with children
- `elements[]` — shots, dialogue, action lines with { id, type, content, character }
- `characters[]` — { id, name, displayName, description }
- `locations[]` — { id, name, description }
- `previsualizations.shots[]` — { shotElementId, filePath, characterIds, locationId, description }
- `assets[]` — { filePath, metadata: { characterId?, locationId? } }

## Testing

- Every node file (e.g. `src/fetch-data.ts`) must have a test file (`src/fetch-data.test.ts`)
- Tests use vitest: `import { describe, it, expect } from "vitest"`
- Use `createMockContext()` from `./_test-helpers.ts` for mock context
- Run tests: `npx vitest run`
- When you write or edit code, ALWAYS write/update the test, then run it to verify

## Documentation

Detailed documentation lives in the `docs/` folder:

- **[React Frontend Integration](docs/react-frontend-integration.md)** — How pipeline outputs map to domain files and React state, critical fields, common pitfalls, and debugging workflow
