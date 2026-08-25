---
"@input/pen-ai": patch
---

Report an AI edit that never landed instead of finishing the turn as complete. The markdown apply strategies carry their edit inside the assistant text, so a plan that fails to compile — or that names blocks the document does not have — left the document untouched and threw nothing, and the turn still reported success with the generated character count. Such a turn now finishes as `status: "error"` with a `turnReason`, and emits a `GENERATION_EDIT_NOT_APPLIED` diagnostic. Staged suggestions and review items are unaffected, and tool-driven edits are excluded because they apply directly without a mutation receipt.

Also narrow the fast-apply lane to the document size its working set can annotate. The router admitted documents up to 200 blocks while the working-set builder annotated block ids only up to `AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS` (120); in that band the model was asked for block-addressed edits against context that carried no block ids. Both now read the same bound, and larger documents route to the tool loop.
