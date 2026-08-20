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
- `playground`: integration app and playground for shipped editor flows

## Generated Package Specs

- `@input/pen-core` -> `packages/core.md`
- `@input/pen-crdt-yjs` -> `packages/crdt/yjs.md`
- `@input/pen-docs` -> `packages/docs.md`
- `@input/pen-ai-autocomplete` -> `packages/extensions/ai-autocomplete.md`
- `@input/pen-ai-skills` -> `packages/extensions/ai-skills.md`
- `@input/pen-ai-suggestions` -> `packages/extensions/ai-suggestions.md`
- `@input/pen-ai-tools` -> `packages/extensions/ai-tools.md`
- `@input/pen-ai` -> `packages/extensions/ai.md`
- `@input/pen-delta-stream` -> `packages/extensions/delta-stream.md`
- `@input/pen-document-ops` -> `packages/extensions/document-ops.md`
- `@input/pen-export-html` -> `packages/extensions/export-html.md`
- `@input/pen-export-json` -> `packages/extensions/export-json.md`
- `@input/pen-export-markdown` -> `packages/extensions/export-markdown.md`
- `@input/pen-export-xml` -> `packages/extensions/export-xml.md`
- `@input/pen-history` -> `packages/extensions/history.md`
- `@input/pen-import-html` -> `packages/extensions/import-html.md`
- `@input/pen-import-markdown` -> `packages/extensions/import-markdown.md`
- `@input/pen-input-rules` -> `packages/extensions/input-rules.md`
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
