---
"@input/pen-react": patch
---

Route React editor and multiplayer caret overlays through GeometryReader.

Local and remote carets now read `caretRect` from the per-root GeometryReader via `measureWithRoot` instead of `getSelectionPointRect`. An open scheduler read phase is reused; idle calls go through counted `measureNow` so same-frame caret placement stays intact.
