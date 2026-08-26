---
"@input/pen-ai": minor
---

Move the last two edit-preview stacks onto the review surface (v5 wave 2, RS2/GATE 2.3/GATE 2.4/GATE 2.5). Markdown block generation and selection rewrites now preview as streaming review text and stage once the turn closes, which is how the `edit_document` tool channel already behaved.

Markdown block generation previewed by re-parsing the whole accumulated payload and re-staging it as suggestions on every frame: each changed delta rejected the previous frame's suggestions and wrote the entire parsed markdown back into the document. It now sets a streaming review preview and commits once, on the same finalize path as an unstreamed buffered generation. The observable change is mid-flight: the document is no longer written while the call is open, and the preview shows the payload's words without its structure — a heading is a heading once the edit stages, not while it is still arriving. `_refreshStreamingMarkdownBlockPreview` is gone, along with the per-generation preview-suggestion bookkeeping it needed.

Selection rewrites that could not stream as an incremental splice — a selection spanning blocks, or a markdown rewrite — previewed through the inline-completion ghost overlay. That overlay previews a keystroke-accepted completion, not an edit awaiting review (RS1), so those rewrites now render on the review surface too. The ghost is unchanged for autocomplete.

Hosts that read the document or the rendered DOM mid-generation to observe in-flight AI content should read `streamingReviewPreviews` instead; hosts that render decorations already show the preview with no change.
