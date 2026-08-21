---
"@input/pen-ai-tools": patch
"@input/pen-delta-stream": patch
"@input/pen-transport-direct": patch
---

Refuse ungranted stream tool execution and streaming writes from read-only tools.

`processStream` runs `tool-input-available` through `executeAITool` with an empty mutating allowlist, so a stream part cannot write without a grant. Read-only tools that call `openTextStream` are refused at the write guard. `disconnect()` aborts the in-flight iterator instead of delivering the next part.
