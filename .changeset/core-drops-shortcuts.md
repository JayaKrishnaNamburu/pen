---
"@input/pen-core": minor
---

Drop `@input/pen-shortcuts` from core, removing the built-in rich-text shortcuts default.

`@input/pen-shortcuts` began importing `keymapFacet` from core in order to provide key bindings through `pen.keymap`, which is the correct dependency direction. Core's long-standing inverted dependency on shortcuts then closed a cycle, and root `build`, `typecheck`, and `test` all failed to resolve the package graph.

Three of core's four imports of `richTextShortcutsExtension` were unused. The fourth registered it in the fallback extension list used when no preset is supplied, so **a bare `createEditor({ schema })` no longer installs rich-text shortcuts**. Hosts that relied on that default should pass `@input/pen-preset-default`, which registers them, or add `richTextShortcutsExtension()` to `extensions` explicitly. `createHeadlessEditor` and any host already using a preset are unaffected.

This removes the fourth of six allowlisted API1 dependency inversions.
