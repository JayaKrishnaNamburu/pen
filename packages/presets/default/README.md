# `@input/pen-preset-default`

`defaultPreset()` is an `EditorPreset` that assembles the default schema and four headless extensions. It does not create an editor, render a surface, or ship CSS.

## What it assembles

`defaultPreset()` with no options (or with every flag left on) resolves to this stack, in order:

| Extension name | Package |
| --- | --- |
| `document-ops` | `@input/pen-document-ops` |
| `delta-stream` | `@input/pen-delta-stream` |
| `undo` | `@input/pen-undo` |
| `rich-text-shortcuts` | `@input/pen-shortcuts` |

`resolve()` also returns `schema: createDefaultSchema()` from `@input/pen-schema-default`. `createEditor({ preset: defaultPreset() })` therefore installs the default blocks. `createEditor()` with no schema and no preset does not.

This package does not assemble a renderer, AI, search, history, input-rules, multiplayer, or import/export.

## Install

This package has no peer dependencies.

```bash
pnpm add @input/pen-preset-default @input/pen-core
```

`@input/pen-core` is the `createEditor` host. A renderer (`@input/pen-react`, `@input/pen-vue`, or `@input/pen-dom`) is a separate install when you want a mounted editor.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});
```

Each assembled feature can be turned off. `deltaStream` and `shortcuts` also accept the option objects from those packages:

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset({
    documentOps: false,
    deltaStream: false,
    undo: false,
    shortcuts: {
      onToggleLink: (editor) => {
        return true;
      },
    },
  }),
});
```

### Options

| Option | Default | Effect |
| --- | --- | --- |
| `documentOps` | on | `false` omits `documentOpsExtension()` |
| `deltaStream` | on | `false` omits `deltaStreamExtension()`; an object is passed through as `DeltaStreamOptions` |
| `undo` | on | `false` omits `undoExtension()` |
| `shortcuts` | on (`{}`) | `false` omits `richTextShortcutsExtension()`; an object is passed through as `RichTextShortcutsOptions` |

The public exports are `defaultPreset` and `DefaultPresetOptions`.

## HOST1 — client boundary

This package has no `"use client"` directive. It is a non-rendering assembler and stays importable from server modules (`spec-v2/15-host-integration.md` HOST1). The React client boundary lives on `@input/pen-react` entry points, not here.

In Next.js App Router, import `PenEditor` from a Client Component. `defaultPreset` does not need that wrapper.

## HOST3 — Node floor

`engines.node` is `>=22`. The workspace Node and browser floor is the table in the [root README](../../../README.md#browser-and-node-support).

## HOST6 — no stylesheet

This package ships no stylesheet. Pen has no required CSS; an editor is functional unstyled. The custom-property surface is documented in [`@input/pen-react` STYLING.md](../../rendering/react/STYLING.md).

Mounted examples: [`examples/react`](../../../examples/react), [`examples/vue`](../../../examples/vue), [`examples/vanilla`](../../../examples/vanilla).

## License

See `LICENSE.md`.
