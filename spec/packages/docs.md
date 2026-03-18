# @pen/docs

## Purpose

Wave 12 documentation site for Pen

## Public Role

Publish the current product surface as a private workspace docs site.

## Key Exports / Entrypoints

- Export map: Package root only.
- Workspace scripts: `build`, `clean`, `dev`, `preview`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `react`, `react-dom`
- Peer dependencies: No peer dependencies declared.
- Boundary: This is a private app, not a reusable runtime package.

## Data Flow / Runtime Model

Private docs app packages in Pen should stay package-first and explicit about ownership. Use it to document shipped surfaces only.

## Integration Notes

- Path in workspace: `packages/docs`
- Spec path mirrors workspace path: `packages/docs.md`
- This package is private to the workspace and exists to support docs, demos, or local development flows.

## Current Maturity / Intended Usage

Private workspace app.

## Non-goals

Do not turn the docs app into a second source of architecture truth.
