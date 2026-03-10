# Wave: Grid Cell Selection & Type-Aware Editing

> Spec for upgrading Pen's shared grid-backed blocks from "click-to-type-in-a-cell"
> to a proper spreadsheet-like interaction model with cell-level selection,
> keyboard navigation, multi-cell operations, and column-type-aware editing.
> `table` is the lightweight default consumer; `database` reuses the same
> selection model and layers richer schema-driven behavior on top.

---

## 1 Problem Statement

The current grid implementation has three gaps:

1. **No cell-level selection.** Clicking a cell enters text editing immediately.
   There is no intermediate "cell selected" state, no arrow-key navigation
   between cells, no multi-cell selection (Shift+Click), and no way to
   delete/clear cell content without first entering text mode. Users cannot
   select around the table or escape out of it naturally.

2. **CellSelection exists but is unused.** The type system defines
   `CellSelection` (`selection.ts`), the core validates it
   (`SelectionManagerImpl._validateSelection`), `crossBlock.ts` recognizes it,
   and `keyHandling.ts:getActiveBlock` handles it — but no UI code ever sets it.

3. **Column types are decorative.** `TableColumnSchema.type` can be set to
   `number`, `date`, `select`, `checkbox`, etc., but cells still mostly render
   as plain `contenteditable` text. Changing the column type does not reliably
   change the cell editing experience or value rendering.

---

## 2 Design Goals

| Goal | Detail |
|------|--------|
| **Notion/Excel-like focus hierarchy** | `grid block selected → cell(s) selected → text editing in cell` with Escape walking back up. |
| **Rectangular multi-cell selection** | Shift+Click and Shift+Arrow to select a rect of cells. Visual highlight, bulk clear, copy. |
| **Keyboard-driven cell navigation** | Arrow keys move between cells in selection mode. Tab/Shift+Tab across cells. Enter to edit. |
| **Type-aware cell rendering & editing** | Each column type gets an appropriate read-mode display and edit-mode widget. |
| **No breakage outside grid blocks** | All existing text editing, block selection, cross-block expansion, and escape flows stay unchanged. |
| **Spec-compatible** | `CellSelection` is used as designed in `selection.ts`. The model applies to both `table` and `database`. |

---

## 3 Focus Hierarchy

```
┌──────────────────────────────────────────────────────────┐
│  Level 0: No selection                                   │
│    ↓ click grid block                                    │
│  Level 1: Block selected (blue block outline)            │
│    ↓ Enter / click a cell                                │
│  Level 2: Cell selected (cell highlight, no cursor)      │
│    ↓ Enter / F2 / start typing                           │
│  Level 3: Text editing (cursor in cell)                  │
│    ↑ Escape (collapse text sel → cell selected)          │
│    ↑ Escape (cell selected → block selected)             │
│    ↑ Escape (block selected → no selection)              │
└──────────────────────────────────────────────────────────┘
```

### 3.1 Escape Transitions

| From | Action | To |
|------|--------|----|
| Text editing, non-collapsed selection | Escape | Collapse selection, stay in text editing |
| Text editing, collapsed | Escape | Cell selected (same cell) — deactivate field editor, set `CellSelection` |
| Cell selected (single cell) | Escape | Block selected — `editor.selectBlock(blockId)` |
| Cell selected (multi-cell) | Escape | Single cell selected (collapse to anchor) |
| Block selected | Escape | No selection (existing behavior) |

### 3.2 Entry Transitions

| From | Action | To |
|------|--------|----|
| No selection | Click on grid cell | Cell selected (single) |
| No selection | Double-click on grid cell | Text editing in that cell |
| Block selected | Enter | Cell selected (first cell: row 0, col 0) |
| Block selected | Click on cell | Cell selected |
| Cell selected | Enter / F2 | Text editing in that cell |
| Cell selected | Start typing (printable char) | Text editing, replacing cell content with char |
| Cell selected | Double-click | Text editing |
| Cell selected | Click another cell | Cell selected (new cell) |
| Cell selected | Shift+Click another cell | Multi-cell selected (rect from anchor to clicked) |

---

## 4 CellSelection Mechanics

### 4.1 Selection Shape

Reuse the existing `CellSelection` type:

