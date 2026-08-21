# @input/pen-preset-default

## Purpose

Default batteries-included editor preset for Pen

## Public Role

Package the standard runtime stack for most adopters so they can start from a coherent default.

## Key Exports / Entrypoints

- Export map: `.`
- Root export: `defaultPreset()`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-delta-stream`, `@input/pen-document-ops`, `@input/pen-schema-default`, `@input/pen-shortcuts`, `@input/pen-types`, `@input/pen-undo`
- Peer dependencies: No peer dependencies declared.
- Boundary: Presets compose existing runtime packages rather than becoming new architecture layers.

## Data Flow / Runtime Model

`defaultPreset()` is the only batteries-included composition path. Bare `createEditor()` does not install this stack.

The preset's `resolve()` returns `createDefaultSchema()` plus, unless turned off, `documentOpsExtension()`, `deltaStreamExtension()`, `undoExtension()`, and `richTextShortcutsExtension()`. Hosts can turn individual defaults off or pass typed options to the composed packages. Hosts that need full control should skip the preset and register extensions explicitly through `createEditor({ extensions: [...] })`.

## Integration Notes

- Path in workspace: `packages/presets/default`
- Spec path mirrors workspace path: `packages/presets/default.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.
- Use `createEditor({ preset: defaultPreset(...) })` when a host wants the standard rich-text stack. Do not assume `createEditor()` already includes shortcuts or delta-stream.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not treat presets as a replacement for explicit extension composition when hosts need custom policy.
