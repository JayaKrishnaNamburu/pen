---
"@input/pen-ai": patch
"@input/pen-document-ops": patch
---

Add the `edit_document` tool channel behind `aiExtension({ editChannel: "tool" })`, a prototype alternative to the `<pen-fast-apply>` XML contract (`spec-better-ai/01-edit-channel.md`, EC1–EC13). The XML channel remains the default and is unchanged.

`edit_document` (in `@input/pen-document-ops`) takes a list of operations from a closed set — `replace_block_text`, `replace_blocks`, `insert_blocks`, `delete_blocks`, `move_block` — that address blocks by id and carry markdown payloads. It never throws: an operation it cannot honour comes back as a structured refusal naming the operation, the reason, and the document's current outline, so the model can correct itself in the same turn. A batch is validated whole before anything is applied, so an unparseable payload cannot leave a sibling operation half-applied.

Selecting `editChannel: "tool"` routes the one lane that committed edits by parsing the assistant text stream (`context-first`) to `tool-loop`, and resolves its apply strategy to the new `AIApplyStrategy` member `tool-edit`, so a durable edit has exactly one source. Lanes that only stream text — selection rewrite, cursor continuation — keep writing text deltas on either channel.
