# `@input/pen-document-ops`

`@input/pen-document-ops` owns Pen's built-in document tool semantics.

The standard `defaultPreset()` installs this extension, so most editors start with the document read/write/context tools already registered.

Use this package when you need to:

- rely on the default document-oriented tools installed by Pen
- access the low-level document tool runtime directly from an editor
- work with advanced escape hatches such as `ToolContextImpl` for custom execution flows

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { getDocumentToolRuntime } from "@input/pen-document-ops";

const editor = createEditor({
  preset: defaultPreset(),
});
const toolRuntime = getDocumentToolRuntime(editor);

if (!toolRuntime) {
  throw new Error("Document tools are unavailable.");
}

const tools = toolRuntime.listTools();
```

Prefer `@input/pen-ai-tools` for the main public agent/tool integration story. Reach for `@input/pen-document-ops` when you need the underlying document semantics or lower-level runtime escape hatches.

## Payload validation (SEC6)

Built-in document tools and `ToolContextImpl` validate each tool-call payload structurally **before** `editor.apply`. Pipeline phase 2 remains the backstop for every other op source.

A payload is accepted only when all of these hold:

- `type` is a known `DocumentOp` union member (`DOCUMENT_OP_TYPES` / `isDocumentOpType`)
- targets resolve against the live document, or against `insert-block` ids earlier in the same batch
- the op `text` field, when present, is at most `MAX_OP_TEXT_FIELD_LENGTH` (1,048,576 UTF-16 code units — 1MB)
- `__proto__`, `constructor`, and `prototype` are not own keys anywhere in the payload

These constants are not configurable:

| Constant | Value | What it caps |
| --- | ---: | --- |
| `MAX_OP_TEXT_FIELD_LENGTH` | 1,048,576 | Per-op `text` field |

Invalid payloads emit `diagnostic` events (`code: "invalid-tool-payload"`, `source: "document-ops"`) and **do not apply**. One failure rejects the whole batch — no partial apply.

This package also rejects `__proto__`, `constructor`, and `prototype` as own keys anywhere in a payload (same filter as apply-time phase 2). It does not validate prop schemas or cap string fields other than `text`. Apply-time `@input/pen-core` phase 2 is the enforcement backstop: those own keys emit `PEN_APPLY_009` and the op is not written.

Custom execution flows should use the same helpers:

```ts
import {
  applyValidatedOps,
  assertValidToolPayloads,
  validateToolPayloads,
  MAX_OP_TEXT_FIELD_LENGTH,
} from "@input/pen-document-ops";

const result = validateToolPayloads(editor, payloads);
if (!result.ok) {
  // result.ops is empty; result.failures carry the diagnostic payloads
}

applyValidatedOps(editor, payloads, { origin: "ai" });
```

`validateToolPayloads` inspects without applying. `assertValidToolPayloads` emits the diagnostics and throws. `applyValidatedOps` asserts, then applies the validated batch.
