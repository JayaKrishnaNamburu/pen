# Package Map

## Purpose

Provide a stable overview of the workspace layout and the spec paths that mirror it.

## Areas

- `packages/types`: contracts and lightweight helpers
- `packages/core`: headless editor authority
- `packages/schema`: default schema surface
- `packages/presets`: standard runtime presets
- `packages/rendering`: renderer bindings and shared DOM engine
- `packages/extensions`: optional runtime features
- `packages/crdt`: CRDT adapters
- `packages/transports`: transport implementations
- `packages/shared`: lower-level shared support libraries
- `packages/tooling`: testing, benchmarks, and development utilities
- `packages/docs`: repository docs app for the current public Pen surface
- `playground`: reference app for embedding Pen — editor, AI agent, document inspector, optional collaboration; hosts `pnpm test:e2e`

## Generated Package Specs

- `@input/pen-core` -> `packages/core.md`
- `@input/pen-crdt-yjs` -> `packages/crdt/yjs.md`
- `@input/pen-docs` -> `packages/docs.md`
- `@input/pen-ai` -> `packages/extensions/ai.md`
- `@input/pen-document-ops` -> `packages/extensions/document-ops.md`
- `@input/pen-history` -> `packages/extensions/history.md`
- `@input/pen-input-rules` -> `packages/extensions/input-rules.md`
- `@input/pen-interop` -> `packages/extensions/interop.md`
- `@input/pen-multiplayer` -> `packages/extensions/multiplayer.md`
- `@input/pen-search` -> `packages/extensions/search.md`
- `@input/pen-shortcuts` -> `packages/extensions/shortcuts.md`
- `@input/pen-undo` -> `packages/extensions/undo.md`
- `@input/pen-preset-default` -> `packages/presets/default.md`
- `@input/pen-dom` -> `packages/rendering/dom.md`
- `@input/pen-react` -> `packages/rendering/react.md`
- `@input/pen-vue` -> `packages/rendering/vue.md`
- `@input/pen-schema-default` -> `packages/schema/default.md`
- `@input/pen-content-ops` -> `packages/shared/content-ops.md`
- `@input/pen-markdown-serialization` -> `packages/shared/markdown-serialization.md`
- `@input/pen-assets-memory` -> `packages/tooling/assets-memory.md`
- `@input/pen-bench` -> `packages/tooling/bench.md`
- `@input/pen-test` -> `packages/tooling/test.md`
- `@input/pen-transport-direct` -> `packages/transports/direct.md`
- `@input/pen-transport-sse` -> `packages/transports/sse.md`
- `@input/pen-types` -> `packages/types.md`
- `@input/pen-playground` -> `packages/playground.md`

AI feature subpaths (`@input/pen-ai/suggestions`, `/autocomplete`, `/skills`, `/tools`, `/stream`) are documented in `packages/extensions/ai.md`. Interop format subpaths (`@input/pen-interop/html`, `/markdown`, `/json`, `/xml`) are documented in `packages/extensions/interop.md`.

## Packages Without A Current-State Spec

`packages/` currently has 27 `package.json` files (24 published, 3 private: `@input/pen-docs`, `@input/pen-conformance`, `@input/pen-eslint-plugin`). 25 of those have a matching current-state spec. These two workspace packages exist and have no `spec/packages/` file. That is intentional:

- `@input/pen-conformance` (`packages/tooling/conformance`) — private Playwright / browser-real harness. Scenario names and host pins change with the wave work; a current-state spec would rot faster than it would help.
- `@input/pen-eslint-plugin` (`packages/tooling/eslint-plugin`) — private lint rules that enforce `spec-v2` invariants mechanically. The rules _are_ the documentation.
