# Tables & Databases Architecture

> Supersedes all prior table and collection specs.
> Cleanly separates **table** (authored content) from **database** (structured data).

---

## 0. Context & Learnings

We spent waves 0–6 building table support in two overlapping forms: a "base table" in
`@pen/react` and a "smart table" extension that overrides it. Real-world playground
testing exposed deep problems:

1. **Blurred boundary.** The smart-table extension replaces the base table renderer, adds
   its own capture-phase keydown listener, and requires a coordination slot. Two keyboard
   stacks, duplicated cell content components, and subtle ordering issues.
2. **Contenteditable crashes.** Non-text cells (date, select, checkbox) carried
   `[data-pen-inline-content]` which triggered the contenteditable backend attachment,
   destroying React-owned DOM and crashing the editor.
3. **Incomplete selection model.** `editor.deleteSelection()` ignores `CellSelection`.
   Cell clearing was done ad-hoc in the smart-table extension. No unified clipboard
   pipeline for cell ranges.
4. **Missing structural interaction.** Clicking above/below a table, pressing Enter on a
   block-selected table, arrow-keying through tables, all had to be patched incrementally.
5. **No clear database story.** The collection renderer is a separate concept with its own
   CRDT structure, its own data provider pattern, but it shares no rendering, selection, or
   keyboard infrastructure with the table.

This spec starts from scratch and defines two distinct, non-overlapping primitives.

---

## 1. Design Principles

1. **Table is for writing; Database is for data.** A table is authored content with
   rich-text cells, the kind of table that appears in blog posts, docs, and READMEs.
   A database is a typed record store, Notion-style, with views, filters, sorting,
   pagination, and optional remote data.

2. **One selection model, two content types.** Both use `CellSelection` for cell ranges.
   Both share the same escape hierarchy, block selection, deletion, undo/redo, and
   keyboard navigation. The selection logic lives in core, not in extensions.

3. **Table is built-in; Database is an extension.** The table block ships with `@pen/react`
   as a first-class content type. The database block is a separate package
   (`@pen/database`) that can be loaded opt-in. No renderer overriding, no coordination
   slots, no two-keyboard-stack hacks.

4. **Pen-native headless data layer for databases.** Database behavior should be
   implemented inside Pen, not delegated to a generic table library. We can borrow
   concepts from TanStack Table, derived row models, column state, grouping, faceting,
   pagination, pinning, but the engine must be designed around Pen's architecture:
   Yjs as source of truth, `editor.apply()` as the mutation path, editor-native selection
   and undo/redo, and extension hooks that compose with the rest of the editor. The
   `DatabaseEngine` is therefore a Pen-owned query/state layer, not an adapter around
   a third-party headless table.

5. **Schema-driven cells.** Cell rendering is driven by column type. The table block has
   only rich-text cells. The database block dispatches to type-specific cell editors
   (text, number, checkbox, select, multi-select, date, url, email, relation, formula).
   Non-contenteditable cells never carry `[data-pen-field-editor-surface]`.

6. **CRDT-native.** Both primitives store data in Yjs structures (`Y.Array`, `Y.Map`,
   `Y.Text`). All mutations go through `editor.apply()` with proper origin tagging for
   undo/redo and collaboration.

7. **Shared grid storage, explicit schema.** Table and database both use the same
   underlying Yjs grid storage for rows and cells. The difference is that database adds
   an explicit typed column schema and optional view state on top of that shared grid.
   Column type determines *interpretation* and *validation*, not storage format. A
   number column's `Y.Text` contains `"42"`; a checkbox column's contains `"true"`.
   The `DatabaseEngine` parses strings into typed values for the UI, but the CRDT
   storage remains uniform.

8. **Stable row identity.** Every row in the shared table grid has a UUID `id` field
   stored in its `Y.Map`. Plain tables may ignore it, but databases depend on it for
   row selection, grouping, pinning, pagination, and remote synchronization. Row
   identity must never be derived from display index.

---

## 2. Table Block (`content: "table"`)

### 2.1 Schema

```typescript
defineBlock("table", {
  props: {
    hasHeaderRow:    prop.boolean().default(true),
    hasHeaderColumn: prop.boolean().default(false),
    columnWidths:    prop.array(prop.number()).optional(),
  },
  content: "table",
  fieldEditor: "table",
  display: {
    title: "Table",
    description: "Rich-text table for authored content",
    group: "advanced",
    aliases: ["grid"],
  },
});
```

### 2.2 CRDT Structure

```text
blockMap[blockId]:
  type: "table"
  props: { hasHeaderRow, hasHeaderColumn, columnWidths }
  tableContent: Y.Array<Y.Map>          ← rows
    [rowIndex]: Y.Map
      cells: Y.Array<Y.Map>             ← cells
        [colIndex]: Y.Map
          content: Y.Text               ← rich-text cell content
```

Every cell is a `Y.Text` that supports inline marks (bold, italic, link, code, etc.)
and inline nodes (mention, inlineApp). No typed columns; all cells are rich-text.

### 2.3 Operations

All existing table ops remain unchanged:

| Op | Purpose |
| ---- | --------- |
| `insert-table-row` | Insert a row at index |
| `delete-table-row` | Delete a row at index |
| `insert-table-column` | Insert a column at index |
| `delete-table-column` | Delete a column at index |
| `insert-table-cell-text` | Insert text into cell Y.Text |
| `delete-table-cell-text` | Delete text from cell Y.Text |
| `format-table-cell-text` | Apply marks to cell text range |
| `merge-table-cells` | Merge cell range (M1) |
| `split-table-cell` | Split merged cell (M1) |

### 2.4 Rendering

The table renderer lives in `@pen/react` as a built-in. It renders a standard
`<table>` element with `<thead>` (when `hasHeaderRow`) and `<tbody>`.

**Interaction model:**

| Gesture | Result |
| --------- | -------- |
| Click cell | Select cell (`CellSelection`) |
| Double-click cell | Activate text editing in cell |
| Shift+click cell | Extend cell range selection |
| Click table frame (outside cells) | Block-select the table |
| Enter on block-selected table | Insert paragraph after table |
| Backspace on block-selected table | Delete the table block |
| Arrow into table from adjacent block | Select first/last cell |
| Arrow out of table from edge cell | Move to adjacent block |
| Tab / Shift+Tab | Linear cell navigation |
| Enter / F2 in cell selection | Activate cell editing |
| Escape from cell editing | Return to cell selection |
| Escape from cell selection | Block-select the table |
| Escape from block selection | Deselect |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo (always, any selection state) |

