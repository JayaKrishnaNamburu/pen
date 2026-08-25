---
"@input/pen-ai": patch
"@input/pen-react": patch
---

Keep every operation of a streaming `edit_document` call on screen

A prompt that made two edits showed the first one's change vanish when the second started streaming, returning only when the turn finished. The controller held one streaming preview, so the arriving operation overwrote the previous one's, and because nothing is written until the call lands the block underneath reverted to the text the turn was about to replace.

Previews are now keyed by operation index: `AIControllerState.streamingReviewPreviews` replaces `streamingReviewPreview`, and every preview owned by the running turn renders. Two related corrections: block ids and operation names are read only once their closing quote arrives, so a half-sent id can no longer anchor a preview (or an EC20 write) on the wrong block, and a payload that has not named its target yet previews nowhere instead of falling back to the generation's block. `AIStreamingReviewPreview` drops the unused `revision` and `updatedAt` fields.
