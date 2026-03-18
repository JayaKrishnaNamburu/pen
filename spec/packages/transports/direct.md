# @pen/transport-direct

## Purpose

In-process transport for Pen

## Public Role

Provide transport-specific wiring around Pen protocols and sessions.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@pen/core`, `@pen/types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Transport packages should stay below product policy and above raw network wiring.

## Data Flow / Runtime Model

Transport package packages in Pen should stay package-first and explicit about ownership. Adopt when a host needs the specific transport surface.

## Integration Notes

- Path in workspace: `packages/transports/direct`
- Spec path mirrors workspace path: `packages/transports/direct.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not make transports own editor behavior or auth policy.
