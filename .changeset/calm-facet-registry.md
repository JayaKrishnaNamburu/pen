---
"@input/pen-core": patch
---

Add defineFacet and a facet registry that resolves providers by precedence.

`createEditor` constructs the registry, `editor.facet()` reads it, and `editor.whenReady()` is on the public Editor interface.
