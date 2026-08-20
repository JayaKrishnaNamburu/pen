---
"@input/pen-dom": patch
---

Add an exhaustive beforeinput-to-command map.

`mapBeforeInput` translates listed InputEvent inputTypes to command names and static params, allows IME composition types, and blocks everything else with `unhandled-input-type`. Standalone table; not wired to DOM listeners.
