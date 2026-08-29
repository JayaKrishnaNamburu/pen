# @input/pen-schema

## Purpose

Default block and inline schemas for Pen

## Public Role

Ship the default block and inline definitions used by most applications and tests.

## Key Exports / Entrypoints

- Export map: `.`, `./defs`
- `createDefaultSchema()` and the prebuilt `defaultSchema`
- Named block defs such as `paragraph`, `heading`, `table`, `callout`, `blockquote`, `toggle`, `checkListItem`, and `subdocument`, plus named marks/inlines such as `bold`, `link`, `mention`. Inline atoms reserve `type` as the embed discriminator (SCH1 in `packages/core.md`); none of the shipped node inlines declare that prop.
- `./defs` also exports the `defaultBlocks` and `defaultInlines` collections
- Display-catalog helpers: `SCHEMA_DISPLAY_CATALOG`, `resolveDisplayCopy()`, `resolveDisplayGroup()`, `schemaDisplayKey()`, `schemaGroupKey()`
- Workspace scripts: `build`, `clean`, `lint`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-core`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: It defines the standard authored surface but does not own runtime authority.

## Data Flow / Runtime Model

Schema surface packages in Pen should stay package-first and explicit about ownership. Use it directly or as the starting point for custom schema composition.

## Integration Notes

- Path in workspace: `packages/schema`
- Spec path mirrors workspace path: `packages/schema.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.1.4`; intended usage is current-state but still evolving.

## Non-goals

Do not hide product policy or renderer-specific styling decisions here.
