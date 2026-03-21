# Importing Screenplays

The Comprehensive Screenplay Generator can import existing screenplays so you can generate previsualization, assign voices, and render without writing from scratch.

## Supported Formats

### Fountain (.fountain) — Recommended
The [Fountain markup format](https://fountain.io) is the best format for importing. It's plain text with simple rules that the parser understands reliably:

- Scene headings start with `INT.` or `EXT.`
- Character names are ALL CAPS on their own line
- Dialogue follows directly after the character name
- Parentheticals are in `(parentheses)`
- Action is any other text

Most screenwriting apps (Highland, WriterDuet, Fade In) can export to Fountain.

### Plain Text (.txt)
Plain text files work if they follow standard screenplay formatting conventions. The parser uses the same rules as Fountain — it looks for ALL CAPS character names, `INT./EXT.` scene headings, etc.

### PDF (.pdf) — Requires Review
PDF import extracts text from the PDF and shows it in the editor for you to review before parsing. Because every PDF is formatted differently, the extracted text may need manual cleanup:

**Common issues with PDF extraction:**
- Page numbers appearing as text (e.g., `42.` on its own line)
- Line breaks in the middle of sentences
- Character names merged with dialogue on the same line
- Missing blank lines between elements
- Headers/footers from the PDF appearing as screenplay text
- `(CONTINUED)` markers that aren't part of the actual script

**Tips for PDF import:**
1. Upload the PDF — the text will be extracted and shown in the paste area
2. Review the extracted text and clean up any formatting issues
3. Make sure character names are ALL CAPS on their own lines
4. Make sure scene headings start with `INT.` or `EXT.`
5. Click "Preview Import" to see what the parser found
6. If characters or locations are missing/wrong, edit the text and preview again

### Final Draft (.fdx)
FDX files are XML and can be imported as text. The parser will attempt to extract screenplay elements from the XML structure. For best results, export from Final Draft as Fountain or plain text first.

## What Gets Imported

The parser extracts:
- **Title and author** from the title page
- **Characters** — detected from ALL CAPS names that precede dialogue
- **Locations** — extracted from scene headings (INT./EXT. lines)
- **Scenes** — created from scene headings, grouped into acts if section headers exist
- **Elements** — dialogue, action lines, transitions

## After Import

Once imported, you can:
1. **Edit characters and locations** via the Characters/Locations buttons in the Screenplay toolbar
2. **Assign voices** in the Voices view for text-to-speech
3. **Generate previsualization** images for each scene
4. **Render to video** with the Editor's render panel

## Fountain Format Quick Reference

```
Title: My Screenplay
Author: Jane Doe
Draft date: 2024

INT. KITCHEN - DAY

JOE enters the room and sets down his briefcase.

JOE
Good morning.

SARAH
(smiling)
It's afternoon.

JOE
Is it? I've lost track.

Sarah hands Joe a cup of coffee.

EXT. PARK - SUNSET

Joe and Sarah walk along the path.

> FADE OUT.
```
