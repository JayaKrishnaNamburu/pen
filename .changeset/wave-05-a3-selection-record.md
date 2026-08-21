---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-dom": patch
"@input/pen-multiplayer": patch
---

Emit `selectionChange` as a `SelectionRecord` so listeners can read version and origin from the event.

`PenEventMap.selectionChange` is now `(record: SelectionRecord) => void`. A cleared selection is a record with `state: null`, not a bare `null`.
