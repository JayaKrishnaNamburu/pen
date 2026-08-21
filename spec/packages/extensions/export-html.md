# @input/pen-export-html

## Purpose

HTML exporter for Pen

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

Export walks `editor.documentState.allBlocks()`, including nested, layout, table, and list children. It does not serialize only top-level `blockOrder`.

## Integration Notes

- Path in workspace: `packages/extensions/export-html`
- Spec path mirrors workspace path: `packages/extensions/export-html.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not duplicate core editor authority or renderer ownership inside the extension.
