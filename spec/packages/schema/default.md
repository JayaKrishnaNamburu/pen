# @pen/schema-default

## Purpose

Default block and inline schemas for Pen

## Public Role

Ship the default block and inline definitions used by most applications and tests.

## Key Exports / Entrypoints

- Export map: `.`, `./defs`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@pen/types`
- Peer dependencies: No peer dependencies declared.
- Boundary: It defines the standard authored surface but does not own runtime authority.

## Data Flow / Runtime Model

Schema surface packages in Pen should stay package-first and explicit about ownership. Use it directly or as the starting point for custom schema composition.

## Integration Notes

- Path in workspace: `packages/schema/default`
- Spec path mirrors workspace path: `packages/schema/default.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not hide product policy or renderer-specific styling decisions here.
