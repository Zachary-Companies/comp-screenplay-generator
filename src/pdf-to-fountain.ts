/**
 * PDF to Fountain Converter
 *
 * Converts screenplay PDFs to Fountain format using spatial text analysis.
 * Uses pdfjs-dist to extract text with position data, then classifies each
 * line as action, dialogue, character name, scene heading, transition, or
 * parenthetical based on its x-position on the page.
 *
 * Standard screenplay PDF positions (US Letter, 612pt width):
 *   Action/Scene heading: x≈108  (1.5" left margin)
 *   Dialogue:             x≈180  (2.5")
 *   Parenthetical:        x≈216  (3.0")
 *   Character name:       x≈252  (3.5", centered)
 *   Transition:           x≈400+ (right-aligned)
 *   Page numbers:         x≈507  (right margin)
 */

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface FountainResult {
  fountain: string;
  metadata: {
    title: string;
    author: string;
    pages: number;
    scenes: number;
    characters: string[];
  };
}

export async function convertPdfToFountain(
  pdfBuffer: Buffer | Uint8Array,
): Promise<FountainResult> {
  const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

  const page1 = await doc.getPage(1);
  const vp = page1.getViewport({ scale: 1 });
  const pageWidth = vp.width;
  const pageHeight = vp.height;

  let fountain = '';
  const seenCharacters = new Set<string>();
  let sceneCount = 0;

  // Extract title page info from page 1
  let titleInfo = { title: '', author: '' };
  {
    const content = await page1.getTextContent();
    const items: TextItem[] = content.items
      .filter((it: any) => it.str && it.str.trim())
      .map((it: any) => ({
        str: it.str.trim(),
        x: it.transform[4],
        y: Math.round(it.transform[5]),
        width: it.width,
      }))
      .sort((a: TextItem, b: TextItem) => b.y - a.y || a.x - b.x);

    // Title is usually the largest/first centered text
    // Author is usually after "by" or "written by"
    let foundBy = false;
    for (const item of items) {
      if (!titleInfo.title && item.str.length > 3 && !/^\d+$/.test(item.str) &&
          !/copyright|written|by$/i.test(item.str)) {
        titleInfo.title = item.str;
      }
      if (/^(by|written by)$/i.test(item.str)) foundBy = true;
      if (foundBy && !titleInfo.author && item.str.length > 2 &&
          !/^(by|written by|\d+|copyright)$/i.test(item.str) &&
          !/^\d{3}/.test(item.str)) {
        titleInfo.author = item.str;
      }
    }
  }

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const items: TextItem[] = content.items
      .filter((it: any) => it.str && it.str.trim())
      .map((it: any) => ({
        str: it.str,
        x: it.transform[4],
        y: Math.round(it.transform[5]),
        width: it.width,
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    // Group into lines by Y proximity
    const lines: TextItem[][] = [];
    let cur: TextItem[] = [];
    let lastY = -1;
    for (const item of items) {
      if (lastY >= 0 && Math.abs(item.y - lastY) > 3) {
        if (cur.length) lines.push(cur);
        cur = [];
      }
      cur.push(item);
      lastY = item.y;
    }
    if (cur.length) lines.push(cur);

    for (const lineItems of lines) {
      lineItems.sort((a, b) => a.x - b.x);
      const firstX = lineItems[0].x;

      // Build line text preserving gaps
      let lineText = '';
      for (let j = 0; j < lineItems.length; j++) {
        if (j > 0) {
          const gap = lineItems[j].x - (lineItems[j - 1].x + lineItems[j - 1].width);
          if (gap > 10) lineText += '  ';
          else if (gap > 2) lineText += ' ';
        }
        lineText += lineItems[j].str;
      }
      const trimmed = lineText.trim();
      if (!trimmed) continue;

      // Skip page numbers
      if (/^\d+\.?$/.test(trimmed) && firstX > pageWidth * 0.7) continue;
      // Skip CONTINUED
      if (/^(CONTINUED|\(CONTINUED\)|\(MORE\))$/i.test(trimmed)) continue;

      // Classify by x-position (adaptive thresholds)
      const dialogueX = pageWidth * 0.27;
      const parenthX = pageWidth * 0.33;
      const characterX = pageWidth * 0.38;
      const transitionX = pageWidth * 0.60;

      if (firstX >= transitionX) {
        // Transition
        fountain += '\n' + trimmed + '\n';
      } else if (firstX >= characterX) {
        // Character name
        const charName = trimmed.replace(/\s*\(.*\)$/, '').trim();
        seenCharacters.add(charName);
        fountain += '\n' + trimmed + '\n';
      } else if (firstX >= parenthX) {
        // Parenthetical
        fountain += (trimmed.startsWith('(') ? trimmed : '(' + trimmed + ')') + '\n';
      } else if (firstX >= dialogueX) {
        // Dialogue
        fountain += trimmed + '\n';
      } else {
        // Action or scene heading
        if (/^(INT|EXT|EST|INT\.?\/?EXT)/i.test(trimmed)) {
          fountain += '\n' + trimmed + '\n\n';
          sceneCount++;
        } else if (/^[A-Z][A-Z\s'\-.,]+$/.test(trimmed) && trimmed.length >= 3 && trimmed.length <= 50) {
          // Secondary scene heading
          fountain += '\n.' + trimmed + '\n\n';
          sceneCount++;
        } else {
          fountain += trimmed + '\n';
        }
      }
    }
  }

  // Clean up
  fountain = fountain.replace(/\n{4,}/g, '\n\n\n').trim();

  // Prepend title page
  const titlePage = [
    `Title: ${titleInfo.title || 'Untitled'}`,
    `Author: ${titleInfo.author || 'Unknown'}`,
    `Draft date: ${new Date().toISOString().split('T')[0]}`,
    '',
    '',
  ].join('\n');

  return {
    fountain: titlePage + fountain,
    metadata: {
      title: titleInfo.title || 'Untitled',
      author: titleInfo.author || 'Unknown',
      pages: doc.numPages,
      scenes: sceneCount,
      characters: [...seenCharacters],
    },
  };
}

/**
 * Entry point for pipeline script execution.
 * Called via: context.tools.pdf_to_fountain({ pdfPath: '/path/to/file.pdf' })
 */
export async function execute(
  inputs: { pdfPath?: string; pdfBase64?: string; outputPath?: string },
  context: any,
): Promise<{ fountain: string; outputPath?: string; metadata: FountainResult['metadata'] }> {
  const { readFile, writeFile } = await import('node:fs/promises');

  let pdfBuffer: Buffer;
  if (inputs.pdfPath) {
    pdfBuffer = await readFile(inputs.pdfPath);
  } else if (inputs.pdfBase64) {
    pdfBuffer = Buffer.from(inputs.pdfBase64, 'base64');
  } else {
    throw new Error('Either pdfPath or pdfBase64 is required');
  }

  const result = await convertPdfToFountain(pdfBuffer);

  // Save output if path specified
  let outputPath = inputs.outputPath;
  if (!outputPath && inputs.pdfPath) {
    outputPath = inputs.pdfPath.replace(/\.pdf$/i, '.fountain');
  }
  if (outputPath) {
    await writeFile(outputPath, result.fountain, 'utf-8');
  }

  // Report progress if available
  if (context?.progress) {
    context.progress.complete?.(`Converted: ${result.metadata.scenes} scenes, ${result.metadata.characters.length} characters`);
  }

  return {
    fountain: result.fountain,
    outputPath,
    metadata: result.metadata,
  };
}
