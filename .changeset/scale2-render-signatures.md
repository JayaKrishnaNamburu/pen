---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Stop using `JSON.stringify` to decide whether inline decorations, rendered deltas, or inline-atom targets changed. Unchanged inputs now keep the previous list by identity, and key order or a dropped `undefined` member no longer looks like a change.
