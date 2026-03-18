# @pen/bench

## Purpose

Performance benchmarks for Pen

## Public Role

Support development, testing, benchmarking, or local integration workflows around Pen.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `bench`, `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: No runtime workspace dependencies declared.
- Peer dependencies: No peer dependencies declared.
- Boundary: Tooling packages serve the workspace and advanced integrators more than standard runtime embedding.

## Data Flow / Runtime Model

Tooling package packages in Pen should stay package-first and explicit about ownership. Use these packages in development flows, tests, or benchmarks.

## Integration Notes

- Path in workspace: `packages/tooling/bench`
- Spec path mirrors workspace path: `packages/tooling/bench.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.0`; intended usage is current-state but still evolving.

## Non-goals

Do not present tooling packages as the editor runtime itself.
