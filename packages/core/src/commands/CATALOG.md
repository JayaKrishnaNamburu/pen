# Built-in command catalog (Wave 4.2 inventory)

Frozen names from `spec-v2/05-commands.md`. Inventory only: no handlers, no `caret.ts` / `text.ts` / `structure.ts` / `table.ts` / `history.ts` / `defaultKeymap.ts`. The 4.1 registry (`define.ts`, `registry.ts`) is unwired to this list.

Owner:

- **field-editor** — v1 behavior lives in `packages/rendering/dom/src/field-editor/` (`commands*.ts`, `keyHandling.ts`, `keyHandlingInlineAtoms.ts`, `keyBindingShortcuts.ts`).
- **not-yet-moved** — no field-editor command to move; handler still to be written (or lives outside that source list).

Intended core modules (not created this step): `caret.ts`, `text.ts`, `structure.ts`, `table.ts`, `history.ts`, `defaultKeymap.ts`.

Related inventories (not this file): `@input/pen-shortcuts` `KEYMAP-INVENTORY.md` (4.3 / 4.4 key → name). `textSegmentation.ts` already landed (LOC4/HOST4); Wave 5 reuses it.

## Caret (`caret.ts`)

Param `{ extend: boolean }` unless noted.

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| `pen.caretLeft` | `{ extend }` | field-editor | `moveCaretAcrossBlocks` (`previous`) + `selectInlineAtomWithArrowKey` (`ArrowLeft`). Within-block grapheme step is still native. |
| `pen.caretRight` | `{ extend }` | field-editor | `moveCaretAcrossBlocks` (`next`) + `selectInlineAtomWithArrowKey` (`ArrowRight`). Within-block grapheme step is still native. |
| `pen.caretUp` | `{ extend }` | field-editor | `keyHandling.ts` `ArrowUp` → `moveCaretAcrossBlocks` (`previous`). Block-boundary only. G5 `verticalCaretTarget` is not wired. |
| `pen.caretDown` | `{ extend }` | field-editor | `keyHandling.ts` `ArrowDown` → `moveCaretAcrossBlocks` (`next`). Same note as `pen.caretUp`. |
| `pen.caretLineStart` | `{ extend }` | not-yet-moved | — |
| `pen.caretLineEnd` | `{ extend }` | not-yet-moved | — |
| `pen.caretBlockStart` | `{ extend }` | not-yet-moved | — |
| `pen.caretBlockEnd` | `{ extend }` | not-yet-moved | — |
| `pen.caretDocStart` | `{ extend }` | not-yet-moved | — |
| `pen.caretDocEnd` | `{ extend }` | not-yet-moved | — |
| `pen.caretWordLeft` | `{ extend }` | not-yet-moved | — |
| `pen.caretWordRight` | `{ extend }` | not-yet-moved | — |
| `pen.selectAll` | `void` | field-editor | `handleSelectAllShortcut` → `fieldEditor.selectAll` / `SelectAllController`. Fallback: `getDocumentTextRange`. |
| `pen.selectBlock` | `{ blockId }` | field-editor | No named export. Outcome of `moveCaretAcrossBlocks` / `applyBackspaceBehavior` (`selectBlock: true`) then `editor.selectBlock`. |

## Text (`text.ts`)

