# CLAUDE.md — Comprehensive Screenplay Generator

Instructions for AI assistants editing this Woodbury pipeline.

## What This Is

A Woodbury v2 file-backed pipeline. Each `.ts` file is a pipeline node.

Purpose: Generate complete screenplay packages with metadata, characters, locations, scenes, elements, assets, and previsualization

## Rules

1. **Always export `execute`** — `export async function execute(inputs, context)`
2. **Declare ports with JSDoc** — `@input name: type - description` and `@output name: type - description`
3. **Return all declared outputs**
4. **Use `context.llm` for AI** — `context.llm.generate(prompt)` / `context.llm.generateJSON(prompt)`
5. **Use `context.log()` for logging** — not `console.log`
6. **Use `context.progress` for long tasks**
7. **Keep the reference directive** — `/// <reference path="./woodbury.d.ts" />`
8. **Do NOT edit** — `pipeline.json`, `woodbury.d.ts`, `tsconfig.json`
9. **Use `require()`** for npm packages (CommonJS context)
10. **Prefix shared utils with `_`** — e.g. `_utils.ts` — these are not treated as nodes

## TODO.json

This pipeline has a `TODO.json` file for tracking tasks. When working on this pipeline:
1. Read TODO.json first to see what needs doing
2. Update item status as you work: "pending" → "in-progress" → "done"
3. Add new items when you discover more work
4. If something fails, set status to "failed" with an error message
