# Changelog — Session 2026-03-23

Comprehensive record of all changes made to the Comprehensive Screenplay Generator pipeline during the March 23, 2026 working session.

---

## Bug Fixes

### 1. Editor timeline created duplicate clips due to missing `elementRange` on scenes

- **Problem/Need**: The Editor (StoryCut) view created one clip per scene times all elements, producing massive duplicate clip counts that crashed the browser. Scenes had no way to declare which subset of the flat `elements[]` array they owned.
- **Root Cause**: `final-assembly.ts` did not compute `elementRange` for scenes. Every scene was treated as containing every element.
- **Solution**: Added `buildScenesWithElementRange()` in `src/final-assembly.ts`. This function walks all flattened scenes, distributes elements proportionally based on beat counts, and stamps each scene with `elementRange: [start, end]` indices into the flat elements array. The editor and screenplay views now use these ranges to render only the elements that belong to each scene.
- **Files Changed**:
  - `src/final-assembly.ts` — added `buildScenesWithElementRange()`, `flattenScenes()` helper
  - `views/editor/extractData.ts` — consumes `scene.elementRange` for clip placement
  - `views/screenplay/ScreenplayView.tsx` — reads `scene.elementRange` for dual-column element layout
- **Tests**: `src/final-assembly.test.ts` updated with element range validation

### 2. Budget calculation in editor used proportional weight for non-audio elements, causing inflated timelines

- **Problem/Need**: When dialogue audio existed in a scene, non-dialogue elements (shots) received proportional time based on text-weight ratios. This gave shots unrealistically long durations, stretching the timeline far beyond what the audio dictated.
- **Root Cause**: In `useDataExtraction.ts` (Woodbury platform) and `extractData.ts` (pipeline), non-audio elements were allocated budget using `(weight / nonAudioWeight) * nonAudioBudget`, which could assign 5-10 seconds per shot when audio only totaled 8 seconds.
- **Solution**: In the pipeline's `extractData.ts`, non-audio elements now receive fixed durations based on type: shots get 1.0s (or 0.5s in compact mode), unrendered dialogue gets 2.0s (or 1.0s in compact mode). This makes audio the primary timeline driver. Action elements (which become subtitle overlays) get zero duration and do not advance the timeline.
- **Files Changed**:
  - `views/editor/extractData.ts` — rewrote budget calculation with fixed per-type durations
  - `/Users/andrewporter/Documents/GitHub/woodbury/src/config-dashboard/react/hooks/useDataExtraction.ts` — platform-side equivalent still uses proportional weight (unchanged, serves as baseline for comparison)
- **Tests**: Manual verification through editor preview

### 3. Dialogue audio render route failed silently when no voice bindings existed

- **Problem/Need**: Clicking "Render All Dialogue" produced zero audio files even when characters had voice assignments set through the voice-assignment pipeline node.
- **Root Cause**: The `/render-dialogue` route only looked for voice bindings in `bindings.json` (type=voice binding documents). When voices were assigned directly on character objects via `character.voiceId` (set by the new voice-assignment node), the route could not find them.
- **Solution**: The route now checks three sources in priority order: (1) `character.voiceId` persisted on character objects, (2) `project.metadata.voiceBindings`, (3) pipeline `bindings.json`. This matches how the ScreenplayView's DialogueBlock resolves voices.
- **Files Changed**:
  - `routes/index.ts` — `/render-dialogue` route, voice resolution logic (lines 852-876)
- **Tests**: End-to-end manual testing with generated screenplay projects

### 4. Previs generation failed to find characters when binding rules had no matches

- **Problem/Need**: Clicking "Generate Image" on a shot produced images with no character reference images, even when characters were clearly mentioned in the shot description text.
- **Root Cause**: The character resolution chain had gaps. When `binding-match` strategy found no bindings, and `autoCreateBindings` ran rules but the rules matched on `displayName` while the shot text used different casing/form, no characters were resolved. The text-match fallback was the last resort but it was after several empty-result branches.
- **Solution**: Added a new fallback step: "nearby dialogue inference." If all other methods fail, the route scans elements within +/-5 positions of the shot element, collects `characterId` values from any nearby `dialogue` elements, and uses those characters (capped at 4). This handles the common case where a shot is surrounded by dialogue from characters who should appear in the frame.
- **Files Changed**:
  - `routes/index.ts` — `/generate-previs` route, added nearby dialogue fallback (lines 338-358)
