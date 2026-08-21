---
"@input/pen-core": patch
---

Add the Wave 4.1 command registry as a standalone `@input/pen-core` module (`defineCommand`, `commandHandler`, `createCommandRegistry`).

`createCommandRegistry` and `getCommandRegistry` are exported from the package index. There is still no `editor.dispatch`; hosts dispatch through the registry.
