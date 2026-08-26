# Styling

Pen is headless. `@input/pen-react` ships no required stylesheet, and an editor with no host CSS is functional: editable, with a visible caret, native text selection, and the user-agent focus outline. Hosts own taste. This file is the HOST6 contract (`spec/rules/host.md`) and the workspace custom-property catalog.

Set override tokens on a parent of the editor (typically `[data-pen-editor-root]` or `:root`). There is no `.css` file under `packages/rendering/{react,vue,dom}`. The only injected sheet is the AI suggestion underline hover/active remaps, mounted when `<Pen.AISuggestions.Root>` is in the tree (`#pen-ai-suggestions-styles`).

## Required styles (stay)

These exist so the editor remains operable without host CSS. They are listed because HOST6 requires the correctness surface to be named, not because they are a theme.

| Surface                | What the library paints                                                                                                                                                            | How to override                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Caret overlay          | `[data-pen-editor-caret]` / `[data-pen-multiplayer-caret]` / `[data-pen-drop-caret]` via inline styles and the caret tokens below. Overlay carets stay `aria-hidden` (AX7).        | `--pen-editor-caret-*`, `--pen-caret-*`, `--pen-drop-caret-*`, `--pen-peer-*`.            |
| Selection highlight    | Text selection stays native `::selection`. `[data-pen-selection-rect]` is geometry only (position/size, `pointer-events: none`, no fill). Block selection is `data-selected` only. | Host `::selection` and `[data-selected]`. Do not expect a library fill on the rect.       |
| Focus ring             | Nothing of its own, and no `outline: none`. The UA `:focus-visible` ring is the AX5 signal.                                                                                        | Host `:focus-visible` on `[data-pen-inline-content]` / `[data-pen-field-editor-surface]`. |
| Suggestion decorations | Underline on `[data-ai-suggestion-id]` via `--pen-ai-suggestion-line`. The injected sheet remaps that token on hover/active. AI review ranges use the review tokens below.         | Suggestion-line and review tokens.                                                        |

## Taste (custom properties)

Every `--pen-*` token the library **reads** is listed with its fallback and purpose. Geometry variables the library **writes** (caret height, contextual-prompt top/left/width/height) are not host tokens.

### Caret overlay

| Token                          | Default                                                                                                   | Purpose                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `--pen-editor-caret-width`     | `var(--pen-caret-width, 1px)` (macOS caret: `2px`)                                                        | Local caret thickness.                                        |
| `--pen-editor-caret-radius`    | `var(--pen-caret-radius, 0px)` (macOS caret: `999px`)                                                     | Local caret corner radius.                                    |
| `--pen-editor-caret-color`     | `var(--pen-caret-color, var(--palette-b100, currentColor))` (macOS caret: `var(--palette-blue, #0a84ff)`) | Local caret fill.                                             |
| `--pen-editor-caret-shadow`    | `none`                                                                                                    | Local caret shadow.                                           |
| `--pen-editor-caret-animation` | `none`                                                                                                    | Local caret blink; library sets `none` while blink is paused. |
| `--pen-editor-caret-opacity`   | `1`                                                                                                       | Local caret opacity.                                          |
| `--pen-caret-width`            | `2px` on remote carets; also the fallback for the local/drop carets                                       | Shared caret thickness.                                       |
| `--pen-caret-radius`           | `999px` on remote carets; also the fallback for the local/drop carets                                     | Shared caret corner radius.                                   |
| `--pen-caret-color`            | `currentColor` (drop caret); see editor-caret color for the local fallback chain                          | Shared caret fill fallback.                                   |
| `--pen-drop-caret-width`       | `1px`                                                                                                     | Inline-atom / image drop caret thickness.                     |
| `--pen-drop-caret-offset`      | `-0.5px`                                                                                                  | Drop caret `margin-left`.                                     |
| `--pen-drop-caret-color`       | `var(--pen-caret-color, currentColor)`                                                                    | Drop caret fill.                                              |
| `--pen-drop-caret-radius`      | `999px`                                                                                                   | Drop caret corner radius.                                     |
| `--pen-drop-caret-shadow`      | `none`                                                                                                    | Drop caret shadow.                                            |

### Multiplayer

| Token                    | Default                                      | Purpose                                                                                                          |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--pen-peer-color`       | The peer's `user.color`, else `currentColor` | Remote caret and label background. Written per caret; override on a parent if every peer should share one color. |
| `--pen-peer-label-color` | `#fff`                                       | Remote caret label text.                                                                                         |

