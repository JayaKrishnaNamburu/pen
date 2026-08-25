---
"@input/pen-document-ops": patch
"@input/pen-ai": patch
---

Add `format_text` and `set_block_props` to the `edit_document` tool so marks and in-place type/prop changes travel as structured operations (`spec-better-ai/01-edit-channel.md`, EC18). Markdown cannot carry `textColor` / `backgroundColor` / heading level, and `replace_blocks` reassigns identity on a 1-to-1 type change — the two holes the Wave 0 corpus recorded.

`format_text` locates a range by exact `matchText` (and optional 1-based `occurrence`) inside an already-addressed block and emits `format-text`. `set_block_props` emits the same `set-props` conversion `update_block` already uses, so the block id stays put. Unknown marks, disallowed types, missing matches, and ambiguous matches come back as EC5 refusals; nothing is guessed. The paired corpus gains a styling prompt (p11) and p10 is now expressible on the tool channel.
