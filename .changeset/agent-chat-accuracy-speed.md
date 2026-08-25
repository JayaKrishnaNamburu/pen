---
"@input/pen-ai": patch
"@input/pen-document-ops": patch
"@input/pen-core": patch
---

Restore agent-chat edit accuracy and speed. Structural prompts on small flow documents route through the markdown fast-apply lane with a whole-document annotated-markdown working set (`<!-- block:<id> <type> -->`), and fast-apply `replace_text` supports `anchorBefore`/`anchorAfter` partial edits. `aiExtension()` gains `mutationPreference: "direct" | "suggestions"` so hosts without a review UI can land AI edits immediately. Tool op budgets are atomic (a too-large batch is rejected whole with a visible `AIToolBudgetError` instead of silently applying a prefix) with raised limits, tool-result compaction keeps far more content and marks truncation explicitly, and the agentic loop's `maxSteps` now counts model passes instead of double-counting tool calls. `update_block` can replace block text and convert block type in place (via `convertBlockOps`, now exported from `@input/pen-core`), `write_document` accepts `replaceBlockIds` for true replace semantics, and `read_document`/`get_context` can emit annotated markdown.

Breaking for direct `AIToolTurn` implementors: `recordOps(count): number` is replaced by `tryRecordOps(count): AIToolAuthorityReason | null`, which records the batch only when it fits whole. Callers that relied on the returned accepted-count to apply a prefix should now treat a non-null return as a rejected batch.
