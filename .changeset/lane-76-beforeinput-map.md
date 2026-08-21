---
"@input/pen-dom": patch
---

Wire contenteditable beforeinput through BEFOREINPUT_MAP.

`handleBeforeInput` now treats the map as the policy authority: command rows `preventDefault` and dispatch, composition rows stay with the field, and an unknown `inputType` emits `unhandled-input-type` instead of being absorbed by the mutation observer.
