# Styling (`@input/pen-vue`)

This is the HOST6 styling contract for `@input/pen-vue` (`spec-v2/15-host-integration.md`).

`@input/pen-vue` ships no stylesheet and injects none. An editor with no host CSS is functional: editable, caret visible, blocks in document order. The host owns taste — typography, spacing, colors, list markers, callout chrome, table chrome.

This package reads no CSS custom properties. Tokens that other Pen packages read (`@input/pen-react`, `@input/pen-dom` overlays) are documented in the canonical reference: [`packages/rendering/react/STYLING.md`](../react/STYLING.md).

The library never sets `outline: none`. The UA focus ring is the focus signal (AX5). Selection fill is native `::selection`. Vue does not paint caret overlays or selection rectangles; those belong to `@input/pen-dom` when the shared field-editor is installed.

## What Vue applies itself

Vue sets a few inline styles for layout, not theme:

- List items (`bulletListItem`, `numberedListItem`, `checkListItem`): `margin-left` from `indent * 24px`.
- Image: `width` when the block has a numeric `width` prop.
- Placeholder host (`PenInlineContent`): `position: relative` while a placeholder is shown.
- Table cell text (`PenTableCellContent`): `min-width: 6rem`, `min-height: 1.5rem`, `display: block`, `width: 100%`, and `position: relative` while a placeholder is shown.

There are no `.css` files in this package.

## Class hooks

The package sets one class, and only on a code block that has a language:

| Class | Where | When |
| --- | --- | --- |
| `language-${language}` | `<code>` inside a `codeBlock` | `block.props.language` is set |

Hosts that run a highlighter (Prism, highlight.js, Shiki) can target that class. Vue does not load a highlighter.

## Data-attribute hooks

Presence attributes are `""` when on and omitted when off. Do not invent attributes that are not in this list.

### Editor shell (`PenEditor`)

| Attribute | Value | Meaning |
| --- | --- | --- |
| `data-pen-editor-root` | present | Editor root. Host CSS starts here. |
| `data-pen-view-id` | view id | Distinguishes this view from another on the same page. |
| `data-focused` | present | Root contains focus. |
| `data-readonly` | present | `readonly` prop is on. |
| `data-empty` | present | Document has no content. |

### Content (`PenContent`)

| Attribute | Value | Meaning |
| --- | --- | --- |
| `data-pen-editor-content` | present | Scrollable content surface (`role="textbox"`). |
| `data-pen-editor-blocks-host` | present | Block list host. Field-editor attaches here in expanded mode. |
| `data-pen-field-editor-surface` | present | Expanded mode: this host is a field-editor surface. |
| `data-pen-field-editor-active-surface` | present | Expanded mode: this host is the active surface. |

### Block wrapper (`PenBlock`)

Every default-rendered block is wrapped in a `div` with:

| Attribute | Value | Meaning |
| --- | --- | --- |
| `data-pen-editor-block` | present | Block wrapper. |
| `data-block-id` | block id | Stable id. |
| `data-block-type` | schema type | Same type as the inner body (see below). |
| `data-selected` | present | Block is in the current selection. |
| `data-focused` | present | Field-editor focus is on this block. |
| `data-surface-role` | `editable-inline` \| `structural` \| `delegated` | Expanded-mode role. Omitted when not expanded. |

The wrapper also sets `dir="ltr"` or `dir="rtl"` when the block's `direction` prop is one of those values (DIR2/DIR3). That is a bidi attribute, not a class hook.

### Block body (`data-block-type`)

Default renderers set `data-block-type` on the inner element as well. Values:

`paragraph`, `heading`, `bulletListItem`, `numberedListItem`, `checkListItem`, `callout`, `toggle`, `blockquote`, `divider`, `codeBlock`, `image`, `table`, or the unknown type string.

Additional body hooks:

| Attribute | On | Value |
| --- | --- | --- |
| `data-level` | heading | `1`–`6` |
| `data-pen-list-marker` | list marker span | present (`aria-hidden`) |
| `data-counter` | numbered list item | resolved ordinal |
| `data-checked` | checklist item | present when checked |
| `data-callout-type` | callout | `info` \| `warning` \| `error` (or the stored type) |
| `data-pen-callout-icon` | callout icon | present (`aria-hidden`) |
| `data-pen-callout-body` | callout body | present |
| `data-pen-callout-children` | nested callout children | present when the callout has children |
| `data-pen-toggle-header` | toggle header row | present |
| `data-pen-toggle-trigger` | toggle open/close button | present |
| `data-pen-ignore-pointer-gesture` | toggle trigger | present (field-editor ignores this target) |
| `data-pen-toggle-title` | toggle title | present |
| `data-pen-toggle-body` | nested toggle children | present when open and the toggle has children |
| `data-pen-blockquote-children` | nested quote children | present when the quote has children |
| `data-language` | code block `<pre>` | language string, if set |
| `data-pen-blocked-url` | image `<img>` | present when URL policy rejected `src` |
| `data-unknown-block` | unknown-type fallback | present |
| `data-pen-unknown-type` | unknown-type label | present |
| `data-selected` | unknown-type fallback | present when that block is selected |

A host `renderers` override replaces the inner body. The wrapper hooks above still apply.

### Table

| Attribute | On | Value |
| --- | --- | --- |
| `data-pen-table-frame` | frame around `<table>` | present |
| `data-pen-table` | `<table>` | present |
| `data-pen-table-row` | `<tr>` | present |
| `data-pen-table-cell` | `<td>` / `<th>` | present |
| `data-cell-row` | cell, and the cell text host | row index |
| `data-cell-col` | cell, and the cell text host | column index |
| `data-pen-cell-selected` | selected cell | present |

### Inline and cell text

`PenInlineContent` (and `PenFieldEditor`, which renders it) and `PenTableCellContent` share most of these:

| Attribute | Value | Meaning |
| --- | --- | --- |
| `data-pen-inline-content` | present | Inline text host. |
| `data-pen-field-editor-surface` | present | Field-editor can attach here. |
| `data-pen-field-editor-active-surface` | present | This host is the active field-editor surface. |
| `data-placeholder-visible` | present | A placeholder is showing. |
| `data-placeholder` | placeholder text | Set while a placeholder is showing. |
| `data-selected` | present | Inline host only: the block is selected. |
| `data-pen-ignore-pointer-gesture` | present | Cell text host only: set while that cell is active. |

## Host CSS

Target the hooks above from host stylesheets. Example:

```css
[data-pen-editor-root] {
  font-family: inherit;
}

[data-block-type="heading"][data-level="1"] {
  font-size: 1.75rem;
}

[data-pen-list-marker] {
  margin-inline-end: 0.5em;
}

[data-pen-cell-selected] {
  outline: 2px solid Highlight;
}
```

Do not depend on class names other than `language-${language}`. Vue does not add theme classes, BEM roots, or utility classes.
