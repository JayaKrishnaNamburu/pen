# Built-in command catalog (Wave 4.2)

Frozen names from `spec-v2/05-commands.md`. Step 4.2 moved caret (except verticals), text, structure, table, and history handlers into this directory. `installEditorCommandRegistry` wires `createCommandRegistry` + `builtinCommandHandlers` onto `createEditor`.

Field-editor keydown (`handleFieldEditorKeyDown`) and beforeinput (`DIRECT_HANDLERS`, expanded backend) now dispatch those handlers through `getCommandRegistry(editor).dispatch`. Local `apply*` / `moveCaretAcrossBlocks` functions remain as compatibility exports and no-registry fallbacks; they are not the live path for cataloged commands except `pen.caretUp` / `pen.caretDown` (still a miss; ArrowUp/Down fall back to `moveCaretAcrossBlocks` at block edges).

Owner:

- **core** — headless handler registered at `default` precedence in `caret.ts`, `text.ts`, `structure.ts`, `table.ts`, or `history.ts`.
- **field-editor** — a named handler for this command still lives in `packages/rendering/dom/src/field-editor/` (not moved this slice).
- **not-yet-moved** — token exists; no registered handler in core or field-editor.

Keymap: `defaultKeymap.ts` is the K2 platform table, including bindings for the two unmoved vertical caret commands. `resolveDirectedBinding` is the K1 / M2 rtl swap (arrow + word only; table stays logical). Unbound by default: `pen.caretBlockStart`, `pen.caretBlockEnd` (callers dispatch them; no key). `pen.convertBlock`, the four structure commands, and `table.escapeGrid` are also unbound.

Related inventories (not this file): `@input/pen-shortcuts` `KEYMAP-INVENTORY.md` (4.3 / 4.4 key → name). `textSegmentation.ts` is the shared Segmenter module.

## Caret (`caret.ts`)

Param `{ extend: boolean }` unless noted.

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| `pen.caretLeft` | `{ extend }` | core | `handleGraphemeCaret` (`-1`) + atom-adjacent select. T4 at block boundary. |
| `pen.caretRight` | `{ extend }` | core | `handleGraphemeCaret` (`1`) + atom-adjacent select. T4 at block boundary. |
| `pen.caretUp` | `{ extend }` | not-yet-moved | Token + keymap only. No registered handler. `dispatch` returns `false` (silent miss, no diagnostic). Field-editor ArrowUp still calls `moveCaretAcrossBlocks` on a parallel path, not this command. Geometry seam (`measureNow` / `GeometryReader`) is still missing. |
| `pen.caretDown` | `{ extend }` | not-yet-moved | Same as `pen.caretUp`. |
| `pen.caretLineStart` | `{ extend }` | core | Block offset 0. M3 visual line-box edges need `GeometryReader` (pen-dom); not inverted for rtl. |
| `pen.caretLineEnd` | `{ extend }` | core | Block logical length. Same M3 deferral. |
| `pen.caretBlockStart` | `{ extend }` | core | Offset 0 of the focus block. |
| `pen.caretBlockEnd` | `{ extend }` | core | Logical length of the focus block. |
| `pen.caretDocStart` | `{ extend }` | core | First normal position in document order. |
| `pen.caretDocEnd` | `{ extend }` | core | Last normal position in document order. |
| `pen.caretWordLeft` | `{ extend }` | core | `previousWordBoundary` via `textSegmentation.ts`. |
| `pen.caretWordRight` | `{ extend }` | core | `nextWordBoundary` via `textSegmentation.ts`. |
| `pen.selectAll` | `void` | core | T1 via `escalateSelectAll`. |
| `pen.selectBlock` | `{ blockId }` | core | BlockSelection of the named block. |

## Text (`text.ts`)

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| `pen.insertText` | `{ text }` | core | Replace the current text selection / insert at caret. |
| `pen.deleteBackward` | `{ granularity }` | core | Grapheme/word/line within the block (F2); merge/select/convert at block start. |
| `pen.deleteForward` | `{ granularity }` | core | Symmetric to backward, including merge at block end. |
| `pen.insertLineBreak` | `void` | core | Insert `"\n"`. |
| `pen.splitBlock` | `void` | core | Port of `applyEnterBehavior`: split, list continuation, empty-list convert, heading → paragraph. |
| `pen.indent` | `void` | core | Port of `applyListTabBehavior` (`shiftKey: false`). |
| `pen.outdent` | `void` | core | Port of `applyListTabBehavior` (`shiftKey: true`). |
| `pen.toggleMark` | `{ mark; value? }` | core | `format-text` over a range. Collapsed caret is a miss (no pending-mark host). |
| `pen.convertBlock` | `{ blockId; newType; newProps? }` | core | `convert-block` plus parentId restore; unknown types emit `invalid-block-type`. |

## Structure (`structure.ts`)

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| `pen.moveBlockUp` | `{ blockId? }` | core | `move-block` before the previous same-parent sibling. First sibling is a miss, not an error. |
| `pen.moveBlockDown` | `{ blockId? }` | core | `move-block` after the next same-parent sibling. Last sibling is a miss. |
| `pen.duplicateBlock` | `{ blockId? }` | core | Insert a copy after the original with a new id; selection lands on the copy. |
| `pen.deleteBlock` | `{ blockId? }` | core | `delete-block` on the target. The last remaining block is replaced by an empty paragraph. |

Block-selection delete is also handled by `pen.deleteBackward` / `pen.deleteForward` when the selection is a BlockSelection.

## Table (`table.ts`)

| Command | Owner | Current name |
| --- | --- | --- |
| `table.cellNext` | core | Port of field-editor Tab: linear cell step, clamp at last cell. Named in `defaultKeymap.ts` (`context: "cell"`). |
| `table.cellPrev` | core | Port of field-editor Shift-Tab: reverse linear step, clamp at first cell. |
| `table.cellDown` | core | Port of field-editor Enter: next row, same column, clamp at last row. |
| `table.escapeGrid` | core | Leave cell selection for the next visible block (else previous; else BlockSelection of the table). Unbound. |

## History (`history.ts`)

| Command | Owner | Current name |
| --- | --- | --- |
| `history.undo` | core | Dispatches to the `undo.manager` facet / `editor.undoManager`. Named in `defaultKeymap.ts`. |
| `history.redo` | core | Same, `redo`. |

## Counts

| Owner | Names |
| --- | --- |
| core | 31 |
| field-editor | 0 |
| not-yet-moved | 2 |
| **total (frozen)** | **33** |

Moved this slice: 4 structure + 4 table + 2 history = 10. Deferred: `pen.caretUp` / `pen.caretDown` — tokens and keymap rows only; registry `dispatch` is a silent miss. Field-editor ArrowUp/Down still call `moveCaretAcrossBlocks` (mapped to left/right boundary crossing, not these names).

## Field-editor names that are not catalog commands

From `commands*.ts` / `keyHandling*.ts` / `keyBindingShortcuts.ts`: `applyListInputRule`, `setInlineMark`, `normalizeInlineOffset`, `getConvertBlockOps`, `resolveBackspaceAction`, `resolveEnterAction`, `handleFieldEditorKeyDown`, `handleEditorKeyBindings`, `collectKeyBindings`, `matchesKey`, `matchesBindingContext`, plus `commandsShared.ts` helpers. Do not invent catalog names for these.

`handleBlockSelectionArrow` / `handleBlockSelectionEnter` / `handleDeleteSelectionShortcut` (`utils/documentShortcuts.ts`) fold into caret / split / delete when those handlers move; they are not extra commands.
