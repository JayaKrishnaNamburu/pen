# @pen/crdt-yjs

## Purpose

Yjs CRDT adapter for Pen

## Public Role

Bridge Pen contracts to a specific CRDT implementation.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@pen/types`, `y-protocols`, `yjs`
- Peer dependencies: No peer dependencies declared.
- Boundary: Adapters must respect the editor authority boundary while exposing persistence and sync integration points.

## Data Flow / Runtime Model

CRDT adapter packages in Pen should stay package-first and explicit about ownership. Use this package when a host app adopts the matching CRDT backend.

## Integration Notes

- Path in workspace: `packages/crdt/yjs`
- Spec path mirrors workspace path: `packages/crdt/yjs.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not let the adapter redefine the Pen document model or renderer behavior.