### Suggestion line

Read by `@input/pen-ai-suggestions` decorations; remapped by the injected sheet on `<Pen.AISuggestions.Root>`.

| Token                                   | Default   | Purpose                                       |
| --------------------------------------- | --------- | --------------------------------------------- |
| `--pen-ai-suggestion-line`              | `#3b82f6` | Underline color on `[data-ai-suggestion-id]`. |
| `--pen-ai-suggestion-line-hover`        | `#1d4ed8` | Hover remap.                                  |
| `--pen-ai-suggestion-line-active`       | `#1d4ed8` | Active remap (`.pen-ai-suggestion-active`).   |
| `--pen-ai-suggestion-line-active-hover` | `#1e40af` | Active + hover remap.                         |

### Contextual prompt selection overlay

| Token                                                | Default                                                                              | Purpose                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `--pen-ai-contextual-prompt-selection-background`    | `#2563eb`                                                                            | Overlay fill (paired with a `color-mix` fallback at 12%). |
| `--pen-ai-contextual-prompt-selection-box-shadow`    | `inset 0 0 0 1px rgba(96, 165, 250, 0.72), inset 0 -1px 0 rgba(147, 197, 253, 0.92)` | Overlay edge.                                             |
| `--pen-ai-contextual-prompt-selection-border-radius` | `4px`                                                                                | Overlay corner radius.                                    |

### AI review (painted by `@input/pen-ai` decorations in this tree)

Review presentation ships as one stylesheet and one class vocabulary, both
exported from `@input/pen-dom` (RS4). Adopt the sheet once, then theme it with
the custom properties below — do not re-declare the rule blocks, which is how
hosts drift out of sync with what the decorations actually emit:

```ts
import { PEN_REVIEW_STYLESHEET } from "@input/pen-dom";

const style = document.createElement("style");
style.textContent = PEN_REVIEW_STYLESHEET;
document.head.prepend(style);
```

It is exported as text rather than a `.css` file because every published
package sets `sideEffects: false` (API7), which entitles a bundler to drop a
bare stylesheet import. `REVIEW_SURFACE_CLASSES`,
`REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES`, and
`REVIEW_SURFACE_CUSTOM_PROPERTIES` are exported alongside it, so a host that
writes its own rules can still reference the names rather than retyping them.

| Token                                  | Default                                              | Purpose                                                 |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `--pen-ai-review-insert-color`         | `#6d28d9`                                            | Inserted text color.                                    |
| `--pen-ai-review-insert-background`    | `color-mix(in srgb, #7c3aed 12%, transparent)`       | Inserted text fill.                                     |
| `--pen-ai-review-delete-color`         | `#6b7280`                                            | Deleted and replaced-original text, struck through.     |
| `--pen-ai-review-context-background`   | `color-mix(in srgb, #2563eb 14%, transparent)`       | Selection context and affected-range fill.              |
| `--pen-ai-review-context-box-shadow`   | `none`                                               | Context edge.                                           |
| `--pen-ai-review-border-radius`        | `3px`                                                | Insert / context / affected-range corner radius.        |
| `--pen-ai-review-inline-padding-block` | `0.2em`                                              | Insert / context inline padding.                        |
| `--pen-ai-review-inline-margin-block`  | `-0.2em`                                             | Insert / context inline margin.                         |

Earlier revisions of this table listed `--pen-ai-affected-range-*` tokens and
warned that none of these properties did anything, because `@input/pen-ai` set
them in an inline `style` attribute that the renderer drops under SEC2. The
sheet is where they live now, so they work; affected-range shares the context
properties instead of carrying its own set.

## Class hooks

These `class` values are written by this package (or by the AI-suggestions sheet it injects). There is no shipped rule for most of them — they are host selectors.

| Class                            | Where                                                                       |
| -------------------------------- | --------------------------------------------------------------------------- |
| `pen-ephemeral-suggestion`       | Empty-block inline completion surface.                                      |
| `pen-autocomplete-preview-block` | Autocomplete preview block.                                                 |
| `pen-table-shell`                | Table outer shell.                                                          |
| `pen-table-main`                 | Table + add-row column.                                                     |
| `pen-table-add-column-control`   | Add-column control. Library sets a 24×24px min size (WCAG 2.2 target-size). |
| `pen-table-add-row-control`      | Add-row control. Library sets a 24×24px min size (WCAG 2.2 target-size).    |
| `pen-col-menu`                   | Table column menu root.                                                     |
| `pen-col-menu-title-row`         | Column menu title row.                                                      |
| `pen-col-menu-title-input`       | Column menu title input.                                                    |
| `pen-col-menu-section`           | Column menu section label.                                                  |
| `pen-col-menu-divider`           | Column menu divider.                                                        |
| `pen-col-menu-item`              | Column menu item.                                                           |
| `pen-col-menu-icon`              | Column menu item icon.                                                      |
| `pen-col-menu-danger`            | Destructive column menu item (with `pen-col-menu-item`).                    |
| `pen-ai-suggestion-underline`    | Suggestion mark; targeted by the injected sheet.                            |
| `pen-ai-suggestion-active`       | Active suggestion mark; targeted by the injected sheet.                     |

