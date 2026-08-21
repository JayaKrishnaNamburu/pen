# @input/pen-ai-autocomplete

## Purpose

Low-latency inline autocomplete extension for Pen.

## Public Role

Add optional ghost-text completion on top of the editor core without changing the canonical mutation authority. The package owns request scheduling and controller state; it does not own the model filter chain.

## Key Exports / Entrypoints

- Export map: `.`
- Primary extension entrypoint: `aiAutocompleteExtension()`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-content-ops`, `@input/pen-core`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Extensions compose through the core editor and slots/events rather than side channels.

## Data Flow / Runtime Model

Completion requests stream through core `streamThroughEgress()` / `pen.aiEgress`. This package re-exports that helper; it does not keep a local filter copy. Generation and suggestions use the same facet.

## Integration Notes

- Path in workspace: `packages/extensions/ai-autocomplete`
- Spec path mirrors workspace path: `packages/extensions/ai-autocomplete.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.1`; intended usage is current-state but still evolving.

## Non-goals

Do not duplicate core editor authority or renderer ownership inside the extension.
