---
"@input/pen-types": patch
"@input/pen-transport-sse": patch
"@input/pen-transport-direct": patch
---

Remove `editor` from `PenStreamRequest.context`. A live editor is not a wire value; pass it to `directTransport` or `createSSEHandler` at construction. SSE rejects a body that includes `editor` with 400.