- **Tests**: Manual verification with multiple screenplay projects

---

## New Features

### 1. Voice Assignment pipeline node (`src/voice-assignment.ts`)

- **Problem/Need**: Characters needed TTS voices assigned before dialogue audio could be generated. Previously this was a manual step in the UI (Voices tab). The pipeline should handle it automatically.
- **Solution**: New pipeline node `voice-assignment` that:
  - Fetches available ElevenLabs voices via `context.tools.tts_voices()`
  - Buckets voices by gender (male/female/neutral)
  - Assigns voices to characters based on gender matching
  - Cycles through the pool when more characters than voices of a given gender
  - Skips characters that already have a `voiceId` (user overrides preserved)
  - Falls back to any available voice when the gender pool is empty
  - Persists `voiceId` and `voiceName` directly on each character object
- **Files Changed**:
  - `src/voice-assignment.ts` — new node
- **Tests**: `src/voice-assignment.test.ts` — 9 test cases covering gender matching, cycling, pre-assigned voices, fallback behavior, error handling, empty inputs, string-encoded inputs, and summary logging

### 2. Motion Graphics Generation pipeline node (`src/motion-graphics-generation.ts`)

- **Problem/Need**: The video render pipeline needed a complete motion graphics specification (Ken Burns effects, captions, lower thirds, title cards, transitions, visual effects) derived from the screenplay data. This was previously hardcoded or missing.
- **Solution**: New pipeline node `motion-graphics-generation` that performs pure data transformation (no LLM calls) to produce a complete `motionGraphicsPlan` object containing:
  - **Ken Burns specs**: Maps camera movements (PAN, DOLLY, CRANE, etc.) and frame sizes (CLOSE-UP, WIDE, etc.) to zoom/pan parameters with easing. Close-ups reduce zoom range by 50%; wide shots increase by 25%.
  - **Captions**: Word-level timing for dialogue overlays. Style adapts to project type (shorts=centered 48px, film=bottom-third 24px, video=bottom-third 28px).
  - **Lower thirds**: Character name introductions (slide-in-left) and location labels (fade-in), triggered on first appearance.
  - **Title cards**: Main title with logline, scene transition cards, and act chapter cards.
  - **Transitions**: Derived from transition elements. Maps DISSOLVE/FADE/WIPE/CUT to FFmpeg xfade types with appropriate durations.
  - **Effects**: Genre-driven global effects (horror=grain+vignette, drama=subtle grain+vignette, comedy=light vignette, etc.).
- **Files Changed**:
  - `src/motion-graphics-generation.ts` — new node
  - `src/final-assembly.ts` — added `motionGraphicsPlan` as optional input and includes it in the output package
- **Tests**: `src/motion-graphics-generation.test.ts` — tests for Ken Burns generation, frame size adjustments, caption word timing, transitions, genre effects, and more

### 3. FFmpeg Filter Builder utility (`src/_ffmpeg-filters.ts`)

- **Problem/Need**: The render-video route and motion graphics node needed a shared library of pure functions that convert motion graphic specifications into FFmpeg filter chain strings.
- **Solution**: New shared utility (prefixed with `_` per convention) providing:
  - `buildKenBurnsFilter()` — Generates `zoompan` filter strings with zoom expressions, pan directions, and easing (linear, ease-in via quadratic, ease-out via quadratic)
  - `buildCaptionFilter()` — Generates word-highlight `drawtext` filter chains with per-word timing
  - `buildLowerThirdFilter()` — Generates animated lower third overlays (slide-in-left or fade-in) with primary/secondary text
  - `buildTitleCardSegment()` — Generates black background color sources with centered, fading text
  - `buildTransitionFilter()` — Generates `xfade` filter strings for dissolve/fade/wipe transitions
  - `buildEffectFilters()` — Generates grain (`noise`), vignette, and letterbox filters
  - `defaultFontPath()` — Platform-aware font path resolution (macOS Helvetica, Linux DejaVu Sans)
  - Type definitions: `KenBurnsSpec`, `CaptionSpec`, `LowerThirdSpec`, `TitleCardSpec`, `TransitionSpec`, `EffectSpec`
  - Camera movement mapping table (`KEN_BURNS_MAP`) for 11 movement types
