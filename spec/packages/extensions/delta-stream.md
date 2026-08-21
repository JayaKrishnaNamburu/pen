# @input/pen-delta-stream

## Purpose

Streaming protocol and processing pipeline for Pen.

## Public Role

Optional runtime that turns a `PenStream` of parts into editor mutations. It is not installed by `createEditor()`. `defaultPreset()` is the path that includes it.

## Key Exports / Entrypoints

- Export map: `.`
- Primary extension entrypoint: `deltaStreamExtension()`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-ai-tools`, `@input/pen-document-ops`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Extensions compose through the core editor and slots/events rather than side channels. Core does not depend on this package.

## Data Flow / Runtime Model

Adopt this package when a host needs streamed tool/delta application. Bare `createEditor()` and `createHeadlessEditor()` do not register it.

## Integration Notes

- Path in workspace: `packages/extensions/delta-stream`
- Spec path mirrors workspace path: `packages/extensions/delta-stream.md`
- Install via `defaultPreset()` or `createEditor({ extensions: [deltaStreamExtension()] })`.

## Current Maturity / Intended Usage

Workspace package at version `0.0.1`; intended usage is current-state but still evolving.

## Non-goals

Do not duplicate core editor authority or renderer ownership inside the extension.
