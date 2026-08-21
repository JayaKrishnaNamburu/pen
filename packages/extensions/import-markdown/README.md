# `@input/pen-import-markdown`

Markdown importer for Pen.

This package turns markdown into document ops. It does not export markdown or own the shared serializer.

## Install

```bash
pnpm add @input/pen-core @input/pen-preset-default @input/pen-import-markdown
```

## What It Provides

- `markdownImporter` for parsing and importing Markdown into a Pen editor
- `parseMarkdownToBlocks()` for block conversion without mutating the editor
- `parseMarkdownWithReport()` for the same conversion plus a single dropped-by-reason report (IOP6)

## Ingest bounds (IOP5 / SEC4)

The same envelope governs every ingest path. These constants are not configurable; a host importing a legitimately huge document needs to know the numbers. They sit beside the published runtime envelope in `spec-v2/22-scale-envelope.md` SCALE1 (verified document size is a different number — ingest caps are what a single paste/import will accept).

| Constant                   |     Value | What it caps                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGEST_MAX_NESTING_DEPTH` |        32 | Block-tree depth (top-level = 1) and list `indent` (0-based, so indent 0–31)                                                                                                                                                                                                                                      |
| `INGEST_MAX_NODE_COUNT`    |    10,000 | Blocks including table rows/cells                                                                                                                                                                                                                                                                                 |
| `INGEST_MAX_TEXT_SIZE`     | 1,048,576 | Imported plain text, UTF-16 code units; also the pre-parse raw-source cap                                                                                                                                                                                                                                         |
| `INGEST_MAX_IMAGE_COUNT`   |       256 | Image blocks                                                                                                                                                                                                                                                                                                      |
| `INGEST_TIME_BUDGET_MS`    |     1,000 | Stated wall-clock budget for one ingest, including markdown paste. Same number as clipboard ingest. Not re-recorded under parallel load — re-record on a quiet machine before treating it as a CI gate. The enforceable bound is the pre-parse source cap: parse work is O(`INGEST_MAX_TEXT_SIZE`), not O(input). |

Exceeding a bound truncates at a block boundary. `import()` and `markdownImporter.parse` (the paste entry) return or emit one `IngestReport` (`droppedByReason`) naming the bound, the limit, the actual value, and what was dropped — not a per-block diagnostic stream. `parseMarkdownToBlocks()` stays silent; use `parseMarkdownWithReport()` when the host wants the report without applying ops.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { markdownImporter } from "@input/pen-import-markdown";

const editor = createEditor({
  preset: defaultPreset(),
});

markdownImporter.import("# Hello\n\nThis came from Markdown.", editor, {
  replace: true,
});
```

A bare `createEditor()` has an empty schema. Unknown block types are dropped, so that markdown would import nothing. `defaultPreset()` (or `createDefaultSchema()`) is required for heading and paragraph types to resolve.

## Integration Notes

- This package is useful for paste, file import, and migration flows from Markdown content.
- Like the other importers, it applies edits through Pen's import operation path instead of bypassing editor authority.
- Use `parseMarkdownToBlocks()` when you want to inspect or transform the converted blocks before applying them.
- Use `parseMarkdownWithReport()` when the host needs the drop/truncation report without applying ops.

## Options

`markdownImporter.import` accepts `ImportOptions`. The ingest bounds above are not configurable.

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