| Command | Param | Owner | Current name |
| --- | --- | --- | --- |
| `pen.insertText` | `{ text }` | field-editor | `insertTextAtRange`. Typing path: `DIRECT_HANDLERS.insertText` → `applyInlineTextEdit` / `replaceSelection`. |
| `pen.deleteBackward` | `{ granularity }` | field-editor | `applyDeleteBehavior` (`backward`) → `applyBackspaceBehavior` / `resolveBackspaceAction`. Alias: `mergeBackwardAtBlockStart`. |
| `pen.deleteForward` | `{ granularity }` | field-editor | `applyDeleteBehavior` (`forward`). After the inline-atom case this often returns `null` (within-block forward still native). |
| `pen.insertLineBreak` | `void` | field-editor | `DIRECT_HANDLERS.insertLineBreak` (`applyInlineTextEdit` `"\n"`). Code-mode Enter: `applyEnterBehavior` → `insertTextAtRange`. |
| `pen.splitBlock` | `void` | field-editor | `applyEnterBehavior` / `resolveEnterAction` → `splitBlockAtOffset` (also convert / lift). |
| `pen.indent` | `void` | field-editor | `applyListTabBehavior` (`shiftKey: false`). |
| `pen.outdent` | `void` | field-editor | `applyListTabBehavior` (`shiftKey: true`). |
| `pen.toggleMark` | `{ mark; value? }` | field-editor | `toggleInlineMark` (re-exports `@input/pen-shortcuts`). `DIRECT_HANDLERS` `formatBold` / `formatItalic` / `formatUnderline`. |
| `pen.convertBlock` | `{ blockId; newType; newProps? }` | field-editor | `convertBlock` / `getConvertBlockOps`. Also used by Enter / Backspace convert actions. |

## Structure (`structure.ts`)

| Command | Owner | Current name |
| --- | --- | --- |
| `pen.moveBlockUp` | not-yet-moved | — |
| `pen.moveBlockDown` | not-yet-moved | — |
| `pen.duplicateBlock` | not-yet-moved | — |
| `pen.deleteBlock` | not-yet-moved | — |

Block-selection delete today is `handleDeleteSelectionShortcut` in `utils/documentShortcuts.ts` (outside the 4.2 source list), not a named `pen.deleteBlock`. `applyBackspaceBehavior` can emit a `delete-block` op as part of `pen.deleteBackward`.

## Table (`table.ts`)

| Command | Owner | Current name |
| --- | --- | --- |
| `table.cellNext` | field-editor | `keyHandling.ts` Tab on `activeCellCoord` → `activateCell` (next col / wrap). |
| `table.cellPrev` | field-editor | `keyHandling.ts` Shift-Tab on `activeCellCoord` → `activateCell` (prev col / wrap). |
| `table.cellDown` | field-editor | `keyHandling.ts` Enter on `activeCellCoord` → `activateCell` (next row). |
| `table.escapeGrid` | not-yet-moved | — |

Cell-selection arrows and Escape cell→block live in `utils/tableCellNavigation.ts` and `utils/escapeSelection.ts` (not in the 4.2 source list).

## History (`history.ts`)

| Command | Owner | Current name |
| --- | --- | --- |
| `history.undo` | field-editor | `handleHistoryShortcut` / `isUndoShortcut` / `tryHandleHistoryOverrideBinding` → `editor.undoManager.undo()`. Also `DIRECT_HANDLERS.historyUndo`. |
| `history.redo` | field-editor | `handleHistoryShortcut` / `isRedoShortcut` → `editor.undoManager.redo()`. Also `DIRECT_HANDLERS.historyRedo`. |

## Counts

| Owner | Names |
| --- | --- |
| field-editor | 20 |
| not-yet-moved | 13 |
| **total (frozen)** | **33** |

## Field-editor names that are not catalog commands

From `commands*.ts` / `keyHandling*.ts` / `keyBindingShortcuts.ts`: `applyListInputRule`, `setInlineMark`, `normalizeInlineOffset`, `getConvertBlockOps`, `resolveBackspaceAction`, `resolveEnterAction`, `handleFieldEditorKeyDown`, `handleEditorKeyBindings`, `collectKeyBindings`, `matchesKey`, `matchesBindingContext`, plus `commandsShared.ts` helpers. Do not invent catalog names for these.

`handleBlockSelectionArrow` / `handleBlockSelectionEnter` / `handleDeleteSelectionShortcut` (`utils/documentShortcuts.ts`) fold into caret / split / delete when those handlers move; they are not extra commands.
