# Host adoption guide (first publish)

This is the first-publish contract, not an upgrade guide. Pen has never cut a release: no git tags, no changelog files, nothing on a registry. Every publishable package is still `0.0.1`. Versioning is a single **0.x** train and the first published release is numbered **0.3** (`spec/rules/api.md` API7). Under that convention a breaking change takes the **minor** position, so there is no deprecation period and none is required. Nothing publishes to npm until the owner explicitly says so. There is no prior published version to migrate from. If you assembled from this repository, treat the sections below as the host-facing surface you are adopting — not as a diff from a version you could have installed.

Adapters named below (`change` / `documentCommit`, `getSlot` / `setSlot`, v1 `keyBindings`) are transitional scaffolding in the current tree, not a promised compatibility window.

Status: nothing has been published and there is no release date. The sections are organised by what a host will observe rather than by how the work was sequenced. Deleted package names, exports, and file paths also have their own headings at the bottom, so a compile error greps. Every package name, export, and repo path here is meant to resolve; if a sentence cannot be checked against source, it is marked **provisional** or **not yet shipped**.

Do these first, in this order:

1. Pass `preset: defaultPreset()` from `@input/pen-preset-default`. Bare `createEditor()` installs no schema and no extensions. Undo and Mod-B / Mod-I fail silently.
2. Install `yjs@^13.6` (and `y-protocols`) next to `@input/pen-crdt-yjs`.
3. Move relocated helpers to `@input/pen-core` (sample below).
4. Delete any `virtualize` / `_virtualize` prop. Window yourself using `packages/rendering/react/VIRTUALIZATION.md`.
5. If you ship AI tools, pass `allowedMutatingTools` and install an egress filter. Default is deny.
6. Convert host `keyBindings` arrays to `keymapFacet` providers when you next touch that file. Do not wait for `Editor.dispatch`.
7. Read selection predicates through helpers. `TextSelection` is a record (`anchor` / `focus` / optional `affinity` / `goalX`). `isCollapsed`, `isMultiBlock`, `blockRange`, and `toRange()` are gone from the live type — see Computed selection fields.

Corrected 2026-08-25: the computed selection fields are gone and the helpers listed under Computed selection fields replace them. Item 7 above is the current position.

---

## Undo and shortcuts silently do nothing

**Symptom:** Mod-Z does nothing. Mod-B / Mod-I / Mod-U do nothing. `editor.undoManager.canUndo()` is `false`. Nothing throws.

**Cause:** Bare `createEditor()` and `createEditor({ schema })` from `@input/pen-core` register no schema (unless you pass one) and no extensions. There is no core fallback that installs document-ops, undo, rich-text-shortcuts, or delta-stream. `@input/pen-core` depends on no extension package.

`createHeadlessEditor({ useDefaultExtensions: true })` is also a no-op — the flag installs nothing. That is intentional. React and Vue `useEditor` still inject `defaultSchema` from `@input/pen-schema-default` and still do not install a preset, so they have the same dead-shortcut and dead-undo fallout.

This landed with zero failing tests. A host that assumed undo existed without registering it will not notice either.

**Fix:** pass `preset: defaultPreset()` from `@input/pen-preset-default`. That assembler registers the default schema plus document-ops, undo, rich-text-shortcuts, and delta-stream.

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});
```

Composing by hand: add `undoExtension()` from `@input/pen-undo` and `richTextShortcutsExtension()` from `@input/pen-shortcuts` to `extensions`, and pass `schema: createDefaultSchema()` from `@input/pen-schema-default` (or you get `createEmptySchema()` from `@input/pen-core` — an empty passthrough registry, not the default blocks).

---

## AI extension throws on create

**Symptom:** `createEditor({ extensions: [aiExtension()] })` throws `Extension "ai" depends on "delta-stream", which is not registered` and/or the same for `document-ops`.

**Cause:** Core does not ship delta-stream (or document-ops, or undo). `aiExtension` from `@input/pen-ai` declares hard dependencies on `document-ops`, `delta-stream`, and `undo`. The extension manager enforces them.

**Fix:** `preset: defaultPreset()` from `@input/pen-preset-default`, or register `deltaStreamExtension()` through the `stream` subpath of `@input/pen-ai`, `documentOpsExtension()` from `@input/pen-document-ops`, and `undoExtension()` from `@input/pen-undo` next to `aiExtension()`.

---

## "Read-only" still accepts typing and `editor.apply`

**Symptom:** You set `pen.ariaReadOnly` and the surface looks read-only to AT, but keystrokes still land and `editor.apply` still writes.

**Cause:** Two different knobs, and they are not unified. This is an open owner decision — neither side is the resolved design.

- The `ariaReadOnlyFacet` (`pen.ariaReadOnly`) from `@input/pen-core` only feeds `aria-readonly` on the editor root (vanilla `mountEditor`, React `EditorRoot`, Vue `PenEditor`). It does not decline typing, does not stop `editor.apply`, and does not stop the wire.
- The `readonly` prop on `mountEditor` from `@input/pen-dom`, React `EditorRoot`, and Vue `PenEditor` is what declines local typing (pointer activation, gestures, transfer). Mount, React, and Vue pass only that prop. It also does not stop `editor.apply`.

**Fix:** if you need the surface to refuse input, pass the `readonly` prop. If you need the document to refuse writes, do not call `editor.apply` (or filter it yourself). Do not treat `editor.facet(ariaReadOnlyFacet)` as an apply gate.

---

## Vanilla mount and click-to-edit

**Symptom:** A vanilla host has no documented mount entry, or a click on an empty document / block padding does not focus a field editor.

**Cause / fix:** `mountEditor` from `@input/pen-dom` is the vanilla mount entry point (`mountEditor(editor, root, options?)`). It binds the field editor, document tree, key handling, and pointer activation, and returns `{ fieldEditor, root, destroy }`.

Pointer activation is block-level: a click anywhere in a text-capable block activates that block's field editor, including on an empty document (host-chrome fallback to the first or last text block). The `readonly` option on `mountEditor` skips that activation.

---

## Structured origins and undo

**Symptom:** `{ type: "user", groupId, requestId }` misses the local undo stack, or `origin === "user"` compiles and never matches.

**Cause:** Origins are structured objects, not strings. `Y.UndoManager` tracking matches on the `.type` discriminant, so a host passing `{ type: "user", groupId, requestId }` is captured. Default tracked types are `user` and `ai`. Collaborator and migration origins are **not** undoable locally.

`event.origin` on `commit` is always structured (`{ type: "user" }`, never the string `"user"`). Branch on `origin.type` or `getOpOriginType` from `@input/pen-core`. A string `=== "history"` check never matches — undo/redo commits use `getOpOriginType(origin) === "history"`.

Remote updates arrive as `{ type: "collaborator" }`. A local transaction with no origin is `{ type: "system", source: "absent" }`. **There is no `"unknown"` origin type** — the union is `user | ai | ai-session | suggestion-resolution | collaborator | extension | history | input-rule | app | import | system | migration`, and an unrecognized local tag becomes `{ type: "system", source }`. Do not test for the strings `"collaborator"` or `"unknown"` as if they were `OpOriginType` string tags on `event.origin` itself — `collaborator` is the `.type` discriminant of a structured origin; `"unknown"` does not exist.

`runMigrations` from `@input/pen-core` stamps origin `"migration"` and stays out of the default undo stack.

---

## Key bindings: convert arrays when you next touch the file

**Symptom:** nothing is broken today. v1 `Extension.keyBindings` still fires. New host bindings should not add another array.

**Cause:** `keymapFacet` from `@input/pen-core` is the contribution channel. Core still wraps each v1 array entry as a `keymapFacet` provider, once, not twice. `@input/pen-shortcuts` `richTextShortcutsExtension()` already contributes through `keymapFacet`. If Mod-B is dead, that is the bare-`createEditor()` fallout above, not a keymap-API change.

**Provisional — do not migrate to this yet.** The command-registry surface (`Editor.dispatch` / `canDispatch`, handler override via `pen.commands`) is being rewritten. `Editor` has no `dispatch` or `canDispatch` today. Do not document, polyfill, or depend on `editor.dispatch("pen.splitBlock")`. Convert arrays to `keymapFacet` providers only. Key handlers still return `boolean` and mutate through `editor.apply`.

```ts
import { createEditor, defineExtension, keymapFacet } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const hostSave = defineExtension({
  name: "host-save",
  facets: [keymapFacet.of([{ key: "Mod-s", handler: () => true }], "high")],
});

