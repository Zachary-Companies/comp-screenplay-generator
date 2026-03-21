#!/usr/bin/env node
/**
 * Build script for pipeline React view bundles.
 *
 * Scans views/<name>/entry.tsx for view entry points and produces
 * views/<name>/view.bundle.js IIFE bundles. React/ReactDOM are externalized
 * and resolved at runtime from window.__WoodburyViewSDK.
 */
import { build } from 'esbuild';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * esbuild plugin that intercepts React imports and redirects them to the
 * host app's __WoodburyViewSDK globals. This is necessary because esbuild's
 * built-in `external` option leaves bare import statements, which IIFE
 * format cannot resolve.
 */
const woodburyExternalsPlugin = {
  name: 'woodbury-externals',
  setup(build) {
    // Intercept react/react-dom imports
    build.onResolve(
      { filter: /^react$|^react-dom$|^react\/jsx-runtime$|^react-dom\/client$/ },
      (args) => ({
        path: args.path,
        namespace: 'woodbury-sdk',
      })
    );

    // Provide module contents that reference the global SDK
    build.onLoad({ filter: /.*/, namespace: 'woodbury-sdk' }, (args) => {
      const mapping = {
        'react': 'window.__WoodburyViewSDK.React',
        'react-dom': 'window.__WoodburyViewSDK.ReactDOM',
        'react-dom/client': 'window.__WoodburyViewSDK.ReactDOM',
        'react/jsx-runtime': 'window.__WoodburyViewSDK.jsxRuntime',
      };
      const global = mapping[args.path] || 'window.__WoodburyViewSDK.React';
      return {
        contents: `module.exports = ${global};`,
        loader: 'js',
      };
    });
  },
};

// ── Find view entry points ──
const viewsDir = __dirname;
const dirs = readdirSync(viewsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => existsSync(join(viewsDir, d.name, 'entry.tsx')));

if (dirs.length === 0) {
  console.log('build:views — no entry.tsx files found, skipping.');
  process.exit(0);
}

console.log(`build:views — building ${dirs.length} view bundle(s)...`);

// ── Build each view ──
for (const dir of dirs) {
  const entry = join(viewsDir, dir.name, 'entry.tsx');
  const outfile = join(viewsDir, dir.name, 'view.bundle.js');

  await build({
    entryPoints: [entry],
    bundle: true,
    outfile,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    jsxImportSource: 'react',
    plugins: [woodburyExternalsPlugin],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    minify: false,
    sourcemap: 'inline',
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
  });

  console.log(`  ✓ ${dir.name}/view.bundle.js`);
}

console.log('build:views — done.');
