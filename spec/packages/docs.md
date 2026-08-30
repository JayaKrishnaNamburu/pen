# @input/pen-docs

## Purpose

Repository documentation site for Pen

## Public Role

Publish the current product surface as a workspace docs app for the repository.

## Key Exports / Entrypoints

- Export map: Package root only.
- Workspace scripts: `build`, `clean`, `dev`, `preview`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `react`, `react-dom`
- Peer dependencies: No peer dependencies declared.
- Boundary: This is a workspace app, not a reusable runtime package.

## Data Flow / Runtime Model

The docs app should stay package-first and explicit about ownership. Use it to document shipped surfaces only.

## Integration Notes

- Path in workspace: `packages/docs`
- Spec path mirrors workspace path: `packages/docs.md`
- This package is workspace-only and exists to support docs, demos, and local development flows.
- `pnpm --filter @input/pen-docs dev` (and `pnpm dev` from the root) binds the site to `http://localhost:5174` with `strictPort`.

## Current Maturity / Intended Usage

Workspace app.

## Non-goals

Do not turn the docs app into a second source of architecture truth.
