# Changelog — 2026-03-21

## Self-Contained Pipeline Extension

Pipeline views and server-side API routes are now fully owned by this repository instead of living in Woodbury core. This makes the pipeline self-contained — changes to views or routes no longer require rebuilding Woodbury.

### Added

- **React View System** — 5 React views migrated from Woodbury core, each with manifest, SDK shim, entry point, and esbuild bundle:
  - `views/overview/` — Project overview with metadata and stats
  - `views/data/` — Character and location card grids with AI enrichment
  - `views/screenplay/` — Full screenplay display with previs integration
  - `views/editor/` — StoryCut nonlinear timeline editor with audio/video
  - `views/voices/` — ElevenLabs voice assignment per character

- **View Build Script** (`views/build.mjs`) — esbuild configuration that compiles React TSX views into IIFE bundles. Handles React externals by redirecting imports to `window.__WoodburyViewSDK` globals. Supports automatic discovery of view directories with `entry.tsx`.

- **Server-Side Routes** (`routes/index.ts` + `routes/build.mjs`) — All 13 screenplay-specific API endpoints moved from Woodbury's `pipeline-app.ts`:
  - `POST /generate-previs` — Shot image generation with character/location references
  - `POST /select-previs-generation` — Select active previs for a shot
  - `POST /backfill-audio-durations` — Detect audio file durations via ffprobe
  - `POST /render-dialogue` — Batch TTS render for unrendered dialogue lines
  - `POST /generate-dialogue-audio` — Single element TTS generation
  - `POST /import-audio` — Import external audio for an element
  - `POST /render-video` — Compose timeline clips + audio to video via ffmpeg
  - `POST /render-cancel` — Cancel active video render
  - `POST /generate-logo` — Generate 1:1 project logo image
  - `PUT /element/:elementId` — Update a screenplay element field
  - `POST /extract-pdf-text` — Extract screenplay from PDF
  - `POST /generate-assets` — Batch generate character and location images

- **Pipeline-Specific Actions** — Action config files for script import workflows:
  - `actions/enrich-script-data.json`
  - `actions/fountain-to-pipeline.json`
  - `actions/pdf-to-fountain.json`

- **Import Documentation** (`docs/importing-scripts.md`)

### Changed

- **`package.json`** — Added `build`, `build:views`, and `build:routes` scripts. Pipeline is now buildable independently with `npm run build`.

- **View Manifests** — Updated `editor/manifest.json` and `voices/manifest.json` with proper labels, emoji icons, React type declarations, and sort ordering.

- **`pipeline.json`** — Updated pipeline node configuration.

### Build

```bash
npm run build          # Build views + routes
npm run build:views    # Build React view bundles only
npm run build:routes   # Build server-side routes only
```

Views and routes are discovered dynamically by Woodbury core at runtime from this directory. No Woodbury rebuild needed.
