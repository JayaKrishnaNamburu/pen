---
"@input/pen-core": patch
"@input/pen-undo": patch
---

Stop core from devDepending on the undo extension so the task graph is acyclic (Wave P P.1).

Undo-dependent tests now live with `@input/pen-undo` and register the extension explicitly. The remaining edge points the right way: the extension depends on core.
