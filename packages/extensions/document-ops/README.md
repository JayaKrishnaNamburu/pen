# `@input/pen-document-ops`

`@input/pen-document-ops` owns Pen's built-in document tool semantics.

The standard `defaultPreset()` installs this extension, so most editors start with the document read/write/context tools already registered. This package does not talk to a model or grant mutating tools — that is `@input/pen-ai-tools`.

## Install

This package has no peer dependencies. `@input/pen-preset-default` already includes it.

```bash
pnpm add @input/pen-document-ops
```

`engines.node` is `>=22`.

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
- text offsets (and delete/replace spans) stay inside the live block, including text inserted earlier in the same batch
- the op `text` field, when present, is at most `MAX_OP_TEXT_FIELD_LENGTH` (1,048,576 UTF-16 code units — 1MB)
- `__proto__`, `constructor`, and `prototype` are not own keys anywhere in the payload

These constants are not configurable:

| Constant                   |     Value | What it caps        |
| -------------------------- | --------: | ------------------- |
| `MAX_OP_TEXT_FIELD_LENGTH` | 1,048,576 | Per-op `text` field |

Invalid payloads emit `diagnostic` events (`code: "invalid-tool-payload"`, `source: "document-ops"`) and **do not apply**. One failure rejects the whole batch — no partial apply. The same diagnostic is emitted when a tool is pointed at an unknown block, a hidden/unavailable block type, or an empty `write_document` payload; those calls still throw so the model sees the error.

This package also rejects `__proto__`, `constructor`, and `prototype` as own keys anywhere in a payload (same filter as apply-time phase 2). It does not validate prop schemas or cap string fields other than `text`. Apply-time `@input/pen-core` phase 2 is the enforcement backstop: those own keys emit `PEN_APPLY_009` and the op is not written.

Custom execution flows should use the same helpers:

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import {
  applyValidatedOps,
  assertValidToolPayloads,
  validateToolPayloads,
  MAX_OP_TEXT_FIELD_LENGTH,
} from "@input/pen-document-ops";
import type { DocumentOp } from "@input/pen-types";

const editor = createEditor({
  preset: defaultPreset(),
});
const payloads: DocumentOp[] = [
  {
    type: "insert-block",
    blockId: "b1",
    blockType: "paragraph",
    props: {},
    position: "last",
  },
];

const result = validateToolPayloads(editor, payloads);
if (!result.ok) {
  // result.ops is empty; result.failures carry the diagnostic payloads
}

applyValidatedOps(editor, payloads, { origin: "ai" });
```

`validateToolPayloads` inspects without applying. `assertValidToolPayloads` emits the diagnostics and throws. `applyValidatedOps` asserts, then applies the validated batch.

## Options

`documentOpsExtension()` accepts `DocumentOpsOptions` with `enableGenerationZones`. The factory does not read that field. Treat the extension as taking no effective options.

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions. It registers document tools on a slot (`document-ops:toolRuntime`). Prefer `@input/pen-ai-tools` for the public agent surface.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Extensions and facets page (`#/extensions`) and the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
