---
"@input/pen-dom": patch
---

Harden decoration attribute application against event-handler keys and raw CSS.

`applyElementAttributes` now drops `/^on/i` keys and refuses `style` as cssText so decoration bags cannot become HTML injection sinks.
