---
"@input/pen-ai": patch
---

Expose `mutationPreference` on AI controller state and add `setMutationPreference` so hosts can switch between staged review and direct writes at runtime. The next generation reads the new value; an in-flight turn keeps the preference it started with. Unknown values are ignored and emit a diagnostic.
