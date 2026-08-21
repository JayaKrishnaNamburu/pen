# @input/pen-export-markdown

## Purpose

Markdown exporter for Pen

## Public Role

Add optional runtime behavior on top of the editor core without changing the canonical mutation authority.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-core`, `@input/pen-markdown-serialization`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Extensions compose through the core editor and slots/events rather than side channels.

## Data Flow / Runtime Model

Serialization lives in `@input/pen-markdown-serialization` and walks the full block tree, including nested children. This package is the exporter wrapper (URL admission, `markdownExporter`).

## Integration Notes

- Path in workspace: `packages/extensions/export-markdown`
- Spec path mirrors workspace path: `packages/extensions/export-markdown.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.1`; intended usage is current-state but still evolving.

## Non-goals

Do not duplicate core editor authority or renderer ownership inside the extension.
