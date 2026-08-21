---
"@input/pen-dom": patch
"@input/pen-core": patch
---

Dispatch field-editor keydown and beforeinput through the core command registry.

Enter, delete, indent, caret, marks, and history now call `registry.dispatch` instead of the local `apply*` implementations. `pen.insertText` accepts optional marks so pending formatBold/Italic state survives the dispatch path, and the contenteditable backend restores the DOM caret after a successful dispatch the same way `applyInlineTextEdit` did. Vertical caret uses `setVerticalCaretMeasure` when a host registers one; otherwise it falls back to block-edge motion. `pen-dom` does not register that measure yet.
