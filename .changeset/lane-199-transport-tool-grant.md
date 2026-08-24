---
"@input/pen-ai": patch
"@input/pen-transport-sse": patch
"@input/pen-transport-direct": patch
---

Refuse ungranted mutating toolCalls on the SSE and direct transports.

Both transports now authorize through `openAIToolCall` before `executeTool`. Default deny: a well-formed `insert_block` (or any un-allowlisted mutating name) emits `tool-error` and leaves the document unchanged. `allowedMutatingTools` is the grant.
