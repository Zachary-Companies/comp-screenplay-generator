# Motion Graphics Research for Comprehensive Screenplay Generator

**Date:** 2026-03-23
**Purpose:** Research and architecture plan for incorporating motion graphics into the automated screenplay/video generation pipeline.

---

## Table of Contents

1. [Types of Motion Graphics in Video Production](#1-types-of-motion-graphics-in-video-production)
2. [Motion Graphics by Video Type](#2-motion-graphics-by-video-type)
3. [Technical Implementation Approaches](#3-technical-implementation-approaches)
4. [Data-Driven Motion Graphics](#4-data-driven-motion-graphics)
5. [Best Practices](#5-best-practices)
6. [Proposed Data Model](#6-proposed-data-model)
7. [Technical Architecture for the Pipeline](#7-technical-architecture-for-the-pipeline)
8. [Implementation Priority](#8-implementation-priority)

---

## 1. Types of Motion Graphics in Video Production

### 1.1 Lower Thirds (Name/Title Cards)

Lower thirds are text overlays positioned in the bottom third of the screen, used to identify speakers, locations, or provide context. They are one of the most common motion graphics in all video production.

**Characteristics:**
- Appear in the bottom ~33% of the frame (the "lower third" region)
- Typically contain 1-2 lines: a name/title and a subtitle/role
- Animate in (slide, fade, wipe) and animate out after 3-6 seconds
- Often include a colored bar, box, or brand element behind the text
- Sans-serif fonts preferred for readability (Helvetica, Roboto, Montserrat)

**Styles:**
- Minimalist: clean text with subtle underline or bar
- Corporate/branded: company colors, logo integration
- Broadcast: bold, high-contrast with background boxes
- Social media: playful, rounded corners, emoji-friendly

**Pipeline relevance:** Every project type benefits from lower thirds. Character introductions, location labels, and chapter markers are all lower-third candidates. The pipeline already has character `displayName` and location `name` fields that map directly to lower-third content.

### 1.2 Title Sequences / Intro Animations

Opening title sequences set the tone and convey key credits (title, cast, crew). They range from simple text-on-black cards to elaborate animated sequences.

**Characteristics:**
- Duration: 5-10 seconds for YouTube; up to 1-3 minutes for film
- Establish visual identity, mood, and genre expectations
- Modern trend: dimensional depth with parallax text and subtle 3D effects
- Film uses: cast/crew credits over establishing shots or custom animation
- YouTube uses: short branded bumper with logo, channel name, and sound

**Pipeline relevance:** The pipeline generates `metadata.title`, `metadata.genre`, `metadata.logline`, and character/crew information. A title sequence node could compose these into an animated intro template selected by `projectType`.

### 1.3 Transitions

Transitions bridge between scenes, shots, or segments. They go beyond simple cuts to provide visual continuity and pacing.

**Common types:**
- **Cross dissolve / fade:** Gradual blend between two shots (universal)
- **Wipe:** One shot slides or pushes over another (directional)
- **Iris:** Circular reveal/close (retro, playful)
- **Glitch:** Digital distortion effect (modern, energetic)
- **Morph/liquid:** Fluid shape-morphing between scenes (trending in 2025-2026)
- **Zoom/whip pan:** Camera-motivated blur transition
- **Luma/alpha matte:** Custom-shape reveal using grayscale masks
- **Slide/push:** Panels sliding in and out (split-screen style)

**Pipeline relevance:** Transitions can be auto-assigned based on element types. A `transition` element already exists in the pipeline's element generation; this could be extended to specify the transition style, direction, and duration.

### 1.4 Text Overlays / Kinetic Typography

Animated text that appears, moves, or transforms to emphasize key messages. Essential for short-form video and social content.

**Characteristics:**
- Word-by-word or phrase-by-phrase animation synced to audio
- Pop, slide, bounce, typewriter, and scale effects
- Bold hook text in first 1-3 seconds for short-form content
- Animated captions/subtitles are a subset of this category
- 85% of social media viewers watch without sound, making text overlays critical

**Pipeline relevance:** Dialogue elements and action descriptions could be converted to kinetic typography overlays. For YouTube Shorts, every dialogue line could become animated on-screen text.

### 1.5 Callouts and Annotations

Pointer-based graphics that draw attention to specific areas of the frame. Common in tutorials, explainers, and product reviews.

**Characteristics:**
- Arrow or line pointing to an area of interest
- Accompanying text label or description
- Zoom-in circles or magnification effects
- Numbered step indicators
- Typically animated in with a bounce or draw-on effect

**Pipeline relevance:** Less relevant for narrative content, but useful for YouTube explainer-style projects. Could be driven by action-line elements that describe specific visual details.

### 1.6 Logo Animations / Bugs

Animated brand logos that appear as intros, watermarks, or corner bugs during video playback.

**Characteristics:**
- Intro logo: 2-5 second animation before content begins
- Corner bug: small, semi-transparent logo in a corner throughout
- Outro logo: appears during end card/credits
- Modern trend: subtle, understated; avoid overly flashy logo animations

**Pipeline relevance:** Users could provide a logo asset that gets animated into standard positions. The `assetCollection` already supports arbitrary asset types.

### 1.7 Animated Infographics / Data Visualization

Charts, graphs, statistics, and data points that animate to reveal information progressively.

**Characteristics:**
- Bar charts growing, pie charts filling, counters incrementing
- Map animations showing locations or routes
- Timeline graphics showing progression
- Comparison layouts (before/after, side-by-side)

**Pipeline relevance:** Useful for documentary-style projects and YouTube explainers. The pipeline could accept structured data inputs and generate infographic overlays.

### 1.8 Particle Effects and Backgrounds

Animated visual elements (particles, bokeh, dust, sparks) that add atmosphere or serve as backgrounds for text.

**Characteristics:**
- Floating particles for ethereal/magical feel
- Bokeh/light leak effects for cinematic warmth
- Animated gradient backgrounds for modern/clean aesthetic
- Snow, rain, fire particles for environmental effects
- Often used behind title cards or as scene atmosphere

**Pipeline relevance:** Could be selected based on `genre` and `mood` inputs. A mapping from mood keywords to particle presets would automate this.

### 1.9 Split Screens

Dividing the frame into two or more panels showing different content simultaneously.

**Characteristics:**
- Comparison shots (before/after, two perspectives)
- Animated panel borders that slide, grow, or reshape
- Customizable border width, color, and animation style
- Panels can animate in sequentially or simultaneously
- Common in music videos, product comparisons, multi-character scenes

**Pipeline relevance:** Multi-character dialogue scenes could use split screens. The pipeline knows which characters are in each scene via bindings, making automatic split-screen composition feasible.

### 1.10 Ken Burns Effect on Stills

Pan and zoom animation applied to still images to create the illusion of movement. Named after documentarian Ken Burns.

**Characteristics:**
- Slow zoom in or out (0.1-0.5% per frame)
- Pan across image to reveal details
- Combination of zoom and pan for dynamic movement
- Typical duration: 4-8 seconds per image
- Often combined with cross-dissolve transitions between images

**Pipeline relevance:** Critical for the pipeline since previsualization images are stills. Every previs image should have a Ken Burns effect applied to create the appearance of camera movement. The `cameraMovement` field on shots already describes the intended movement (PAN, PUSH IN, PULL BACK) which maps directly to Ken Burns parameters.

### 1.11 Animated Borders and Frames

Decorative borders or frames that surround video content, often animated.

**Characteristics:**
- Vignette effects (dark edges)
- Animated corner decorations
- Film frame overlays (sprocket holes, frame lines)
- Social media frame templates (9:16 content in 16:9 frame)
- Retro film grain and scratch overlays

**Pipeline relevance:** Could be auto-selected based on `visualStyle`. A "cinematic" style might add film grain and vignette; a "retro" style might add VHS scan lines.

---

## 2. Motion Graphics by Video Type

### 2.1 YouTube Shorts (9:16 Vertical)

YouTube Shorts are viewed 90%+ on mobile devices. Motion graphics must be designed for the vertical format and small screen.

**Commonly used motion graphics:**
- **Animated captions/subtitles:** Word-by-word or phrase-by-phrase, large bold text (18-24pt+), high contrast. Shorts with burned-in captions see 15-25% higher retention.
- **Bold hook text:** Full-screen text in the first frame/1-3 seconds. This is the single most important graphic for Shorts.
- **Emoji reactions:** Animated emoji overlays synced to emotional beats.
- **Progress bars:** Thin animated bars showing video progress (keep watching motivation).
- **Subscribe/like animations:** Animated CTAs, usually in the bottom third.
- **Text-behind-subject:** Text that appears to be behind the main subject (parallax depth effect).
- **Countdown/timer graphics:** For listicle or step-by-step content.

**Safe zone considerations:**
- Top 20%: occupied by title/channel name overlays from YouTube UI
- Bottom 25%: occupied by like/comment/share buttons
- Center third: the safe zone for captions and key graphics
- All text must be large enough to read on a phone screen

**Pacing:**
- One cut every 2-4 seconds
- New graphic element every 3-5 seconds
- Total duration: under 60 seconds (optimal: 30-45 seconds)
- First 3 seconds determine whether viewers stay

**Pipeline-specific recommendations:**
- Auto-generate animated captions from dialogue elements
- Use character `displayName` for on-screen name cards
- Generate bold hook text from `metadata.logline` or first action line
- Apply aspect ratio 9:16 throughout; the pipeline's `generate-image.json` already supports aspect ratio config

### 2.2 YouTube Videos (16:9 Horizontal)

Standard landscape format with longer duration and more complex motion graphic needs.

**Commonly used motion graphics:**
- **Intros:** 5-10 second branded animation with title, channel name
- **Outros:** 15-20 second end card with subscribe CTA, video suggestions, end screens
- **Lower thirds:** Character/speaker identification, location labels
- **Chapter cards:** Full-screen or partial-screen text marking new chapters/sections
- **B-roll overlays:** Text, statistics, or graphics over supplementary footage
- **Sponsor segments:** Branded segment with logo, product shots, CTA
- **Transition bumpers:** Short animated breaks between segments
- **Animated thumbnails:** Motion-designed title cards for social sharing

**Pacing:**
- New visual element every 10-15 seconds
- Intro under 10 seconds
- Chapter cards: 2-3 seconds, matching YouTube chapters feature
- Lower thirds: 4-6 seconds
- Sponsor segments: 30-90 seconds

**Pipeline-specific recommendations:**
- Map `sections` to YouTube chapters with animated chapter cards
- Generate intro from `metadata.title` + `metadata.genre` + visual style
- Generate outro with CTA elements
- Lower thirds triggered by character-element entries in scenes

### 2.3 Film / Screenplay / Traditional

Film motion graphics are typically more restrained and serve the narrative.

**Commonly used motion graphics:**
- **Opening title cards:** White text on black, or superimposed over establishing shots
- **Opening credits sequence:** 1-3 minutes, can be elaborate
- **Scene transition cards:** "THREE YEARS LATER", location/time text
- **End credits:** Scrolling or paged crew credits
- **VFX plates:** Green screen composites, environmental effects
- **Subtitle tracks:** For foreign language dialogue
- **Intertitles:** Text cards between scenes (common in period pieces, documentaries)

**Pacing:**
- Title cards: 3-5 seconds per card
- Credits scroll: 120-180 words per minute reading speed
- Scene transitions: match the film's rhythm (slower for drama, snappier for thriller)

**Pipeline-specific recommendations:**
- Generate title cards from `metadata.title`, `metadata.genre`
- Create scene heading cards from `sections[].title` and location/time info
- Auto-generate end credits from `productionMetadata` author info and `characters`
- Scene transition text from `elements` where `type === 'transition'`

### 2.4 Social Media (Instagram Reels, TikTok)

Overlaps significantly with YouTube Shorts but with platform-specific conventions.

**Trending effects and styles (2025-2026):**
- **Butter yellow serif text:** Warm yellow color with classic serif fonts (trending aesthetic)
- **Text-behind-subject:** Depth-simulating text placement
- **Glitch and distortion effects:** Quick digital artifact transitions
- **Liquid motion transitions:** Fluid, morphing shape transitions
- **Audio-synced text beats:** Text that pulses or transforms on music beats
- **CapCut-style templates:** Standardized effect packages (slow-motion, color grade + text combo)
- **Niche-specific styling:** Travel uses earth tones + serif; finance uses dark backgrounds + gold accents; comedy uses bold sans-serif + bright colors

**Pipeline-specific recommendations:**
- Support platform-specific presets in the motion graphics configuration
- Allow mood/genre to drive color palette and font selection
- Support audio-synced timing markers in the motion graphics spec

---

## 3. Technical Implementation Approaches

### 3.1 Remotion (React-Based Video Generation)

Remotion is a framework for creating videos programmatically using React components. It is the strongest candidate for the pipeline's motion graphics rendering layer.

**How it works:**
- Write React components with JSX, CSS, and JavaScript
- Components receive a frame number and render each frame
- Remotion renders frames into MP4/WebM using headless Chromium + FFmpeg
- Compositions are reusable templates parameterized by `inputProps` (JSON data)

**Key capabilities:**
- Full web technology stack: CSS animations, SVG, Canvas, WebGL
- Built-in `spring()` function for natural-feeling animation curves
- `interpolate()` for mapping frame numbers to values
- `Sequence` component for timing sub-compositions
- `AbsoluteFill` for layered composition
- Audio support with `<Audio>` component
- Built-in `@remotion/player` for browser preview

**Relevance to this pipeline:**
- The pipeline's entire data model (characters, locations, elements, sections, previs) can be passed as `inputProps` to a Remotion composition
- Each motion graphic type becomes a reusable React component
- The pipeline can output a Remotion project that renders to final video
- Remotion supports dynamic aspect ratios (9:16, 16:9, 1:1)

**2025-2026 developments:**
- Remotion agent skill hit 150,000 installs; strong community adoption
- Official AI SaaS starter template (Next.js) for building AI-powered motion graphics products
- Claude Code + Remotion integration is a proven workflow for AI-assisted video generation
- Analysts predict 45% of motion graphics will be produced through AI-assisted code generation by 2027

### 3.2 FFmpeg (Command-Line Video Processing)

FFmpeg provides lower-level motion graphics capabilities through its filter system. Best for simple overlays, Ken Burns effects, and transitions.

**Key filters for motion graphics:**
- `drawtext`: Text overlay with font, size, color, position, fade-in/out, and expression-based timing (`enable='between(t,1,5)'`)
- `zoompan`: Ken Burns effect (zoom + pan on still images; zoom range 1-10x)
- `overlay`: Composite one video/image over another at specific coordinates
- `xfade`: Cross-fade and other transitions between clips (offset, duration, type)
- `fade`: Simple fade in/out effects
- `colorkey` / `chromakey`: Green screen compositing
- `drawbox`: Colored rectangles (for lower-third backgrounds)
- `pad`: Add letterboxing or pillarboxing for aspect ratio conversion
- `scale`: Resize/reformat content

**Ken Burns implementation:**
- `zoompan=z='zoom+0.001':x=0:y=0:d=150:s=1920x1080` for slow zoom
- Zoom factor controls speed; x/y control pan target
- Can be chained with `xfade` for slideshow-style transitions between images

**Limitations:**
- Complex layouts are very difficult (no flexbox, no component model)
- Text styling is primitive compared to CSS
- No built-in spring animations or easing curves
- Filter chain syntax is hard to maintain programmatically
- Limited to what drawtext and overlay can express

**Best used for:**
- Ken Burns on previs images (the pipeline's most immediate need)
- Simple text overlays and fade transitions
- Final video assembly (concatenating rendered segments)
- As the encoding backend behind Remotion

### 3.3 Lottie / Bodymovin (JSON Animation Format)

Lottie is a JSON-based animation format exported from After Effects. Animations are lightweight, scalable, and renderable on web, mobile, and in video pipelines.

**Key characteristics:**
- JSON structure describing layers, keyframes, and easing curves
- Much smaller than video/GIF equivalents while preserving quality
- 60fps playback capability
- Cross-platform: iOS, Android, web, desktop
- dotLottie (.lottie) format for even smaller file sizes
- Massive free library of pre-made animations on LottieFiles

**Relevance to this pipeline:**
- Pre-made Lottie animations for common motion graphics (lower thirds, transitions, callouts)
- Lottie files can be rendered to video frames using `lottie-to-video` tools
- Can be embedded in Remotion compositions via `@remotion/lottie`
- Could serve as the template format for user-customizable motion graphics
- JSON format aligns with the pipeline's data-driven approach

**Workflow:**
1. Design motion graphic templates in After Effects
2. Export as Lottie JSON using Bodymovin/LottieFiles plugin
3. Store templates in pipeline's asset library
4. At render time, inject dynamic data (character names, titles) into Lottie JSON
5. Render to video frames via Remotion or direct canvas rendering

### 3.4 CSS/HTML-Based Motion Graphics

Using standard web technologies (CSS animations, CSS keyframes, HTML/SVG) to create motion graphics that are captured as video frames.

**Approach:**
- Define animations with CSS `@keyframes` and `animation` properties
- Use SVG for vector graphics (logos, icons, shapes)
- Canvas API for particle effects and complex procedural graphics
- Capture frames via headless browser (Puppeteer/Playwright)

**Libraries:**
- **GSAP (GreenSock):** Industry-standard web animation library; timeline-based, precise control
- **Motion (formerly Framer Motion):** React-native animation with declarative API
- **Anime.js:** Lightweight; good for SVG and CSS animations
- **mo.js:** Purpose-built for motion graphics on the web
- **Three.js:** 3D graphics in WebGL (for 3D title sequences)

**Relevance to this pipeline:**
- Remotion already uses this approach (React + CSS + Canvas)
- The pipeline's view system (`views/`) already uses HTML/CSS/JS
- Motion graphic templates could share technology with pipeline views
- Web-based approach allows instant preview in the browser

### 3.5 AI-Generated Motion Graphics (State of the Art 2026)

AI video generation has matured significantly but is best understood as a complement to template-based motion graphics, not a replacement.

**Current capabilities:**
- Text-to-video models (VEO 3.1, Sora 2, Runway Gen-4.5) can generate footage but not precise motion graphics
- AI can generate title card concepts, transition ideas, and style explorations
- AI-powered tools automate keyframing, rotoscoping, and object tracking
- Motion prediction AI can optimize timing and camera movement
- Adobe After Effects 26.0 includes AI-assisted motion design features

**Limitations for motion graphics:**
- AI video generators lack pixel-level precision needed for typography
- Cannot guarantee consistent branding (colors, fonts, logo placement)
- Not suitable for template-based production where exact reproducibility is required
- Best used for ideation and concept generation, not final rendering

**Recommendation for the pipeline:**
- Use AI (context.llm) to suggest motion graphic parameters (timing, style, color palette)
- Use AI to generate motion graphic descriptions that drive template selection
- Use traditional rendering (Remotion/FFmpeg) for actual output
- AI image generation (already in the pipeline via nanobanana) can create custom background plates and textures

---

## 4. Data-Driven Motion Graphics

### 4.1 JSON-Based Specifications

The industry standard for data-driven motion graphics uses JSON to define templates with dynamic fields that are populated at render time.

**Adobe's approach:**
- Motion Graphics Templates (MOGRTs) with Essential Properties that bind to CSV/JSON data
- Dynamic Graphics Render (DGR) API: MOGRTs + CSV data source for scaled rendering
- mgJSON format supports time-varying data (data that changes per frame)

**Dataclay Templater approach:**
- After Effects templates with data-bound text, images, and properties
- Data sources: Google Sheets, TSV files, JSON files/feeds
- Dynamic text styling (font-face, direction) controlled from data source

**Remotion approach:**
- React components receive `inputProps` as JSON
- Each "composition" is a template; data drives all variable content
- `renderMedia()` API accepts data and outputs video
- Native JSON - no conversion layer needed

**Recommended approach for this pipeline:**
- Define motion graphics as JSON specifications within the script package
- Each motion graphic element has a `type`, `timing`, `data`, and `style` configuration
- The render layer (Remotion or FFmpeg) interprets the specification
- This keeps the pipeline's node scripts independent of the render technology

### 4.2 Templating with Pipeline Data

The pipeline already generates all the data needed to drive motion graphics:

| Pipeline Data | Motion Graphic Use |
|---|---|
| `metadata.title` | Title card, intro sequence |
| `metadata.genre`, `metadata.mood` | Style selection, color palette |
| `characters[].displayName` | Lower thirds, character introductions |
| `characters[].description` | Extended character cards |
| `characters[].imagePath` | Character headshot in lower thirds |
| `locations[].name` | Location title cards |
| `locations[].description` | Location establishing text |
| `sections[].title` | Chapter cards, act breaks |
| `elements[].type === 'dialogue'` | Caption/subtitle overlays |
| `elements[].type === 'transition'` | Transition effect triggers |
| `elements[].type === 'shot'` | Camera movement for Ken Burns |
| `previs.shots[].filePath` | Still images for Ken Burns |
| `previs.shots[].frameSize` | Ken Burns zoom level |
| `previs.shots[].cameraMovement` | Ken Burns direction |
| `productionMetadata` | Credits sequence |
| `validatedInput.projectType` | Template selection (Shorts vs. film) |

### 4.3 NLE Integration

Non-linear editors use Edit Decision Lists (EDLs), AAF, and XML formats to describe timelines. The pipeline could export motion graphic specifications in NLE-compatible formats.

**Key concepts:**
- Timeline tracks: separate tracks for video, audio, titles, graphics
- Markers: named time points for sync (chapter starts, beat drops)
- Clip metadata: each clip carries properties like in/out points, effects
- Dynamic Link: Premiere Pro can reference After Effects compositions

**Pipeline integration:**
- The pipeline's element array is already timeline-adjacent (ordered elements with implicit durations)
- Adding explicit timing data (start time, duration) to elements would make NLE export straightforward
- Motion graphic specifications could export as MOGRT references in an EDL/XML timeline

---

## 5. Best Practices

### 5.1 Timing and Pacing

| Element | Duration | Notes |
|---|---|---|
| Lower thirds | 3-6 seconds | Long enough to read, short enough to not distract |
| Character title cards | 2-5 seconds | Shorter for freeze-frame introductions |
| Title cards (film) | Up to 12 seconds | Includes title + subtitle |
| Video intros/bumpers | 5-10 seconds | YouTube: aim for 5-8 seconds |
| Animated text entry | 0.5-1.5 seconds | Use easing (ease-out for entries, ease-in for exits) |
| Transition effects | 0.5-2 seconds | Match the pacing of the content |
| End credits scroll | 120-180 words/min | Standard reading speed |
| YouTube Shorts hooks | First 3 seconds | Determines viewer retention |
| New visual element | Every 10-15 seconds | For YouTube long-form |
| Cut pacing (Shorts) | Every 2-4 seconds | High-performing Shorts use aggressive pacing |

**Project-type timing profiles:**

- **YouTube Shorts:** Fast pace. New visual element every 2-4 seconds. Hook text in first frame. Animated captions throughout. Total: 30-60 seconds.
- **YouTube Video:** Medium pace. Intro 5-10s, new element every 10-15s, lower thirds 4-6s, chapter cards 2-3s, outro 15-20s. Total: 8-30 minutes.
- **Film/Screenplay:** Slow pace. Title sequence 30-180s, scene transitions 1-3s, lower thirds only for documentary-style, end credits 60-300s. Total: varies.

### 5.2 Typography Rules

**Font selection:**
- Sans-serif fonts for all motion graphics (Helvetica, Arial, Roboto, Montserrat)
- Serif fonts only for specific stylistic choices (period pieces, luxury branding)
- Maximum 2-3 typefaces per project
- Bold or semi-bold weights for all on-screen text
- Avoid thin weights on mobile/small screens

**Size guidelines:**
- Minimum 40-60px for body text at 1920x1080 (Full HD)
- Titles: 50%+ larger than body text
- YouTube Shorts: 18-24pt minimum; larger preferred
- Maximum 30 characters per line
- Maximum 3 lines displayed simultaneously

**Animation:**
- Use easing functions (ease-out for entries, ease-in for exits)
- Spring physics for natural-feeling motion (Remotion's `spring()`)
- Avoid linear interpolation (looks robotic)
- Keep animation style consistent throughout a project
- Use 2-3 transition patterns as a consistent vocabulary

### 5.3 Color and Contrast

**Contrast ratios (WCAG):**
- Normal text: minimum 4.5:1 contrast ratio against background
- Large text (24px+ or 18px+ bold): minimum 3:1 contrast ratio
- Always add text shadows, strokes, or background boxes over video content

**Color strategies:**
- Dark text with light drop shadow or outline over bright video
- Light text with dark background box (most reliable)
- Transparent gradient overlay behind text (lower third region)
- Color palette derived from project genre/mood

**Genre-to-color mappings (recommendation for pipeline):**
- Drama: deep blues, warm ambers, muted palette
- Comedy: bright primaries, warm yellows, saturated
- Horror: deep reds, cold blues, high contrast, desaturated
- Sci-fi: neon blues/cyans, dark backgrounds, tech aesthetic
- Romance: warm pinks, soft golds, pastel palette
- Documentary: neutral/white text, minimal color, clean

### 5.4 Accessibility

**Captions:**
- Burned-in captions increase retention 15-25%
- Position in center-third safe zone (avoid top 20% and bottom 25% on Shorts)
- Sync with audio at natural phrase boundaries
- Minimum 2.3 seconds display time per 30-character line (13 chars/second reading speed)
- Test with sound off to verify the experience is complete

**Visual accessibility:**
- Avoid relying solely on color to convey information
- Provide alternative text descriptions for animated sequences (metadata)
- Support pause/replay for complex animations (interactive contexts)
- Avoid strobing or rapid flash effects (photosensitive epilepsy risk)
- Maintain consistent animation patterns (predictability aids comprehension)

**Platform-specific safe zones:**
- YouTube Shorts: avoid top 20% (title/channel) and bottom 25% (buttons)
- Instagram Reels: similar to Shorts; avoid bottom 30%
- TikTok: avoid bottom 20% (interaction buttons) and top 10% (status bar)
- YouTube Video: standard 90% title-safe area
- Film: standard 80% title-safe, 90% action-safe

---

## 6. Proposed Data Model

### 6.1 Motion Graphic Element Schema

Each motion graphic is defined as a JSON object within the script package:

```json
{
  "id": "mg-001",
  "type": "lower-third",
  "trigger": {
    "elementId": "el-dialogue-001",
    "event": "start",
    "offsetMs": 0
  },
  "timing": {
    "startMs": null,
    "durationMs": 5000,
    "enterMs": 500,
    "exitMs": 300,
    "enterEasing": "ease-out",
    "exitEasing": "ease-in"
  },
  "position": {
    "region": "lower-third",
    "anchor": "bottom-left",
    "offsetX": 48,
    "offsetY": -64,
    "safeZone": true
  },
  "content": {
    "primary": "{{character.displayName}}",
    "secondary": "{{character.role}}",
    "image": "{{character.imagePath}}"
  },
  "style": {
    "preset": "minimal",
    "fontFamily": "Roboto",
    "primaryFontSize": 42,
    "secondaryFontSize": 28,
    "primaryColor": "#FFFFFF",
    "secondaryColor": "#CCCCCC",
    "backgroundColor": "rgba(0,0,0,0.6)",
    "accentColor": "#FF6B35",
    "borderRadius": 4
  },
  "animation": {
    "enter": "slide-right",
    "exit": "fade-out",
    "emphasis": null
  },
  "conditions": {
    "projectTypes": ["YouTube Video", "Short Film", "TV Episode"],
    "firstAppearanceOnly": true
  }
}
```

### 6.2 Core Motion Graphic Types

```typescript
type MotionGraphicType =
  | "lower-third"        // Name/title identification
  | "title-card"         // Full-screen or partial title
  | "chapter-card"       // Section/chapter divider
  | "caption"            // Dialogue subtitle overlay
  | "transition"         // Scene/shot transition effect
  | "intro-sequence"     // Opening title sequence
  | "outro-sequence"     // Closing credits/CTA
  | "ken-burns"          // Pan/zoom on still image
  | "text-overlay"       // Arbitrary text (hooks, callouts)
  | "logo-bug"           // Corner logo watermark
  | "split-screen"       // Multi-panel layout
  | "progress-bar"       // Video progress indicator
  | "background-effect"  // Particles, gradients, ambiance
  | "border-frame"       // Decorative frame/vignette
  | "infographic"        // Data visualization overlay
```

### 6.3 Ken Burns Specification (for Previs Images)

```json
{
  "id": "kb-shot-001",
  "type": "ken-burns",
  "shotElementId": "shot-ext-park-1",
  "sourceImage": "{{previs.shots[0].filePath}}",
  "timing": {
    "durationMs": 4000,
    "enterMs": 500,
    "exitMs": 500
  },
  "movement": {
    "startZoom": 1.0,
    "endZoom": 1.15,
    "startX": 0.5,
    "startY": 0.5,
    "endX": 0.55,
    "endY": 0.45,
    "easing": "linear"
  },
  "derivedFrom": {
    "cameraMovement": "SLOW PUSH IN",
    "frameSize": "MEDIUM"
  }
}
```

**Camera movement to Ken Burns mapping:**

| Camera Movement | Start Zoom | End Zoom | Pan Direction |
|---|---|---|---|
| STATIC | 1.0 | 1.0 | None |
| PUSH IN | 1.0 | 1.2 | Center |
| SLOW PUSH IN | 1.0 | 1.1 | Center |
| PULL BACK | 1.2 | 1.0 | Center |
| PAN | 1.05 | 1.05 | Left-to-right or right-to-left |
| TILT | 1.05 | 1.05 | Top-to-bottom or bottom-to-top |
| TRACKING | 1.0 | 1.0 | Follow subject (left-to-right) |
| DOLLY | 1.0 | 1.15 | Forward with slight pan |
| CRANE | 1.1 | 1.0 | Top-down pull back |
| HANDHELD | 1.02 | 1.04 | Slight random drift |
| STEADICAM | 1.0 | 1.08 | Smooth lateral + slight push |

### 6.4 Caption/Subtitle Specification

```json
{
  "id": "cap-001",
  "type": "caption",
  "trigger": {
    "elementId": "el-dialogue-005",
    "event": "start"
  },
  "timing": {
    "startMs": null,
    "durationMs": 3200,
    "enterMs": 100,
    "exitMs": 100
  },
  "content": {
    "text": "I never thought I'd see this place again.",
    "characterName": "MARCUS",
    "words": [
      { "text": "I", "startMs": 0, "endMs": 200 },
      { "text": "never", "startMs": 200, "endMs": 500 },
      { "text": "thought", "startMs": 500, "endMs": 900 },
      { "text": "I'd", "startMs": 900, "endMs": 1100 },
      { "text": "see", "startMs": 1100, "endMs": 1400 },
      { "text": "this", "startMs": 1400, "endMs": 1700 },
      { "text": "place", "startMs": 1700, "endMs": 2100 },
      { "text": "again.", "startMs": 2100, "endMs": 2600 }
    ]
  },
  "style": {
    "preset": "shorts-bold",
    "fontFamily": "Montserrat",
    "fontSize": 56,
    "fontWeight": 800,
    "color": "#FFFFFF",
    "strokeColor": "#000000",
    "strokeWidth": 3,
    "highlightColor": "#FFD700",
    "highlightCurrentWord": true
  },
  "position": {
    "region": "center",
    "safeZone": true
  }
}
```

### 6.5 Transition Specification

```json
{
  "id": "trans-001",
  "type": "transition",
  "trigger": {
    "elementId": "el-transition-003",
    "event": "start"
  },
  "timing": {
    "durationMs": 1000
  },
  "effect": {
    "name": "cross-dissolve",
    "direction": null,
    "params": {
      "easing": "ease-in-out"
    }
  },
  "derivedFrom": {
    "elementContent": "DISSOLVE TO:",
    "genreSuggestion": "drama"
  }
}
```

### 6.6 Motion Graphics Plan (Top-Level Container)

The full motion graphics specification that gets added to the script package:

```json
{
  "motionGraphicsPlan": {
    "version": "1.0",
    "projectType": "YouTube Short",
    "aspectRatio": "9:16",
    "resolution": { "width": 1080, "height": 1920 },
    "fps": 30,
    "globalStyle": {
      "colorPalette": {
        "primary": "#FFFFFF",
        "secondary": "#FFD700",
        "accent": "#FF6B35",
        "background": "rgba(0,0,0,0.7)"
      },
      "fontPrimary": "Montserrat",
      "fontSecondary": "Roboto",
      "animationPreset": "energetic"
    },
    "safeZones": {
      "top": 0.20,
      "bottom": 0.25,
      "left": 0.05,
      "right": 0.05
    },
    "elements": [
      { "...": "array of motion graphic element objects as defined above" }
    ],
    "timeline": {
      "totalDurationMs": 45000,
      "segments": [
        {
          "id": "seg-001",
          "type": "intro",
          "startMs": 0,
          "endMs": 3000,
          "motionGraphicIds": ["mg-title-001", "mg-hook-001"]
        },
        {
          "id": "seg-002",
          "type": "scene",
          "sceneId": "scene-001",
          "startMs": 3000,
          "endMs": 35000,
          "motionGraphicIds": ["kb-shot-001", "cap-001", "cap-002", "mg-lt-001"]
        },
        {
          "id": "seg-003",
          "type": "outro",
          "startMs": 35000,
          "endMs": 45000,
          "motionGraphicIds": ["mg-cta-001", "mg-logo-001"]
        }
      ]
    }
  }
}
```

---

## 7. Technical Architecture for the Pipeline

### 7.1 New Pipeline Node: `motion-graphics-generation.ts`

A new node that takes the assembled script data and generates a motion graphics plan.

**Inputs:**
- `metadata` - Script metadata (title, genre, mood)
- `characters` - Character definitions
- `locations` - Location definitions
- `elements` - Script elements (dialogue, shots, transitions, action)
- `processedSections` - Section hierarchy (acts, scenes)
- `previsualizationPlan` - Previs shots with image paths
- `validatedInput` - Original input including `projectType`
- `productionMetadata` - Credits and production info

**Outputs:**
- `motionGraphicsPlan` - Complete motion graphics specification (JSON)

**Logic:**
1. Determine project type and select appropriate template profile
2. Generate global style from genre/mood mapping
3. Calculate safe zones based on aspect ratio and platform
4. Generate intro sequence elements from metadata
5. Walk the elements array in order:
   - For each `shot` element: generate Ken Burns spec from camera movement data
   - For each `dialogue` element: generate caption overlay (with word-by-word timing estimated from text length)
   - For each `transition` element: generate transition effect spec
   - For first appearance of each character: generate lower-third
   - At scene boundaries: generate chapter cards
6. Generate outro/credits sequence from production metadata
7. Calculate timeline segments and total duration
8. Return complete `motionGraphicsPlan`

### 7.2 Integration with Final Assembly

The `final-assembly.ts` node would be updated to accept `motionGraphicsPlan` as an additional input and include it in the `scriptPackage` output.

### 7.3 Render Architecture (Future)

Two rendering paths, chosen based on project complexity:

**Path A: FFmpeg (Simple/Fast)**
- Best for: Ken Burns on previs stills, simple text overlays, basic transitions
- Generate FFmpeg filter chain from motion graphics plan
- Use `zoompan` for Ken Burns, `drawtext` for captions, `xfade` for transitions
- Fast processing, no additional dependencies

**Path B: Remotion (Full-Featured)**
- Best for: Complex motion graphics, kinetic typography, split screens, custom animations
- Generate a Remotion project from the motion graphics plan
- Each motion graphic type maps to a React component
- Render via headless Chromium + FFmpeg
- Produces broadcast-quality output

**Path Selection Logic:**
```
if projectType in ["YouTube Short", "YouTube Video"]:
    use Remotion (rich motion graphics expected)
elif projectType in ["Short Film", "Feature Film"]:
    if motionGraphicsPlan has complex elements:
        use Remotion
    else:
        use FFmpeg (simpler, more cinematic)
else:
    use FFmpeg as default
```

### 7.4 View Integration

The pipeline's existing NLE screenplay view could be extended to visualize motion graphics:
- Show motion graphic markers on the timeline
- Preview Ken Burns directions with arrow overlays on previs images
- Display caption text synced with dialogue elements
- Show lower-third positioning overlays

### 7.5 Binding Integration

New binding types to support motion graphics:

- `labeled-by`: Links a motion graphic (lower-third) to the character/location it identifies
- `overlays`: Links a motion graphic to the shot it appears over
- `transitions-between`: Links a transition graphic to the two shots it bridges

These bindings enable the motion graphics plan to be edited in the bindings UI, keeping the declarative, data-driven approach.

---

## 8. Implementation Priority

### Priority 1: Ken Burns on Previs Images (High Impact, Low Complexity)

**Why first:** The pipeline already generates previs still images with camera movement metadata. Applying Ken Burns transforms these stills into dynamic video with minimal effort.

**Scope:**
- Add Ken Burns parameters to previs shot output
- Map existing `cameraMovement` and `frameSize` fields to zoom/pan values
- Generate FFmpeg `zoompan` commands or Remotion `spring()` animations
- Chain shots with cross-dissolve transitions

**Data already available:** `previs.shots[].cameraMovement`, `previs.shots[].frameSize`, `previs.shots[].filePath`

**Estimated complexity:** Low. Mapping table + filter generation.

### Priority 2: Animated Captions/Subtitles (High Impact, Medium Complexity)

**Why second:** Captions provide 15-25% retention improvement and are essential for YouTube Shorts (85% of viewers watch without sound). The pipeline already generates dialogue elements.

**Scope:**
- Generate caption timing from dialogue elements (estimate duration from character count at 13 chars/second)
- Word-by-word timing subdivision
- Style presets per project type (bold centered for Shorts, traditional subtitle for film)
- Safe zone positioning

**Data already available:** `elements[].content` where `type === 'dialogue'`, `elements[].character`

**Estimated complexity:** Medium. Requires timing estimation and word segmentation.

### Priority 3: Lower Thirds for Characters and Locations (Medium Impact, Low Complexity)

**Why third:** Lower thirds are universal across all video types and the data is already fully available in the pipeline.

**Scope:**
- Generate lower-third specs for first appearance of each character in a scene
- Generate location lower-thirds at scene boundaries
- Style presets matching project type
- Use `depicts` bindings to determine which characters appear in which shots

**Data already available:** `characters[].displayName`, `characters[].description`, `locations[].name`, bindings

**Estimated complexity:** Low. Binding query + template population.

### Priority 4: Title Cards and Chapter Cards (Medium Impact, Low Complexity)

**Why fourth:** Provides professional structure. Title cards set expectations; chapter cards improve YouTube SEO and navigation.

**Scope:**
- Opening title card from `metadata.title`, genre, logline
- Scene/chapter transition cards from `sections[].title`
- Act break cards for screenplay format
- "X TIME LATER" style transition cards from transition elements

**Data already available:** `metadata.*`, `sections[].title`, `elements[]` where `type === 'transition'`

**Estimated complexity:** Low. Template selection + data population.

### Priority 5: Intro and Outro Sequences (Medium Impact, Medium Complexity)

**Why fifth:** Adds professional polish. Different templates for each project type.

**Scope:**
- YouTube Shorts: minimal 2-3 second branded hook
- YouTube Video: 5-10 second intro with title/channel, 15-20 second outro with CTA
- Film: opening credits sequence, end credits scroll

**Data needed:** `metadata.*`, `productionMetadata`, new input for channel/brand info

**Estimated complexity:** Medium. Requires template design per project type.

### Priority 6: Transitions Between Shots (Low Impact, Low Complexity)

**Why sixth:** Transitions are subtle but improve flow. The pipeline already has transition elements.

**Scope:**
- Map transition element text ("CUT TO:", "DISSOLVE TO:", "FADE OUT") to effect types
- Genre-appropriate defaults (drama = dissolve, action = hard cut, horror = smash cut)
- Duration based on pacing profile for project type

**Data already available:** `elements[]` where `type === 'transition'`

**Estimated complexity:** Low. Mapping table.

### Priority 7: Background Effects and Frames (Low Impact, Medium Complexity)

**Why seventh:** Nice visual polish but not essential for v1.

**Scope:**
- Film grain overlay based on visual style
- Vignette for cinematic look
- Letterboxing/pillarboxing for aspect ratio adaptation
- Genre-based atmospheric particles

**Estimated complexity:** Medium. Requires asset library of effect overlays.

### Priority 8: Split Screens and Infographics (Low Impact, High Complexity)

**Why last:** These are specialized motion graphics that apply to specific project types and require significant rendering complexity.

**Scope:**
- Split screen for multi-character dialogue
- Infographic templates for documentary content
- Data visualization overlays

**Estimated complexity:** High. Requires layout engine and template system.

---

## Summary of Recommendations

1. **Rendering technology:** Use Remotion as the primary rendering engine, with FFmpeg as a lightweight fallback for simple Ken Burns + text overlay jobs. Remotion's React-based composition model aligns with the pipeline's data-driven, JSON-first architecture.

2. **Data model:** Add a `motionGraphicsPlan` to the script package output. Define motion graphics as JSON specifications that are independent of the rendering engine. Use the schema described in Section 6.

3. **New pipeline node:** Create `motion-graphics-generation.ts` that takes existing pipeline outputs and generates the motion graphics plan. This node sits between `previs-generation` and `final-assembly`.

4. **Start with Ken Burns:** The highest-impact, lowest-effort motion graphic is Ken Burns on previs images. The data already exists; it just needs a mapping layer.

5. **Captions are essential:** For YouTube Shorts and social media, animated captions are not optional. Implement word-by-word timing estimation from dialogue elements.

6. **Project-type profiles:** Define distinct motion graphics profiles for each project type (Shorts, YouTube Video, Film). These profiles control timing, style, safe zones, and which motion graphic types are enabled.

7. **Leverage existing bindings:** Use the pipeline's binding system to connect motion graphics to their source entities (characters, locations, shots). This maintains the declarative, editable approach.

8. **Template library:** Build a library of motion graphic presets (Lottie files for complex animations, CSS/React components for Remotion rendering). Allow users to customize or replace templates.