Decoration classes from `@input/pen-ai` / `@input/pen-ai-suggestions` that land in this tree (not assigned as React `className` in this package): `pen-ai-suggestion-animated`, plus the review vocabulary. The review names are not restated here — they are exported as `REVIEW_SURFACE_CLASSES` and `REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES` from `@input/pen-dom` and styled by `PEN_REVIEW_STYLESHEET` (see [AI review](#ai-review-painted-by-inputpen-ai-decorations-in-this-tree) above), so a list in this file could only go stale.

Code blocks may also get `language-${language}` from the fence language (Prism convention), not a Pen theme class.

## Data-attribute hooks

Boolean `data-*` attributes are the valueless HTML form (`data-readonly=""`), omitted when off. Write the bare selector `[data-readonly]`, not `[data-readonly=""]` or `[data-readonly="true"]`. Both the bare form and `[data-readonly=""]` match today; the bare form stays correct if one of these attributes ever carries a real value. The bare-attribute rule is for `data-*` only.

ARIA booleans are not valueless. They are the strings `"true"` and `"false"` (`aria-expanded="true"`, `aria-hidden="true"`, `aria-readonly="true"`). `aria-hidden=""` is invalid, and `[aria-hidden=""]` matches nothing. Do not extend the valueless `data-*` convention to ARIA.

State attributes below are written when the state is true — **present** (valueless), never `"true"`. `data-readonly` tracks the `readonly` **prop**, not `pen.ariaReadOnly`. Do not invent selectors that are not in this list.

```css
[data-readonly] {
  /* host taste — not [data-readonly="true"] or [data-readonly=""] */
}
```

### Editor chrome

| Attribute                            | Role                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-pen-editor-root`               | Editor root. Also `data-pen-view-id`. Booleans, present when they apply: `data-focused` (root contains focus), `data-readonly` (`readonly` prop is on), `data-empty` (document has no content).                                                                                 |
| `data-pen-editor-content`            | Block list surface. Also `data-drop-target` / `data-empty` present when those apply.                                                                                                                                                                                            |
| `data-pen-editor-blocks-host`        | Inner blocks host. Also `data-pen-field-editor-surface` present when the host is the field-editor surface.                                                                                                                                                                      |
| `data-pen-editor-block`              | Block wrapper. Also `data-block-id`, `data-block-type`, and `data-selected` / `data-focused` / `data-surface-role` / `data-drop-target` / `data-drop-position` / `data-ai-generating` present when those apply.                                                                 |
| `data-pen-inline-content`            | Text field. Also `data-pen-field-editor-surface`, and `data-pen-field-editor-active-surface` / `data-placeholder-visible` / `data-placeholder` / `data-suggestion-id` / `data-suggestion-text` / `data-suggestion-type` / `data-suggestion-placement` present when those apply. |
| `data-pen-field-editor`              | Field-editor primitive. Also `data-active` / `data-input-mode` / `data-surface-mode` / `data-expanded` / `data-block-count` present when those apply.                                                                                                                           |
| `data-pen-editor-caret-overlay`      | Local caret overlay host (`aria-hidden`).                                                                                                                                                                                                                                       |
| `data-pen-editor-caret`              | Local caret. Also `data-block-id`, `data-offset`.                                                                                                                                                                                                                               |
| `data-pen-selection-rect`            | Block-selection geometry. Also `data-selecting` while a live drag rect is active.                                                                                                                                                                                               |
| `data-pen-selection-toolbar`         | Selection toolbar root.                                                                                                                                                                                                                                                         |
| `data-pen-selection-toolbar-content` | Selection toolbar content.                                                                                                                                                                                                                                                      |
| `data-pen-drag-overlay`              | Drag overlay host.                                                                                                                                                                                                                                                              |
| `data-pen-drop-caret`                | Drop caret.                                                                                                                                                                                                                                                                     |
| `data-pen-ignore-pointer-gesture`    | Opt out of editor pointer gestures (menus, handles, overlays).                                                                                                                                                                                                                  |
| `data-pen-ignore-transfer`           | Opt out of cut/copy/paste transfer handling.                                                                                                                                                                                                                                    |

### Blocks and layout

| Attribute                          | Role                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| `data-pen-list-item-layout`        | List row. Also `data-block-type`, `data-indent`, `data-selected`. |
| `data-pen-list-item-marker`        | List marker column.                                               |
| `data-pen-list-item-content`       | List text column.                                                 |
| `data-pen-list-marker`             | List marker glyph (`-` / `N.`).                                   |
| `data-pen-blockquote-children`     | Blockquote nested-block host.                                     |
| `data-pen-callout-icon`            | Callout icon.                                                     |
| `data-pen-callout-body`            | Callout body.                                                     |
| `data-pen-callout-children`        | Callout nested-block host.                                        |
| `data-pen-toggle-header`           | Toggle header row.                                                |
| `data-pen-toggle-trigger`          | Toggle expand/collapse control.                                   |
| `data-pen-toggle-trigger-icon`     | Toggle chevron.                                                   |
| `data-pen-toggle-title`            | Toggle title field host.                                          |
| `data-pen-toggle-body`             | Toggle children host.                                             |
| `data-pen-toggle-empty-state`      | Empty open toggle.                                                |
| `data-pen-toggle-empty-button`     | Empty-toggle add-block control.                                   |
| `data-pen-blocked-url`             | Image whose `src` was rejected by URL policy.                     |
| `data-pen-subdocument-host`        | Nested editor host.                                               |
| `data-pen-subdocument-placeholder` | Autocomplete preview placeholder inside a subdocument.            |
| `data-pen-unknown-type`            | Fallback renderer: unknown block type.                            |
| `data-pen-unknown-props`           | Fallback renderer: unknown props dump.                            |
| `data-checked`                     | Checklist item checked state.                                     |

### Tables

| Attribute                   | Role                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| `data-pen-table`            | `<table>`.                                                                     |
| `data-pen-table-frame`      | Frame around the table. Also `data-selected` when the table block is selected. |
| `data-pen-table-row`        | `<tr>`. Also `data-row` (`header` or a row index).                             |
| `data-pen-table-cell`       | `<th>` / `<td>`. Also `data-cell-row`, `data-cell-col`.                        |
| `data-pen-cell-selected`    | Cell in the current cell selection.                                            |
| `data-pen-column-menu`      | Column menu root.                                                              |
| `data-pen-column-menu-item` | Column menu item. Also `data-active` on the current column type.               |

### Handles, drag, autocomplete preview

| Attribute                                   | Role                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `data-pen-block-handle`                     | Block drag handle. Also `data-block-id`, and `data-dragging` while dragging. |
| `data-pen-block-handle-menu`                | Block handle menu.                                                           |
| `data-pen-command`                          | Handle-menu item command id.                                                 |
| `data-pen-block-drag-preview-root`          | Block drag preview portal root.                                              |
| `data-pen-block-drag-preview`               | Block drag preview clone.                                                    |
| `data-pen-inline-atom-drag-preview-root`    | Inline-atom drag preview portal root.                                        |
| `data-pen-inline-atom-drag-preview`         | Inline-atom drag preview.                                                    |
| `data-pen-autocomplete-preview-surface`     | Autocomplete preview surface.                                                |
| `data-pen-autocomplete-preview-content`     | Autocomplete preview content.                                                |
| `data-pen-autocomplete-preview-block`       | Autocomplete preview block.                                                  |
| `data-pen-autocomplete-preview-subdocument` | Autocomplete preview nested document.                                        |

### Toolbar, slash menu, suggestion menu, search

| Attribute                                | Role                                                                |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `data-pen-toolbar`                       | Toolbar root.                                                       |
| `data-pen-toolbar-group`                 | Toolbar group.                                                      |
| `data-pen-toolbar-button`                | Toolbar button.                                                     |
| `data-pen-toolbar-toggle`                | Toolbar toggle.                                                     |
| `data-pen-toolbar-select`                | Toolbar select.                                                     |
| `data-pen-toolbar-separator`             | Toolbar separator.                                                  |
| `data-pen-slash-menu`                    | Slash menu root.                                                    |
| `data-pen-slash-menu-content`            | Slash menu content.                                                 |
| `data-pen-slash-menu-input`              | Slash menu input.                                                   |
| `data-pen-slash-menu-list`               | Slash menu list.                                                    |
| `data-pen-slash-menu-group`              | Slash menu group.                                                   |
| `data-pen-slash-menu-group-heading`      | Slash menu group heading.                                           |
| `data-pen-slash-menu-item`               | Slash menu item. Also `data-selected` on the highlighted item.      |
| `data-pen-slash-menu-empty`              | Slash menu empty state.                                             |
| `data-pen-suggestion-menu`               | Suggestion menu root.                                               |
| `data-pen-suggestion-menu-content`       | Suggestion menu content.                                            |
| `data-pen-suggestion-menu-list`          | Suggestion menu list.                                               |
| `data-pen-suggestion-menu-group`         | Suggestion menu group.                                              |
| `data-pen-suggestion-menu-group-heading` | Suggestion menu group heading.                                      |
| `data-pen-suggestion-menu-item`          | Suggestion menu item. Also `data-selected` on the highlighted item. |
| `data-pen-suggestion-menu-empty`         | Suggestion menu empty state.                                        |
| `data-pen-search-root`                   | Search root.                                                        |
| `data-pen-search-toggle`                 | Search toggle.                                                      |
| `data-pen-search-input`                  | Search input.                                                       |
| `data-pen-search-results`                | Search results.                                                     |
| `data-pen-search-navigation`             | Search next/prev. Also `data-option`.                               |
| `data-pen-search-replace-input`          | Replace input.                                                      |
| `data-pen-search-replace-button`         | Replace control. Also `data-action`.                                |

### Multiplayer

| Attribute                                | Role                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `data-pen-multiplayer-remote-cursors`    | Remote cursor list host.                                                                                   |
| `data-pen-multiplayer-remote-cursor`     | One remote cursor.                                                                                         |
| `data-pen-multiplayer-caret-overlay`     | Remote caret overlay host (`aria-hidden`). Also `data-cursor-count`.                                       |
| `data-pen-multiplayer-caret`             | Remote caret. Also `data-client-id`, `data-user-id`, `data-user-name`, `data-user-color`, `data-block-id`. |
| `data-pen-multiplayer-caret-label`       | Remote caret label.                                                                                        |
| `data-pen-multiplayer-presence-list`     | Presence list.                                                                                             |
| `data-pen-multiplayer-presence-avatar`   | Presence avatar.                                                                                           |
| `data-pen-multiplayer-presence-overflow` | Presence overflow count.                                                                                   |

### AI primitives

| Attribute                                                                                                                                                                                              | Role                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-pen-ai-root`                                                                                                                                                                                     | AI primitive root. Also `data-pen-view-id`.                                                                                                                                                                                                                                                                                         |
| `data-pen-ai-trigger`                                                                                                                                                                                  | AI trigger.                                                                                                                                                                                                                                                                                                                         |
| `data-pen-ai-selection-trigger`                                                                                                                                                                        | Selection AI trigger.                                                                                                                                                                                                                                                                                                               |
| `data-pen-ai-suggestion`                                                                                                                                                                               | Suggestion primitive.                                                                                                                                                                                                                                                                                                               |
| `data-pen-ai-progress`                                                                                                                                                                                 | Progress primitive.                                                                                                                                                                                                                                                                                                                 |
| `data-pen-ai-tool-stream`                                                                                                                                                                              | Tool stream. Also `data-visible`, `data-tool-call-count`, `data-running-tool-count`; children use `data-tool-call`, `data-tool-call-id`, `data-tool-name`, `data-tool-status`, `data-tool-output-parts`, `data-tool-call-summary`, `data-tool-call-name`, `data-tool-call-status`, `data-tool-call-input`, `data-tool-call-output`. |
| `data-pen-ai-actionBar`                                                                                                                                                                                | Accept / reject / retry bar.                                                                                                                                                                                                                                                                                                        |
| `data-pen-ai-accept` / `data-pen-ai-reject` / `data-pen-ai-retry`                                                                                                                                      | Action-bar buttons.                                                                                                                                                                                                                                                                                                                 |
| `data-pen-ai-generationZone`                                                                                                                                                                           | Generation zone.                                                                                                                                                                                                                                                                                                                    |
| `data-pen-ai-trackChanges`                                                                                                                                                                             | Track-changes primitive.                                                                                                                                                                                                                                                                                                            |
| `data-pen-ai-diff-view`                                                                                                                                                                                | Diff view.                                                                                                                                                                                                                                                                                                                          |
| `data-pen-ai-change-list`                                                                                                                                                                              | Change list.                                                                                                                                                                                                                                                                                                                        |
| `data-pen-ai-command-menu` / `data-pen-ai-command-input` / `data-pen-ai-command-list` / `data-pen-ai-command-item`                                                                                     | Command menu.                                                                                                                                                                                                                                                                                                                       |
| `data-pen-ai-suggestions-root`                                                                                                                                                                         | AI suggestions root.                                                                                                                                                                                                                                                                                                                |
| `data-pen-ai-suggestions-popover`                                                                                                                                                                      | AI suggestions popover.                                                                                                                                                                                                                                                                                                             |
| `data-pen-ai-inline-suggestion-control`                                                                                                                                                                | Inline suggestion control. Also `data-suggestion-id`, `data-suggestion-action`, `data-placement`.                                                                                                                                                                                                                                   |
| `data-pen-ai-inline-suggestion-controls`                                                                                                                                                               | Control cluster. Also `data-visible-count`, `data-placement`, `data-has-active-suggestion`.                                                                                                                                                                                                                                         |
| `data-pen-ai-inline-suggestion-nav`                                                                                                                                                                    | Prev / next / count cluster.                                                                                                                                                                                                                                                                                                        |
| `data-pen-ai-inline-suggestion-count` / `-prev` / `-next` / `-accept` / `-reject`                                                                                                                      | Inline suggestion controls.                                                                                                                                                                                                                                                                                                         |
| `data-pen-ai-contextual-prompt` / `data-pen-ai-inline-session`                                                                                                                                         | Contextual prompt / inline session surface.                                                                                                                                                                                                                                                                                         |
| `data-pen-ai-contextual-prompt-trigger`                                                                                                                                                                | Contextual prompt trigger.                                                                                                                                                                                                                                                                                                          |
| `data-pen-ai-contextual-prompt-composer`                                                                                                                                                               | Composer root.                                                                                                                                                                                                                                                                                                                      |
| `data-pen-ai-contextual-prompt-form` / `-header` / `-target` / `-label` / `-target-hint` / `-history` / `-input` / `-controls` / `-prompt` / `-turn` / `-turn-meta` / `-turn-status` / `-turn-actions` | Composer parts (mirrored as `data-pen-ai-inline-session-*`).                                                                                                                                                                                                                                                                        |
| `data-pen-ai-inline-session-spacer` / `-submit` / `-accept` / `-reject` / `-close` / `-actions` / `-turn-accept` / `-turn-reject`                                                                      | Inline-session-only composer parts.                                                                                                                                                                                                                                                                                                 |
| `data-pen-ai-contextual-prompt-selection-overlay` / `-selection-segment`                                                                                                                               | Prompt selection overlay (mirrored as `data-pen-ai-inline-session-selection-*`).                                                                                                                                                                                                                                                    |

Inline-atom marks (`data-pen-inline-atom`, `data-pen-inline-atom-host`, `data-pen-inline-atom-type`, `data-pen-inline-atom-props`, `data-pen-inline-atom-caret-boundary`, `data-pen-inline-atom-caret-side`, `data-pen-inline-atom-dragging`) are written by `@input/pen-dom` inside the field editor, not as React `className` / JSX attributes in this package.

## Not a token

The library also applies layout that is not taste: list indent (`24px` per level), list column gap (`8px`), list marker min-height (`1.5em`), table-cell `min-width` (`6rem`) / `min-height` (`1.5rem`), image width from the block prop, placeholder `position: relative`, and default chrome on the suggestions popover, remote caret label (`padding: 2px 6px`, `font-size: 12px`), and block-drag count badge. Those stay literal.

Replaceable primitives (toolbar, slash/suggestion menus, search, AI composer, column menu) ship no stylesheet. Hosts style the hooks above.

## Conformance follow-ups

These HOST6 / HOST4 scenarios live in `@input/pen-conformance` (`pnpm --filter @input/pen-conformance run test:host-e7`):

- **unstyled-render** — `/?unstyled=1` skips harness `styles.css`; assert editable, caret not transparent, and a UA ring or `[data-pen-editor-caret]`.
- **non-secure-context HTTP** — Chromium maps `pen.test` to `127.0.0.1` so the origin is plain HTTP and not localhost (localhost HTTP is still a secure context). Construct, type, no throw, no error diagnostics (F24). Unit stand-in: `packages/core/src/__tests__/nonSecureContext.test.ts`.