- **Files Changed**:
  - `src/_ffmpeg-filters.ts` — new utility file
  - `routes/index.ts` — imports and uses the filter builders in the render-video route
- **Tests**: `src/_ffmpeg-filters.test.ts` — tests for all filter builders, easing modes, pan directions, text escaping, effect generation

### 4. SRT subtitle generation alongside dialogue audio

- **Problem/Need**: Rendered dialogue audio files had no corresponding subtitle files for video composition.
- **Solution**: The `/render-dialogue` route now generates an `.srt` subtitle file alongside each `.mp3` audio file. The `buildSrt()` function splits dialogue text into sentences and distributes timing proportionally across the audio duration. Character names are included as bold HTML tags in the subtitle output. The SRT path is stored in `asset.metadata.srtPath` and `asset.srtPath`.
- **Files Changed**:
  - `routes/index.ts` — `buildSrt()` helper function, SRT generation in render-dialogue route (line 1030-1034)
- **Tests**: Manual verification of generated `.srt` files

### 5. Compact Timing route (`POST /compact-timing`)

- **Problem/Need**: After generating dialogue audio, shot durations in the timeline did not reflect the actual audio lengths. Shots with 0.5 seconds of dialogue might span 5 seconds visually.
- **Solution**: New server route that recalculates shot durations based on dialogue audio. For each scene, it walks elements mapped to shots, sums up audio durations for dialogue elements under each shot, and assigns that as the shot duration. Shots without dialogue get a minimum duration of 0.5 seconds. The route persists updated durations to `scene.shots[].duration` and returns statistics (shots updated, old/new total duration).
- **Files Changed**:
  - `routes/index.ts` — `/compact-timing` route (lines 671-777)
  - `views/screenplay/ScreenplayView.tsx` — "Compact Timing" button in toolbar that calls the route
- **Tests**: Manual verification

### 6. Compact Timeline mode in Editor view

- **Problem/Need**: The editor timeline was too spread out even when dialogue audio existed. Users wanted a tighter view where shot durations are minimized and audio drives pacing.
- **Solution**: Added `compactTimeline` boolean state to the editor store. When enabled, `extractData()` uses reduced durations: shots get 0.5s instead of 1.0s, unrendered dialogue gets 1.0s instead of 2.0s, and scenes without audio get a 4s budget instead of 8s. The toggle is available as a button in the editor toolbar.
- **Files Changed**:
  - `views/editor/editorStore.ts` — added `compactTimeline` field to `EditorState`, `TOGGLE_COMPACT_TIMELINE` action
  - `views/editor/extractData.ts` — `compactTimeline` parameter, conditional duration logic
  - `views/editor/EditorView.tsx` — compact timeline toggle button
- **Tests**: State reducer tests for the new action

### 7. Audio duration backfill route (`POST /backfill-audio-durations`)

- **Problem/Need**: Existing dialogue audio assets from earlier sessions lacked `metadata.duration`, making the audio-driven timeline inaccurate.
- **Solution**: New route that scans all `dialogueAudio.assets`, finds those missing duration, and probes each file with `ffprobe` to detect the actual duration. Falls back to file-size estimation if ffprobe is unavailable.
- **Files Changed**:
  - `routes/index.ts` — `/backfill-audio-durations` route (lines 779-831)
- **Tests**: Manual verification

### 8. Prompt prefix persistence (`POST /update-prompt-prefix`)

- **Problem/Need**: The image generation prompt prefix, location prompt prefix, shot prompt prefix, and global aspect ratio needed to persist across sessions.
- **Solution**: New route that saves these values to `project.metadata`. Supports `imagePromptPrefix`, `locationImagePromptPrefix`, `shotImagePromptPrefix`, and `globalAspectRatio` fields.
- **Files Changed**:
  - `routes/index.ts` — `/update-prompt-prefix` route (lines 1891-1915)
  - `views/screenplay/ScreenplayView.tsx` — calls the route when the user changes the global aspect ratio or shot prefix
- **Tests**: Manual verification

---

## Architecture Changes

### 1. Voice data flow restructured: from bindings to character properties

