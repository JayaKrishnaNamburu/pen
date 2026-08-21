# `@input/pen-export-html`

HTML exporter for a live Pen editor. `htmlExporter.export(editor)` walks every block, including nested and layout children, and returns an HTML string.

This package does not import HTML, sanitize untrusted markup, or mount a renderer. Import is `@input/pen-import-html`. URL admission for display is render-time policy in `@input/pen-core`, not this exporter.

## Install

This package has no peer dependencies.

```bash
pnpm add @input/pen-export-html
```

`engines.node` is `>=22`.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { htmlExporter } from "@input/pen-export-html";

const editor = createEditor({
  preset: defaultPreset(),
});
const html = htmlExporter.export(editor);
```

`htmlExporter.name` is `"html"`, `mimeType` is `"text/html"`, and `fileExtension` is `".html"`. Blocks without a schema `serialize.toHTML` fall back to a `<p>` of the block text.

## Options

| Option               | Default | Effect                                                                             |
| -------------------- | ------- | ---------------------------------------------------------------------------------- |
| `includeSuggestions` | unset   | `false` forces `viewMode` to `"resolved"` when `extra.viewMode` is omitted         |
| `extra.viewMode`     | `"raw"` | `"resolved"` omits delete-suggestion spans; `"raw"` serializes the stored document |

Other `ExportOptions` fields (`includeApps`, `includeLayout`, `includeMetadata`, `prettyPrint`) are accepted on the type and are unused by this exporter.

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Import and export page (`#/import-export`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
