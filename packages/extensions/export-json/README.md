# @input/pen-export-json

Canonical JSON exporter and importer for Pen documents.

Use this package for persistence and deterministic round-tripping. It does not sanitize HTML, admit URLs, or mount a renderer.

## Install

```bash
pnpm add @input/pen-export-json
```

## What It Provides

- `jsonExporter` for machine-readable document export
- `textExporter` and `exportPlainText()` for plain text export
- `jsonImporter` for importing Pen JSON documents
- shared JSON document types for integration code

Use this package for persistence, interchange, and deterministic round-tripping of supported Pen document content.

## Plain Text

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import {
  exportEditorToJson,
  exportEditorToText,
  exportPenDocumentToText,
  exportPlainText,
} from "@input/pen-export-json";

const editor = createEditor({
  preset: defaultPreset(),
});
const documentJson = exportEditorToJson(editor);

const textFromEditor = exportEditorToText(editor);
const plainText = exportPlainText(editor);
const textFromJson = exportPenDocumentToText(documentJson, {
  excludeBlockTypes: ["blockquote"],
  separator: " ",
});
```

Hosts can filter block types and render app-specific inline nodes while keeping product delivery policy outside Pen.

## Options

`exportEditorToJson` reads `includeMetadata`. When that flag is true and `extra.metadata` is set, the metadata object is written onto the JSON document. Other `ExportOptions` fields are accepted on the type and unused here.

`exportPenDocumentToText` accepts `excludeBlockTypes` (default none) and `separator` (default `"\\n"`).

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Import and export page (`#/import-export`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
