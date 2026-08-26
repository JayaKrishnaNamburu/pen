---
"@input/pen-ai": patch
---

Retire the XML `<pen-fast-apply>` channel. Durable AI document edits always go through `edit_document`; `editChannel` is no longer an `aiExtension()` option. Selection rewrite and cursor continuation still stream text. Drop the unused `context-first` route lane (the router now assigns `tool-loop` directly) and rename the working-set annotation bound to `AI_ANNOTATED_WORKING_SET_MAX_BLOCKS`.