```ts
interface CellSelection {
  type: "cell";
  blockId: string;
  anchor: { row: number; col: number };
  head: { row: number; col: number };
}
```

- **Single cell**: `anchor === head`.
- **Multi-cell**: `anchor !== head` — defines a rectangle from
  `(min(anchor.row, head.row), min(anchor.col, head.col))` to
  `(max(anchor.row, head.row), max(anchor.col, head.col))`.

### 4.2 Editor API Additions

Add to `SelectionManagerImpl`:

```ts
selectCell(blockId: string, row: number, col: number): void {
  this.setSelection({
    type: "cell", blockId,
    anchor: { row, col },
    head: { row, col },
  });
}

selectCellRange(blockId: string, anchor: {row, col}, head: {row, col}): void {
  this.setSelection({ type: "cell", blockId, anchor, head });
}
```

Add to `Editor` facade:

```ts
selectCell(blockId: string, row: number, col: number): void;
selectCellRange(blockId: string, anchor: CellCoord, head: CellCoord): void;
```

### 4.3 Field Editor Integration

When `CellSelection` is active:

- `fieldEditor.isEditing` is `false` — no contenteditable is active.
- `fieldEditor._activeCellCoord` is `null` — that field only holds the
  *editing* cell.
- `fieldEditorImpl._mode` stays `"inactive"` — the table renderer handles
  visual feedback directly from `editor.selection`.
- The field editor is fully deactivated. The table renderer reads
  `editor.selection` via a hook and applies visual cell highlights.

Entering text editing from cell selection calls
`fieldEditor.activateCellFromElement(...)` which sets `_activeCellCoord` and
activates the contenteditable backend.

### 4.4 FieldEditorStoreSnapshot

No changes needed. `activeCellCoord` represents the *editing* cell.
Cell *selection* is read from `editor.selection`.

---

## 5 Keyboard Navigation

All key handling below applies when `editor.selection?.type === "cell"` and
the field editor is *not* editing (i.e., Level 2: cell selected).

These handlers go in `keyHandling.ts` (or a new `tableCellNavigation.ts`
imported from `root.tsx`).

### 5.1 Arrow Keys

| Key | Shift | Effect |
|-----|-------|--------|
| Arrow{Up,Down,Left,Right} | No | Move head to adjacent cell, collapse selection to single cell |
| Arrow{Up,Down,Left,Right} | Yes | Extend selection: move head, keep anchor |

Boundary behavior:
- ArrowLeft at col 0 → wrap to last col of previous row (or no-op at row 0)
- ArrowRight at last col → wrap to col 0 of next row (or no-op at last row)
- ArrowUp at row 0 → no-op (stay)
- ArrowDown at last row → no-op (stay)

### 5.2 Other Keys

| Key | Effect |
|-----|--------|
| Enter | Enter text editing in the head cell |
| F2 | Enter text editing in the head cell |
| Tab | Move head to next cell (left-to-right, top-to-bottom), collapse |
| Shift+Tab | Move head to previous cell |
| Escape | See §3.1 |
| Backspace / Delete | Clear content of all selected cells |
| Printable char | Enter text editing, clear cell, insert char |
| Cmd+C | Copy selected cell values (tab-separated rows) |
| Cmd+V | Paste into selected cells (tab-separated → fill rect) |
| Cmd+A | Select all cells in the table |

### 5.3 Implementation Location

Key events when a `CellSelection` is active are handled at the **root** level
(`root.tsx` `handleKeyDown`), before the field editor key handler. This is
because the field editor is inactive during cell selection.

Flow:
1. `root.tsx:handleKeyDown` checks `editor.selection?.type === "cell"`.
2. If yes, delegates to `handleTableCellSelectionKeyDown(...)`.
3. That function handles arrow/enter/escape/delete/tab/typing.
4. Returns `true` if handled, `false` to fall through.

---

## 6 Pointer Interactions

### 6.1 Click on a Cell (not currently editing)

**Current**: `table.tsx:handleCellMouseDown` → immediate `activateCellFromElement`.

**New**: Single click → `editor.selectCell(blockId, row, col)`. This sets
`CellSelection` and deactivates the field editor. No text editing yet.

### 6.2 Double-Click on a Cell

