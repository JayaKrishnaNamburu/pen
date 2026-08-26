# `@input/pen-preset-default`

`defaultPreset()` is an `EditorPreset` that assembles the default schema and five headless extensions. It does not create an editor, render a surface, or ship CSS.

## What it assembles

`defaultPreset()` with no options (or with every flag left on) resolves to this stack, in order:

| Extension name        | Package                   |
| --------------------- | ------------------------- |
| `document-ops`        | `@input/pen-document-ops` |
| `delta-stream`        | `@input/pen-ai/stream`    |
| `undo`                | `@input/pen-undo`         |
| `rich-text-shortcuts` | `@input/pen-shortcuts`    |
| `html-clipboard`      | `@input/pen-interop/html` |

`resolve()` also returns `schema: createDefaultSchema()` from `@input/pen-schema-default`. `createEditor({ preset: defaultPreset() })` therefore installs the default blocks. `createEditor()` with no schema and no preset does not.

A bare `createEditor({ schema })` (no preset) installs no extensions. The four that used to come from core's no-preset fallback — `document-ops`, `undo`, `rich-text-shortcuts`, and `delta-stream` — are gone. Dependents of the first three fail loudly. Undo fails silently: `canUndo()` is false, Mod-Z is dead, and nothing throws. This preset is the batteries-included path: Mod-B / Mod-I, undo / Mod-Z, and `aiExtension()`'s `delta-stream` dependency all require it (or an explicit `extensions` entry).

This package does not assemble a renderer, AI, search, history, input-rules, or multiplayer. It does contribute the default HTML paste importer through `clipboardFacet` (`html-clipboard`). A host on bare `createEditor()` plus a renderer does not get HTML paste unless they supply `importers.html`.

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

| Option        | Default   | Effect                                                                                                  |
| ------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `documentOps` | on        | `false` omits `documentOpsExtension()`                                                                  |
| `deltaStream` | on        | `false` omits `deltaStreamExtension()`; an object is passed through as `DeltaStreamOptions`             |
| `undo`        | on        | `false` omits `undoExtension()`                                                                         |
| `shortcuts`   | on (`{}`) | `false` omits `richTextShortcutsExtension()`; an object is passed through as `RichTextShortcutsOptions` |

The public exports are `defaultPreset` and `DefaultPresetOptions`.

## HOST1 — client boundary

This package has no `"use client"` directive. It is a non-rendering assembler and stays importable from server modules (`spec/rules/host.md` HOST1). The React client boundary lives on `@input/pen-react` entry points, not here.

In Next.js App Router, import `PenEditor` from a Client Component. `defaultPreset` does not need that wrapper.

## HOST3 — Node floor

`engines.node` is `>=22`. The workspace Node and browser floor is the browser-and-Node-support table in the repository root README.

## HOST6 — no stylesheet

This package ships no stylesheet. Pen has no required CSS; an editor is functional unstyled. The custom-property surface is documented in `STYLING.md`, which ships inside the `@input/pen-react` package.

Mounted examples live in the repository under `examples/react`, `examples/vue`, and `examples/vanilla`.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Getting started page (`#/getting-started`) and the Core concepts page (`#/core-concepts`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
