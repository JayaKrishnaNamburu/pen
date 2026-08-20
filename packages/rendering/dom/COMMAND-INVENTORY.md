# @input/pen-dom — Wave 4.2 command move inventory

Inventory for spec-v2 Wave 4 step 4.2 (built-in catalog). Not a code move. Wave 3/4 gates are not closed. Do not relocate handlers into `core/src/commands/` here (4.2 implementers consume this table).

Current functions: `src/field-editor/commands.ts` (barrel), `commandsBlock.ts`, `commandsDelete.ts`, `commandsEnter.ts`, `commandsNavigation.ts`, `commandsShared.ts`, `keyHandling.ts`, `keyHandlingInlineAtoms.ts`, `keyBindingShortcuts.ts`.
Future names: `spec-v2/05-commands.md` catalog (`caret.ts`, `text.ts`, `structure.ts`, `table.ts`, `history.ts`).

## Current function → future command

| Current function | Source | Future command | Notes |
| --- | --- | --- | --- |
| `toggleInlineMark` | `commandsBlock.ts` | `pen.toggleMark` | Re-export of `@input/pen-shortcuts`. Catalog moves the handler into core. Param `{ mark }`. Callers also pass `"strikethrough"` from beforeinput. |
| `setInlineMark` | `commandsBlock.ts` | unmapped | Force set/clear. Catalog has toggle only (`value?` on `pen.toggleMark` is not set-semantics). |
| `insertTextAtRange` | `commandsBlock.ts` | `pen.insertText` | Replace/insert in one apply. Code-mode Enter uses this with `"\n"`. |
| `splitBlockAtOffset` | `commandsBlock.ts` | `pen.splitBlock` | Split primitive used by `applyEnterBehavior`. |
| `convertBlock` | `commandsBlock.ts` | `pen.convertBlock` | Also used by empty-list / container backspace and Enter. |
| `getConvertBlockOps` | `commandsBlock.ts` | `pen.convertBlock` | Ops builder. Spec: wrap the op with schema validation. |
| `applyListInputRule` | `commandsBlock.ts` | unmapped | `origin: "input-rule"`. Not in the catalog. Callers: EditContext + contenteditable insert paths. |
| `applyDeleteBehavior` | `commandsDelete.ts` | `pen.deleteBackward` / `pen.deleteForward` | No `granularity` today. Word/line and the F2 grapheme fix land on these. Forward at block end is `null` (browser). |
| `applyBackspaceBehavior` | `commandsDelete.ts` | `pen.deleteBackward` | Boundary merge / convert / `selectBlock` / delete-empty. |
| `mergeBackwardAtBlockStart` | `commandsDelete.ts` | `pen.deleteBackward` | Alias of `applyBackspaceBehavior`. |
| `resolveBackspaceAction` | `commandsDelete.ts` | `pen.deleteBackward` | Decision helper; folds into the same handler. |
| `applyEnterBehavior` | `commandsEnter.ts` | `pen.splitBlock` | Wave names this move. Branches: split, convert, lift (`liftBlockOutOfParent`), code-mode `insertTextAtRange("\n")`. |
| `resolveEnterAction` | `commandsEnter.ts` | `pen.splitBlock` | Decision helper; folds into the same handler. |
| `applyListTabBehavior` | `commandsNavigation.ts` | `pen.indent` / `pen.outdent` | `shiftKey` chooses outdent. List items only. |
| `moveCaretAcrossBlocks` | `commandsNavigation.ts` | `pen.caretLeft` / `pen.caretRight` | T4 / boundary entry. ArrowUp/Down also call this today; those become `pen.caretUp` / `pen.caretDown` via `measureNow`. |
| `selectInlineAtomWithArrowKey` | `keyHandlingInlineAtoms.ts` | `pen.caretLeft` / `pen.caretRight` | N1 atom cases. `extend` is the private `extendInlineAtomSelectionWithArrowKey`. |
| `handleSelectAllShortcut` | `keyHandling.ts` | `pen.selectAll` | Delegates to `fieldEditor.selectAll` (T1 ladder) or `getDocumentTextRange`. |
| `handleHistoryShortcut` | `keyHandling.ts` | `history.undo` / `history.redo` | After `tryHandleHistoryOverrideBinding`. |
| `handleFieldEditorKeyDown` (cell Tab) | `keyHandling.ts` | `table.cellNext` / `table.cellPrev` | Inline Tab/Shift-Tab when `activeCellCoord` is set. Not a named function. |
| `handleFieldEditorKeyDown` (cell Enter) | `keyHandling.ts` | `table.cellDown` | Inline Enter when `activeCellCoord` is set. Not a named function. |

