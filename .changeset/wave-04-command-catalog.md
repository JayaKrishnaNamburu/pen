---
"@input/pen-core": patch
---

Move the Wave 4.2 caret and text command catalog into `@input/pen-core`, with a platform-conditional default keymap.

Grapheme-aware delete fixes the surrogate-pair split (F2). Vertical caret handlers are deferred until Wave 3 geometry lands; their keymap entries are still present.
