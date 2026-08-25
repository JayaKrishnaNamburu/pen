---
"@input/pen-types": patch
---

Add optional `tool-input-start` / `tool-input-delta` members to `ModelStreamEvent`, plus adapter `capabilities` (`partialToolInput`, `forcedToolChoice`) and request `toolChoice`. Adapters that still emit only a complete `tool-call` stay correct.
