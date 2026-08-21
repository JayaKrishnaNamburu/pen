# `@input/pen-export-markdown`

Markdown exporter for a live Pen editor. `markdownExporter.export(editor)` serializes the document and admits link and image URLs through core's URL policy.

This package does not import markdown or own the shared serializer. Import is `@input/pen-import-markdown`. The serializer lives in `@input/pen-markdown-serialization`; this package is the host-facing wrapper.

## Install

This package has no peer dependencies.

```bash
pnpm add @input/pen-export-markdown
```

`engines.node` is `>=22`.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { markdownExporter } from "@input/pen-export-markdown";

const editor = createEditor({
  preset: defaultPreset(),
});
const markdown = markdownExporter.export(editor);
```

`exportMarkdownForBlocks(editor, handles)` and `exportMarkdownRange(editor, range)` are the same serializers with URL admission applied.

`markdownExporter.name` is `"markdown"`, `mimeType` is `"text/markdown"`, and `fileExtension` is `".md"`.

## Options

| Option               | Default   | Effect                                                                     |
| -------------------- | --------- | -------------------------------------------------------------------------- |
| `includeSuggestions` | unset     | `false` forces `viewMode` to `"resolved"` when `extra.viewMode` is omitted |
| `extra.viewMode`     | `"raw"`   | `"resolved"` drops delete-suggestion spans                                 |
| `extra.range`        | whole doc | `{ startBlockId, endBlockId }` limits the export to that span              |

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Import and export page (`#/import-export`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
