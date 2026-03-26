# Changelog — Session 2026-03-26

## Export System — Fountain & Lookbook

### New: Export View
- Added dedicated **Export** view (`views/export/`) with Fountain and Lookbook export buttons
- Export view shows project stats (scenes, characters, locations, shots, previs frames)
- Lookbook preview renders in an embedded iframe

### New: Fountain Export
- Generates industry-standard `.fountain` screenplay format from pipeline data
- Proper title page with Title, Author, Draft date, Notes (genre + logline)
- Handles all element types: dialogue (with modifiers), action, transitions, shots
- Robust `str()` helper handles arrays, objects with `.name`, and primitives — fixes `[object Object]` bug
- Downloads as a blob to avoid MIME type issues with `/api/file`

### New: Lookbook / Pitch Deck Generator
- Generates a polished HTML lookbook with: title page, synopsis, characters, locations, and key frames
- Character headshots resolved from `character.imagePath` or `character-headshot` assets
- Location images resolved from `location.imagePath` or `landscape`/`location-landscape` assets
- Dark theme by default with full `@media print` light theme for PDF export
- Robust data handling: `esc()` safely handles objects, numbers, arrays — fixes `.replace is not a function`
- `tagList()` handles string, string[], and object[] for genre/tone/audience tags
- `authorStr` handles string, string[], and `{name, role}[]` formats
- Scene actions handled as strings or objects with `.content` — fixes `.substring is not a function`

### New: Print to PDF
- Lookbook HTML includes a floating "Print / Save as PDF" button (hidden in print output)
- Auto-triggers `window.print()` when opened with `?print=1` query parameter
- Export view has dedicated "Print to PDF" button that opens lookbook with auto-print

### Screenplay View: Export Shortcuts
- Added Fountain and Lookbook export buttons to the Screenplay toolbar
- Lookbook opens in a new tab directly from the Screenplay view

### Tests
- Added comprehensive test suite (`routes/export.test.ts`, 28 tests)
- Covers: Fountain metadata, scene headings, dialogue, actions, transitions, shots
- Covers: Lookbook HTML structure, characters, locations, key frames, synopsis
- Covers: HTML escaping/XSS prevention, print button inclusion, edge cases

## Bindings Update

- Added manual `depicts` bindings linking shots to characters (David Chen, Sarah Chen)
- Added manual `set-in` bindings linking shots to locations
- New bindings created via the editor's manual reference editor (origin: `manual`)

## Metadata View Redesign

### New: Professional Two-Column Layout
- Full-width layout replacing the narrow single-column view
- **Left column**: Large editable title (32px), genre/tone/audience pill badges, logline card, author field, project stats grid (scenes, characters, locations, shots, previs, dialogue)
- **Right column**: Production details sidebar (runtime, pages, draft date, version, language) with icons, completeness progress bars (characters enriched, images, locations, previs coverage)
- All key fields (title, logline, author) are click-to-edit inline with auto-save via metadata update endpoint

### New: Metadata Update API
- `POST /api/app/:id/update-metadata` endpoint for inline field editing
- Supports partial updates to title, logline, and author fields
- Persists changes to the pipeline's production-metadata node

## Screenplay Toolbar Redesign

- Shortened button labels for space efficiency ("Generate Headshots" → "Headshots", etc.)
- Grouped by function with vertical separators: Data | AI Enrich | Image Gen | Audio & Timing | Export
- Consistent `text-[11px]` sizing and color-coding by category
- Added `appearance: none` CSS reset to fix browser default button styling on scene-level buttons

## Settings View Overhaul (Woodbury Core)

### New: Friendly Labels and Multi-Column Layout
- Settings view reads `pipeline-inputs.json` for human-friendly field labels, descriptions, groups, and examples
- Fields grouped into sections: "Project Essentials", "Creative Direction", "Production", "TV Settings", "Commercial Settings"
- Multi-column grid layout for related fields (Genre + Mood side by side, etc.)
- Select dropdowns with predefined options for Project Type, Approximate Length, etc.
- Conditional visibility: TV fields only show when Project Type is TV, commercial fields only for commercials
- Required fields marked with red badge, optional with muted badge

### Fix: Content Scroll
- Changed `overflow: hidden` to `overflow: auto` on the main content wrapper in `PipelineApp.tsx`
- Settings form now scrolls properly when content exceeds viewport height

## Save/Load Modal Fix (Woodbury Core)

- Replaced Tailwind class-based styling with inline styles for reliability
- Dark theme (`#0f172a` background, `colorScheme: dark`) renders correctly regardless of Tailwind availability
- Blur backdrop effect, larger border radius, proper button styling

## Section Tree Improvement (Woodbury Core)

- Color-coded section type icons (act = 📁 indigo, scene = 🎬 gray, teaser = 🎪 purple, montage = 🎞 cyan)
- Type badges as small chips next to section names
- Fallback title resolution: tries `title`, `name`, `heading`, `label`, then auto-generates
- Child count indicators, description display, and summary statistics
- Top-level sections have subtle card backgrounds for visual separation

## Program Monitor Enhancements

- Added more zoom levels: 25%, 33%, 50%, 67%, 75%, 100%, 125%, 150%, 200%, 250%, 300%, 400%
- Added Fit, Fit Width, Fit Height options in zoom dropdown
- Drag-to-pan works at any zoom level (not just when content overflows)
- Fixed drag stability by using `useRef` for pan offset instead of state in useEffect deps

## Removed Duplicate Settings View

- Removed the pipeline's custom `views/settings/` view which duplicated Woodbury's built-in Settings page

## Repo Cleanup

- Updated `.gitignore` to exclude `pipeline.json.backup`, compiled Go binary (`tools/llm-proxy/woodbury-llm-proxy`), and accidental `~/` directory
