---
"@input/pen-transport-sse": patch
---

Reject hostile SSE request bodies with 400 before any tool executes.

The parser now walks the body for prototype keys, extra fields on closed nested records, oversized depth/size/array length, and out-of-range numbers (`protocolVersion` other than 1, negative or fractional offsets). The handler reads the raw text first and refuses a payload over the byte bound before `JSON.parse`.