Unmapped count: **2** (`setInlineMark`, `applyListInputRule`).

`commands.ts` is a barrel only (no own functions). Host-replaced mark keys stay `pen.toggleMark` (not extra rows).

## Helpers that fold (not command rows)

`commandsShared.ts` (and the offset re-exports on the barrel) stay helpers: `getLogicalInlineLength`, `normalizeInlineOffset`, `normalizeInlineRange`, `getSelectionTarget`, `isCollapsedRange`, `isBlockEmpty`, `getAdjacentEditableBlock`, `getInlineNodeSelectionTarget`, `getListIndent`, `isListBlock`. Wave 4.5 splits this file between core command modules and the offset seam.

Private folds: `liftBlockOutOfParent` → `pen.splitBlock`; `extendInlineAtomSelectionWithArrowKey` → `pen.caretLeft` / `pen.caretRight` (`extend: true`); `getDocumentTextRange` → `pen.selectAll`.

## Catalog with no current function

These catalog names have no function in the 4.2 source list:

| Future command | Notes |
| --- | --- |
| `pen.caretUp` / `pen.caretDown` | Geometry via `verticalCaretTarget` + `measureNow`. Current ArrowUp/Down only reuse `moveCaretAcrossBlocks`. |
| `pen.caretLineStart` / `pen.caretLineEnd` | No current function. |
| `pen.caretBlockStart` / `pen.caretBlockEnd` | No current function. |
| `pen.caretDocStart` / `pen.caretDocEnd` | No current function. |
| `pen.caretWordLeft` / `pen.caretWordRight` | No current function. Word delete in beforeinput uses `nextWordBoundary` / `previousWordBoundary` in `contenteditableDirectHandlers.ts` (out of this file list). |
| `pen.selectBlock` | Outcome flag on delete/caret targets (`editor.selectBlock`). No dedicated function. |
| `pen.insertLineBreak` | No current function. beforeinput `insertLineBreak` writes `"\n"` via `applyInlineTextEdit` (4.4). |
| `pen.moveBlockUp` / `pen.moveBlockDown` | No current function. |
| `pen.duplicateBlock` | No current function. |
| `pen.deleteBlock` | `delete-block` op inside `applyBackspaceBehavior` only. |
| `table.escapeGrid` | No current function. Cell arrows return `false` (browser). |

## Keymap leftovers (4.3 / K3)

Not 4.2 catalog rows. `handleFieldEditorKeyDown` and `handleEditorKeyBindings` are dispatchers. `keyBindingShortcuts.ts` (`collectKeyBindings`, `matchesBindingContext`, `matchesKey`, `isUndoShortcut`, `isRedoShortcut`, `isSelectAllShortcut`, `tryHandleHistoryOverrideBinding`) is deleted or rewritten in 4.3 (K3).

Tab in `handleFieldEditorKeyDown` also accepts inline completion / requests autocomplete when list indent does not apply. Those are extension hooks, not catalog commands.

## Step 4.4 (beforeinput)

This inventory does not rewrite beforeinput. Current `DIRECT_HANDLERS` already call 4.2 functions:

| inputType | Current function | Future command |
| --- | --- | --- |
| `insertText` / `insertReplacementText` | `applyListInputRule` then `applyInlineTextEdit` | `pen.insertText` (list rule stays unmapped) |
| `insertParagraph` | `applyEnterBehavior` | `pen.splitBlock` |
| `insertLineBreak` | `applyInlineTextEdit("\n")` | `pen.insertLineBreak` |
| `deleteContentBackward` / `deleteContentForward` | `applyDeleteBehavior` | `pen.deleteBackward` / `pen.deleteForward` grapheme |
| `deleteWordBackward` / `deleteWordForward` | word-boundary text edit (not `applyDeleteBehavior`) | same commands, word |
| `formatBold` / `formatItalic` / `formatUnderline` / `formatStrikeThrough` | `toggleInlineMark` | `pen.toggleMark` |
| `historyUndo` / `historyRedo` | `editor.undoManager` | `history.undo` / `history.redo` |

## Conversion status

- Behavior still lives in pen-dom field-editor modules. Core has `defineCommand` / `createCommandRegistry` only (4.1). No `caret.ts` / `text.ts` / `structure.ts` / `table.ts` / `history.ts` handlers yet.
- Unmapped count: 2 (`setInlineMark`, `applyListInputRule`).
- `toggleInlineMark` still delegates to `@input/pen-shortcuts`; 4.2 moves that handler to `pen.toggleMark`.
- Keymap / K3 deletions and beforeinput map are 4.3 / 4.4.
- File deletions listed in wave 4.5 wait until handlers exist in core.
