# `@pen/document-ops`

`@pen/document-ops` owns Pen's built-in document tool semantics.

`createEditor()` installs this extension by default, so every editor starts with the standard document read/write/context tools already registered.

Use this package when you need to:

- rely on the default document-oriented tools installed by Pen
- access the low-level document tool runtime directly from an editor
- work with advanced escape hatches such as `ToolContextImpl` for custom execution flows

## Usage

```ts
import { createEditor } from "@pen/core";
import { getDocumentToolRuntime } from "@pen/document-ops";

const editor = createEditor();
const toolRuntime = getDocumentToolRuntime(editor);

if (!toolRuntime) {
  throw new Error("Document tools are unavailable.");
}

const tools = toolRuntime.listTools();
```

Prefer `@pen/ai-tools` for the main public agent/tool integration story. Reach for `@pen/document-ops` when you need the underlying document semantics or lower-level runtime escape hatches.
