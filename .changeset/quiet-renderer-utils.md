---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Move remaining non-clipboard renderer utility duplicates to @input/pen-dom. Import cell-selection, placeholder, empty-state, environment, autocomplete, field-editor, table, menu/placement, AI scope, popup ARIA, drag-preview, pointer-selection, and block-drag helpers from the pen-dom subpaths; React re-exports them and Vue shares isCellInSelection, document-placeholder visibility, and replaceElementChildren.
