---
"@input/pen-transport-sse": patch
---

Validate every `PenStreamRequest` field at the SSE boundary.

A string `prompt` and the `editor` absence checks used to be enough for `parsePenStreamRequest` to cast the rest of the body. The parser now rejects a wrong-shaped field and fails typecheck if `PenStreamRequest` grows a key the parser does not name.
