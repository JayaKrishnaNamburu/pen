---
"@input/pen-ai": patch
---

Report agentic-loop tool failures to the host, not only to the model

The agentic loop emitted no diagnostics. When a tool call threw, it set the step
status, called `onToolResult`, and pushed the error into the tool journal — all
of which feeds the model so it can retry — and told the host nothing. The
streaming path already emitted `stream-tool-error` for the same failure, so the
behaviour differed between two paths that fail the same way.

`loop.ts` now emits `ai-tool-failed` naming the tool and the reason. The case
that motivated it is a malformed `edit_document` payload: it is rejected before
any op is applied, so the document is untouched, `runPrompt` resolves
`complete`, and the receipt is `noop`. A host could not distinguish that from a
model that read the document and chose not to edit (UC2).

The code is not payload-specific. The loop cannot tell why a tool threw without
matching on message text, and "this tool call failed" is the honest statement at
that layer, so every tool failure is now observable rather than just this one.
