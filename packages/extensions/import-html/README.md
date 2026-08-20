# `@input/pen-import-html`

HTML importer with sanitization for Pen.

## Install

```bash
pnpm add @input/pen-core @input/pen-import-html
```

## What It Provides

- `htmlImporter` for parsing and importing HTML into a Pen editor
- `parseHtmlToBlocks()` for block conversion without mutating the editor
- `parseHtmlWithReport()` for the same conversion plus a single dropped-by-reason report (IOP6)
- `sanitizeHTML()` for sanitizing incoming HTML before import

## Ingest bounds (IOP5 / SEC4)

The same envelope governs every ingest path. These constants are not configurable; a host importing a legitimately huge document needs to know the numbers. They sit beside the published runtime envelope in `spec-v2/22-scale-envelope.md` SCALE1 (verified document size is a different number — ingest caps are what a single paste/import will accept).

Sibling importers (`@input/pen-import-markdown`, `@input/pen-import-json`) already shipped these numbers as local copies. This package uses the same values rather than a shared module because extracting a shared constants package is outside this step's fence. IOP5 requires one document arriving by two routes to have one limit.

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
import { htmlImporter } from "@input/pen-import-html";

const editor = createEditor();

await htmlImporter.import("<p>Hello <strong>Pen</strong></p>", editor, {
  replace: true,
});
```

## Image src policy

Remote `<img src>` URLs are **kept as-is** by default (`imageSrc: "keep"`).
The imported document may then depend on the remote server. Set
`imageSrc: "ingest"` to fetch those URLs (and `data:` URLs) and upload them
through the editor's `AssetProvider` on the `paste:assetProvider` slot.
Ingest failure emits `asset-upload-failed` and omits that image block.

```ts
await htmlImporter.import('<img src="https://cdn.example/a.png" />', editor, {
  imageSrc: "ingest",
});
```

## Integration Notes

- This package is intended for paste, import, and migration flows from HTML sources.
- Import goes through Pen's normal operation pipeline with `origin: "import"`.
- Sanitization is built in so host applications can treat HTML as untrusted input by default.
- Use `parseHtmlToBlocks()` when you want to inspect or transform the converted blocks before applying them.
- Use `parseHtmlWithReport()` when the host needs the drop/truncation report without applying ops.
