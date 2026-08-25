---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-react": minor
"@input/pen-vue": minor
---

Delete the three v1 adapters: `getSlot`/`setSlot`, `change`/`documentCommit` emission, and `v1ExtensionProviders` (including the `Extension.keyBindings` / `inputRules` / `decorations` fields). Read with `editor.facet(...)` and `editor.on("commit")`; write with `internals.assignSlot`. The `no-new-slots` gate retires with the slot adapter.
