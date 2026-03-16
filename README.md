# Comprehensive Screenplay Generator

Generate complete screenplay packages with metadata, characters, locations, scenes, elements, assets, and previsualization

## Overview

This is a [Woodbury](https://woodbury.dev) v2 file-backed pipeline. Each script node is a TypeScript file.

## Structure

```
comp-screenplay-generator/
├── pipeline.json       # Graph manifest
├── tsconfig.json       # TypeScript config
├── woodbury.d.ts       # Type definitions
├── package.json        # npm dependencies
├── .gitignore
└── *.ts                # Script node files
```

## Script Node Contract

Each `.ts` file exports an `execute` function with `@input`/`@output` annotations:

```typescript
/// <reference path="./woodbury.d.ts" />

/**
 * @input name: string - The input
 * @output greeting: string - The output
 */
export async function execute(
  inputs: { name: string },
  context: ScriptContext,
): Promise<{ greeting: string }> {
  return { greeting: `Hello, ${inputs.name}!` };
}
```
