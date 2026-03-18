# @pen/export-markdown

## Purpose

Markdown exporter for Pen

## Public Role

Add optional runtime behavior on top of the editor core without changing the canonical mutation authority.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@pen/markdown-serialization`, `@pen/types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Extensions compose through the core editor and slots/events rather than side channels.

## Data Flow / Runtime Model

Extension package packages in Pen should stay package-first and explicit about ownership. Adopt this package only when the host app needs the capability it provides.

## Integration Notes

- Path in workspace: `packages/extensions/export-markdown`
- Spec path mirrors workspace path: `packages/extensions/export-markdown.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not duplicate core editor authority or renderer ownership inside the extension.
