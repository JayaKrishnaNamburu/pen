---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Route menu, selection, and drop-caret measurement through GeometryReader.

Slash/suggestion menu anchors, selection-toolbar rects, and React drop indicators now read caret and block boxes from the per-root GeometryReader. Sync callers go through counted `measureNow`; an open scheduler read phase does not increment the counter. The ad hoc `selectionGeometry` module is gone.
