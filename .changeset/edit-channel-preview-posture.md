---
"@input/pen-ai": patch
---

Stream the edit preview into the document under both mutation postures (EC15). Under `mutationPreference: "suggestions"` the growing payload went to the ephemeral completion surface and cleared the in-document preview, so hosts that render no completion surface saw nothing until the whole edit landed at once. The preview also now reads the streamed operation: `insert_blocks` previews after the block it names instead of appearing to overwrite it.
