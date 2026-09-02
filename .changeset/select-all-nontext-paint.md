---
"@input/pen-dom": patch
---

Paint the native selection for a text range whose endpoint sits on a block with no inline content, such as a divider or a host's sealed region. The `0..1` unit extent (N2) now maps to the DOM points around the block element, so select-all over such a tail no longer leaves the previous caret on screen while the authority holds a document-wide range (O4).