- **Problem/Need**: Voice assignments were stored as binding documents (type=voice in `bindings.json`), separate from character objects. This created a disconnect: the pipeline node generated characters without voices, then a separate UI step assigned voices via bindings, and the render route had to look up bindings to find voice IDs.
- **Solution**: Voice assignments are now persisted directly on character objects as `voiceId` and `voiceName` properties. The new `voice-assignment` pipeline node sets these during pipeline execution. The `dialogue-audio-generation` node reads `character.voiceId` directly. The `/render-dialogue` route checks `character.voiceId` first, then falls back to voice bindings for backward compatibility. The ScreenplayView also checks `character.voiceId` before consulting bindings.
- **Files Changed**:
  - `src/voice-assignment.ts` — new node that stamps voiceId/voiceName on characters
  - `src/dialogue-audio-generation.ts` — reads `character.voiceId` instead of querying bindings
  - `routes/index.ts` — render-dialogue route priority: character.voiceId > metadata.voiceBindings > pipeline bindings
  - `views/screenplay/ScreenplayView.tsx` — DialogueBlock checks character.voiceId, then voiceBindings

### 2. Motion graphics plan as first-class pipeline output

- **Problem/Need**: The render-video route had to construct motion graphics parameters ad-hoc at render time. This was fragile and not configurable.
- **Solution**: Motion graphics are now a separate pipeline node (`motion-graphics-generation`) that runs after element generation and previs planning. Its output flows through `final-assembly` into the script package as `motionGraphicsPlan`. The render-video route consumes this plan rather than computing it inline. The FFmpeg filter builders in `_ffmpeg-filters.ts` provide the rendering bridge between the plan and actual FFmpeg commands.
- **Data flow**: `elements + previsShots + characters + locations + metadata` -> `motion-graphics-generation` -> `motionGraphicsPlan` -> `final-assembly` -> `scriptPackage.motionGraphicsPlan` -> `routes/render-video`
- **Files Changed**:
  - `src/motion-graphics-generation.ts` — new pipeline node
  - `src/_ffmpeg-filters.ts` — new shared utility
  - `src/final-assembly.ts` — accepts `motionGraphicsPlan` input, includes in output
  - `routes/index.ts` — imports `_ffmpeg-filters` for render-video route

### 3. Scene-based data model with element ranges

- **Problem/Need**: The flat `elements[]` array had no mapping to scenes. Views had to guess which elements belonged to which scene.
- **Solution**: `buildScenesWithElementRange()` in `final-assembly.ts` creates a `scenes[]` array where each scene has:
  - `elementRange: [start, end]` — indices into the flat elements array
  - `dialogue[]` — extracted dialogue with character info and element IDs
  - `actions[]` — extracted action text
  - `shots[]` — extracted shots with previs paths and character IDs
  - `characterIds[]` — unique character IDs from dialogue in the scene
  - `locationId` — resolved from scene heading
- Both the ScreenplayView and EditorView consume `scene.elementRange` to correctly scope their rendering.

### 4. Reference image support in nanobanana (Woodbury platform)

- **Problem/Need**: Previs image generation needed to receive character headshot and location reference images for visual consistency.
- **Solution**: The `nanobanana.ts` tool in the Woodbury platform now accepts a `referenceImages` parameter (array of file paths, URLs, or base64 data URLs). Each reference image is loaded and included as an inline image part in the Gemini API request. The `/generate-previs` route collects character headshot and location landscape assets, then passes them via `referenceImages` to the image generation call.
- **Files Changed**:
  - `/Users/andrewporter/Documents/GitHub/woodbury/src/loop/tools/nanobanana.ts` — added `referenceImages` parameter to schema and handler
  - `routes/index.ts` — `/generate-previs` route collects and passes reference images
  - `actions/generate-image.json` — reference resolution configuration (binding-match strategy, auto-create bindings, fallback rules)

---

## UI/UX Improvements

### 1. Dual-column layout in ScreenplayView

