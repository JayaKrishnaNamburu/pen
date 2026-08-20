# DUR7 durability corpus

Committed JSON snapshots of notable document shapes. The standing assertion is:

load snapshot → rebuild via the test harness → `normalizeAll` → re-export → semantic equality.

These are **JSON export snapshots**, not Yjs binaries. Wave V.7 starts here so the corpus does not depend on `loadYjsDocument` (binary load + repair) or on non-deterministic table-cell UUIDs. `exportEditorToJson` uses stable synthetic cell ids (`cell-0-0`).

## Fixtures

| File | Shape |
| --- | --- |
| `DUR7-nested-blocks.json` | Toggle with a `parentId` child |
| `DUR7-table.json` | Default 2×2 table |
| `DUR7-unknown-block-type.json` | Passthrough `hostWidget` type |
| `DUR7-unknown-props.json` | Paragraph with undeclared `hostAnnotation` |
| `DUR7-emoji-rtl.json` | Hebrew + emoji + Arabic |

Skipped as too large or not representable in this interchange format: subdocument, and per-store-generation Yjs binaries (`penFormat` lives in Yjs `metadata`, which JSON export does not write unless the caller passes `includeMetadata`).

## Regenerate

The script is the only supported rewrite path. Do not hand-edit the JSON files.

```bash
node src/fixtures/durability/generate.mjs
```

Run from `packages/tooling/test` after workspace packages are built. A PR that regenerates fixtures must record why. The suite compares against the committed files and must not rewrite them on failure.

## `assertDocEquals` coverage

`assertDocEquals` compares block id (when both sides name one), type, props (unknown keys included on document↔document), content, marks, layout `children`, table cells, `apps`, and `metadata` except `penFormat.writer`. `ASSERT_DOC_EQUALS_FIELDS` is the closed list. JSON export equality still covers interchange shape.
