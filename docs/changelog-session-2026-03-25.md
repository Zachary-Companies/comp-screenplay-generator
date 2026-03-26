# Changelog — Session 2026-03-25

## Video Chain System

Added the ability to chain multiple short video generations into a continuous sequence that fills a shot's timeline slot.

### Backend (`routes/index.ts`)

- **`POST /preview-video-prompt`** — New endpoint that builds and returns the video generation prompt for a shot without executing it. Returns the prompt text, source image path, and aspect ratio so the editor can display/edit the prompt before generating.
- **`POST /generate-video-previs` — chain continuation** — New `continueChain: true` parameter extracts the last frame from the most recent video in the chain via ffmpeg (`-sseof -0.04`) and uses it as the source image for the next generation, creating visual continuity.
- **`POST /generate-video-previs` — prompt override** — New `promptOverride` parameter lets the client send a custom prompt instead of using the auto-built one.
- **`POST /generate-video-previs` — duration probing** — After generation, ffprobe reads the actual video duration and stores it as `actualDuration` alongside the requested `duration`.
- **`POST /generate-video-previs` — chain tracking** — New generations in chain mode get `continuationOf` set to the previous chain segment. The `videoChain` array on the previs shot entry is auto-updated.
- **`POST /update-video-chain`** — New endpoint to reorder or replace the full chain array for a shot.
- **`POST /remove-from-chain`** — New endpoint to remove a single generation from the chain.
- **Video rendering — chain concat** — The render-video route now pre-concatenates chain segments into temp files before building the final ffmpeg filter graph. Chain-concat files are cleaned up after render.
- **Video rendering — gap filling** — Visual clips now extend to fill gaps between cuts (each clip holds until the next one starts), so the rendered video matches the NLE timeline without black frames.
- **Video rendering — video looping** — Short video clips that don't fill their slot are looped with `-stream_loop -1` capped by `-t`.

### Editor Store (`views/editor/editorStore.ts`)

- Added `videoMap`, `generationsMap`, and `videoChainMap` to `EditorState`
- `SET_DATA` action now accepts and propagates these new maps
- Undo/redo preserves video state

### Data Extraction (`views/editor/extractData.ts`)

- New types: `GenerationEntry`, `VideoChainSegment`, `VideoChainInfo`
- `computeChainGap()` — pure helper that calculates total chain duration, slot duration, gap, fill percentage, and whether the chain is filled
- Extraction now builds `videoMap`, `generationsMap` (images + videos per element), and `videoChainMap` from previs shot data

### Editor UI (`views/editor/EditorView.tsx`)

- **Versions Gallery** — New `VersionsGallery` component in the clip inspector shows all image and video generations for a shot. Thumbnails indicate the selected generation (checkmark), chain membership (chain badge), and duration. Click to select; button to add/remove from chain.
- **Chain section in inspector** — When a shot has a video chain, shows the ordered segments with thumbnails, per-segment duration, a fill progress bar (e.g. "3.2s / 6.0s"), and a "Continue Chain" button that triggers chain continuation generation.
- **Timeline chain gap indicator** — Visual clips with incomplete chains show a fill progress bar overlay and duration text (e.g. "3.2s/6.0s") directly on the timeline clip.
- **Program monitor** — Video path resolution now uses typed `state.videoMap` instead of casting.

### Screenplay View (`views/screenplay/ScreenplayView.tsx`)

- Updated to work with the new video/generation data structures.

### Styles (`views/editor/view.css`)

- Chain section styles: segment list, progress bar, continue button
- Version grid styles: thumbnails, selection state, chain badges, duration labels
- Timeline gap indicator styles: progress bar overlay, gap text

### Pipeline Config (`pipeline.json`)

- Added `appConfig` block: sidebar actions (New Project, Import Script), node key map, import modal config, node renderers (character grid, location grid, element list, section tree), `usesProjectState` flag.

### Tests

- `views/editor/previsSelection.test.ts` — Tests for previs selection data extraction
- `views/editor/videoChain.test.ts` — Tests for `computeChainGap` and chain info extraction