- **Problem/Need**: Shot previs images and their corresponding dialogue/action text were displayed in separate sections, requiring users to scroll between them to understand the visual-narrative relationship.
- **Solution**: The ScreenplayView now uses a dual-column layout within each scene. Elements are grouped into "shot groups" where each group starts with a shot element (left column: previs image) and contains subsequent dialogue/action elements (right column: text content). This creates a visual storyboard flow where you see the image and its accompanying narrative side by side.
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — `SceneElements` component with shot group logic, `ShotGroup` type definition, dual-column rendering

### 2. Per-shot and global aspect ratio controls

- **Problem/Need**: All previs images were generated at a single aspect ratio. Users needed to set a global default and override per-shot for mixed-format projects (e.g., 16:9 for landscape shots, 9:16 for vertical short-form content).
- **Solution**: Added aspect ratio selector at two levels:
  - **Global**: Dropdown in the screenplay toolbar that persists to `project.metadata.globalAspectRatio` via the `/update-prompt-prefix` route. Supports 9:16, 2.39:1, 21:9, 4:3, 1:1, 16:9.
  - **Per-shot**: Each shot card has a small aspect ratio dropdown. When set, it overrides the global default for that shot. Stored on `scene.shots[].aspectRatio`.
  - Resolution cascade: per-shot > global > default (9:16)
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — `ASPECT_RATIOS` constant, global aspect ratio state with persistence, per-shot selectors in InlineShotCard, ShotBlock, and SceneElements
  - `routes/index.ts` — `/update-prompt-prefix` route saves `globalAspectRatio`, `/generate-previs` reads `body.aspectRatio`

### 3. Voice binding auto-load in ScreenplayView

- **Problem/Need**: Dialogue audio generation buttons in the ScreenplayView required visiting the Voices tab first to load voice bindings into the window global. Without this, the "Generate Audio" button was hidden for all dialogue blocks.
- **Solution**: Added a `useEffect` in the ScreenplayView that auto-fetches voice bindings on mount via `GET /api/app/:id/voice-bindings`. This populates `window.appBindings` so DialogueBlock components can show voice assignment status and generation buttons immediately. Also reads `character.voiceId` directly from project data as the primary voice source, making the binding fetch a fallback.
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — auto-load effect and dual-source voice resolution in DialogueBlock

### 4. Compact Timing button in ScreenplayView toolbar

- **Problem/Need**: After rendering dialogue audio, users had to manually adjust shot durations to match audio pacing. This was tedious for projects with many shots.
- **Solution**: Added a "Compact Timing" button to the screenplay toolbar action bar. It calls `POST /compact-timing` which recalculates all shot durations based on dialogue audio, then reloads the project data. The button sits alongside "Render All Dialogue" and "Render All Previs" in the toolbar.
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — toolbar button, action handler case for `compact-timing`
  - `routes/index.ts` — `/compact-timing` route implementation

### 5. Shot generation gallery with version badge

- **Problem/Need**: Users could not browse previous generations of a shot's previs image or select an older version.
- **Solution**: Added `ShotGalleryBadge` and `ShotGalleryLink` components that display a version count badge on shots with multiple generations. Clicking opens a `PrevisGalleryModal` that shows all versions in a grid. Selecting a version calls `POST /select-previs-generation` to update the active image.
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — `ShotGalleryBadge`, `ShotGalleryLink`, gallery modal integration

### 6. Editable action blocks and dialogue splitting

- **Problem/Need**: Action/description text and dialogue lines could not be edited inline. Users had to re-run the pipeline to change narrative content.
- **Solution**: Added `EditableAction` component (click-to-edit textarea) and dialogue line editing with split functionality. Users can click any action text to edit it inline, and dialogue blocks support splitting at a specific line to create two separate dialogue elements.
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — `EditableAction`, `splitDialogue()`, `handleSaveAction()`, `handleSaveDialogue()`

### 7. Element drag-and-drop reordering

- **Problem/Need**: Users could not reorder shots and dialogue within a scene.
- **Solution**: Added `DropZone` and `PasteZone` components for drag-and-drop and cut/paste element reordering. Elements can be dragged to drop zones between other elements, or cut and pasted at specific positions.
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — `DropZone`, `PasteZone`, `moveElementBefore()`, `moveElementToEnd()`, drag state management

### 8. Streaming progress for dialogue rendering

