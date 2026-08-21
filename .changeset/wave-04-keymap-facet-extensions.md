---
"@input/pen-shortcuts": patch
"@input/pen-search": patch
---

Register first-party shortcut and search key bindings as one `keymapFacet` provider per binding, using the same priority-to-precedence mapping the v1 compatibility shim applies, instead of `Extension.keyBindings`.
