---
"@input/pen-ai-autocomplete": patch
---

Remove module-scope prototype mutation from the autocomplete controller.

The four controller seam modules now take an explicit host instead of assigning methods onto `AutocompleteControllerImpl.prototype` at import time, so the package can declare `sideEffects: false`.
