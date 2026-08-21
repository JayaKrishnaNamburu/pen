---
"@input/pen-react": patch
"@input/pen-vue": patch
---

Drop the selection-rect frame retry and state the boolean data-attribute contract.

`EditorSelectionRect` already reads block boxes through `measureWithRoot`. The trailing `requestAnimationFrame` re-ran the same function against a GeometryReader cache that returns the first result, including `null`, so the second frame observed nothing the first could not. Both styling references now mandate the bare `[data-readonly]` selector and the ARIA value-bearing exception.