**New**: Double-click → `fieldEditor.activateCellFromElement(...)`. Enters
text editing directly.

### 6.3 Shift+Click on a Cell

**New**: If `editor.selection?.type === "cell"`, extend selection:
`editor.selectCellRange(blockId, selection.anchor, { row, col })`.

If no current cell selection, treat as single cell click.

### 6.4 Click Outside Grid / On Another Block

Standard behavior: the active grid renderer's `ignorePointerGesture` makes the
content-level handler skip grid cells. Clicks outside the grid (on
`content.tsx` managed
areas) proceed as normal, deactivating any cell selection via the standard
`editor.setSelection(...)` flow.

### 6.5 Click on Table Header

Unchanged — opens column menu. Headers use `ignorePointerGesture`.

---

## 7 Visual Feedback

### 7.1 Cell Selection Highlight

The active grid renderer reads `editor.selection` and determines which cells are in
the selected rectangle. Selected cells get a `data-pen-cell-selected`
attribute. CSS styles the highlight.

```css
[data-pen-cell-selected] {
  background: var(--pen-selection-bg, rgba(45, 120, 255, 0.12));
  outline: 2px solid var(--pen-selection-border, rgba(45, 120, 255, 0.5));
}
```

### 7.2 Active (Editing) Cell

The currently-editing cell keeps the existing `data-pen-field-editor-active-surface`
attribute for its contenteditable styling (cursor, active border).

### 7.3 Grid Block Selected

When the current grid block itself is selected (Level 1, `BlockSelection`), the
existing `data-selected` attribute on the block wrapper handles highlighting.

---

## 8 Type-Aware Cell Editing

### 8.1 Principle

When a cell's column type is not `text`, the editing experience should match
the type. The cell renders a **display view** when not editing and an
**edit widget** when active.

### 8.2 Per-Type Behavior

| Column Type | Display View | Edit Widget | Storage |
|-------------|-------------|-------------|---------|
| `text` | Inline text | `contenteditable` (current) | Y.Text |
| `number` | Right-aligned number | `contenteditable` with numeric validation | Y.Text (string) |
| `checkbox` | Checkbox icon | Toggle on click/space/enter | Y.Text `"true"`/`"false"` |
| `select` | Colored tag | Dropdown overlay | Y.Text (option value) |
| `multiSelect` | Colored tag list | Multi-select dropdown overlay | Y.Text (comma-separated) |
| `date` | Formatted date string | Date picker overlay | Y.Text (ISO string) |
| `url` | Link (clickable in read mode) | `contenteditable` | Y.Text |
| `email` | Email (clickable in read mode) | `contenteditable` | Y.Text |

### 8.3 Type Change Conversion

When a column type changes via the column header menu, existing cell values
should be preserved or converted:

- `text → number`: Keep if parseable as number, clear otherwise.
- `text → checkbox`: `"true"` → checked, anything else → unchecked.
- `text → date`: Keep if parseable as ISO date, clear otherwise.
- `number → text`: Convert number string as-is.
- `checkbox → text`: `"true"` / `"false"`.
- `any → select`: Keep value if it matches an option, clear otherwise.
- Clearing means setting cell text to `""`.

### 8.4 Component Architecture

`TableCellContent` or a shared grid-cell dispatcher becomes a dispatcher:

```tsx
function TableCellContent({ columnType, ...props }) {
  switch (columnType) {
    case "checkbox": return <CheckboxCell {...props} />;
    case "select":   return <SelectCell {...props} />;
    case "date":     return <DateCell {...props} />;
    case "number":   return <NumberCell {...props} />;
    default:         return <TextCell {...props} />;
  }
}
```

Each sub-component handles:
- **Read mode**: Display-only rendering from `useCellTextSnapshot`.
- **Edit mode** (when `isActiveCell`): The appropriate input widget.
- **Cell selection mode**: Shows display view with selection highlight
  (highlight applied by parent `<td>` via `data-pen-cell-selected`).

### 8.5 Non-Contenteditable Cell Types

For `checkbox`, `select`, `date`: the field editor is NOT activated for
text editing. Instead:

- **Checkbox**: Cell selection + Enter/Space toggles. Click toggles. No
  `contenteditable`.
- **Select**: Cell selection + Enter opens dropdown. Click opens dropdown.
  Selecting an option commits and closes.
