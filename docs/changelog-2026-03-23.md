# Changelog

All notable changes to the Comprehensive Screenplay Generator pipeline.

## 2026-03-23

- Added YouTube Short and YouTube Video as project types across the full pipeline (input validation, character generation, metadata, section structure, rule enforcement)
- Added `projectFolder` variable node so users can set the asset output directory from the pipeline UI
- Asset collection now accepts `projectFolder` as an explicit input rather than relying solely on context

## 2026-03-22

- Updated pipeline metadata timestamp

## 2026-03-21

- Redesigned custom views with polished UI and added tests
- Added character headshot generation routes on the server side
- Built self-contained views system with server-side routes for dynamic view loading

## 2026-03-19

- Added CLAUDE.md pipeline documentation covering directory structure, rules, bindings, views, and testing
- Updated view.css styling

## 2026-03-18

- Enhanced character matching logic for bindings (displayName-based matching)
- Added comprehensive generated asset support (characters, locations, previs)
- Updated documentation with custom views section and TTS features
- Updated character-to-shot bindings with new element mappings
- Updated pipeline.json configuration

## 2026-03-17

- Set up bindings system (bindings.json, rules.json, views.json)
- Added comprehensive pipeline structure with all core nodes and config
- Updated bindings timestamps after pipeline regeneration

## 2026-03-16

- Initial pipeline scaffold
