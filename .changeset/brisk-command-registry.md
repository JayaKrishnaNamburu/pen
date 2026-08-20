---
"@input/pen-core": patch
---

Add the Wave 4.1 command registry as a standalone `@input/pen-core` module (`defineCommand`, `commandHandler`, `createCommandRegistry`).

The module is not re-exported from the package index yet; `editor.dispatch` stays deferred.
