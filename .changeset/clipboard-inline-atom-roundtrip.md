---
"@input/pen-dom": minor
"@input/pen-types": patch
---

Keep inline atoms in sliced Pen JSON clipboard deltas and rebuild them on paste (IOP7). Add optional `InlineSchema.serialize.toText` and emit atom interchange text through the existing `toMarkdown` / `toHTML` hooks, defaulting to skip when none are set (IOP8).

Graded `minor` on `@input/pen-dom`: copy now writes embed inserts into the Pen JSON flavor and paste rebuilds them, so an existing host that read or wrote that flavor sees a different clipboard payload. `toText` on `@input/pen-types` is an optional hook and stays `patch`.
