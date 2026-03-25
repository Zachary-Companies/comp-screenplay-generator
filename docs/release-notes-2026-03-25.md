# Release Notes — March 25, 2026

## Video Chain System

Generate longer video sequences by chaining multiple AI video clips together. Each shot can now have a chain of video segments that play back-to-back, filling the full dialogue duration.

- **Continue Chain** — Click "Continue" on any shot to generate a new video that picks up from the last frame of the previous one, creating seamless visual continuity
- **Gap Detection** — Progress bars show how much of a shot's slot is covered by video vs. how much remains, with duration labels (e.g., "12.0s / 17.7s (5.7s gap)")
- **Auto Slot Duration** — Shot durations are now calculated automatically from dialogue audio — no need to run Compact Timing first
- **Chain Management** — Add, remove, and reorder video segments in the chain from the editor's Versions Gallery

## Transition Videos

Generate smooth transition videos between consecutive shots using first-frame/last-frame interpolation.

- **Generate Transition** — A new button between shot cards generates a transition video using the previous shot's last frame and next shot's first frame
- **Transition Shots** — Transition videos are inserted as proper shot elements in the screenplay, with their own previs and video controls
- **Veo 3.1 SDK** — Transitions use the Google GenAI SDK for first+last frame interpolation via Veo 3.1

## Prompt Editing

Full control over the prompts used for image and video generation.

- **Edit Image Prompt** — Click the pencil icon next to "Regen" to open a modal with the editable scene description
- **Persistent Prompts** — Edited prompts are saved and reused for all future generations of that shot
- **Video Prompt Preview** — The Continue Chain modal shows the auto-generated prompt with start/end frame previews before generating

## Shot Management

- **Delete Shots** — Click the X button on any shot card to remove it from the screenplay
- **Insert Shots** — Add new shot elements at action/description lines to split visual coverage

## Editor Improvements

- **Versions Gallery** — Shows all image and video generations with chain segment indicators, "Add to Chain" buttons, and duration labels
- **Timeline Gap Indicator** — Visual clips with insufficient video coverage show an amber progress bar and duration text on the timeline
- **Video Duration Labels** — Each video thumbnail shows its actual duration

## Render Improvements

- **Chain Concatenation** — Render now pre-concatenates chain segments into continuous video before the final render pass
- **No Black Frames** — Visual clips extend to fill gaps between cuts; each image/video holds on screen until the next cut
- **Video Looping** — Short videos automatically loop to fill their timeline slot duration

## Image Gallery

- **Improved Layout** — Gallery modal now uses a responsive grid that maximizes space for image thumbnails with minimal metadata overlay
