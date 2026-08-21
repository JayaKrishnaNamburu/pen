---
"@input/pen-core": patch
---

Export the Wave 6.1 direction facets and Wave 4.2 command catalog from `@input/pen-core`, and wire `createCommandRegistry` into `createEditor` so hosts can install resolvers and dispatch built-in commands without a deep import.
