# `@input/pen-import-markdown`

Markdown importer for Pen.

## Install

```bash
pnpm add @input/pen-core @input/pen-import-markdown
```

## What It Provides

- `markdownImporter` for parsing and importing Markdown into a Pen editor
- `parseMarkdownToBlocks()` for block conversion without mutating the editor
- `parseMarkdownWithReport()` for the same conversion plus a single dropped-by-reason report (IOP6)

## Ingest bounds (IOP5 / SEC4)

The same envelope governs every ingest path. These constants are not configurable; a host importing a legitimately huge document needs to know the numbers. They sit beside the published runtime envelope in `spec-v2/22-scale-envelope.md` SCALE1 (verified document size is a different number — ingest caps are what a single paste/import will accept).

| Constant | Value | What it caps |
| --- | ---: | --- |
| `INGEST_MAX_NESTING_DEPTH` | 32 | Block-tree depth (top-level = 1) and list `indent` (0-based, so indent 0–31) |
| `INGEST_MAX_NODE_COUNT` | 10,000 | Blocks including table rows/cells |
| `INGEST_MAX_TEXT_SIZE` | 1,048,576 | Imported plain text, UTF-16 code units; also the pre-parse raw-source cap |
| `INGEST_MAX_IMAGE_COUNT` | 256 | Image blocks |

Exceeding a bound truncates at a block boundary. `import()` returns one `IngestReport` (`droppedByReason`) and emits a single `import-truncated` or `import-dropped` diagnostic naming the bound and what was dropped — not a per-block diagnostic stream.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { markdownImporter } from "@input/pen-import-markdown";

const editor = createEditor();

markdownImporter.import("# Hello\n\nThis came from Markdown.", editor, {
  replace: true,
});
```

## Integration Notes

- This package is useful for paste, file import, and migration flows from Markdown content.
- Like the other importers, it applies edits through Pen's import operation path instead of bypassing editor authority.
- Use `parseMarkdownToBlocks()` when you want to inspect or transform the converted blocks before applying them.
- Use `parseMarkdownWithReport()` when the host needs the drop/truncation report without applying ops.
