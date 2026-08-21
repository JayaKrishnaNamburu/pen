---
"@input/pen-types": patch
---

Declare `mutating` and `destructive` on `ToolDefinition`.

Tool authority (AIB3) decides whether a model may call a tool by asking whether
that tool writes to the document. The check already read those two fields off
the registered definition, but `ToolDefinition` did not declare them, so the
read was structural and any tool that honestly declared `mutating: false` failed
to compile. Both are optional; when absent, authority keeps falling back to
name-based classification.