**Controls (non-readonly):**

- "+" button on last column header → insert column
- "+" button on last row → insert row
- Right-click cell → context menu: insert/delete row/column
- Drag column border → resize column (updates `columnWidths` prop)

### 2.5 Serialization

- **Markdown:** GFM pipe table. First row is header when `hasHeaderRow`.
- **HTML:** Standard `<table>` with `<thead>`/`<tbody>`.
- **Import:** Markdown/HTML tables parse into table blocks.

---

## 3. Database Block (`content: "database"`)

### 3.1 Schema

```typescript
defineBlock("database", {
  props: {
    title:       prop.string().default("Untitled"),
    dataSource:  prop.enum(["local", "remote", "hybrid"]).default("local"),
  },
  content: "database",
  fieldEditor: "database",
  display: {
    title: "Database",
    description: "Structured data with typed columns, views, and queries",
    group: "advanced",
    aliases: ["spreadsheet", "dataset"],
  },
});
```

The `fieldEditor: "database"` mode is new. It tells `content.tsx` that click events
inside this block are handled by the database renderer (via `data-pen-ignore-pointer-gesture`),
not by the default pointer-selection pipeline. This prevents `finalizePointerSelection`
from block-selecting the database when a user clicks a cell. The database renderer
manages its own `CellSelection` dispatching.

The database block replaces the existing `collection` block. Persisted legacy
documents are migrated at load time into `database` blocks; new runtime APIs and
schemas should not expose `collection` as a supported authoring primitive.

### 3.2 CRDT Structure

The database block reuses the same grid storage primitive as the table block and adds
formal typed schema + view state. This is the chosen architecture for this wave: do not
fork table/grid storage into a second CRDT shape unless a later wave proves it necessary.

**Shared grid storage (used by both `table` and `database`):**

```text
blockMap[blockId]:
  type: "table" | "database"
  props: { ... }
  tableContent: Y.Array<Y.Map>          ← rows
    [rowIndex]: Y.Map
      id: string                        ← stable row UUID
      cells: Y.Array<Y.Map>
        [colIndex]: Y.Map
          id: string
          content: Y.Text
```

**Database schema + view state layered on top of the grid:**

```text
blockMap[blockId]:
  type: "database"
  props: { title, dataSource }
  tableColumns: Y.Array<Y.Map>
    [colIndex]: Y.Map
      id: string
      title: string
      type: ColumnType
      width: number?
      hidden: boolean?
      pinned: "left" | "right"?
      format: Y.Map?                    ← number/date formatting
      options: Y.Array<Y.Map>?          ← select / multi-select options
  databaseViews: Y.Array<Y.Map>?
    [viewIndex]: Y.Map
      id: string
      title: string
      type: "table" | "board" | "calendar" | "gallery" | "list"
      visibleColumnIds: Y.Array<string>
      columnOrder: Y.Array<string>
      sort: Y.Array<Y.Map>              ← [{ columnId, direction }]
      filter: Y.Map                     ← filter tree
      groupBy: string?
      pageSize: number?
      pageIndex: number?
      rowPinning: Y.Map?                ← { top: string[], bottom: string[] }
  databasePrimaryViewId: string?
```

**Phase boundaries:**

- **Phase 3:** `tableContent` + structured `tableColumns`; one implicit table view.
- **Phase 4:** explicit `databaseViews`, grouping, ordering, pinning, pagination state.
- **Phase 5:** remote/hybrid data providers integrate with the same query/view model.

**Why this structure:** It keeps one shared row/cell model across table and database,
preserves editor APIs like `block.tableCell(r, c)`, and avoids a second parallel grid
implementation. At the same time, it makes database schema first-class instead of hiding
extra metadata in ad-hoc serialized column blobs.

**Important implementation constraint:** `tableColumns` must no longer be stored as a
JSON string blob. The schema has to be represented as structured Yjs data so column
metadata survives round-trips, incremental edits, collaboration, and undo/redo without
lossy reserialization.

**Why all cells are `Y.Text`:** Storing typed primitives (`number`, `boolean`) alongside
`Y.Text` in the same `Y.Map` creates a bifurcation that forces every accessor, cell
editor, and serializer to type-check the CRDT value before reading. `Y.Text` is
universal: a number column stores `"42"`, a checkbox stores `"true"`, a date stores
`"2026-03-09"`. The `DatabaseEngine` parses these strings into typed values and
validates on write. Rich-text marks are available but ignored for non-text column types.

### 3.2.1 Exact Shared Types

The following types should become the canonical contract across `@pen/types`,
`@pen/core`, `@pen/react`, and `@pen/database`.

```typescript
export type ColumnType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "multiSelect"
  | "date"
  | "url"
  | "email"
  | "relation"
  | "formula";

export interface SelectOption {
  id: string;
  value: string;
  color?: string;
}

export interface NumberFormat {
  style: "plain" | "currency" | "percent";
  decimals?: number;
  currency?: string;
}

export interface DateFormat {
  includeTime?: boolean;
  dateStyle?: "short" | "medium" | "long";
}

export interface TableColumnSchema {
  id: string;
  title: string;
  type: ColumnType;                 // plain tables use "text"
  width?: number;
  hidden?: boolean;                 // database-only semantic; ignored by table block
  pinned?: "left" | "right";        // database-only semantic; ignored by table block
  options?: SelectOption[];         // select / multiSelect
  format?: NumberFormat | DateFormat;
  readonly?: boolean;               // formula / computed columns
}

export interface TableRowHandle {
  id: string;                       // stable UUID
  index: number;
}

export interface DatabaseSort {
  columnId: string;
  direction: "asc" | "desc";
}

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "is_checked"
  | "is_unchecked"
  | "is_any_of"
  | "is_none_of"
  | "is_before"
  | "is_after"
  | "is_between"
  | "is_relative";

export interface FilterCondition {
  columnId: string;
  operator: FilterOperator;
  value: string | string[] | null;
}

export interface FilterGroup {
  operator: "and" | "or";
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface DatabaseViewState {
  id: string;
  title: string;
  type: "table" | "board" | "calendar" | "gallery" | "list";
  visibleColumnIds: string[];
  columnOrder: string[];
  sort: DatabaseSort[];
  filter: FilterGroup | null;
  groupBy?: string;
  pageIndex: number;
  pageSize: number;
  rowPinning?: {
    top: string[];
    bottom: string[];
  };
}

export interface DatabaseQuery {
  sort: DatabaseSort[];
  filter: FilterGroup | null;
  groupBy?: string;
  pageIndex: number;
  pageSize: number;
  search?: string;
}
```

