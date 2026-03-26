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

## Repo Cleanup

- Updated `.gitignore` to exclude `pipeline.json.backup`, compiled Go binary (`tools/llm-proxy/woodbury-llm-proxy`), and accidental `~/` directory
