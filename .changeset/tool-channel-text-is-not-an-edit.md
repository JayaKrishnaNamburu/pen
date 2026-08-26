---
"@input/pen-ai": patch
---

Stop assistant text from becoming a document edit on the tool edit channel. A model that answered with markdown instead of calling `edit_document` had its whole answer appended as new blocks, so the document rendered twice with the second copy rewritten. Finalize consulted the apply strategy only to choose how to parse the text, never whether text was a mutation source, so `tool-edit` fell through to plain-markdown insertion (`spec/packages/extensions/ai.md` EC1, EC6). Text is now refused as a mutation source under `tool-edit` on both the block and selection paths.

Also give the tool channel its own prompt. `tool-edit` fell through to the generic flow-markdown instructions — "Return only markdown content" — so the model was asked for the one thing this channel discards, and complied: a live run produced a whole rewritten document as prose and made no edit. The tool-channel prompt now asks for `edit_document` calls, says that text is a reply and is never applied, and explains how to recover from a rejected operation.

The fallback mutation receipt no longer infers `applied` from the length of the generated text. On a channel whose edits arrive as tool calls, text says nothing about whether the document moved, and a receipt claiming a write that never happened makes the channel unmeasurable.
