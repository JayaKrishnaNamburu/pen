# @pen/markdown-serialization

## Purpose

Shared markdown serialization helpers for Pen

## Public Role

Provide shared lower-level helpers used by higher-level packages.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@pen/types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Shared packages support package boundaries without becoming end-user entrypoints.

## Data Flow / Runtime Model

Shared support library packages in Pen should stay package-first and explicit about ownership. Use them when authoring other Pen packages, not as first-stop adoption surfaces.

## Integration Notes

- Path in workspace: `packages/shared/markdown-serialization`
- Spec path mirrors workspace path: `packages/shared/markdown-serialization.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not leak product-facing abstractions into generic shared helpers.
