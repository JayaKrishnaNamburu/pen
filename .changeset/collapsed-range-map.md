---
"@input/pen-core": patch
"@input/pen-undo": patch
---

Keep collapsed ranges collapsed when mapping through a change summary.

`mapRange` treated a caret as a sticky-edged selection, so an insert at the caret mapped the left-biased anchor and right-biased focus to different offsets. Collapsed inputs now map once with `assoc: 1` unless the caller passes explicit associations.

Undo restore also keeps a stored caret on a block that is still live after a history invert, instead of accepting the sequential clamp fallback through a temporary removal.