- **Problem/Need**: Rendering dialogue audio for a full screenplay could take minutes. Users had no feedback during the process.
- **Solution**: The `/render-dialogue` route supports `stream: true` mode that returns NDJSON progress events. Events include: initial quota info, per-item progress with character name, errors with quota details, and completion summary. The ElevenLabs character quota is checked before each TTS call with early termination if insufficient.
- **Files Changed**:
  - `routes/index.ts` — streaming support in `/render-dialogue` route, quota tracking

---

## Research and Documentation

### Motion Graphics Research (`docs/motion-graphics-research.md`)

New research document covering the technical architecture for incorporating motion graphics into the automated screenplay/video generation pipeline. Topics include:

- Types of motion graphics in video production (lower thirds, title sequences, transitions, text overlays, callouts, logo animations, background motion, data visualizations, social media overlays)
- Motion graphics by video type (YouTube Shorts, YouTube Videos, Short Films, Feature Films)
- Technical implementation approaches (FFmpeg filter chains, Remotion, After Effects templates, custom renderers)
- Data-driven motion graphics architecture
- Proposed data model (used as the basis for `_ffmpeg-filters.ts` type definitions)
- Implementation priority matrix

### Reference Resolution Configuration (`actions/generate-image.json`)

Documented and refined the action configuration that controls how the `/generate-previs` route resolves character and location reference images:

- Character strategy: `binding-match` with `depicts` binding type, auto-create bindings enabled
- Location strategy: `binding-match` with `set-in` binding type, fallback to scene heading
- Auto-bind rules: match `shotText` against character `name` (whole word, case insensitive)
- Prompt template sections: references, scene description, camera technique, lighting, style
- Frame size to lens mapping (6 entries from WIDE to EXTREME CLOSE-UP)
- Camera movement to technique mapping (11 entries from STATIC to STEADICAM)

---

## Summary of New Test Files

| Test File | Coverage |
|-----------|----------|
| `src/voice-assignment.test.ts` | 9 tests: gender matching, cycling, pre-assigned skip, fallback, error handling, empty input, string encoding, summary logging |
| `src/_ffmpeg-filters.test.ts` | Ken Burns filter generation, easing modes, pan directions, caption filters, lower third animations, title card segments, transitions, effects, text escaping, default font paths |
| `src/motion-graphics-generation.test.ts` | Ken Burns from previs shots, CLOSE-UP zoom reduction, WIDE zoom increase, caption generation, word timing, lower thirds deduplication, title cards, transitions, genre effects |
| `src/final-assembly.test.ts` | Updated for motionGraphicsPlan input, elementRange scene building, dialogue audio linking |

---

## Files Changed (Complete List)

### Pipeline nodes
- `src/voice-assignment.ts` (new)
- `src/motion-graphics-generation.ts` (new)
- `src/_ffmpeg-filters.ts` (new utility)
- `src/final-assembly.ts` (modified: buildScenesWithElementRange, motionGraphicsPlan input)
- `src/dialogue-audio-generation.ts` (modified: reads character.voiceId)
- `src/character-generation.ts` (modified: YouTube Short/Video project types)
- `src/previs-generation.ts` (modified)

### Test files
- `src/voice-assignment.test.ts` (new)
- `src/_ffmpeg-filters.test.ts` (new)
- `src/motion-graphics-generation.test.ts` (new)
- `src/final-assembly.test.ts` (updated)
- `src/character-generation.test.ts` (updated)
- `src/dialogue-audio-generation.test.ts` (updated)

### Server routes
- `routes/index.ts` (modified: generate-previs nearby dialogue fallback, render-dialogue voice resolution, compact-timing route, backfill-audio-durations route, update-prompt-prefix route, buildSrt helper)

### Views
- `views/screenplay/ScreenplayView.tsx` (modified: dual-column layout, voice binding auto-load, compact timing, aspect ratio persistence, shot gallery, editable actions, dialogue splitting, drag-and-drop)
- `views/editor/extractData.ts` (modified: compact timeline, fixed budget calculation)
- `views/editor/editorStore.ts` (modified: compactTimeline state, TOGGLE_COMPACT_TIMELINE action)
- `views/editor/EditorView.tsx` (modified: compact timeline toggle button)

### Configuration
- `actions/generate-image.json` (modified: reference resolution configuration)

### Documentation
- `docs/motion-graphics-research.md` (new)
- `docs/changelog-session-2026-03-23.md` (this file)