- **Date**: Cell selection + Enter opens date picker. Selecting a date
  commits and closes.

These types set `fieldEditor._activeCellCoord` without activating a
`ContentEditableBackend`. A new concept: `cellEditMode: "contenteditable" |
"widget"` determines whether the backend is needed.

---

## 9 File-by-File Changes

### 9.1 `packages/core/src/editor/selection.ts`

- Add `selectCell(blockId, row, col)` method.
- Add `selectCellRange(blockId, anchor, head)` method.
- Add `getSelectedCellText()` for `CellSelection` in `getSelectedText()`.

### 9.2 `packages/core/src/editor/editor.ts`

- Expose `selectCell(...)` and `selectCellRange(...)` on the Editor facade.

### 9.3 `packages/types/src/types/editor.ts`

- Add `selectCell` and `selectCellRange` to the `Editor` interface.

### 9.4 `packages/rendering/react/src/utils/escapeSelection.ts`

- Add `CellSelection` handling:
  - Multi-cell → collapse to anchor.
  - Single cell → `editor.selectBlock(blockId)`, focus block container.
- Add text-editing-in-grid-cell → `CellSelection` transition:
  - When the field editor has `_activeCellCoord` and Escape is pressed,
    set `CellSelection` for that cell, deactivate field editor.

### 9.5 `packages/rendering/react/src/field-editor/keyHandling.ts`

- Extract table-cell-active key handling (Tab, Enter) into a helper.
- Remove arrow-key `return false` passthrough for table cells (those now
  go through cell navigation).

### 9.6 New: `packages/rendering/react/src/utils/tableCellNavigation.ts`

- `handleTableCellSelectionKeyDown(editor, fieldEditor, event)`: Handles
  all key events when `CellSelection` is active.
- Arrow key movement with boundary wrapping.
- Shift+Arrow for extending selection.
- Enter/F2 → activate text editing.
- Backspace/Delete → clear selected cells.
- Printable char → activate text editing, clear cell, insert char.
- Tab/Shift+Tab → move between cells.
- Cmd+A → select all cells.

### 9.7 `packages/rendering/react/src/primitives/editor/root.tsx`

- In `handleKeyDown`, before delegating to field editor:
  1. Check `editor.selection?.type === "cell"`.
  2. If yes, call `handleTableCellSelectionKeyDown(...)`.
  3. If handled, return.

### 9.8 `packages/rendering/react/src/renderers/table.tsx`

**Mouse handling rewrite:**

- `handleCellMouseDown`: Single click → `editor.selectCell(blockId, row, col)`.
  If Shift held, → `editor.selectCellRange(blockId, currentAnchor, {row, col})`.
  `preventDefault` + `stopPropagation` to prevent content-level handler.
- Remove `handleCellMouseUp` (no longer needed for text selection sync).
- `handleCellDoubleClick`: Enter text editing via
  `fieldEditor.activateCellFromElement(...)`.

**Cell selection visual feedback:**

- Read `editor.selection` via `useEditorSelection()` hook.
- Compute selected cell set from `CellSelection` rect.
- Apply `data-pen-cell-selected` to matching `<td>` elements.

**Block-selected → Enter:**

- When the table block has `data-selected` and receives `Enter` keydown,
  set `CellSelection` for `(0, 0)`.

### 9.9 `packages/rendering/react/src/renderers/database.tsx`

- Mirror the same pointer and keyboard selection semantics as `table.tsx`.
- Read `tableColumns` and `databaseViews` in addition to `tableContent`.
- Reuse shared cell-selection helpers instead of re-implementing them.

### 9.10 `packages/rendering/react/src/primitives/editor/tableCellContent.tsx`

- Refactor into a dispatcher based on `columnType`.
- Extract `TextCell` (existing contenteditable behavior).
- Add `CheckboxCell`, `SelectCell`, `DateCell`, `NumberCell` sub-components.
- Each has display mode and edit mode.

### 9.11 `packages/rendering/react/src/field-editor/crossBlock.ts`

- Change `CellSelection` case from `{ mode: "block", ... }` to
  `{ mode: "inactive", blockIds: [] }` — the field editor should not be
  active when cells are selected (only when editing text in a cell).

