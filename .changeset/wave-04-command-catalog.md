---
"@input/pen-core": patch
---

Move the Wave 4.2 caret and text command catalog into `@input/pen-core`, with a platform-conditional default keymap.

Grapheme-aware delete fixes the surrogate-pair split (F2). `pen.caretUp` / `pen.caretDown` handlers are registered; without a host-injected `setVerticalCaretMeasure` they fall back to logical block-edge crossing.