const editor = createEditor({
  preset: defaultPreset(),
  extensions: [hostSave],
});
```

`keymapFacet.of` takes a `KeyBinding[]` and an optional `Precedence` (`highest` | `high` | `default` | `low` | `lowest`). A `"highest"` provider for `Mod-x` runs before a v1 `keyBindings` entry for the same key.

---

## Selection types: declared fields are unwritten; helpers are not shipped

**Symptom:** types mention `affinity`, `goalX`, and `BlockSelection.head`. A host that branches on them will take the wrong path.

`Affinity` and `SelectionOrigin` are declared in `packages/types/src/types/selection.ts`. `TextSelection` carries optional `affinity` and `goalX`. `BlockSelection` carries optional `head`. Those names reach the published `.d.ts`.

They are **declared and never populated by the v1 selection manager**. `editor.getSelection()` on a text caret returns `affinity: undefined` and `goalX: undefined`. A block selection's `head` is `undefined`. A host reading "affinity is available" and finding it always undefined is the failure this section exists to prevent. Do not branch on those fields. The type comment that readers "default to downstream" is a future convention, not a value the live manager persists.

Commit snapshots fill `affinity: "downstream"` and `goalX: null` when they build a `SelectionRecord`. That is a snapshot default, not the live `SelectionState`. Command write payloads omit the fields the same way the manager does.

`Editor.setSelection(selection)` takes a `SelectionState` only. There is no origin argument. `SelectionOrigin` (`pointer` / `keyboard` / `ime` / `programmatic` / `mapped` / `restore` / `gc`) is the tag a forthcoming `SelectionAuthority.set(state, { origin })` will require. That method is not on `Editor` today. Host programmatic writes stay `editor.setSelection(next)`. Do not pass a second argument; `gc` is reserved for the authority's own repair writes and will be rejected from callers when `set` ships.

**Shipped — computed properties are gone.** `TextSelection` is a record. Read predicates through helpers from `@input/pen-core` (field → helper table under Computed selection fields). Write with `editor.setSelection(next)` or `createTextSelection({ anchor, focus })`. Do not read `selection.isCollapsed`.

---

## Import paths, yjs peer, empty schema

**Symptom:** helpers you imported from `@input/pen-types` are gone; a second copy of `yjs` throws; `createEditor()` has no paragraph schema.

**Fix:**

1. Teach `@input/pen-preset-default` first (see undo section). Without `preset` and without `schema`, `createEditor()` uses `createEmptySchema()` from `@input/pen-core`.
2. Install `yjs@^13.6` (and `y-protocols`) next to `@input/pen-crdt-yjs`. They are `peerDependencies`, not bundled. A host `Y.Doc` that is not `instanceof` the adapter's `Doc` throws, naming duplicate-yjs / the dedupe fix.
3. Update imports:

```ts
import {
  createEmptySchema,
  defineBlock,
  defineExtension,
  getOpOriginType,
  interpolateMessage,
  mergeSchemas,
  prop,
  resolveMessage,
  SchemaRegistryImpl,
} from "@input/pen-core";
import { PenDocumentUnreadableError } from "@input/pen-crdt-yjs";
import { generateId } from "@input/pen-types";
```

Creation APIs (`defineBlock`, `defineExtension`, `prop`, `SchemaRegistryImpl`, `mergeSchemas`), `interpolateMessage` / `resolveMessage`, `getOpOriginType`, and `runMigrations` export from `@input/pen-core`. `PenDocumentUnreadableError` and `readFormatStamp` export from `@input/pen-crdt-yjs`. `generateId` still exports from `@input/pen-types`. `BlockHandle.as("table")` exists — table methods live on `TableBlockHandle`, not the universal handle.

Published `.d.ts` strips `/** @internal */` exports. Use `editor.openTextStream` instead of the removed writer factory. Do not import `toZod`.

---

## `virtualize` is gone

**Symptom:** TypeScript rejects `virtualize` / `_virtualize` on React `EditorContent` / `PenEditor`. Large documents you used to window through that prop now render in full.

**Cause:** The prop is gone from `@input/pen-react`. Vue never had it. Tree grep under the React package is empty except `packages/rendering/react/VIRTUALIZATION.md`.

**Fix:**

1. Stop passing the prop.
2. If you window blocks yourself, follow `packages/rendering/react/VIRTUALIZATION.md`: unmount is allowed, remount is a no-op, `selection-target-unmounted` is a future diagnostic.
3. Read the published envelope — grades only (`verified` / `measured` / `untested-above`), not a number to copy — in `packages/tooling/test/ENVELOPE.md`. Headless ladder only; no renderer suite at those sizes. Treat that table as the source of truth.

---

## Documents: format stamp, unknown blocks, live `validateProps`

**Symptom:** unstamped fixtures still load; unknown block types survive load instead of disappearing; props you thought were decorative now clamp.

**Format stamp.** New documents write `metadata.penFormat` (`PEN_DOCUMENT_FORMAT` is `3`, `minReader: 1`). `readFormatStamp` exports from `@input/pen-crdt-yjs`. Absent stamp is `{ format: 1, minReader: 1, writer: "unknown" }`. Stamp `< 3` loads run the empty-block sentinel strip (see the sentinel section). Do not write reserved keys `penFormat`, `documentProfile`, or `penMigrations` (`RESERVED_METADATA_KEYS` from `@input/pen-types`).

**Load.** `adapter.loadDocument` is `ok` or `repaired` (`getDocumentLoadReport`). Wrong-typed shared types throw `PenDocumentUnreadableError` from `@input/pen-crdt-yjs` (sanctioned exception — do not swallow into a diagnostic). `document-size` diagnostic on load (and a bounded cadence), not per keystroke.

**Migrations.** `runMigrations` exports from `@input/pen-core`. Applied ids land in `metadata.penMigrations`. Origin is `"migration"` and stays out of the default undo stack.

**Unknown-block policy is passthrough, not drop.** Default schema uses `onUnknownBlock: () => "passthrough"`. Stored unknown types, props, and marks survive load / normalize / encode. React `DefaultRenderer` from `@input/pen-react` and Vue `PenBlock` from `@input/pen-vue` show stored unknown blocks (`data-unknown-block`); selectable, not editable. `editor.apply` still refuses inserting a type absent from `allBlocks()` (`PEN_APPLY_002`).

**`validateProps` was kept, not deleted, and it is now live.** It runs on `insert-block` and `update-block` at apply, on clipboard ingest, and on JSON import, coercing, clamping, or falling back with a `prop-invalid` diagnostic. If you wrote a `validateProps` hook when it was inert, it now rewrites values on every apply. If you never wrote one but your schema declares `prop.number().min(...)` / `.max(...)` or an enum, those bounds now clamp where they previously passed through. Undeclared props are still preserved.

---

## AI tools default-deny; egress is required

**Symptom:** mutating tools come back `{ ok: false, status: "blocked", reason: "tool-not-allowed" }` with no throw and no toast. A host filter you thought was advisory for autocomplete now actually refuses the request.

**Cause:** `aiExtension` from `@input/pen-ai` defaults `allowedMutatingTools` to `[]`. `createAIToolTurn` on the `tools` subpath of `@input/pen-ai` default-denies mutating tools unless that list includes them. An unrecognized tool name defaults to mutating. Hosts that assumed default-allow will see every mutating tool blocked.

The `pen.aiEgress` facet is defined once, in `@input/pen-core`, and re-exported by `@input/pen-ai`. Every AI feature routes through it. A refusing filter means no adapter call; features complete rather than throwing.

```ts
import { aiEgressExtension, createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { aiExtension } from "@input/pen-ai";

const editor = createEditor({
  preset: defaultPreset(),
  extensions: [
    aiExtension({
      allowedMutatingTools: ["insert_block", "delete_block", "write_document"],
    }),
    aiEgressExtension((context) => {
      if (context.feature === "autocomplete") {
        return null;
      }
      return context;
    }),
  ],
});
```

`AIRequestContext` / `AIRequestFilter` exist in `@input/pen-types`. Classify custom tools with `mutating` / `destructive` on the `ToolDefinition`, or list them. Optional `confirm` for destructive tools (absent resolver → allow + `ai-tool-unconfirmed`). Defaults: 20 calls / turn, 32 ops / call, 128 ops / turn.

`packages/docs/src/pages/AI.tsx` is a features overview — it does not mention egress, redaction, or refusal. Until that page is written, this section and the `@input/pen-ai` README are the host-facing description of the boundary.

---

## Document changes: subscribe to `commit`

**Symptom:** `editor.on("change")` / `on("documentCommit")` still fire but warn; observe handlers that read `event.ops` no longer type-check.

Subscribe with `editor.on("commit", (event) => { ... })`. `CommitEvent` is on the types barrel. Read `event.summary` and `event.origin.requestId` / `groupId`. There is no `event.ops` / `event.affectedBlocks` on `CommitEvent` — use `event.summary` or `affectedBlockIdsFromSummary` from `@input/pen-core`. `change` / `documentCommit` keep the v1 payload and emit `diagnostic { code: "event-deprecated" }` once per session. `selectionChange` is unchanged. Remote / observer-originated adapter events have `ops: []`.

`Extension.observe` receives `CommitEvent[]`, not `CRDTEvent[]`. Read `event.summary`. Adapter-level `observe` on a CRDT document is a different method and still speaks CRDT events.

`editor.openTextStream(target, options)` is the host stream API (`append` / `splice` / `position` / `flush` / `close` / `abort`).

---

## URL policy, search, a11y, clipboard

**URL policy.** The policy lives in `@input/pen-core` (`urlPolicy`, `UrlContext`, `UrlPolicy`), next to `urlPolicyFacet`. `@input/pen-dom` re-exports those three and exports `urlPolicyExtension`. Hosts that need custom schemes add `urlPolicyExtension()` from `@input/pen-dom`. Inert URLs omit `src` and set `data-pen-blocked-url=""`. Clipboard HTML and `export-html` / `export-xml` admit href/src through `resolve()` before emitting markup.

**Search.** `@input/pen-search` defaults `regex: false`; query cap 1,024; invalid pattern diagnoses instead of throwing. A ReDoS-class query returns matches-so-far plus `search-budget-exceeded`.

**A11y.** `createEditor({ a11yLabel })` feeds `pen.a11yLabel`. Missing label diagnoses `a11y-missing-label` once when a surface binds, then falls back to `pen.editor.label`. React `EditorRoot` and Vue `PenEditor` ship `role="textbox"`, `aria-multiline="true"`, the resolved surface label, and `aria-readonly` from the `readonly` prop or `pen.ariaReadOnly`. Override `pen.messages` for i18n, including `pen.a11y.*`. Focus-sink / announcer helpers exist under `@input/pen-dom` source and are not re-exported.

**Clipboard and assets.** Pen clipboard JSON is `PenClipboardPayload` with `version` (`PEN_CLIPBOARD_PAYLOAD_VERSION` from `@input/pen-types`). Unknown-version payloads fall back to HTML (or plain text) with a diagnostic. Asset upload honors `maxSize` and `onProgress`; oversize and provider failure diagnose. `AssetProvider.delete` is host-implemented — Pen never calls it. HTML, Markdown, and JSON import report one `IngestReport` (`droppedByReason`). Export fidelity tables exist for HTML, Markdown, JSON, and XML next to the merged interop exporters. JSON export → import is lossless over the durability corpus except unknown-type insert (`PEN_APPLY_002`).

---

## Localization, IDs, SSR, styling

`createEditor({ locale, messages })` feeds `pen.locale` / `pen.messages`. Keys are `pen.<area>.<name>`. Host `messages` overrides win over extension catalogs and the default catalog. Props that defaulted to English placeholders are kept; the omitted-prop default now comes from the catalog (`emptyPlaceholder` → `pen.schema.document.emptyPlaceholder`; slash / search / AI prompt placeholders → `pen.slash.input.placeholder`, `pen.search.input.placeholder`, `pen.search.replace.placeholder`, `pen.ai.prompt.placeholder`, `pen.ai.commandMenu.placeholder`). Schema `display.title` / `description` / `group` / `placeholder` accept a key or a literal.

Word motion uses `Intl.Segmenter`; unspaced scripts now stop at real word boundaries, not `/\s/` runs. Matching uses `foldAndNormalize`, not `toLowerCase()`.

Library IDs go through `generateId` from `@input/pen-types`. `createEditor()` does not throw on non-secure origins.

`@input/pen-react` entry points carry `"use client"`: `@input/pen-react`, `@input/pen-react/ai`, `@input/pen-react/ai-suggestions`, `@input/pen-react/history`, `@input/pen-react/multiplayer`, `@input/pen-react/search`. SSR is shell-only (`packages/rendering/react/README.md`) — indexed HTML comes from the host's own interop HTML export pass, not from the React tree. Styling references: `packages/rendering/react/STYLING.md` and `packages/rendering/vue/STYLING.md`. Pen ships no required stylesheet.

**Not yet shipped.** Quickstarts and example apps covering SSR and styling are not written. Until they are, the two `STYLING.md` files and the React README are the host-facing description.

Published packages declare `engines.node: >=22`. Browser floor in the root README: Chromium 93 / Firefox 92 / Safari 15.4.

---

## Facets (current)

`defineFacet` / `createFacetRegistry` export from `@input/pen-core`. `editor.facet(facet)` and `editor.whenReady()` are on `Editor`. `Extension.facets?` is the only contribution channel.

`getSlot` / `setSlot` are deleted. Production writes still use `internals.assignSlot` (string key → facet override). Read with `editor.facet(...)`. The slot-key → facet table is under The three v1 adapters and their police.

A headless probe shows `assignSlot("paste:importers", …)` and `editor.facet(clipboardFacet)` are identical in all three reachable states: never assigned both read `[]`, after `assignSlot(key, importers)` both read the importer object itself (`assignSlot` replaces the facet value rather than appending to the list combine), and after the teardown write `assignSlot(key, undefined)` both read `undefined`.

Replace lifecycle-slot waits with `await editor.whenReady()`. Do not add new `*_SLOT` / `*_SLOT_KEY` constants.

---

## Collaboration and history (still true)

`@input/pen-history` blame uses a host `ResolveHistoryAuthor` (`clientId` → author). Without a resolver, output is an opaque client handle, not a presence name. Attribution will not show names until you pass that resolver.

`@input/pen-transport-sse` is single-process, non-resumable, and development-oriented. `GET` / `Last-Event-ID` is `405`, not resume. Do not ship it as a sync backend.

Collaboration boundary copy: `packages/crdt/yjs/COLLABORATION.md`. Convergence and origin labeling are Pen’s; auth, persistence, permissions, presence-payload policy, and schema agreement are the host’s.

Concurrent A-under-B / B-under-A (and `parentId` cycles) are broken in normalize: the parent edge owned by the lexicographically lowest block id is cleared, with a `parent-cycle` diagnostic.

---

## 0.3 `DocumentOp` rewrite (30 → 10)

This is the one-time rewrite table for 0.3, not a supported host API for the deleted names. Nothing has published; the ten primitives are the contract from 0.3 onward. Do not keep emitting the v2 names.

| v2 op                                                                                                                                              | v3                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `insert-text`, `delete-text`, `replace-text`                                                                                                       | `splice-text` (`from` / `to` / `insert`)                                                                                                   |
| `insert-inline-node`, `remove-inline-node`                                                                                                         | `splice-text` (atom `InlineInsert` / atom-range delete)                                                                                    |
| `insert-table-cell-text`, `delete-table-cell-text`                                                                                                 | `splice-text` with `cell`                                                                                                                  |
| `format-text`, `format-table-cell-text`                                                                                                            | `format-text` (± `cell`; `from` / `to`)                                                                                                    |
| `insert-block`, `delete-block`, `move-block`                                                                                                       | unchanged                                                                                                                                  |
| `update-block`                                                                                                                                     | `set-props`                                                                                                                                |
| `convert-block`                                                                                                                                    | `set-props` with `"type"`                                                                                                                  |
| `update-layout`                                                                                                                                    | `set-props` (`layout` replacement; command merges first)                                                                                   |
| `update-table-columns`                                                                                                                             | `set-props` (`columns` replacement)                                                                                                        |
| `set-meta`                                                                                                                                         | unchanged                                                                                                                                  |
| six table grid ops (`insert-table-row`, `delete-table-row`, `insert-table-column`, `delete-table-column`, `merge-table-cells`, `split-table-cell`) | `grid` (`change.kind`)                                                                                                                     |
| `create-app`, `update-app`, `delete-app`                                                                                                           | `app` (`change.kind`)                                                                                                                      |
| `split-block`                                                                                                                                      | command recipe (`pen.splitBlock`): `insert-block` + splice delete + splice insert, plus `tagStructuralOrigin` in the same transaction      |
| `merge-blocks`                                                                                                                                     | command recipe from `pen.deleteBackward` / `pen.deleteForward`: splice append + `delete-block`, plus the merge tag in the same transaction |
| `set-selection`                                                                                                                                    | deleted; command `{ selection }` results / `authority.set`                                                                                 |
| `stream-open`                                                                                                                                      | unchanged                                                                                                                                  |

Apply codes whose meaning existed only for a deleted variant retire with that variant; surviving `PEN_APPLY_*` codes keep their meaning. `origin.intent` already names the dispatched command (`pen.splitBlock`, `pen.deleteBackward`, `pen.deleteForward`) — do not invent a `pen.mergeBlocks` command.

The recipes below are a one-time rewrite. There is no compatibility layer and no dual-form `apply` (`spec/rules/api.md` API7). The retired names were never published.

### `insert-text` / `delete-text` / `replace-text`

```text
{ type: "insert-text",  blockId, offset, text, marks? }
{ type: "delete-text",  blockId, offset, length }
{ type: "replace-text", blockId, offset, length, text, marks? }
→
{ type: "splice-text", blockId, from, to, insert, marks? }
```

`insert-text`: `from = to = offset`, `insert = text`. `delete-text`: `from = offset`, `to = offset + length`, `insert = ""`. `replace-text`: `from = offset`, `to = offset + length`, `insert = text`.

### `insert-inline-node` / `remove-inline-node`

```text
{ type: "insert-inline-node", blockId, offset, nodeType, props }
{ type: "remove-inline-node", blockId, offset }
→
{ type: "splice-text", blockId, from: offset, to: offset, insert: { nodeType, props } }
{ type: "splice-text", blockId, from: offset, to: offset + 1, insert: "" }
```

### `insert-table-cell-text` / `delete-table-cell-text`

Same splice as text, plus `cell: { row, col }`.

### `format-text` / `format-table-cell-text`

v2 `offset` / `length` become `from` / `to`. The cell variant adds `cell`. The `type` discriminant stays `format-text`.

### `update-block` / `convert-block` / `update-layout` / `update-table-columns`

```text
{ type: "update-block", blockId, props }
→ { type: "set-props", blockId, props }

{ type: "convert-block", blockId, newType, newProps? }
→ { type: "set-props", blockId, props: { type: newType, ...newProps } }

{ type: "update-layout", blockId, layout }
→ { type: "set-props", blockId, props: { layout } }   // command merges first, then replaces

{ type: "update-table-columns", blockId, columns }
→ { type: "set-props", blockId, props: { columns } } // command emits the full replacement
```

### `insert-table-row` / `delete-table-row` / `insert-table-column` / `delete-table-column` / `merge-table-cells` / `split-table-cell`

```text
{ type: "insert-table-row", blockId, index }     → { type: "grid", blockId, change: { kind: "insert-row", index } }
{ type: "delete-table-row", blockId, index }     → { type: "grid", blockId, change: { kind: "delete-row", index } }
{ type: "insert-table-column", blockId, index }  → { type: "grid", blockId, change: { kind: "insert-column", index } }
{ type: "delete-table-column", blockId, index }  → { type: "grid", blockId, change: { kind: "delete-column", index } }
{ type: "merge-table-cells", blockId, anchor, head }
  → { type: "grid", blockId, change: { kind: "merge-cells", anchor, head } }
{ type: "split-table-cell", blockId, row, col }
  → { type: "grid", blockId, change: { kind: "split-cell", row, col } }
```

### `create-app` / `update-app` / `delete-app`

```text
{ type: "create-app", appId, appType, config, placement }
  → { type: "app", change: { kind: "create", appId, appType, config, placement } }
{ type: "update-app", appId, patch }
  → { type: "app", change: { kind: "update", appId, patch } }
{ type: "delete-app", appId }
  → { type: "app", change: { kind: "delete", appId } }
```

### `split-block`

No successor op. `pen.splitBlock` at `{ blockId, offset }` emits one apply: `insert-block` (after the source) + `splice-text` deleting `[offset, length)` from the source + `splice-text` inserting the moved content at offset 0 of the new block. Stamp `origin.intent: "pen.splitBlock"` and write `tagStructuralOrigin` on `txn.meta` in that same transaction so the summary carries `block-split`.

### `merge-blocks`

No successor op and no `pen.mergeBlocks` command. `pen.deleteBackward` / `pen.deleteForward` at a block boundary emit `splice-text` appending source content onto the target + `delete-block` source. Intent is the delete command that was dispatched. The merge tag on `txn.meta` is what the summary reads.

### `set-selection`

No successor op. Selection is not a document effect.

```text
editor.apply([{ type: "set-selection", selection }])
→
// command handler result
{ selection: next }

// host programmatic write (today)
editor.setSelection(next)
```

`CommandResult` accepts `{ selection: SelectionState }`. A forthcoming `authority.set(state, { origin })` is **not yet shipped** — keep writing `editor.setSelection`. There is no apply-time selection op.

### `insert-block` / `delete-block` / `move-block` / `set-meta` / `stream-open`

Unchanged discriminants. Do not rewrite these.

### Twenty v2 op interfaces and their union members

The twenty retired `DocumentOp` interfaces are the v2 rows in the table above that do not survive as the same `type` discriminant. Their union members are gone from `@input/pen-types`. Emit the v3 primitive in that row. `split-block` / `merge-blocks` / `set-selection` have no successor op — command recipe or selection result, not a compatibility alias.

### deleted-op validator/executor branches

Core's validate phase and executors no longer have a case per deleted v2 op. There is no host-facing replacement: one validator and one executor per remaining primitive. A host `switch` on `op.type` that still names `insert-text` / `convert-block` / `split-block` (and the rest of the table) does not compile. Re-key it to the ten primitives; for split/merge identity read `origin.intent`, not the op shape.

### Retired `PEN_APPLY_*` codes

Surviving apply codes (same meaning as v2): `PEN_APPLY_002` (unknown / unregistered block type), `PEN_APPLY_003`, `PEN_APPLY_004` (malformed op), `PEN_APPLY_005`, `PEN_APPLY_007`, `PEN_APPLY_008`, `PEN_APPLY_009` (proto keys). A code whose meaning existed only for a deleted variant retires with that variant. There is no enumerated list of retired code numbers beyond that rule — a host matching on a code that is no longer emitted should treat the op as dropped and follow the rewrite table. `PEN_APPLY_001` and `PEN_APPLY_006` are not in the live pipeline.

### op-shape sniffing in suggest-mode

`@input/pen-ai` `suggestMode` no longer switch-cases `insert-text` / `delete-text` / `replace-text` / `convert-block` / `split-block` to recover intent from shape. Interception matches primitives plus `origin.intent`. A split is one apply with `intent: "pen.splitBlock"` (usually on the `insert-block` of the recipe). A conversion is `set-props` with `"type"` in `props`. Host copies of the old switch should do the same; do not reconstruct `"split-block"` from a primitive sequence.

---

## Deleted names (0.3 look-up)

The sections above are organised by symptom. This index is organised by the name that went away. Nothing here was ever published; there is no deprecation window. Each heading is the grep target.

---

## `packages/extensions/multiplayer/src/presence/mapRemoteSelection.ts` is deleted

**What it was:** per-frame remap of a remote peer's selection through local `ChangeSummary` mapping.

**Replacement:** peers publish serialized anchors; receivers resolve per flush as `provenance: "wire"` (`followUndoneDeletions: false`). A `null` resolution hides the caret until the next awareness frame. The file and its test are gone; there is no dual-form fallback.

**Before / after:** stop calling a local `mapRemoteSelection`. Publish `editor.anchors.serialize(...)` on the wire; on receive, `deserialize` then `resolve`. Hostile / oversize / cross-doc payloads diagnose and hide the caret. They do not throw.

---

## Every per-consumer mapping loop named in the sub-steps

**What it was:** each of those consumers (autocomplete continuation, stream write head, undo cursor restore, suggestions, multiplayer awareness) remapped positions through `mapPoint` / `mapRange` / `mapOffset` / `summaryLog.between` on every commit.

**Replacement:** mint an anchor (or `AnchorRange`) when the position becomes interesting; resolve it when you need the current point. Undo keeps its stack-item selection snapshots and adds local-provenance drift anchors (`followUndoneDeletions: true`). Decorations stay derived-tier: they may call `mapOffsetThroughSplices` inside one summary and must not mint anchors.

**Before / after:** delete the per-commit mapping loop. One mint at request / capture time; resolve at response / restore / flush. Do not re-mint on ordinary commits (AN4).

---

## `mapping.ts`

**What it was:** the `ChangeSummary` mapping algebra (`mapOffset` / `mapPoint` / `mapRange` / `compose`) and its factory.

**Replacement:** single-commit derived shifts use `mapOffsetThroughSplices` from `@input/pen-core`. Positions that must survive more than one commit use the editor anchors API (`EditorAnchors` on `@input/pen-types`). See CS4 in `spec/rules/api.md`.
The file is deleted.
Its `createChangeSummary` factory folded into the internal summary builder and is not a public export.

---

## `spliceCompose.ts`

**What it was:** multi-summary splice compose (`mergeSplices` lived here).

**Replacement:** none as a host API. `mergeSplices` folded into the internal summary builder for adjacent splices inside one commit. Cross-commit compose is gone; use anchors.

---

## `structuralCompose.ts`

**What it was:** compose over structural summary entries.

**Replacement:** none. Structural compose died with the mapping algebra. Split/merge geometry for a single local commit is on the summary as `block-split` / `blocks-merged` (AN14). Across commits, use anchors.

---

## `summaryLog.ts`

**What it was:** the summary ring buffer and `summaryLog.between`.

**Replacement:** none. A `CommitEvent` carries its summary; flushes carry batched `CommitEvent[]`. Nothing retains summaries. Undo and multiplayer were the last `between` callers; both now use anchors.

**Before / after:** `summaryLog.between(a, b).mapPoint(...)` → mint an anchor at `a` and resolve it at `b`.

---

## `core/src/changes/types.ts`

**What it was:** a local duplicate of the change-summary types, which had drifted from core's union by omitting `block-split` and `blocks-merged`.

**Replacement:** the file is now a re-export shim from `@input/pen-types` (`Assoc`, `BlockTextChange`, `ChangeSummary`, `Point`, `StructuralChange`, `TextSplice`). Import those names from `@input/pen-types`, not from a core-internal types path.

---

## `block-converted`

**What it was:** a `StructuralChange` variant for block type changes.

**Replacement:** conversions emit `block-props-changed` with `"type"` in `keys` (OB1). If you needed _why_, read `origin.intent` on local commits (INT3). Remote commits never carried a trustworthy command name; treat them as effect-only. `block-split` and `blocks-merged` stay.

**Before / after:** `change.type === "block-converted"` → `change.type === "block-props-changed" && change.keys.includes("type")`.

---

## `PointMapMode`

**What it was:** the `mode?` argument on `ChangeSummary.mapOffset` / `mapPoint` / `mapRange` (`DefaultPointMapMode` went with it).

**Replacement:** none. `mapOffsetThroughSplices(splices, offset, assoc)` takes an `Assoc` (`-1` | `1`) only. There are no map modes.

---

## `map*` declarations on ChangeSummary

**What it was:** `ChangeSummary.mapOffset`, `mapPoint`, `mapRange`, and `compose` on `types/changes.ts`.

**Replacement:** `mapOffsetThroughSplices` from `@input/pen-core` for a single summary's splices. Durable positions: editor anchors. `PositionMapping.mapOffset` on decorations and the DOM helper `mapOffsetThroughRemoteDeltas` are different functions and stay.

**Before / after:** `summary.mapOffset(offset, assoc, mode)` → `mapOffsetThroughSplices(blockChange.splices, offset, assoc)`. `summary.mapPoint(point, mode)` → mint/resolve an anchor, or map the offset with that helper when you already have this commit's splices for that block.

---

## `types/changes.ts` mapping declarations

Same cut as `map*` and `PointMapMode`: the mapping methods and modes left `packages/types/src/types/changes.ts`. The file stays as the `ChangeSummary` / `TextSplice` / `StructuralChange` contract; `mapOffsetThroughSplices` has since moved to `@input/pen-core` (`spec/packages/core.md`).

---

## the retired property suites

**What it was:** `changeSummaries.properties.test.ts` and the conformance nightly mapping suites (I2/I3).

**Replacement:** the AN fuzz suite (`anchors.an-fuzz.test.ts`, nightly via the `*an-fuzz*` glob). Scale obligation transferred; the mapping property suites are gone. Hosts do not import these.

---

## `fromDocument.ts`

**What it was:** a deletion candidate if its only consumers were mapping paths.

**Replacement:** it was reviewed and **kept**. `createBlockIndexSnapshotFromDocument` still builds the shadow block index the summary builder reads. Not a public export. Hosts never imported this file; there is nothing to migrate.

---

## `logicalText.ts`

**What it was:** `@input/pen-types` `utils/logicalText.ts` — stored↔logical translation for the empty-block sentinel.

**Replacement:** none. Stored domain equals logical domain. Callers that wrapped text in `logicalTextFromStored` become identity on the stored string, or go away. Do not substitute another reserved character.

---

## `EMPTY_BLOCK_SENTINEL`

**What it was:** the exported U+200B constant used as the empty-block caret sentinel.

**Replacement:** none. Empty text-capable storage is `""`. The identifier is gone from production and from tests (EM4/EM8 name the character as a `\u200B` literal where they must). Do not import `EMPTY_BLOCK_SENTINEL`.

**Before / after:** `text === EMPTY_BLOCK_SENTINEL` / `length === 1` on an empty block → `text === ""` / `length === 0`. `textDeltas()` on empty is `[]`, not `[{ insert: "\u200B" }]`.

---

## `logicalTextFromStored`

**What it was:** the function that stripped the empty-block sentinel from stored text.

**Replacement:** none. Every caller was identity once storage is `""`. `textContent()` / `length()` already went through it; they now read stored text directly. The `types-runtime-allowlist.json` entry is gone. Do not import `logicalTextFromStored`.

---

## `INLINE_ATOM_CARET_BOUNDARY_TEXT`

**What it was:** a second U+200B alias used as the inline-atom caret-boundary text node.

**Replacement:** none as a character. The atom caret is a `<br>` or empty span, not a reserved code point. `INLINE_ATOM_REPLACEMENT_TEXT` (`\uFFFC`) is a different character with a different job — leave it. Do not import `INLINE_ATOM_CARET_BOUNDARY_TEXT`.

---

## `offsetDomain.ts` sentinel branch

**What it was:** exact-equality on the sentinel plus a clamp (`logicalLength` / `toDomOffset` / `toLogicalOffset`).

**Replacement:** the three clamp helpers remain (or are inlined). They are identity clamps: stored equals logical. Mark-span and inline-atom host resolution never lived in this file (`inlineAtomLogicalDom.ts` / `geometryReader.ts` / `selectionBridge.ts`). Do not keep a "logical↔DOM translation seam".

---

## `\u200B` empty-block sentinel

**What it was:** the reserved empty-block character hosts could observe on `data-offset`, field `textContent`, `extractTextFromDOM`, and `BlockHandle.textDeltas()`.

**Replacement:** empty blocks are genuinely empty. Host-visible: `data-offset="0"`, field `textContent` `""`, `extractTextFromDOM` `""`, `textDeltas()` `[]`. DOM placeholder is one `<br data-pen-empty="">` (never serialized). Embedded ZWSP in longer user text (`"keep\u200Bme"`) is unchanged. Stamp < 3 loads run `strip-empty-block-sentinels` (lone-sentinel form only, origin `"migration"`).

---

## summary seam-1 cancellation

**What it was:** summary-builder logic that cancelled a sentinel insert against a sentinel remove so empty-block churn stayed off the summary.

**Replacement:** none. With no sentinel there is nothing to cancel. The builder emits ordinary splices. Do not reintroduce a cancellation seam.

---

## `normalize.ts` sentinel insertion

**What it was:** `normalize` inserting U+200B into empty text-capable blocks.

**Replacement:** normalize leaves empty text as `""`. Repeated passes stay `""` (I10). New documents stamp format 3.

---

## the four core exact-equality filters

**What it was:** sentinel exact-equality in `applyBlockOps.ts`, `applyInlineAndMetaOps.ts`, `editorSelectionMutations.ts`, and `tableGridExecutor.ts`.

**Replacement:** none. Those filters are gone. Empty blocks are `""`; do not special-case a one-character buffer.

---

## every sentinel test expectation (EM4 / EM8 keep theirs)

**What it was:** product-contract tests that expected a lone U+200B in empty blocks, plus identifier uses of `EMPTY_BLOCK_SENTINEL`.

**Replacement:** rewrite those expectations against `""`. Keep (do not delete) EM4's lone-sentinel fixture, EM8's stamp-2 corpus, and the preservation / hostile-input fixtures (`"keep\u200Bme"`, SEC1, AIB3). A raw "zero `\u200B` in tests" rule is wrong.

---

## `types-runtime-allowlist.json`

**What it was:** the API3 leftover allowlist still named `logicalTextFromStored`.

**Replacement:** that entry is gone. The remaining leftovers are `generateId` and `formatUuidV4`. Hosts do not import this file.

---

## I11 two-seam wording in v2 specs

**What it was:** v2 I11 confined U+200B to two sanctioned seams (`spec/rules/selection.md`).

**Replacement:** I11 is retired. I14 is the rule: do not name the character in production except the temporary EM4 heal, which the release PR deletes. There is no sanctioned-seam end state. Read `spec/rules/empty-blocks.md`.

---

## pen-ai-autocomplete is `@input/pen-ai/autocomplete`

**What it was:** the autocomplete satellite package.

**Replacement:** SF1 folds it into the `autocomplete` subpath of `@input/pen-ai`. Manifest dependency becomes `@input/pen-ai`.

**Before / after:** point `autocompleteExtension` at `@input/pen-ai/autocomplete`. The codemod's `SOURCE_REWRITE` table is the closed mapping.

---

## pen-ai-skills is `@input/pen-ai/skills`

**What it was:** the skills satellite package.

**Replacement:** the `skills` subpath of `@input/pen-ai`. Same codemod. Manifest → `@input/pen-ai`.

**Before / after:** point `listDefaultAISkills` at `@input/pen-ai/skills`.

---

## pen-ai-suggestions is `@input/pen-ai/suggestions`

**What it was:** the suggestions satellite package.

**Replacement:** the `suggestions` subpath of `@input/pen-ai`. Same codemod. Manifest → `@input/pen-ai`. Suggest-mode interception already lives in `@input/pen-ai` (`suggestMode.ts`), not in a satellite.

**Before / after:** point `aiSuggestionsExtension` at `@input/pen-ai/suggestions`.

---

## pen-ai-tools is `@input/pen-ai/tools`

**What it was:** the tools satellite (`createAIToolTurn`, `listAITools`, default-deny).

**Replacement:** the `tools` subpath of `@input/pen-ai`. Same codemod. Manifest → `@input/pen-ai`. Egress stays the single core facet. Drop any self-dependency that would make `@input/pen-ai` depend on itself.

**Before / after:** point `createAIToolTurn` at `@input/pen-ai/tools`.

---

## pen-delta-stream is `@input/pen-ai/stream`

**What it was:** the delta-stream satellite (`deltaStreamExtension`).

**Replacement:** the `stream` subpath of `@input/pen-ai` (not a `delta-stream` subpath). Same codemod. Manifest → `@input/pen-ai`. `defaultPreset()` still registers the stream; only the specifier moves.

**Before / after:** point `deltaStreamExtension` at `@input/pen-ai/stream`.

---

## pen-export-html

**What it was:** HTML exporter (`htmlExporter`).

**Replacement:** SF2 folds the import/export family into one interop package. HTML import and export share the `html` format subpath. `@input/pen-markdown-serialization` survives and is not merged (`document-ops` still consumes it).

**Before / after:** point `htmlExporter` at the html format subpath the codemod writes.

---

## pen-export-json

**What it was:** JSON exporter (`jsonExporter`, `exportEditorToJson`) plus a versioned `PenDocumentJSON` importer, also named `jsonImporter`.

**Replacement:** `@input/pen-interop/json` (shared with the JSON importer). Same codemod.

**Before / after:** point `exportEditorToJson` and `jsonExporter` at `@input/pen-interop/json`.

Both this package and `pen-import-json` exported a `jsonImporter`, and only one of the two names survives the merge. A host that imported `jsonImporter` from `pen-export-json` must rename the binding: the codemod rewrites specifiers, not local identifiers, so this is the one interop case that still fails to compile after it runs.

```text
jsonImporter  (pen-export-json)  → jsonDocumentImporter  (parseJsonDocument, versioned PenDocumentJSON)
jsonImporter  (pen-import-json)  → jsonImporter          (ingest-bounds; keeps the name)
```

Both land on the same `json` format subpath.

---

## pen-export-markdown

**What it was:** Markdown exporter (`markdownExporter`).

**Replacement:** interop package, `markdown` format subpath (shared with the Markdown importer). Same codemod. This is not `@input/pen-markdown-serialization`.

**Before / after:** point `markdownExporter` at the markdown format subpath the codemod writes.

---

## pen-export-xml

**What it was:** XML exporter (`xmlExporter`).

**Replacement:** interop package, `xml` format subpath. Same codemod.

**Before / after:** point `xmlExporter` at the xml format subpath the codemod writes.

---

## pen-import-html

**What it was:** HTML importer (`htmlImporter`, `sanitizeHTML`).

**Replacement:** interop package, `html` format subpath (shared with the HTML exporter). Same codemod.

**Before / after:** point `htmlImporter` at the html format subpath the codemod writes.

---

## pen-import-json

**What it was:** JSON importer (`jsonImporter`, `parseJsonToBlocks` / `parseJsonWithReport`).

**Replacement:** `@input/pen-interop/json` (shared with the JSON exporter). Same codemod.

**Before / after:** point `jsonImporter` at `@input/pen-interop/json`. This importer keeps the name; the colliding one from `pen-export-json` is now `jsonDocumentImporter`.

---

## pen-import-markdown

**What it was:** Markdown importer (`markdownImporter`).

**Replacement:** interop package, `markdown` format subpath (shared with the Markdown exporter). Same codemod.

**Before / after:** point `markdownImporter` at the markdown format subpath the codemod writes.

---

## Deleted names (0.4 look-up)

The 0.3 index ends above. This index covers the scaffolding and internal-structure deletions that follow it. Headings are grep targets. Deletions that have not landed stay **not yet shipped** — do not treat a heading as proof the identifier is already gone.

---

## The three v1 adapters and their police

**Shipped.** `getSlot` / `setSlot`, v1 `change` / `documentCommit` emission, `v1ExtensionProviders`, `SLOT_DEPRECATED_CODE`, `EVENT_DEPRECATED_CODE`, and the `no-new-slots` gate are all deleted. `internals.assignSlot` is the sanctioned write path and stays. The slot-key constants in `@input/pen-types` stay — they are the assignSlot write contract, not the deleted adapter.

### Slot table

| Slot key                                  | Use instead                                                           |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `field-editor`                            | `fieldEditorHostFacet`                                                |
| `react:field-editor` / `vue:field-editor` | deleted; never had a runtime reader. Write `field-editor` only        |
| `core:collect-key-bindings`               | keymap collector (not a facet; host key bindings go on `keymapFacet`) |
| `core:await-extension-lifecycle`          | `editor.whenReady()`                                                  |
| `input-rules:engine`                      | `inputRulesEngineFacet`                                               |
| `undo:history-restore`                    | `undoRestoreControllerFacet`                                          |
| `undo:history-metadata-controller`        | `undoMetadataControllerFacet`                                         |
| `undo:manager`                            | `undoManagerFacet`                                                    |
| `ai:inline-completion`                    | `aiInlineCompletionFacet`                                             |
| `ai:controller`                           | `aiControllerFacet`                                                   |
| `ai:inline-history`                       | `aiInlineHistoryFacet`                                                |
| `ai:review`                               | `aiReviewControllerFacet`                                             |
| `ai-autocomplete:controller`              | `aiAutocompleteControllerFacet`                                       |
| `ai-suggestions:controller`               | `aiSuggestionsControllerFacet`                                        |
| `search:controller`                       | `searchControllerFacet`                                               |
| `multiplayer:controller`                  | `multiplayerControllerFacet`                                          |
| `history:controller`                      | `historyControllerFacet`                                              |
| `paste:importers`                         | `clipboardFacet`                                                      |
| `paste:assetProvider`                     | `assetProviderFacet`                                                  |
| `document-ops:toolRuntime`                | `documentOpsToolRuntimeFacet`                                         |
| `pen.locale`                              | `localeFacet`                                                         |
| `pen.messages`                            | `messagesFacet`                                                       |
| `pen.a11yLabel`                           | `a11yLabelFacet`                                                      |
| `core:engine`                             | `editor.internals.engine`                                             |
| `delta-stream:target`                     | `streamingTargetFacet`                                                |
| `pen.announcer`                           | `announcerFacet`                                                      |

Facet names above export from `@input/pen-core`. Production writes use `internals.assignSlot`; that path did **not** close with the adapter.

### Event table

| v1 event         | Use instead | Payload                                                               |
| ---------------- | ----------- | --------------------------------------------------------------------- |
| `change`         | `commit`    | `CommitEvent` — `event.summary`, `event.origin.requestId` / `groupId` |
| `documentCommit` | `commit`    | same                                                                  |

`onDocumentCommit` is deleted. There is no `event.ops` / `event.affectedBlocks` on `CommitEvent`. Use `event.summary` or `affectedBlockIdsFromSummary` from `@input/pen-core`. `selectionChange` is unchanged.

### Extension-field table

| v1 `Extension` field | Facet              |
| -------------------- | ------------------ |
| `keyBindings`        | `keymapFacet`      |
| `inputRules`         | `inputRulesFacet`  |
| `decorations`        | `decorationsFacet` |

Declare `facets: [keymapFacet.of(...), inputRulesFacet.of(...), decorationsFacet.of(...)]`. The v1 fields are gone from the `Extension` type. Block-schema `keyBindings` on `defineBlock` are a different feature and stay.

---

## Computed selection fields

Shipped 2026-08-25. `TextSelection` is a record. The four v1 computed fields are gone; constructors no longer stamp them.

| Field / method                       | Helper                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `selection.isCollapsed`              | `isCollapsed(sel)`                                                                                   |
| `selection.isMultiBlock`             | `isMultiBlock(sel)`                                                                                  |
| `selection.blockRange`               | `getSelectionBlockRange(doc, sel)` or `getSelectionBlockRange(editor.documentState.blockOrder, sel)` |
| `selection.toRange()`                | `selectionToRange(doc, sel)`                                                                         |
| `stampTextSelection(doc, input)`     | `createTextSelection(input)` — plain constructor; no `doc`, no stamped fields                        |
| `getTrustedSelectionBlockRange(sel)` | `getSelectionBlockRange(doc, sel)` — one helper; pass a `blockOrder` snapshot from renderers         |

```ts
import {
  createEditor,
  createTextSelection,
  getSelectionBlockRange,
  isCollapsed,
  isMultiBlock,
  selectionToRange,
} from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({ preset: defaultPreset() });
const anchor = { blockId: "block-1", offset: 0 };
const focus = { blockId: "block-1", offset: 3 };

const sel = createTextSelection({ anchor, focus });
if (isCollapsed(sel)) {
  /* caret */
}
if (isMultiBlock(sel)) {
  /* spans blocks */
}
const ids = getSelectionBlockRange(editor.documentState.blockOrder, sel);
const range = selectionToRange(editor.internals.doc, sel);
```

`isCollapsed` / `isMultiBlock` / `getSelectionBlockRange` / `selectionToRange` / `createTextSelection` export from `@input/pen-core`. Do not add replacements on `@input/pen-types` (API3).

`AISessionSelectionSnapshot.blockRange` / `isMultiBlock` are a different type and stay. Native `Selection.isCollapsed` / `Range.collapsed` are the DOM API and stay.

---

## `isProgrammaticDomTextSelection`

**Shipped.** This pen-dom flag is removed, along with the projection-controller helpers that existed only to compute it. The call sites were unreachable rather than a surviving decision, so nothing moved into `decideDomSelectionRead` and no replacement flag exists. The one real caller branched on the flag to decide whether to record user selection intent, and its skip side could not be reached — both contenteditable backends forward to the reader before that path, and the remaining production caller opens the pointer gesture window before it writes, which made the flag always `false`. Intent is now always recorded. Echo suppression on the sanctioned read path is owned by the snap and equivalent-stop rules, as `spec/rules/selection.md` specifies. Hosts never imported this name; there is no host replacement.

---

## the S4 waiver timer

**Not yet shipped.** The three S4 waivers (`contenteditableBackend.ts` / `scheduleActiveDOMMatchCheck`, react `inlineAtomSelectionInteraction.ts`, react `useSelectionToolbar.ts`) are resolved with a no-Pen-code browser probe, after which the timer and its allowlist `entries` are deleted. Hosts never imported these; there is no host replacement. An investigation that concludes a timer is required becomes an S4 spec amendment, not a renewed waiver.

---

## `clipboardSerialization.ts`

**Shipped.** The react clipboard serializer is removed.
`packages/rendering/react/src/utils/clipboardSerialization.ts` is deleted; it had zero importers and had drifted from the live implementation.
The one clipboard serializer is `packages/rendering/dom/src/utils/clipboardSerialization.ts`.
No host recipe — nothing consumed the react copy.

---

## `overlays/`

**Shipped.** Pen-dom's overlay helpers moved into the conformance harness.
`packages/rendering/dom/src/overlays/` is deleted and pen-dom's export map carries no overlay keys.
The harness owns them under `packages/tooling/conformance/suites/overlays/`.
Hosts that imported overlay helpers from `@input/pen-dom` stop; the shipped caret overlay stays the react O2 owner recorded in `spec/packages/rendering/dom.md`.

---

## `DecorationSet.map`

**Not yet shipped.** `DecorationSet.map` and `PositionMapping` are removed from `packages/types/src/types/decorations.ts`. Zero callers. Decorations that must survive commits already have the sanctioned mechanisms: per-block recompute off `affectedBlockIds`, or anchors for the durable few. Do not add a mapping-era replacement.

---

## `PositionMapping`

Same cut as `DecorationSet.map`. The mapping-era decoration contract goes; recompute or mint an anchor.

---

## core barrel migration exports

**Not yet shipped.** `isLoneEmptyBlockZwsp`, `createStripEmptyBlockZwspMigration`, and the `STRIP_*` constants come off the `@input/pen-core` barrel. The load path stays wired internally via the migrations module. Hosts never needed these; `runMigrations` from `@input/pen-core` remains the host API.

---

## content-ops shims

**Shipped.** The 1-line re-export modules in `@input/pen-content-ops` and the barrel passthroughs of the same names are deleted. Import those names from `@input/pen-core`. The package keeps its real code (`parseMarkdownToBlocks`, `splitPlainTextLineBlocks`, `buildDocumentWriteOps`, structured-target types).

| Deleted shim                  | Old import                                                                                            | New import                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `blocks.ts`                   | `import { blocksToOps, type PendingBlock } from "@input/pen-content-ops"`                             | `import { blocksToOps, type PendingBlock } from "@input/pen-core"`                             |
| `blocks.ts` (`ImportOptions`) | `import type { ImportOptions } from "@input/pen-content-ops"`                                         | `import type { ImportOptions } from "@input/pen-types"`                                        |
| `blockCapabilities.ts`        | `import { getFlowCapabilityFromSchema, shouldExposeBlockInTooling, … } from "@input/pen-content-ops"` | `import { getFlowCapabilityFromSchema, shouldExposeBlockInTooling, … } from "@input/pen-core"` |
| `profilePolicy.ts`            | `import { createImportResult, normalizePendingBlocksForImport, … } from "@input/pen-content-ops"`     | `import { createImportResult, normalizePendingBlocksForImport, … } from "@input/pen-core"`     |

---

## content-ops plan-record helpers

**Shipped.** `normalizePlanRecord`, `normalizePlanSteps`, and `PlanRecord` are deleted from `@input/pen-content-ops`. They coerced unknown JSON-plan payloads for the retired structured planner and had no production caller after that channel closed. There is no replacement — hosts that parsed assistant-text plans should use `edit_document` instead.

`packages/shared/content-ops/src/plan/planSchemas.ts` is deleted.

The structured-target types in `packages/shared/content-ops/src/plan/targets.ts` stay.

---

## Types runtime outliers

**Shipped, with one half withdrawn.** `mapOffsetThroughSplices` moved to `@input/pen-core`; import it from there. `DEFAULT_MESSAGE_CATALOG` and its dependent guard **stay on `@input/pen-types`** — the relocation was withdrawn because six non-core consumers (`@input/pen-ai`, three React primitives, and the docs) make the catalog a shared contract rather than a core internal. `generateId` stays on `@input/pen-types` (HOST4), and `types-runtime-allowlist.json` now holds only `generateId` and its private `formatUuidV4`.

| Name                      | Was                | Now                            |
| ------------------------- | ------------------ | ------------------------------ |
| `mapOffsetThroughSplices` | `@input/pen-types` | `@input/pen-core`              |
| `DEFAULT_MESSAGE_CATALOG` | `@input/pen-types` | `@input/pen-types` (unchanged) |
| `generateId`              | `@input/pen-types` | `@input/pen-types` (unchanged) |

---

## `.size-limit.json`

The orphan root file is gone. `size-limit.mjs` reads only `.size-limit.baseline.json`. Hosts never imported this file.

---

## 23 tracked artifact files

The 23 tracked Playwright artifacts under the conformance `test-results-n2*` directories left the index. Suffixed result dirs are gitignored. Hosts never imported these.

---

## `static-gates.yml`

`ch-gates` runs as a matrix row in `.github/workflows/static-gates.yml`. The `health-gates.mjs` wrapper is gone. Hosts never imported this file.

---

## `turbo.json`

The root `turbo.json` `lint` task is gone; every package answers `pnpm --filter … lint`. Hosts never imported this file.

---

## four one-shot scripts with aliases and references

The spent 0.3 one-shots (`migrate-changesets-v3.mjs`, `wave6-manual-work-inventory.mjs`, `record-wave0-baseline.mjs`, `sf3-package-list-check.mjs`) retire with their aliases. `migrate-imports-v3.mjs`, `gate-mutation.mjs`, `check-instruments.mjs`, `health-gates.mjs`, `console-inventory.mjs`, `engines-inventory.mjs`, `skip-hygiene.mjs`, `renderer-inventory.mjs`, `f22-dead-bindings.mjs`, `above-floor-api-allowlist.mjs`, `instrument-paths.mjs`, `pen-stream-request-no-editor.mjs`, `coverage-rules.mjs`, `no-pen-deep-imports.mjs`, `no-unscheduled-measure.mjs`, `no-bidi-override.mjs`, `no-json-stringify-signatures.mjs`, and `no-selection-state-properties.mjs` retire the same way: duplicates of lint or `ch-gates`, always-green inventories, meta-gates, spent one-shots, and greps that moved into `@input/pen-eslint-plugin`. `verdaccio-closure-check.mjs` stays. `v3-gates.mjs` and `wave-deletions-migration-check.mjs` were removed when the v5 train's wave files were deleted — both read a train's `waves/*.md` as their only input, so neither has a population to check without one. A future train reintroduces them. Hosts never imported any of these.

---

## The `any` seam types and forwarding wrappers

**Not yet shipped.** CS1 replaces `ApplyPipelineRuntime = any` / `EditorImplRuntime = any` with typed internal context interfaces and deletes the private forwarding wrappers. Public surface stays byte-identical. Hosts never named these types.

---

## `CRDTText`

**Not yet shipped.** CS1 collapses the local `CRDTText` interface copies into `crdtShapes.ts`. Not a public export. Hosts never imported this name.

---

## `shouldRestoreStale*`

**Not yet shipped.** CS5 folds the four `shouldRestoreStale*` helpers into the owned reader/projector decision path. Hosts never imported these.

---

## `sessionReconciler`

**Not yet shipped.** CS6 moves `sessionReconciler`'s rAF coalesce onto `DomScheduler` and retires its allowlist entry. Hosts never imported this module.

---

## react's hand-rolled sibling builds

**Not yet shipped.** CS8 replaces the react `test` script's hand-rolled sibling builds with the turbo dependency graph. Hosts never invoked this script.

---

## two redundant offsetDomain test files

**Not yet shipped.** CS10 collapses the `offsetDomain` test trio to one file. Hosts never imported these.

---

## per-format interop fixture copies (folded into the shared helper)

**Not yet shipped.** CS10 extracts one shared corpus helper in `@input/pen-test`. Hosts that copied per-format fixtures can point at that helper when it ships; there is no public API change.

---

## `AI_EDIT_CHANNELS` and `AIEditChannel`

**Shipped 2026-08-26.** UC1 leaves one AI edit channel, so there is nothing left to select between. Hosts that passed `editChannel` to `aiExtension` drop the option; the tool channel is the only behavior.

---

## `pen-fast-apply`

**Shipped 2026-08-26.** The XML edit contract is gone with UC1. A host system prompt that still instructs a model to emit `<pen-fast-apply>` produces no mutation and no error — the text is treated as text (UC2). Hosts that shipped their own prompt copy describing the XML block must delete that paragraph; the loop mounts `edit_document` and the model calls it.

---

## `MARKDOWN_FAST_APPLY_OMISSION_MARKER`

**Shipped 2026-08-26.** The channel-control token that the XML channel embedded in preview payloads. Hosts that stripped this marker from displayed text can delete that filter.

---

## `markdownPatchPlan.ts`, `markdownFastApply.ts`, and `markdownFastApplyMethods.ts`

**Shipped 2026-08-26.** The XML channel's patch planner, runtime, and controller method bag. Internal to `@input/pen-ai`; no host imported them.

---

## `AIPlannerMode` and `AI_PLANNER_MODES`

**Shipped 2026-08-26.** UC3 removes the planner-mode vocabulary with the text-parsed plan channel it selected. Both were exported from `@input/pen-ai`; a host that imported either has a compile error and no replacement to reach for, because there is no longer a second channel to name. `route.plannerMode` is also gone from the routing decision.

---

## `structuredPlanner`

**Shipped 2026-08-26.** The plan prompt, the plan parse, and the streamed plan preview. A model that emits a JSON plan into the assistant text stream now gets no mutation (UC2); block conversion and mark changes go through `set_block_props` and `format_text` on `edit_document`.

One capability is removed rather than replaced: previews of a partially-arrived plan. That preview re-parsed half-written JSON on every text delta, which a tool call cannot produce — a tool call arrives complete. Hosts that read `data-structured-preview-*` off the AI progress primitive to render an in-flight plan should render staged suggestions instead.

---

## `planValidation`

**Shipped 2026-08-26.** UC3 deletes the plan schema validator. Internal to `@input/pen-ai`; no host imported it.

---

## `planExecutor` and `planState`

**Shipped 2026-08-26.** The plan-to-ops compiler. Deleted rather than extracted: its consumers were gated on a `planState` no producer wrote. Internal to `@input/pen-ai`; no host imported them.

---

## `reviewArtifacts`, `StructuralReviewItem`, `StructuralReviewComparisonRow`, `acceptReviewItem(s)`, `rejectReviewItem(s)`, `reviewItems`, `reviewItemIds`, and `pendingReviewItemIds`

**Shipped 2026-08-26.** The structural-review-item surface. A plan was their only producer, so they became a second review presentation that could never be shown. Hosts that rendered review items or called `acceptReviewItem` / `rejectReviewItem` use the suggestion review surface instead (RS1–RS4).

---

## `AIApplyStrategy` and `AI_APPLY_STRATEGIES`

**Shipped 2026-08-26 (v5 wave 3, UC5).** The strategy vocabulary is gone. Durable edits arrive as `edit_document` tool calls (`editsArriveAsToolCalls` on the route); streaming generation is selected by `target` and `contentFormat`. Hosts that passed `applyStrategy` pass a mutation preference (`suggestions` | `direct`) instead.

---

## `ephemeral-preview`, `AI_BLOCK_CLASSES`, `app-structured`, `AI_TRANSPORT_KINDS`, and `"staged_review"`

**Shipped 2026-08-26 (v5 wave 3, UC5).** Four declared members no input produces, plus the two vocabularies that only named app-block routes. Hosts switching on these have a compile error; there is no replacement member.

---

## `getBlockRevision`

**Shipped 2026-08-26 (v5 wave 3, UC4).** The per-block revision counter left AI edit gating and tool payloads. Working-set view fingerprints are what a mutating tool consults. Hosts that echoed a revision from a tool payload read the fingerprint instead.

---

## `FastApplyDebugState` → `CommitDebugState`, `FastApplyFallbackMetrics` → `CommitFallbackMetrics`, `AISessionFastApplyMetrics` → `AISessionCommitMetrics`, `AIDebugLogFastApplyMetrics` → `AIDebugLogCommitMetrics`, `debug.fastApply` → `debug.commit`, `metrics.fastApply` → `metrics.commit`, `nativeFastApplyCount` → `selectionReplacementCount`, `native-fast-apply` → `selection-replacement`, `controller/fastApplySupportMethods.ts` → `markdownCommitMethods.ts`, and `ai-markdown-fast-apply` → `ai-markdown-commit`

**Shipped 2026-08-26 (v5 wave 3, UC5).** These carried the name of the XML channel deleted in wave 1. They are renamed, not removed — the behavior is unchanged. The new name is `commit`, which is what this codebase calls turning generated text into document ops.

| Before                                  | After                       |
| --------------------------------------- | --------------------------- |
| `FastApplyDebugState`                   | `CommitDebugState`          |
| `FastApplyFallbackMetrics`              | `CommitFallbackMetrics`     |
| `AISessionFastApplyMetrics`             | `AISessionCommitMetrics`    |
| `AIDebugLogFastApplyMetrics`            | `AIDebugLogCommitMetrics`   |
| `debug.fastApply`                       | `debug.commit`              |
| `metrics.fastApply`                     | `metrics.commit`            |
| `nativeFastApplyCount`                  | `selectionReplacementCount` |
| `native-fast-apply`                     | `selection-replacement`     |
| `controller/fastApplySupportMethods.ts` | `markdownCommitMethods.ts`  |
| `ai-markdown-fast-apply`                | `ai-markdown-commit`        |
| `ai-markdown-fast-apply-verify`         | `ai-markdown-commit-verify` |

A host filtering commit telemetry on the old surface strings sees no events rather than an error.

---

## `confidence`, `verificationFailureReason`, and `untouchedBlockMutationCount`

**Shipped 2026-08-26.** Writer-less fields on the commit debug state. The last two were the XML channel's diff-verification telemetry. No code wrote them, so a host reading them was reading `undefined`.

---

## `useAIStructuredPreview.ts`, `structuredTargetPreview.tsx`, and `utils/structuredPreview.ts`

**Shipped 2026-08-26.** With UC3's text-parsed plan door closed, this surface had no reachable producer, so RS1 deleted it rather than migrating it. Hosts that mounted `Pen.AI.StructuredTargetPreview` or called `useAIStructuredPreview` render staged suggestions through the review surface instead.

---

## `data-structured-preview-*` attributes

**Shipped 2026-08-26.** The progress attributes hosts could read off the structured-preview surface, removed with it. Hosts that styled or asserted on `data-structured-preview-count`, `-state`, or `-patch-count` should target the review surface's attributes.

---

## the selection-rewrite decoration stack

**Shipped 2026-08-26.** RS2 stages selection rewrites through the suggest-mode interceptor and renders them as review-surface suggestions. Hosts that styled the bespoke rewrite decoration classes restyle against the review class vocabulary that RS4 exports — `REVIEW_SURFACE_CLASSES` and `REVIEW_SURFACE_CUSTOM_PROPERTIES` from `@input/pen-types`, with the default rules available as `PEN_REVIEW_STYLESHEET` from `@input/pen-dom`. Those names are exported from exactly one place each: RS4 removed the duplicate re-exports that `@input/pen-dom` also carried, so a host importing the class constants from `@input/pen-dom` moves that import to `@input/pen-types`.

---

## the four unscheduled next-paint callbacks outside the scheduler

**Shipped 2026-08-26.** FE3 adjudicated each one. Two were selection retries in disguise — both placed the caret after `insert-block`, which the selection projection controller already does — and were dropped under the S4 fence. The other two were real next-paint work and moved onto the scheduler's own phases: the multi-click measurement to `scheduler.read`, the drag-preview coalescer to `scheduler.write`. Internal to `@input/pen-dom`; hosts observe only that selection settles without a frame's delay.

---

## the harness-fed typing-budget mode

**Shipped 2026-08-26.** FE4 put `DomScheduler.acceptCommit` on the production apply path, so the conformance scenario measures that path instead of a harness-fed one. The wiring lives in `FieldEditorImpl` rather than `mountEditor`, which is what makes it true for every host — the React and Vue bindings do not go through `mountEditor`, so a commit feed placed there fed the vanilla host only, and the React-based conformance harness recorded zero commits. The harness now reads the production `getRootGeometry(root)` instead of constructing its own scheduler, and the harness-fed mode is retired. Affects `@input/pen-conformance` consumers only. Measured cost of moving onto the production path: `readPhaseP95Ms` 3.4 → 3.2, i.e. none.

---

## undemonstrable capability matrix cells

**Shipped 2026-08-26, and nothing was deleted** — this heading's premise was wrong. There was no capability matrix to prune; HB1 created one, at `packages/docs/CAPABILITY-MATRIX.md`, checked by `scripts/check-capability-matrix.mjs` in CI. So a host does not see fewer claimed cells than before, because there were no claimed cells before.

What a host does get is a claim it can check: every `supported` cell names a test or example path that exercises the capability **on that surface**, and the checker fails if a named path does not exist. Two rule changes came out of writing it, both of which a host should know about. The vocabulary has four statuses, not three — `bring-your-own-ui` was added for capabilities that work through the core API but ship no binding-specific component, which is the honest description of much of what React and Vue expose and was previously forced into either `supported` or `not-supported`. And HB5's demand for a demo outside the playground was relaxed to a test-or-example path, because the demo-app reading of it was unmeetable and a binding test is stronger evidence than a demo nobody runs. Each binding README mirrors its own column.

---

## transport packages without a host integration test

**Shipped 2026-08-26. No package was deleted, and no host loses a dependency** — read this entry if you saw the earlier warning that you might.

Both transports produced the required host-driven test, so both stay. `hb6.hostIntegration.test.ts` in each package drives `PenTransport.stream` into `processStream`, which is the seam a host actually uses; the SSE package needed a new one, because its existing tests either mocked `fetch` with hand-written frames or called `createSSEHandler` without the transport.

The tiers are now stated, and they are lower than a host might assume. `@input/pen-transport-direct` is **experimental**: in-process only, no socket, no resume, `connected` is always `true` and `onConnectionChange` never fires. `@input/pen-transport-sse` is **reference**: it illustrates the protocol with a single-process in-memory handler, and `GET` with `Last-Event-ID` returns 405, so it is explicitly not resumable. Neither is production-supported. If you are running either one behind real traffic, that is the finding to act on.

Two caveats stated rather than hidden. Each README declares its tier twice, in two vocabularies, because HB6 (`reference | supported | experimental`) and the older COL6 docs gate (`reference | production | development-only`) demand different words for the same fact; that is a spec collision to resolve, not a design. And no application in the Pen repository imports either transport — the tests are their only in-tree consumers — so neither is exercised by a host-shaped app, only by a host-shaped test.
