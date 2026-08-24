---
"@input/pen-ai": patch
---

Move suggestion controller methods onto the class so the package no longer mutates prototypes at import time.

The module-scope prototype assignment forced `sideEffects: true` and kept the whole package in every consumer bundle. With the mutation gone the manifest can declare `sideEffects: false`.