**Rules:**

- `TableColumnSchema` is now shared infrastructure, not table-only infrastructure.
- Plain `table` blocks use the same column schema type but treat `type` as `"text"` and
  ignore database-only metadata such as `options`, `hidden`, `pinned`, and `format`.
- `TableRowHandle.id` must be stable and CRDT-backed. It must never be derived from row index.
- `DatabaseViewState` is serializable and CRDT-storable as-is, except arrays/maps are
  represented as Yjs shared types in the actual document structure.

### 3.3 Column Types

| Type | CRDT Storage | Typed Value (parsed) | Cell Editor | Display |
| ------ | ------------- | --------------------- | ------------- | --------- |
| `text` | `Y.Text` | `string` (rich-text marks preserved) | Contenteditable (rich-text) | Text |
| `number` | `Y.Text` (e.g. `"42"`) | `number \| null` | Contenteditable (plaintext, right-aligned) | Formatted number |
| `checkbox` | `Y.Text` (`"true"` / `"false"`) | `boolean` | Toggle on click/Space/Enter | Checkbox icon |
| `select` | `Y.Text` (option key) | `string \| null` | Dropdown with options | Tag |
| `multiSelect` | `Y.Text` (JSON array) | `string[]` | Dropdown with multi-pick | Tag list |
| `date` | `Y.Text` (ISO string) | `Date \| null` | Date picker on Enter/click | Formatted date |
| `url` | `Y.Text` | `string` | Contenteditable | Link |
| `email` | `Y.Text` | `string` | Contenteditable | Email link |
| `relation` | `Y.Text` (block/row id) | `string \| null` | Relation picker | Linked record |
| `formula` | — (computed) | varies | N/A (read-only) | Computed value |

**Rule:** Only `text`, `number`, `url`, `email` columns produce contenteditable surfaces
with `[data-pen-field-editor-surface]`. All other column types render widget cells
without `[data-pen-inline-content]`; they are never attached to the contenteditable
backend.

### 3.4 Operations

Database operations are distinct from table operations:

| Op | Purpose |
| ---- | --------- |
| `database-add-column` | Add column to schema |
| `database-update-column` | Change column title, width, or config (not type) |
| `database-convert-column` | Change column type with value coercion (see §3.5) |
| `database-remove-column` | Remove column from schema |
| `database-reorder-columns` | Reorder columns in a view |
| `database-insert-row` | Insert a row |
| `database-update-cell` | Update a cell value |
| `database-delete-row` | Delete a row |
| `database-delete-rows` | Bulk delete rows by ID (from row selection) |
| `database-duplicate-row` | Clone a row with new ID |
| `database-move-row` | Reorder a row |
| `database-add-view` | Add a view |
| `database-update-view` | Update view config (sort, filter, group, visible columns) |
| `database-remove-view` | Remove a view |
| `database-set-active-view` | Switch active view |
| `database-update-select-options` | Add, remove, rename, recolor options for select/multiSelect |

### 3.5 Column Type Conversion

When a column type changes via `database-convert-column`, the engine coerces existing
cell values. The operation stores both `fromType` and `toType` for undo.

**Coercion rules:**

| From → To | Rule |
| ----------- | ------ |
| `text → number` | Parse as float; keep if valid, write `""` otherwise |
| `text → checkbox` | `"true"` (case-insensitive) → `"true"`, else `"false"` |
| `text → date` | Parse as ISO date; keep if valid, write `""` otherwise |
| `text → select` | Keep if value matches an existing option, write `""` otherwise |
| `text → url` | Keep as-is (assume text could be a URL) |
| `text → email` | Keep as-is |
| `number → text` | Keep as-is (already a string in Y.Text) |
| `checkbox → text` | Keep as-is (`"true"` / `"false"`) |
| `date → text` | Keep as-is (ISO string) |
| `select → text` | Keep as-is (option value is a string) |
| `select → multiSelect` | Wrap single value in JSON array |
| `multiSelect → select` | Take first value from array |
| `any → checkbox` | Non-empty truthy string → `"true"`, else `"false"` |
| `any → any` (no rule) | Keep value if non-empty, write `""` if unparseable |

Coercion is applied to all rows in a single transaction. The operation is undoable;
undo restores the original type and all original cell values.

### 3.6 Select & MultiSelect Options

Select and multiSelect columns store their options in the column schema:

```text
columns[colIndex]: Y.Map
  ...
  options: Y.Array<Y.Map>
    [optionIndex]: Y.Map
      id: string            ← stable UUID
      value: string         ← display label
      color: string         ← CSS color or named palette key (e.g. "red", "blue", "#3b82f6")
```

**`database-update-select-options` op fields:**

```typescript
{
  type: "database-update-select-options";
  blockId: string;
  columnId: string;
  action: "add" | "remove" | "rename" | "recolor" | "reorder";
  optionId?: string;    // for remove, rename, recolor
  value?: string;       // for add (new label), rename (new label)
  color?: string;       // for add, recolor
  order?: string[];     // for reorder (option IDs in new order)
}
```

**Behavior on option removal:** When an option is removed, cells referencing that option
are cleared (set to `""`). For multiSelect, the removed option is filtered out of the
JSON array.

**Option editor UI:** The select/multiSelect cell editor includes an inline option
manager: a list of existing options with color dots, rename-on-click, drag-to-reorder,
delete button, and an "Add option" input at the bottom. This mirrors Notion's pattern.

### 3.7 Headless State Machine (`DatabaseEngine`)

The database extension owns its own headless engine. It should be inspired by the best
parts of TanStack Table's model, but it should not depend on TanStack Table at runtime.
The engine is a pure, Pen-native query layer over Yjs-backed state.

**Architecture:**

```text
 CRDT (source of truth)          DatabaseEngine              Renderer
┌────────────────────────┐   ┌─────────────────────────┐   ┌──────────────┐
│ tableContent           │──▶│ deriveBaseRows()         │──▶│ header rows  │
│ tableColumns           │──▶│ deriveColumns()          │──▶│ visible cells│
│ databaseViews          │──▶│ applyColumnOrder()       │──▶│ groups       │
│ props.dataSource       │──▶│ applyVisibility()        │──▶│ pagination   │
│ provider page (opt.)   │──▶│ applyFilters()           │──▶│ toolbar state│
└────────────────────────┘   │ applyGlobalSearch()      │   └──────────────┘
         ▲                   │ applySorting()           │
         │ user action       │ applyGrouping()          │
         │ (sort/filter/etc) │ applyPagination()        │
         └───────────────────│ facetColumnValues()      │
                             │ buildViewModel()         │
                             └─────────────────────────┘
```

