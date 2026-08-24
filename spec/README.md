# Pen Specs

This spec set describes Pen as it exists in the monorepo today. It is package-centric and current-state oriented rather than roadmap-driven.

## How To Read This

Start with the charter docs if you want the durable architectural rules:

- `charter/architecture.md`
- `charter/document-model.md`
- `charter/mutation-pipeline.md`
- `charter/package-map.md`

Then read package specs by layer:

- Runtime authority: `packages/core.md`, `packages/types.md`
- Rendering: `packages/rendering/dom.md`, `packages/rendering/react.md`, `packages/rendering/vue.md`
- Editing and extensions: `packages/extensions/search.md`, `packages/extensions/undo.md`, `packages/extensions/history.md`, `packages/extensions/multiplayer.md`
- AI and tooling: `packages/extensions/ai.md`, `packages/extensions/document-ops.md`, `packages/shared/content-ops.md`
- Import/export: `packages/extensions/import-markdown.md`, `packages/extensions/import-html.md`, `packages/extensions/import-json.md`, `packages/extensions/export-json.md`, `packages/extensions/export-xml.md`
- Transports and AI tools: `packages/transports/direct.md`, `packages/transports/sse.md`, `packages/extensions/ai-tools.md`

## Structure

- `charter/` contains cross-cutting architectural invariants.
- `packages/` mirrors the workspace package and app layout.
- Package specs stay close to real package boundaries instead of grouping work by milestone or wave.
- `roadmap/` contains explicit forward-looking plans that have not yet been folded into package specs.

## Core Conventions

- Runtime authority lives with `@input/pen-core` and the `Editor` API.
- `DocumentOp[]` and `editor.apply(...)` remain the canonical mutation path.
- `@input/pen-types` is the shared contract layer, not a hidden runtime layer.
- Renderer packages bind to the editor runtime but do not own document truth.
- JSON is the canonical machine-readable format. XML is an interoperability surface layered on top of that model.
- React is the primary documented renderer. Vue is a shipped renderer proof built on the shared DOM engine.
- Private apps such as `@input/pen-docs` and `@input/pen-playground` are specified because they are part of the workspace, but they are not publishable runtime packages.
- Two workspace packages have no current-state spec on purpose: `@input/pen-conformance` and `@input/pen-eslint-plugin`. `packages/` has 38 package.json files; 36 have a matching spec. See `charter/package-map.md`.
- `pen.ariaReadOnly` (the facet) only sets `aria-readonly`. The renderer `readonly` prop is what declines typing. That split is shipped and unresolved; package specs describe it, they do not pick a winner.
- Command registration and the Wave 05 selection engine are mid-flight. Package specs that mention them mark them as unsettled; do not read those sections as shipped contracts.

## What Changed

- Historical wave docs and planning notes were removed.
- Specs now describe the workspace as shipped today.
- The highest-value packages now have deeper runtime notes, boundaries, and architecture diagrams rather than just metadata summaries.

## Roadmap Specs

- `roadmap/headless-collaboration-ai-waves.md`: generic Pen primitives for CRDT state barriers, structured mutation groups, headless server editors, export hooks, field adapters, and deterministic fixtures.
