# `@input/pen-import-json`

JSON document importer for Pen. Schema-validates before ops (SEC4) and applies the shared ingest envelope (IOP5).

This package does not export JSON. Export is `@input/pen-export-json`. URLs are not pre-laundered (SEC1 applies at render time).

## Install

```bash
pnpm add @input/pen-core @input/pen-import-json
```

## What It Provides

- `jsonImporter` for importing a Pen JSON document (`version: 1`) into an editor
- `parseJsonToBlocks()` / `parseJsonWithReport()` for conversion without applying ops
- One `IngestReport` (`droppedByReason`) per import — not a diagnostic stream (IOP6)

## Ingest bounds (IOP5 / SEC4)

The same envelope governs every ingest path. These constants are not configurable. They sit beside the published runtime envelope in `spec-v2/22-scale-envelope.md` SCALE1 (verified document size is a different number — ingest caps are what a single paste/import will accept).

| Constant                   |     Value | What it caps                           |
| -------------------------- | --------: | -------------------------------------- |
| `INGEST_MAX_NESTING_DEPTH` |        32 | Block-tree depth (top-level = 1)       |
| `INGEST_MAX_NODE_COUNT`    |    10,000 | Blocks including table rows/cells      |
| `INGEST_MAX_TEXT_SIZE`     | 1,048,576 | Imported plain text, UTF-16 code units |
| `INGEST_MAX_IMAGE_COUNT`   |       256 | Image blocks                           |

Exceeding a bound truncates at a block boundary and names the bound in `droppedByReason` plus a single `import-truncated` diagnostic.

## JSON validation (SEC4)

- Block `type` must resolve in the active registry; unknown types and unknown props are dropped with `diagnostic { code: "import-dropped" }`.
- `__proto__`, `constructor`, and `prototype` are rejected as own keys anywhere in the payload.
- Validation builds fresh null-prototype records. It never deep-merges raw parsed JSON.
- URLs are not pre-laundered (SEC1 applies at render time).

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { jsonImporter } from "@input/pen-import-json";

const editor = createEditor();

jsonImporter.import(
  {
    version: 1,
    blocks: [
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: { text: "Hello" },
      },
    ],
  },
  editor,
  { replace: true },
);
```

## Options

`jsonImporter.import` accepts `ImportOptions`. The ingest bounds above are not configurable.

| Option      | Default | Effect                       |
| ----------- | ------- | ---------------------------- |
| `position`  | unset   | Insert position              |
| `replace`   | unset   | Replace the current document |
| `validate`  | unset   | Passed through to apply      |
| `normalize` | unset   | Passed through to apply      |
| `undoGroup` | unset   | Passed through to apply      |

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Import and export page (`#/import-export`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