The renderer does not hold a second parallel state machine. It asks the engine for a
fully derived view model from the CRDT + local ephemeral UI state, and it sends user
actions back through explicit engine commands that write via `editor.apply()`.

**`DatabaseEngine` responsibilities:**

```typescript
interface DatabaseEngine {
  // Column + row derivation from CRDT / provider
  deriveColumns(): DatabaseColumn[];
  deriveRows(): DatabaseRow[];

  // View model
  buildViewModel(input: DatabaseViewState): DatabaseViewModel;

  // Row-model pipeline
  applyColumnOrder(rows: DatabaseRow[], state: DatabaseViewState): DatabaseRow[];
  applyVisibility(columns: DatabaseColumn[], state: DatabaseViewState): DatabaseColumn[];
  applyFilters(rows: DatabaseRow[], state: DatabaseViewState): DatabaseRow[];
  applyGlobalSearch(rows: DatabaseRow[], query: string): DatabaseRow[];
  applySorting(rows: DatabaseRow[], state: DatabaseViewState): DatabaseRow[];
  applyGrouping(rows: DatabaseRow[], state: DatabaseViewState): GroupedRows;
  applyPagination(rows: DatabaseRow[], state: DatabaseViewState): PaginatedRows;
  facetColumnValues(rows: DatabaseRow[], columnId: string): FacetBucket[];

  // Column-type semantics
  parseCellValue(raw: string, columnType: ColumnType): unknown;
  serializeCellValue(value: unknown, columnType: ColumnType): string;
  validateCellValue(raw: string, columnType: ColumnType): string | null;
  compareValues(a: string, b: string, columnType: ColumnType): number;
  matchesFilter(raw: string, filter: FilterCondition, column: DatabaseColumn): boolean;
  coerceValue(raw: string, fromType: ColumnType, toType: ColumnType): string;

  // Data source integration
  fetchRemotePage?(query: DatabaseQuery): Promise<DatabasePage>;
  subscribeRemotePage?(query: DatabaseQuery, onPage: (page: DatabasePage) => void): Unsubscribe;
}
```

**Design constraints:**

- The engine is framework-agnostic. No React hooks inside `DatabaseEngine`.
- The engine is deterministic. Same CRDT state + same view state => same result.
- Sorting/filtering/grouping work over stable row IDs, never display indexes.
- Remote/hybrid mode uses the same query model as local mode; only the row source changes.
- All persistent state changes are written through `editor.apply()`, not hidden local state.

**Implementation model:** Build the engine as a pipeline of small pure functions. Each
stage should be independently testable:

1. `deriveColumns`
2. `deriveRows`
3. `filterRows`
4. `searchRows`
5. `sortRows`
6. `groupRows`
7. `paginateRows`
8. `facetValues`
9. `buildViewModel`

This keeps the engine deeply aligned with Pen's architecture and makes it much easier to
reason about collaboration, undo/redo, and server-backed modes than a wrapped generic
table library would.

### 3.8 Data Source Modes

**Client-side mode (`dataSource: "local"`):** All rows live in `tableContent`. The
Pen-native `DatabaseEngine` derives filters, sorting, grouping, faceting, and pagination
locally from CRDT state.

**Server-side mode (`dataSource: "remote"`):** Schema and view config live in the CRDT,
but rows come from a `DatabaseDataProvider`. The engine converts local view state into a
query object (`sort`, `filter`, `groupBy`, `pageIndex`, `pageSize`) and calls
`provider.fetch(query)`. The returned page becomes the row source for the renderer.

**Hybrid mode (`dataSource: "hybrid"`):** Rows come from a provider, while local Yjs
state stores schema, view state, annotations, and draft edits. The engine merges remote
rows with local overlays before deriving the final view model.

```typescript
interface DatabaseDataProvider {
  fetch(query: DatabaseQuery): Promise<DatabasePage>;
  subscribe?(query: DatabaseQuery, callback: (page: DatabasePage) => void): Unsubscribe;
  mutate?(op: DatabaseMutationOp): Promise<void>;
}
```

### 3.9 Cell Keyboard Delegation

The base cell navigation handler in `root.tsx` handles generic cell selection and
navigation for both tables and databases. The database extension needs to override
keyboard behavior for non-text cells (e.g., Space toggles checkbox, Enter opens a
date picker).

**Extension point:** The database extension registers a `cellKeyDownDelegate` via a
single slot: `"database:cell-keydown"`. When the base handler encounters a `CellSelection`
on a database block, it calls the delegate first. If the delegate returns `true`, the
base handler defers.

```typescript
type CellKeyDownDelegate = (event: KeyboardEvent, context: {
  editor: PenEditor;
  blockId: string;
  cell: { row: number; col: number };
  columnType: ColumnType;
}) => boolean;
```

This is one slot, one callback, not the two-keyboard-stack pattern. The base handler
still owns arrow navigation, Escape, Tab, and undo/redo. The delegate only intercepts
cell-activation keys (Enter, Space, printable characters) where behavior differs by
column type.

### 3.10 Rendering

The database renderer lives in `@pen/database` (the extension package). It renders the
currently active view. The first view type implemented is **table view**.

**Table view layout:**

```text
┌──────────────────────────────────────────────────┐
│  📊 Database Title              [+ View] [⋯]    │  ← title bar
├──────────────────────────────────────────────────┤
│  🔍 Filter  ↕ Sort  ⊞ Group  ⋯                  │  ← toolbar
├──────────────────────────────────────────────────┤
│  ☐ │ Name      │ Status ▾  │ Date    │ # Score  │  ← column headers
│────┼───────────┼───────────┼─────────┼──────────│
│  ☐ │ Alice     │ Active    │ Jan 15  │      92  │  ← data rows
│  ☐ │ Bob       │ Inactive  │ Feb 03  │      67  │
│  ☐ │ Carol     │ Active    │ Mar 22  │      88  │
│────┼───────────┼───────────┼─────────┼──────────│
│                 + New row                  + ▸   │  ← add row / add column
├──────────────────────────────────────────────────┤
│  ◀  Page 1 of 5  ▶     50 rows per page         │  ← pagination (when needed)
└──────────────────────────────────────────────────┘
```

**Interaction model:**

Same cell selection model as tables (`CellSelection`), plus:

