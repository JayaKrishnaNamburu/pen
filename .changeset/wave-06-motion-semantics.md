---
"@input/pen-core": patch
---

Add the Wave 6.4 keymap direction resolver so RTL focus blocks swap left/right and word arrow bindings at dispatch. Caret and delete command semantics stay logical; visual line-edge motion is not registered.
