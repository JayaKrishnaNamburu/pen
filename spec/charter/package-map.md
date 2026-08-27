# Package Map

## Purpose

Provide a stable overview of the workspace layout and the spec paths that mirror it.

## Areas

Directory groups are repo navigation only; published names never carry them (SF7 in `spec/rules/api.md` owns the naming doctrine).

- `packages/types`: contracts and the bounded runtime allowlist
- `packages/core`: headless editor authority
- `packages/schema`: default schema surface
- `packages/pen`: the batteries-included starter package
- `packages/rendering`: renderer bindings and shared DOM engine
- `packages/extensions`: optional runtime features
- `packages/crdt`: CRDT adapters
- `packages/transport`: transports (`./direct`, `./sse`)
- `packages/shared`: lower-level shared support libraries
- `packages/tooling`: testing, benchmarks, and development utilities
- `packages/docs`: repository docs app for the current public Pen surface
- `playground`: reference app for embedding Pen — editor, AI agent, document inspector, optional collaboration; hosts `pnpm test:e2e`

## Generated Package Specs

- `@input/pen-core` -> `packages/core.md`
- `@input/pen-yjs` -> `packages/crdt/yjs.md`
- `@input/pen-docs` -> `packages/docs.md`
- `@input/pen-ai` -> `packages/extensions/ai.md`
- `@input/pen-tools` -> `packages/extensions/tools.md`
- `@input/pen-snapshots` -> `packages/extensions/snapshots.md`
- `@input/pen-autoformat` -> `packages/extensions/autoformat.md`
- `@input/pen-interop` -> `packages/extensions/interop.md`
- `@input/pen-multiplayer` -> `packages/extensions/multiplayer.md`
- `@input/pen-search` -> `packages/extensions/search.md`
- `@input/pen-shortcuts` -> `packages/extensions/shortcuts.md`
- `@input/pen-undo` -> `packages/extensions/undo.md`
- `@input/pen` -> `packages/pen.md`
- `@input/pen-dom` -> `packages/rendering/dom.md`
- `@input/pen-react` -> `packages/rendering/react.md`
- `@input/pen-vue` -> `packages/rendering/vue.md`
- `@input/pen-schema` -> `packages/schema.md`
- `@input/pen-ingest` -> `packages/shared/ingest.md`
- `@input/pen-markdown` -> `packages/shared/markdown.md`
- `@input/pen-assets` -> `packages/tooling/assets.md`
- `@input/pen-bench` -> `packages/tooling/bench.md`
- `@input/pen-test` -> `packages/tooling/test.md`
- `@input/pen-transport` -> `packages/transport.md`
- `@input/pen-types` -> `packages/types.md`
- `@input/pen-playground` -> `packages/playground.md`

AI feature subpaths (`@input/pen-ai/suggestions`, `/autocomplete`, `/skills`, `/tools`, `/stream`) are documented in `packages/extensions/ai.md`. Interop format subpaths (`@input/pen-interop/html`, `/markdown`, `/json`, `/xml`) are documented in `packages/extensions/interop.md`.

## Packages Without A Current-State Spec

`packages/` currently has 26 `package.json` files (23 published, 3 private: `@input/pen-docs`, `@input/pen-conformance`, `@input/pen-eslint-plugin`). 24 of those have a matching current-state spec. These two workspace packages exist and have no `spec/packages/` file. That is intentional:

- `@input/pen-conformance` (`packages/tooling/conformance`) — private Playwright / browser-real harness. Scenario names and host pins track the live suite; a current-state spec would rot faster than it would help.
- `@input/pen-eslint-plugin` (`packages/tooling/eslint-plugin`) — private lint rules that enforce `spec/rules/` invariants mechanically. The rules _are_ the documentation.