| Gesture | Result |
| --------- | -------- |
| Click column header | Sort by column (cycle: none → asc → desc → none) |
| Shift+click column header | Multi-sort: add column to sort stack |
| Right-click column header | Column menu (type, rename, hide, pin, delete) |
| Drag column header edge | Resize column (updates database view sizing state) |
| Drag column header | Reorder column (updates database view column order state) |
| Click row checkbox | Toggle row selection |
| Click header checkbox | Select/deselect all rows |
| Selected rows + Delete | Delete selected rows |
| Toolbar Filter button | Open filter panel |
| Toolbar Sort button | Open sort panel (manage multi-sort stack) |
| Toolbar Group button | Group by column |
| Toolbar Search input | Global fuzzy filter across all columns |

**Cell editing for non-text types:**

| Type | Activation | Behavior |
| ------ | ----------- | ---------- |
| `checkbox` | Click, Space, Enter | Toggle value; no contenteditable |
| `select` | Enter, click display | Open dropdown; select option |
| `multiSelect` | Enter, click display | Open multi-dropdown; toggle options |
| `date` | Enter, click display | Open date picker; commit on close |
| `relation` | Enter, click display | Open relation picker |
| `formula` | — | Read-only; shows computed value |
| `text`, `number`, `url`, `email` | Double-click, Enter, F2, type | Contenteditable editing |

**Database title:** The title bar contains an inline-editable text field. Clicking it
activates a contenteditable span that reads/writes the `title` block prop. Blur or
Enter commits. The title is also the block's display name in slash-menu search and
document outline.

**Empty state:** A newly inserted database starts with 3 columns (Name/text, Tags/select,
Status/checkbox) and 0 rows. The body area shows a centered "+ New row" prompt. This
matches Notion's pattern of providing useful defaults rather than a blank grid.

**Number formatting:** The column schema supports an optional `format` field on number
columns:

```text
columns[colIndex]: Y.Map
  ...
  format: Y.Map?               ← only for number columns
    style: "plain" | "currency" | "percent"
    decimals: number?           ← fixed decimal places (default: auto)
    currency: string?           ← ISO 4217 code (e.g. "USD", "EUR")
```

The `DatabaseEngine.parseCellValue` applies `Intl.NumberFormat` for display. Editing
always shows the raw number string.

**Date formatting:** Similarly, date columns support a `format` field:

```text
columns[colIndex]: Y.Map
  ...
  format: Y.Map?               ← only for date columns
    includeTime: boolean        ← show time component (default: false)
    dateStyle: "short" | "medium" | "long"
```

Display uses `Intl.DateTimeFormat`. The date picker UI respects `includeTime`.

### 3.11 Filter Specification

Filters are stored per-view and use a composable tree structure:

```typescript
interface FilterGroup {
  operator: "and" | "or";
  conditions: (FilterCondition | FilterGroup)[];
}

interface FilterCondition {
  columnId: string;
  operator: FilterOperator;
  value: string | string[] | null;
}
```

**Filter operators by column type:**

| Column Type | Operators |
| ------------- | ----------- |
| `text`, `url`, `email` | `is`, `is_not`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty` |
| `number` | `=`, `!=`, `>`, `<`, `>=`, `<=`, `is_empty`, `is_not_empty` |
| `checkbox` | `is_checked`, `is_unchecked` |
| `select` | `is`, `is_not`, `is_any_of`, `is_none_of`, `is_empty`, `is_not_empty` |
| `multiSelect` | `contains`, `not_contains`, `is_any_of`, `is_none_of`, `is_empty`, `is_not_empty` |
| `date` | `is`, `is_before`, `is_after`, `is_between`, `is_relative` (this week, last 7 days, etc.), `is_empty`, `is_not_empty` |

**Filter panel UI:** Opened via toolbar button. Renders a vertical list of conditions,
each with column selector, operator selector, and value input. "Add filter" button at
bottom. "Add filter group" for nested AND/OR. Each condition has a remove button.

For client-side mode, filters are applied by the engine's filter pipeline with
per-type operator semantics. For server-side mode, the filter tree is serialized and
sent to `DatabaseDataProvider.fetch()`.

### 3.12 Table ↔ Database Conversion

Users should be able to convert between table and database blocks in both directions.

**Table → Database:**

1. Create a new database block with one column per table column (all typed `text`).
2. Copy all cell Y.Text content from the table rows into the shared grid storage.
3. If `hasHeaderRow`, use the first row's cell content as column titles.
4. Assign stable row UUIDs.
5. Replace the table block with the database block in the document.
6. The operation is a single undoable transaction.

**Database → Table:**

1. Create a new table block with the same column count and shared grid shape.
2. Set `hasHeaderRow: true`; first row contains column titles.
3. Copy all cell Y.Text content (raw strings, no type interpretation).
4. View state, column types, options, and schema are discarded.
5. Replace the database block with the table block in the document.
6. Single undoable transaction.

Both conversions are available via the block menu ("Turn into → Table" / "Turn into →
Database") and via `editor.convertBlock(blockId, targetType)`.

### 3.13 Serialization

- **Markdown:** GFM pipe table with typed cell formatting.
- **HTML:** `<table>` with `data-col-type` attributes on `<th>` elements.
- **Import:** Markdown/HTML tables with column type hints parse into database blocks.

### 3.14 Extension API

```typescript
import { databaseExtension } from "@pen/database";

