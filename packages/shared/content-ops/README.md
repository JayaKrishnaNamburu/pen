# `@input/pen-content-ops`

`@input/pen-content-ops` is a shared library for turning imported or authored content into `DocumentOp`s. Hosts do not install it alone — install `@input/pen-preset-default`, or `@input/pen-core` plus the import / document-ops extensions that consume this package.

This is the live workspace package at `packages/shared/content-ops`. It is not the deleted `packages/extensions/content-ops` husk (Wave H.5 / CH6). Core still depends on this package; dropping that edge is Wave P P.1, not this inventory.

## Install

```bash
pnpm add @input/pen-content-ops
```

## What this package does

- Parse markdown or plain text into pending blocks.
- Filter pending blocks against a document profile and report import violations.
- Turn pending blocks into `DocumentOp`s (`blocksToOps`, `buildDocumentWriteOps`).
- Share structured-target and plan-record shapes used by document-ops and AI planning.

## What this package does not do

- It is not an editor, importer extension, or host entry point.
- It does not apply ops — callers pass the result to `editor.apply`.
- It does not own the deleted husk path or invert the core → content-ops DAG.
- `parseMarkdownToBlocks` is parse-only: it does not drop unknown or flow-disallowed types. Callers that need that run `normalizePendingBlocksForImport`.
- `blocksToOps` reads only `ImportOptions.position` (default `"last"`). `replace`, `validate`, `normalize`, and `undoGroup` are on the re-exported type from `@input/pen-types` and are unused here.

## Public exports

The index is the public surface. Unused former exports (`TARGET_EDITABILITIES`, `STRUCTURED_TARGET_KINDS`, `normalizePlanProps`) are not on it. Internal modules (`astToBlocks`, `htmlInline`, `inlineMarks`, `tableParser`) are not either.

| Export | Role |
| --- | --- |
| `blocksToOps` | Pending blocks → insert/update ops. Direct callers: import-markdown, paste (`@input/pen-dom`), autocomplete. Core re-exports it; import-html consumes that re-export. |
| `parseMarkdownToBlocks` | Markdown → pending blocks. Used by import-markdown, `buildDocumentWriteOps`, and autocomplete. |
| `splitPlainTextLineBlocks` | Plain text → trimmed line strings (leading/trailing empty lines stripped). Used by AI replacement and autocomplete. |
| `buildDocumentWriteOps` | Text, markdown, or block input → write ops (normalizes first). Used by document-ops (re-export + write tool) and AI via that re-export. |
| `createImportResult` | Builds an `ImportResult` drop report. Used by export-json. Core re-exports it. |
| `normalizePendingBlocksForImport` | Drops unknown and flow-disallowed blocks. Used by importers, paste, write-ops, and core. |
| `filterPendingBlocksForDocumentProfile` | Profile-only filter (does not drop unknown types). Used by core's profile-policy re-export. |
| `reportPendingBlockImportViolations` | Emits `PEN_PROFILE_002` and `PEN_IMPORT_001`. Used by export-json, paste, write-ops, and core. |
| `reportPendingBlockProfileViolations` | Emits `PEN_PROFILE_002` only. Called by the import reporter; core re-exports it. |
| `normalizePlanRecord`, `normalizePlanSteps` | Coerce unknown plan payloads. Covered by this package's tests; no production caller. |
| `PendingBlock`, `ImportOptions` | Pending-block and import shapes. `ImportOptions` is re-exported from `@input/pen-types`. |
| `PendingBlockImportPolicyViolation`, `PendingBlockProfilePolicyViolation` | Diagnostic shapes. |
| `DocumentWriteFormat`, `DocumentWriteBlockInput`, `BuildDocumentWriteOpsOptions`, `BuildDocumentWriteOpsResult` | Write-ops option/result types. |
| `StructuredTargetDescriptor` and members (`StructuredTargetKind`, `TargetEditability`, `BlockTargetDescriptor`, `TableTargetDescriptor`) | Structured-target types. Used by document-ops. Kind/editability const arrays are not exported. |
| `PlanRecord` | `Record<string, unknown>` returned by `normalizePlanRecord`. |

### `buildDocumentWriteOps` options

| Field | Default |
| --- | --- |
| `format` | `"blocks"` when `blocks` is non-empty, otherwise `"text"` |
| `content` | `""` (empty content returns empty blocks and ops) |
| `blocks` | `[]` when `format` is `"blocks"` |
| `position` | passed through to `blocksToOps` (`"last"` if omitted) |
| `surface` | `"write-content:${format}"` |

## Usage

```ts
import { parseMarkdownToBlocks, blocksToOps } from "@input/pen-content-ops";

const blocks = parseMarkdownToBlocks("# Hello", { schema: editor.schema });
editor.apply(blocksToOps(blocks, { position: "last" }), { origin: "import" });
```

Hosts that import markdown or write documents should use `@input/pen-import-markdown` or `@input/pen-document-ops` instead of calling this package directly.

## License

See `LICENSE.md`.
