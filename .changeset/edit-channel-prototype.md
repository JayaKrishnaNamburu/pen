---
"@input/pen-document-ops": patch
"@input/pen-ai": patch
---

Add the `edit_document` tool: the block-addressed edit channel from `spec-better-ai/01-edit-channel.md` (EC1–EC6). Operations (`replace_block_text`, `replace_blocks`, `insert_blocks`, `delete_blocks`, `move_block`) address blocks by id and carry markdown payloads, so structural edits keep block identity instead of round-tripping through document text. A rejected operation returns a result naming what failed plus the document's current block outline, so a model can correct itself in the same turn; nothing in this path can turn an unparsed payload into document content. `edit_document` is classified mutating and destructive for AI tool authority, so hosts must allowlist it explicitly.

Prototype status: the channel ships beside the existing `<pen-fast-apply>` XML channel, which stays the default. Wave 0 of `spec-better-ai` measures the two against a fixed prompt corpus and states the criteria under which the XML channel is retired or this one is deleted.
