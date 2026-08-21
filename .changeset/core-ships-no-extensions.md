---
"@input/pen-core": minor
---

`createEditor()` no longer registers any extension by default. Core's fallback list is now empty, and `@input/pen-core` depends on no extension package at all.

Previously a bare `createEditor({ schema })` gave you undo for free. It no longer does. The last of the built-in fallbacks (`undo`) has been removed, following `delta-stream`, `rich-text-shortcuts`, and `document-ops`. This completes API1/F12: the workspace dependency graph now has **zero** inverted edges, and the DAG allowlist is empty.

**If you use `defaultPreset()` from `@input/pen-preset-default`, nothing changes.** It still supplies document-ops, delta-stream, undo, and rich-text-shortcuts, and it is now the only batteries-included path.

**If you call `createEditor()` directly**, register what you need:

```ts
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";

const editor = createEditor({ schema, extensions: [undoExtension()] });
```

Without it, `editor.undoManager` is an inert stub: `canUndo()` returns `false` and `undo()` does nothing. The `undo:manager` slot is absent. Nothing throws, so this fails quietly — check any code path that assumed undo was present.

`createHeadlessEditor({ useDefaultExtensions: true })` is a no-op for the same reason: core's fallback list is gone, so the flag only skips the empty headless preset object. Pass `preset: defaultPreset()` or an explicit `extensions` list.

Extensions that declare a dependency **do** throw, which is the loud case: `aiExtension` declares `["document-ops", "delta-stream", "undo"]`, so composing it on a bare editor now fails with `Extension "ai" depends on "undo", which is not registered` unless all three are registered or you use the preset.
