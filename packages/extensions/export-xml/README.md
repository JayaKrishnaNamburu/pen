# `@input/pen-export-xml`

XML exporter and importer for Pen documents. `xmlExporter` serializes through the JSON document model. `xmlImporter` parses a `<pen-document version="1">` tree and applies it through `jsonImporter`.

This package does not own the JSON schema. Persistence and round-trip types live on `@input/pen-export-json`. It does not sanitize HTML or admit URLs.

## Install

This package has no peer dependencies.

```bash
pnpm add @input/pen-export-xml
```

`engines.node` is `>=22`.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { xmlExporter, xmlImporter } from "@input/pen-export-xml";

const editor = createEditor({
  preset: defaultPreset(),
});
const xml = await xmlExporter.export(editor);
await xmlImporter.import(xml, editor, { replace: true });
```

`parseXmlDocument(input)` returns the JSON document without applying it. The root element must be `pen-document` with `version` `1`; anything else throws. A source longer than `INGEST_MAX_TEXT_SIZE` (1,048,576 code units) is refused before parse: `xmlImporter.import` emits `import-truncated` and inserts nothing; `parseXmlDocument` throws. Slicing XML cannot produce a valid document, so the cap is a refuse-before-parse precondition. After parse, the same node / depth / image caps as the JSON importer truncate the tree (`INGEST_MAX_NODE_COUNT` 10,000, `INGEST_MAX_NESTING_DEPTH` 32, `INGEST_MAX_IMAGE_COUNT` 256). `INGEST_TIME_BUDGET_MS` (1,000) is advisory — the enforceable bound is the cap-before-parse refusal.

`xmlExporter.name` is `"xml"`, `mimeType` is `"application/xml"`, and `fileExtension` is `".xml"`.

## Options

`xmlExporter` forwards `ExportOptions` to `exportEditorToJson`. `includeMetadata` is the only flag that exporter reads: when it is true and `extra.metadata` is set, that metadata is written onto the JSON document and then into XML.

`xmlImporter.import` accepts `ImportOptions`:

| Option      | Default | Effect                              |
| ----------- | ------- | ----------------------------------- |
| `position`  | unset   | Insert position for imported blocks |
| `replace`   | unset   | Replace the current document        |
| `validate`  | unset   | Passed through to `jsonImporter`    |
| `normalize` | unset   | Passed through to `jsonImporter`    |
| `undoGroup` | unset   | Passed through to `jsonImporter`    |

`XmlExporterExtraOptions` is an open `Record<string, unknown>`; this package does not read custom keys.

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Import and export page (`#/import-export`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
