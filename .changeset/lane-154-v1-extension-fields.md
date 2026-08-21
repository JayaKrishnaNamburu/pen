---
"@input/pen-ai": patch
---

Move `aiExtension` inline-history shortcuts from the v1 `keyBindings` field onto `keymapFacet`. Hosts that only call `aiExtension()` still get the same Mod-z / Mod-Shift-z / Ctrl-y bindings through the keymap collector; `extension.keyBindings` is now undefined. Search highlights, remote cursors, and AI decoration overlays stay on the v1 `decorations` field until `collectDecorations` reads `decorationsFacet`.