const editor = createEditor({
  extensions: [
    databaseExtension({
      dataProvider: myRemoteProvider,  // optional
    }),
  ],
});
```

---

## 4. Unified Selection Model

Both table and database blocks share a single selection model managed in `@pen/core`.

### 4.1 Selection Types (unchanged)

```typescript
TextSelection   { type: "text"; ... }
BlockSelection  { type: "block"; blockIds }
CellSelection   { type: "cell"; blockId; anchor: { row, col }; head: { row, col } }
```

### 4.2 `deleteSelection()` — Cell Support

**Current gap:** `editor.deleteSelection()` does nothing for `CellSelection`.

**Fix:** Add cell selection handling to `SelectionManagerImpl.deleteSelection()`:

```typescript
if (sel.type === "cell") {
  const block = this._editor.getBlock(sel.blockId);
  if (!block) return;
  const minRow = Math.min(sel.anchor.row, sel.head.row);
  const maxRow = Math.max(sel.anchor.row, sel.head.row);
  const minCol = Math.min(sel.anchor.col, sel.head.col);
  const maxCol = Math.max(sel.anchor.col, sel.head.col);

  const ops: DocumentOp[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = block.tableCell(r, c);
      if (!cell) continue;
      const text = cell.textContent();
      if (text.length > 0) {
        ops.push({
          type: "delete-table-cell-text",
          blockId: sel.blockId,
          row: r, col: c, offset: 0, length: text.length,
        });
      }
    }
  }
  if (ops.length > 0) this._editor.apply(ops);
  // Collapse selection to anchor cell
  this._setSelection({ ...sel, head: sel.anchor });
}
```

This eliminates the need for ad-hoc `clearSelectedCells` in extensions.

### 4.3 Clipboard Pipeline — Cell Support

**Copy (`Cmd+C`) with `CellSelection`:**

1. `getSelectedText()` returns tab-separated cell content (already works).
2. Additionally, write a `pen/cells` clipboard format with structured data for
   paste-into-table support.

**Paste (`Cmd+V`) with `CellSelection`:**

1. If clipboard has `pen/cells` format, paste cells into the range starting at the
   anchor cell.
2. If clipboard has plain text with tabs/newlines, parse as cell grid and paste.
3. Otherwise, paste as text into the active cell.

**Cut (`Cmd+X`) with `CellSelection`:**

1. Copy cells (as above).
2. Call `deleteSelection()` to clear the range.

### 4.4 Cell Selection Keyboard (core, not extension)

The base cell selection keyboard handler lives in `@pen/react`'s root keyboard handler.
It fires for any block with `fieldEditor: "table"` or `fieldEditor: "database"`. No
coordination slots needed (except the single `"database:cell-keydown"` delegate from
Section 3.9).

| Key | Selection = Cell | Selection = Block (table/db) |
| ----- | ----------------- | ------------------------------ |
| Arrows | Move cell selection | Move to adjacent block |
| Shift+Arrows | Extend cell range | — |
| Tab / Shift+Tab | Move to next/prev cell | — |
| Enter / F2 | Activate cell editing | Insert paragraph after block |
| Backspace / Delete | Clear selected cells | Delete block |
| Escape | See escape hierarchy | Deselect |
| Cmd+A | Select all cells | — |
| Cmd+C | Copy cell range | — |
| Cmd+X | Cut cell range | — |
| Cmd+V | Paste into cells | — |
| Cmd+Z | Undo | Undo |
| Cmd+Shift+Z | Redo | Redo |
| Printable key | Clear cell, type | — |

The database extension extends this with type-specific overrides (e.g., Space toggles
checkbox, Enter on select opens dropdown) via the `"database:cell-keydown"` delegate
(Section 3.9).

### 4.5 Selection Scopes: CellSelection vs Database Row Selection

Two distinct selection concepts coexist in the database block:

1. **`CellSelection` (Pen core):** A rectangular cell range for spreadsheet-like
   navigation, clipboard, and deletion. This is the editor-level selection that determines
   which cells have the blue highlight, which cells are cleared on Backspace, and which
   cells are copied on Cmd+C.

2. **Database row selection (database extension):** A set of row IDs for bulk data
   operations (delete rows, export rows, update field). This is the checkbox column.
   Row selection is managed by the database engine / renderer state and is orthogonal to
   `CellSelection`.

These do not conflict: clicking a cell sets `CellSelection`; clicking a row checkbox
toggles database row selection. They serve different purposes and are never confused.

### 4.6 Focus Hierarchy

Shared by both table and database:

```text
No selection
    ↕ click table frame / Escape from block selection
Block selected (table outline highlighted)
    ↕ Enter / click cell / arrow into table
Cell selected (cell outline highlighted, no caret)
    ↕ Enter / F2 / double-click / type printable key
Cell editing (caret in cell, contenteditable active)
```

---

## 5. Structural Interaction

These behaviors apply to both table and database blocks.

### 5.1 Click Above/Below

Clicking in the editor content area above the first block or below the last block
inserts a new paragraph (or focuses an existing empty one). This is handled in
`content.tsx`'s click handler and ensures users can always write around structural blocks.

### 5.2 Enter on Block Selection

When a table or database is block-selected, pressing Enter inserts a new paragraph
after the block and activates it.

### 5.3 Arrow Key Navigation

Arrowing up from the first row of a table/database or down from the last row exits to
the adjacent block. If the adjacent block is structural (another table, image, etc.),
it becomes block-selected. If it's inline-editable, the caret is placed at the
appropriate boundary.

Arrowing into a table/database from an adjacent block selects the nearest edge cell.

### 5.4 Deletion

- Block-selected table/database + Backspace/Delete → `editor.deleteSelection()` →
  `delete-block` op → undoable.
- Cell selection + Backspace/Delete → `editor.deleteSelection()` →
  `delete-table-cell-text` ops → undoable.

---

## 6. Package Structure

```text
packages/
  schema/default/src/blocks/
    table.ts          ← table block (unchanged)
    database.ts       ← database block (renamed from collection.ts)
  rendering/react/src/
    renderers/
      table.tsx       ← built-in table renderer
    primitives/editor/
      tableCellContent.tsx  ← built-in text cell component
    utils/
      tableCellNavigation.ts  ← base cell keyboard handler
      escapeSelection.ts      ← escape hierarchy
  extensions/
    database/             ← NEW: replaces smart-table + collection
      src/
        index.ts
        extension.ts      ← defineExtension, register renderer
        engine/
          index.ts        ← DatabaseEngine entry
          derive.ts       ← columns + rows from CRDT / provider
          filter.ts       ← filter tree evaluation
          search.ts       ← global search scoring
          sort.ts         ← compare + multi-sort
          group.ts        ← grouping + expansion model
          paginate.ts     ← pagination helpers
          facet.ts        ← unique values / counts
          types.ts        ← engine-local state + view model types
        renderer.tsx      ← Database renderer (table view)
        cellEditors/      ← type-specific cell editors
          text.tsx
          number.tsx
          checkbox.tsx
          select.tsx
          multiSelect.tsx
          date.tsx
          url.tsx
          email.tsx
          relation.tsx
          formula.tsx
        toolbar.tsx       ← filter, sort, group, search, view controls
        columnMenu.tsx    ← column header context menu
        pagination.tsx    ← pagination controls
        provider.ts       ← DatabaseDataProvider interface
        types.ts          ← shared types
