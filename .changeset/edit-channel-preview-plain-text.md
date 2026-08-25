---
"@input/pen-ai": patch
---

Show the streaming edit preview as plain text (EC15). `insert_blocks` and `replace_blocks` carry markdown (EC3), and the preview rendered it verbatim, so `##` and `-` appeared on screen and were swapped for real blocks when the turn landed. The payload is now stripped to its words for display, line-locally so a half-arrived fragment does not reflow text already shown. A `replace_block_text` payload is plain text already and is left untouched.
