#!/usr/bin/env node
/**
 * Build server-side routes for the Script Generator pipeline.
 * Compiles TypeScript routes into a single JS file that can be
 * dynamically imported by Woodbury's pipeline route loader.
 *
 * Output: routes/index.js (ESM format, runs in Node.js)
 */
import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(__dirname, 'index.ts')],
  bundle: true,
  outfile: join(__dirname, 'index.js'),
  format: 'esm',
  platform: 'node',
  target: ['node18'],
  // pdfjs-dist is imported dynamically at runtime — mark as external
  external: ['pdfjs-dist', 'pdfjs-dist/*', '@google/genai'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  minify: false,
  sourcemap: 'inline',
  loader: {
    '.ts': 'ts',
  },
});

console.log('✓ Pipeline routes built → routes/index.js');