### Woodbury platform
- `/Users/andrewporter/Documents/GitHub/woodbury/src/loop/tools/nanobanana.ts` (modified: referenceImages parameter)
- `/Users/andrewporter/Documents/GitHub/woodbury/src/config-dashboard/react/hooks/useDataExtraction.ts` (baseline reference, proportional budget calculation)

---

## Late Session Additions (continued)

### 12. Editor uses video clips in Visuals track when available

- **Problem/Need**: The Editor timeline always showed still images for shots, even when video previs clips had been generated via Veo.
- **Solution**: `extractData.ts` now builds a `videoMap` (element ID → video file path) from `previsualizations.shots[].videoGenerations` and `videoPath`. Visual clips get `type: 'video'` when a video exists. The Editor's Program Monitor renders `<video autoPlay muted loop>` for video clips and `<img>` for stills. Timeline clips display a 🎬 icon (purple) for video vs 🖼 for images.
- **Files Changed**:
  - `views/editor/extractData.ts` — added `videoMap` to ExtractionResult, built from previs shots and scene shots
  - `views/editor/EditorView.tsx` — added `previewVideoPath` memo, renders `<video>` in Program Monitor, updated empty-state check, added video icon to story panel

### 13. Manual reference editor for shot cards ("✏️ Refs" button)

- **Problem/Need**: Auto-binding rules match character names in shot text, but many shots don't mention characters by name (e.g., "Family kitchen bathed in morning light"). Users needed a way to manually add or remove character/location references per shot so regenerated images use the correct headshots.
- **Solution**: Added a `RefEditor` React component that renders a "✏️ Refs" button in the bottom-right corner of each shot thumbnail. Clicking it opens a popup with checkboxes for all characters (with headshot thumbnails) and locations (up to 8). Toggling a checkbox creates or removes a `depicts` or `set-in` binding via the `/api/compositions/:id/bindings` API. After updating, a toast prompts "Bindings updated — Regen to apply".
- **Files Changed**:
  - `views/screenplay/ScreenplayView.tsx` — added `RefEditor` component, integrated into shot card rendering, passed `locMap` prop through `SceneElements`

### 14. Video generation MIME type fix (JPEG files with .png extension)

- **Problem/Need**: Gemini's image generator saves JPEG data with `.png` file extensions. When the Veo API received these with `mimeType: 'image/png'`, the mismatched MIME caused Veo to silently ignore the source image and fall back to text-to-video, producing completely different characters/scenes.
- **Root Cause**: The route trusted the file extension for MIME type detection instead of inspecting the actual file data.
- **Solution**: The route now detects the actual image format by checking the base64 prefix: `/9j/` → JPEG, `iVBOR` → PNG. This ensures the correct MIME type is sent to Veo regardless of file extension.
- **Files Changed**:
  - `routes/index.ts` — MIME detection in `callVeoApi`, base64 prefix check

### 15. Video generation uses fs.readFileSync instead of shell exec for base64

- **Problem/Need**: The route used `sdk.exec('base64 -i ...')` to encode images, but Node.js `execSync` has a default stdout buffer limit (~1MB). Previs images encoded to ~1.1MB base64, causing `ENOBUFS` errors that silently failed — resulting in no image being sent to Veo.
- **Solution**: Replaced shell-based `base64` command with direct `fs.readFileSync` + `Buffer.from(...).toString('base64')` in Node.js, which has no buffer size limits.
- **Files Changed**:
  - `routes/index.ts` — `callVeoApi` now reads files directly with `fs`

### 16. Veo model selection: Veo 2.0 for image-to-video, Veo 3.1 for text-to-video

- **Problem/Need**: Veo 3.1's audio generation triggered aggressive safety filters on many scenes (children's rooms, etc.), blocking video output entirely. Veo 3.1 also doesn't support the `generateAudio: false` parameter on the Gemini API endpoint.
- **Solution**: The route now selects the model based on whether a source image exists: image-to-video uses `veo-2.0-generate-001` (no audio generation, fewer safety blocks), text-to-video uses `veo-3.1-generate-preview` (higher quality when no source constraints exist).
- **Files Changed**:
  - `routes/index.ts` — model selection logic in `callVeoApi`
