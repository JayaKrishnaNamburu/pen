---
"@input/pen-ai": patch
"@input/pen-document-ops": patch
---

Add the `edit_document` tool channel as the durable AI edit path (`spec/packages/extensions/ai.md`, EC1–EC13), a replacement for the `<pen-fast-apply>` XML contract.

`edit_document` (in `@input/pen-document-ops`) takes a list of operations from a closed set — `replace_block_text`, `replace_blocks`, `insert_blocks`, `delete_blocks`, `move_block` — that address blocks by id and carry markdown payloads. It never throws: an operation it cannot honour comes back as a structured refusal naming the operation, the reason, and the document's current outline, so the model can correct itself in the same turn. A batch is validated whole before anything is applied, so an unparseable payload cannot leave a sibling operation half-applied.

Selecting the tool channel routes the one lane that used to commit edits by parsing the assistant text stream (`context-first`) to `tool-loop`, and resolves its apply strategy to `tool-edit`, so a durable edit has exactly one source. Lanes that only stream text — selection rewrite, cursor continuation — keep writing text deltas.
