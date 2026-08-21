---
"@input/pen-dom": patch
"@input/pen-vue": patch
---

Project authority text ranges into the native selection on Firefox, and catalog `data-pen-editor-blocks-host`.

`findLogicalDOMPoint` returned the inline element at offset 0, so a host
`selectTextRange` became `setBaseAndExtent(element, 0, text, n)`. Firefox
accepts that call and leaves a caret. The write now resolves to text-node
endpoints and falls back to `addRange` when the range did not take, using
the same synchronous projector seam as the collapsed history-restore caret.
Vue now queries the blocks host through `DATA_ATTRS` instead of a literal.
