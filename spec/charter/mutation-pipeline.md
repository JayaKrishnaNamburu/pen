# Mutation Pipeline

## Purpose

Capture the mutation rules that keep editor behavior predictable across packages.

## Canonical Path

`DocumentOp[]` is the mutation currency. Durable document writes go through `editor.apply(ops, options)`.

## Responsibilities

`@pen/core` owns:

- operation validation
- normalization and policy enforcement
- selection updates
- extension dispatch hooks
- history integration
- document commit events

## Design Constraints

- Packages should not bypass the core mutation boundary for document writes.
- Extension hooks should stay deterministic and bounded.
- Importers, tools, AI, and renderers may prepare ops, but `@pen/core` remains the authority that applies them.
- Origin tagging matters so undo, diagnostics, and collaboration surfaces can interpret writes correctly.
