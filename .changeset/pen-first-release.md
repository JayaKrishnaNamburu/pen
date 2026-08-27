---
"@input/pen": minor
---

First public release. The batteries-included starter for Pen. `createEditor` and `createHeadlessEditor` default an omitted `preset` to `defaultPreset()`, which assembles the default schema, document tools, delta stream, undo, rich-text shortcuts, and HTML clipboard, so the quickstart is one import and a bare `createEditor()`. Explicit `preset`, `schema`, and `extensions` pass through unchanged; `@input/pen-core` remains the bare, preset-free constructor.
