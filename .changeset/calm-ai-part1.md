---
"@input/pen-ai": patch
---

Move the AI controller, helpers, types, and runtime plan/intent/review/playground/executor modules off `@ts-nocheck` PartN files onto typed seam modules.

Controller mixins, helper Part files, `extensionParts/`, `typeParts/`, and all runtime `*Parts/` directories are gone. The unused `affectedRange` decoration helper is gone. Public exports for those seams are unchanged. Behavior is unchanged except `refreshWorkingSet` now rebuilds with the generation prompt.
