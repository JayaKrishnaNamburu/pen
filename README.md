<!-- markdownlint-disable MD033 MD041 -->
<img width="100%" height="auto" alt="cover@2x" src="https://github.com/user-attachments/assets/20356e3d-4a7c-4e65-b687-e680db017547" />

<h3 align="center">
  Headless, extension-first editor<br/> engine for human-AI collaboration
</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@pen/core"><img src="https://img.shields.io/npm/v/@pen/core?color=0368FF&label=version" alt="npm version" /></a>
  <img src="https://img.shields.io/github/stars/niceperson/pen?style=flat&color=8D30FF" alt="GitHub stars" />
  <img src="https://img.shields.io/badge/license-Pen-FF2B6E" alt="license" />
</p>
<!-- markdownlint-enable MD033 MD041 -->

# Pen

Pen is a source-available SDK published as public npm packages. You can evaluate and develop with it freely, but production use requires a commercial license from Input.

```bash
pnpm add @pen/core @pen/preset-default @pen/react
```

## What Pen Is

Pen is a package-first editor toolkit built around a headless runtime, schema-driven document model, and explicit extension composition. The core editor owns document state, selection, normalization, and mutation authority, while renderer packages bind that runtime to React or Vue.

## Quick Start

The smallest recommended setup uses the core runtime, the default preset, and the React renderer.

```tsx
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { PenEditor } from "@pen/react";

const editor = createEditor({
  preset: defaultPreset(),
});

export function App() {
  return <PenEditor editor={editor} />;
}
```

## Recommended Packages

- `@pen/core`: create editors and access the headless runtime
- `@pen/types`: contracts and shared type-level helpers
- `@pen/schema-default`: default blocks and inline definitions
- `@pen/preset-default`: standard runtime composition for most adopters
- `@pen/react`: primary documented renderer surface
- `@pen/crdt-yjs`: Yjs adapter for collaborative setups

## Optional Capabilities

### Rendering

- `@pen/vue`: shipped Vue renderer proof built on the shared DOM engine
- `@pen/dom`: shared DOM field-editor engine and low-level DOM helpers

### Editing And Extensions

- `@pen/search`: document search and replacement primitives
- `@pen/input-rules`: opt-in markdown shortcut typing
- `@pen/undo`: undo and redo with origin tagging
- `@pen/shortcuts`: headless keyboard shortcut extension
- `@pen/history`: snapshot history and attribution primitives
- `@pen/database`: database block behaviors
- `@pen/document-ops`: document tool and generation-zone helpers

### AI

- `@pen/ai`: AI extension, suggest mode, and track changes
- `@pen/ai-autocomplete`: inline autocomplete
- `@pen/ai-tools`: canonical AI tool surface
- `@pen/ai-skills`: agent-facing skill artifacts

### Collaboration And Transport

- `@pen/multiplayer`: multiplayer presence and sync primitives
- `@pen/delta-stream`: streaming protocol and processing pipeline
- `@pen/transport-direct`: in-process transport
- `@pen/transport-sse`: Server-Sent Events transport

### Import And Export

- `@pen/import-markdown` and `@pen/import-html`
- `@pen/export-markdown`, `@pen/export-html`, `@pen/export-json`, and `@pen/export-xml`

## Architecture

Pen keeps one block-native document model and one canonical mutation path.

- `editor.apply(...)` is the runtime authority boundary for document writes.
- `DocumentOp[]` is the mutation currency shared across runtime features.
- Extensions compose optional behavior without replacing the editor authority boundary.
- Renderer packages stay separate from the core runtime.
- JSON is the canonical machine-readable format. XML exists for interoperability.

For the full current-state package and architecture specs, see [spec/README.md](spec/README.md).

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Authors

Pen is created by [Input](https://www.input.so/).

## License

The Pen SDK is provided under the [Pen license](LICENSE.md). You can use the SDK freely in development. Production use requires a license. Contact [input.so](https://www.input.so/) to learn more.

Copyright (c) 2026-present Input B.V.
