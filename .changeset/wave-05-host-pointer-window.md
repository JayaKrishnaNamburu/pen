---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Open the pointer gesture window from the editor root so hosts no longer call `beginPointerSelection`.

React maps mousedown/mouseup onto `notifyGestureEvent` and stops incrementing pointer depth. Cross-block mid-drag writes stay: they are the first promotion into expanded mode, which P1 cannot invent from a single-field native range.