### 9.12 `packages/rendering/react/src/primitives/editor/content.tsx`

- `finalizePointerSelection`: When clicking on a grid cell, call
  `editor.selectCell(...)` instead of `fieldEditor.activateCell(...)`.
- Ensure Shift+Click on grid cells delegates to the active renderer's own
  handler (already handled by `ignorePointerGesture`).

### 9.13 `packages/rendering/react/src/field-editor/contenteditableBackend.ts`

- No changes needed for cell selection. The backend is only active during
  Level 3 (text editing). Cell selection (Level 2) does not involve the
  backend.

### 9.14 CSS / Styles (`playground/src/styles.css`)

- Add `[data-pen-cell-selected]` styles.
- Add cell selection ring for single selected cell.
- Add type-specific cell styles (number alignment, tag colors, etc.).

---

## 10 Implementation Phases

### Phase 1: Cell Selection Foundation

1. Add `selectCell` / `selectCellRange` to `SelectionManagerImpl` and `Editor`.
2. Update `escapeSelection.ts` for the full hierarchy.
3. Rewrite `table.tsx` pointer handling (click → cell select, double-click →
   edit, shift+click → range select).
4. Apply the same selection model in `database.tsx`.
5. Add cell selection visual feedback (`data-pen-cell-selected`).
6. Update `content.tsx` to use `selectCell` instead of `activateCell`.
7. Update `crossBlock.ts` to treat `CellSelection` as inactive.

### Phase 2: Keyboard Navigation

8. Create `tableCellNavigation.ts` with all key handlers.
9. Wire into `root.tsx` `handleKeyDown`.
10. Handle Enter on block-selected grid block → cell selection.
11. Handle Backspace/Delete → clear selected cells.
12. Handle printable char → enter editing with char.

### Phase 3: Type-Aware Cell Editing

13. Refactor `TableCellContent` into type-dispatched sub-components.
14. Implement `CheckboxCell` (toggle without contenteditable).
15. Implement `NumberCell` (contenteditable with validation).
16. Implement `SelectCell` (dropdown overlay).
17. Implement `DateCell` (date picker overlay).
18. Implement type-change value conversion.

### Phase 4: Multi-Cell Operations

19. Copy: selected cells → tab-separated clipboard text.
20. Paste: tab-separated text → fill selected cells.
21. Cmd+A → select all cells in the current grid block.

---

## 11 Testing Strategy

### 11.1 Unit Tests (vitest)

- Cell selection state transitions (escape hierarchy, all 5 levels).
- Arrow key navigation (wrapping, boundaries, Shift+Arrow range extension).
- Tab/Shift+Tab cell traversal.
- Enter/Escape/F2 transitions.
- Backspace on cell selection clears cells.
- Type-specific rendering for each column type.
- Type-change value conversion.
- Multi-cell copy/paste.

### 11.2 Playground Manual Testing

- Insert table and database via slash menu.
- Click cell → highlight without cursor.
- Arrow keys to navigate.
- Enter to type, Escape back to cell, Escape to block, Escape to nothing.
- Shift+Click for multi-cell.
- Change column type → cell rendering changes.
- Checkbox column → click toggles.
- Delete on multi-cell selection → cells cleared.

---

## 12 Non-Goals (This Wave)

- Column resizing (drag column borders).
- Row reordering (drag rows).
- Cell merge / split (`MergeTableCellsOp` stays no-op).
- Formulas or computed columns.
- Sorting / filtering the lightweight `table` block.
- Row selection checkboxes and advanced query UI for `database`.
- Remote data / pagination plumbing beyond the shared cell-selection contract.

---

## 13 Migration Notes

- The `table` block schema (`packages/schema/default/src/blocks/table.ts`)
  does **not** need structural changes for cell selection. Most changes are in
  rendering, selection, and interaction.
- `database` reuses the same `CellSelection` contract and shared grid helpers,
  even when it layers richer schema and view-state behavior on top.
- `CellSelection` is already in the `SelectionState` union. No type changes
  needed outside adding the `selectCell`/`selectCellRange` convenience methods.
- Existing tests for text editing in table cells should continue to pass —
  Level 3 behavior is unchanged, only the entry path changes (you now go
  through cell selection first, or double-click to skip it).
