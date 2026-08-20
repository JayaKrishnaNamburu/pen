---
"@input/pen-react": patch
---

Keep React caret overlays out of the accessibility tree and pointer hit-testing.

AX7: editor and multiplayer caret overlay roots stay `aria-hidden="true"` with `pointer-events: none`, so library and remote carets remain presentation-only.
