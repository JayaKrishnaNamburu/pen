---
"@input/pen-core": patch
---

Resolve facet providers and definitions by name when two copies of `@input/pen-core` are evaluated, instead of throwing an opaque "Unknown provider" from `createEditor`.
