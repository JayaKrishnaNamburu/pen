---
"@input/pen-dom": patch
"@input/pen-vue": patch
---

Project authority text ranges into the native selection on Firefox, and catalog `data-pen-editor-blocks-host`.

`findLogicalDOMPoint` returned the inline element at offset 0, so a host
`selectTextRange` became `setBaseAndExtent(element, 0, text, n)`. Firefox
accepts that call and leaves a caret. The write now resolves to text-node
endpoints and falls back to `addRange` when the range did not take.

A leftover programmatic caret stamp also won over the new authority range,
so `restoreDOMSelectionFromEditor` rewrote the old collapsed caret. Live
same-block editor selection now wins; the stamp is only the fallback.

Vue now queries the blocks host through `DATA_ATTRS` instead of a literal.