```

**Removed packages:**

- `packages/extensions/smart-table/` — replaced by `@pen/database`
- `packages/rendering/react/src/renderers/collection.tsx` — replaced by `database`

**Preserved:**

- `packages/rendering/react/src/renderers/table.tsx` — built-in, enhanced

---

## 7. Migration from Current State

### 7.1 Smart Table → Database

1. Remove `@pen/smart-table` package.
2. Create `@pen/database` package with the new architecture.
3. Move column type logic, cell editors, column menu from smart-table into database.
4. Implement `DatabaseEngine` as a Pen-native headless state machine.
5. Do **not** introduce or retain a dependency on TanStack Table. This wave replaces
   the temporary wrapper approach entirely.

### 7.2 Collection → Database

1. Rename block type from `"collection"` to `"database"`.
2. Migrate collection schema into structured `tableColumns` metadata plus
   `databaseViews` where needed.
3. Migrate collection rows into shared `tableContent` rows with stable row IDs.
4. Update import/export extensions to handle `"database"` type.
5. Remove `collection.tsx` renderer and route all collection-era entry points to database.

### 7.3 Base Table Enhancement

1. Move cell selection handling (`CellSelection` delete, copy, paste) into
   `editor.deleteSelection()` in `@pen/core`.
2. Keep base cell navigation in `@pen/react` (no slot coordination needed).
3. Add column resize drag handles.
4. Add right-click context menu for row/column operations.

---

## 8. Implementation Phases

### Phase 1: Core Selection Fixes

- [ ] Add `CellSelection` handling to `editor.deleteSelection()`
- [ ] Add cell clipboard support (copy/cut/paste with `CellSelection`)
- [ ] Move undo/redo shortcut to root-level keydown (already done)
- [ ] Move base cell navigation to root keydown (already done)
- [ ] Remove smart-table coordination slot

### Phase 2: Table Block Polish

- [ ] Column resize via drag handles (`columnWidths` prop)
- [ ] Right-click context menu (insert/delete row/column)
- [ ] Row drag reordering
- [ ] Column drag reordering
- [ ] Header row toggle in context menu
- [ ] Markdown/HTML round-trip tests

### Phase 3: Database Extension — Foundation

- [ ] Create `@pen/database` package with no TanStack dependency
- [ ] Define `database` block schema with `fieldEditor: "database"` (rename from collection)
- [ ] Extend shared grid storage with stable row IDs and structured `tableColumns`
- [ ] Implement `DatabaseEngine` as a Pen-native derived row-model engine
- [ ] Implement database table view renderer on top of `DatabaseViewModel`
- [ ] Implement cell editors for all column types
- [ ] Register `"database:cell-keydown"` delegate for type-specific key handling
- [ ] Column header menu (type, rename, hide, delete)
- [ ] Column type conversion with value coercion (`database-convert-column`)
- [ ] Select/multiSelect option CRUD (add, remove, rename, recolor, reorder)
- [ ] Inline database title editing
- [ ] Empty state with default columns and "+ New row" prompt
- [ ] Add/remove columns and rows
- [ ] Bulk row deletion (`database-delete-rows`)
- [ ] Duplicate row (`database-duplicate-row`)

### Phase 3.1: Exact First Slice

This is the concrete first implementation slice that should land before advanced database
features. It gives us a correct data model and a minimal but durable renderer.

**Types (`@pen/types`):**

- [ ] Extend `TableColumnSchema` to the exact shape in §3.2.1
- [ ] Add `ColumnType`, `SelectOption`, `NumberFormat`, `DateFormat`
- [ ] Add `DatabaseSort`, `FilterOperator`, `FilterCondition`, `FilterGroup`
- [ ] Add `DatabaseViewState` and `DatabaseQuery`
- [ ] Add ops:
  - `database-update-view`
  - `database-update-select-options`
  - `database-delete-rows`
  - `database-duplicate-row`

**CRDT (`@pen/crdt-yjs` + core apply):**

- [ ] Keep `tableContent` as the shared row/cell store
- [ ] Guarantee every row has `id: string`
- [ ] Store `tableColumns` as structured Yjs data, not lossy serialized JSON
- [ ] Seed a new `database` block with:
  - columns: `Name/text`, `Tags/select`, `Status/checkbox`
  - rows: none
  - one implicit default table view

**Handles (`@pen/core`):**

- [ ] `BlockHandle.tableColumns()` returns full structured `TableColumnSchema[]`
- [ ] Add `BlockHandle.tableRow(rowIndex)` or equivalent stable row-id accessor
- [ ] Preserve `block.tableCell(r, c)` as the canonical cell accessor

**Renderer (`@pen/database`):**

- [ ] Minimal table-view renderer
- [ ] Inline title editing
- [ ] Column menu: rename, type change, delete
- [ ] Row selection + bulk delete
- [ ] Type-specific cell editors
- [ ] Shared `CellSelection` behavior from `@pen/react`

**Engine (`@pen/database`):**

- [ ] `deriveColumns()`
- [ ] `deriveRows()`
- [ ] `sortRows()`
- [ ] `filterRows()`
- [ ] `paginateRows()`
- [ ] `buildViewModel()`

**Deferred from this exact slice:**

- [ ] grouping
- [ ] faceting autocomplete
- [ ] board/calendar/gallery/list views
- [ ] remote/hybrid providers
- [ ] virtualization

### Phase 3.2: Package-by-Package Landing Order

This is the recommended merge order for implementation. Each step should leave the
repo in a releasable state and reduce architectural risk for the next step.

#### Step 1 — `@pen/types`

- [ ] Extend `ContentType` with `"database"`
- [ ] Finalize `TableColumnSchema`, `TableRowHandle`, `ColumnType`, view/query types
- [ ] Add database-specific document ops and public editor contracts
- [ ] Ensure all downstream packages compile against the new types before moving on

#### Step 2 — `@pen/crdt-yjs` + `@pen/core` apply pipeline

- [ ] Teach block creation / conversion to seed `database` blocks correctly
- [ ] Store `tableColumns` and `databaseViews` as structured Yjs data
- [ ] Guarantee stable row IDs in `tableContent`
- [ ] Keep `editor.apply()` as the only write path; no renderer-side CRDT mutation

#### Step 3 — `@pen/core` handles + selection

- [ ] Expose `tableColumns()` and stable row accessors on `BlockHandle`
- [ ] Finish `CellSelection` delete/copy/cut/paste behavior in core/editor plumbing
- [ ] Make selection/clipboard behavior identical for `table` and `database`
- [ ] Add tests for row-ID stability and structured column reads

#### Step 4 — `schema/default`

- [ ] Add the `database` block definition
- [ ] Seed default columns and title behavior
- [ ] Remove or migrate the old `collection` entry point
- [ ] Verify slash menu / default schema / zero-config editor creation paths

#### Step 5 — `@pen/react` shared grid behavior

- [ ] Keep `table.tsx` as the canonical lightweight grid renderer
- [ ] Move shared cell-selection helpers into `@pen/react` utilities
- [ ] Ensure root keyboard handling and pointer-gesture logic work for both content types
- [ ] Verify `table` remains extension-free and fully functional on its own

#### Step 6 — `@pen/database` engine foundation

- [ ] Land pure engine modules first: `derive`, `sort`, `filter`, `paginate`, `buildViewModel`
- [ ] Keep them deterministic and framework-agnostic
- [ ] Feed only CRDT/provider inputs plus serializable view state
- [ ] Add focused unit tests before the renderer depends on them

#### Step 7 — `@pen/database` renderer foundation

- [ ] Land minimal table-view renderer on top of `DatabaseViewModel`
- [ ] Reuse shared `CellSelection` and cell-editing hooks from `@pen/react`
- [ ] Support title editing, default columns, add row/column, and type-aware editors
- [ ] Keep advanced features (grouping, faceting, virtualization, alternate views) out

#### Step 8 — Feature Layers

- [ ] Add sorting/filter/search/group/pin/visibility incrementally
- [ ] Add provider mode after local mode is stable
- [ ] Add alternate views only after the table view API and state model settle
- [ ] Add virtualization last, at the renderer layer, after correctness is proven

### Phase 3.3: Merge Gates

Each step above should satisfy these gates before the next one lands:

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Table block behavior remains unchanged unless explicitly targeted
- [ ] No TanStack dependency or compatibility layer re-enters the codebase

### Phase 4: Database Extension — Features

- [ ] Add view CRDT structures (deferred from Phase 3)
- [ ] Sorting via engine `sortRows()` (click header, sort panel)
- [ ] Multi-sort with Shift+click header
- [ ] Custom compare function per column type
- [ ] Filter panel with per-type operators and compound AND/OR groups
- [ ] Filtering via engine `filterRows()` with per-type operator semantics
- [ ] Global search via engine `searchRows()` with Pen-owned ranking/scoring
- [ ] Column faceting via engine `facetColumnValues()` (filter autocomplete)
- [ ] Grouping via engine `groupRows()` (group by column)
- [ ] Row expanding for grouped rows
- [ ] Pagination via engine `paginateRows()` (client-side)
- [ ] Column sizing state + drag handles
- [ ] Column ordering state + drag-and-drop reorder
- [ ] Column pinning state (pin left/right, sticky columns)
- [ ] Column visibility state (show/hide from column menu)
- [ ] Row selection state (checkboxes, bulk actions)
- [ ] Row pinning state (pin rows to top/bottom)
- [ ] Row virtualization with a renderer-level virtualization layer, independent of table engine
- [ ] Number formatting (currency, percent, decimals)
- [ ] Date formatting (includeTime, dateStyle)
- [ ] Table ↔ Database conversion

### Phase 5: Database Extension — Data Providers

- [ ] `DatabaseDataProvider` interface
- [ ] Server-side sorting, filtering, pagination
- [ ] Hybrid mode (remote rows + local metadata)
- [ ] Streaming row updates via `provider.subscribe()`

### Phase 6: Database Extension — Views

- [ ] Board view (Kanban)
- [ ] Calendar view
- [ ] Gallery view
- [ ] List view
- [ ] View tabs and switching

---

## 9. Acceptance Criteria

### Table Block

- **AC-T1:** Table block renders in `@pen/react` without any extension loaded.
- **AC-T2:** Click cell → cell selected. Double-click → editing. Escape → cell → block → deselect.
- **AC-T3:** Backspace on block-selected table deletes it. Cmd+Z restores it.
- **AC-T4:** Backspace on cell selection clears cells via `editor.deleteSelection()`.
- **AC-T5:** Arrow keys navigate cells; exit to adjacent blocks at edges.
- **AC-T6:** Tab/Shift+Tab navigate cells linearly.
- **AC-T7:** Click above/below table inserts paragraph.
- **AC-T8:** Enter on block-selected table inserts paragraph after.
- **AC-T9:** Cmd+C copies cell range as tab-separated text.
- **AC-T10:** Column resize via drag updates `columnWidths` prop.
- **AC-T11:** Markdown round-trip preserves table content.

### Database Block

- **AC-D1:** Database block renders only when `@pen/database` extension is loaded.
- **AC-D2:** Same cell selection model as table (AC-T2 through AC-T6).
- **AC-D3:** Type-specific cell editors dispatch correctly; non-text cells never crash.
- **AC-D4:** Checkbox toggles on click/Space/Enter. Date opens picker. Select opens dropdown.
- **AC-D5:** Sorting via column header click. Filter panel filters rows.
- **AC-D6:** Pagination for datasets > 100 rows.
- **AC-D7:** `DatabaseDataProvider` can supply remote data with server-side query.
- **AC-D8:** Database deletion + undo/redo works.
- **AC-D9:** Column add/remove/rename/type-change works and is undoable.
- **AC-D10:** Row selection via checkbox column enables bulk operations.
- **AC-D11:** Column type conversion coerces existing cell values per §3.5 rules.
- **AC-D12:** Select/multiSelect options can be added, removed, renamed, and recolored.
- **AC-D13:** Database title is inline-editable; changes persist to block prop.
- **AC-D14:** Filter panel supports per-type operators and compound AND/OR groups.
- **AC-D15:** Table → Database and Database → Table conversion is undoable.
- **AC-D16:** Empty database shows default columns and "+ New row" prompt.
- **AC-D17:** Bulk row deletion via row selection + Delete key.
- **AC-D18:** Column visibility toggle hides/shows columns without data loss.
- **AC-D19:** Column pinning sticks columns left/right during horizontal scroll.
- **AC-D20:** Multi-sort via Shift+click cycles through asc/desc/none per column.
- **AC-D21:** Global search filters rows across all visible columns using the Pen-native engine.
- **AC-D22:** Column faceting shows unique values in filter autocomplete.

---

## 10. Non-Goals (Deferred)

- **Merged cells** — Complex interaction model; defer to a future wave.
- **Formula engine** — Display computed values but don't build a formula evaluator yet.
- **Real-time collaborative cursors in table cells** — Awareness-level feature; defer.
- **Board/Calendar/Gallery views** — Phase 6; table view is the priority.
- **Import from CSV/Excel** — Separate import extension; not part of this architecture doc.
- **Row detail / expand view** — Notion-style side panel for editing a single row; defer.
- **Drag to fill** — Excel-style drag-handle to fill a range from a pattern; defer.
- **Column description / tooltip** — Notion-style column description; defer.
- **Calculation row** — Sum/count/average footer row; defer.
- **Linked databases** — Notion-style references to databases in other documents; defer.
