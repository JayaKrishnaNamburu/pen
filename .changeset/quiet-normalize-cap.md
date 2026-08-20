---
"@input/pen-core": patch
---

Route the schema normalize iteration cap through the diagnostic event channel.

Hosts that listen for `diagnostic` now receive `normalize-cap` when the dirty-block loop hits its bound, instead of a bare `console.warn`.
