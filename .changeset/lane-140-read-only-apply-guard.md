---
"@input/pen-ai-tools": patch
---

Refuse `editor.apply` from a tool classified as read-only.

A catalog read-only name or an explicit `mutating: false` used to skip the mutating allowlist entirely, so a handler that then called `editor.apply` wrote the document under an empty grant. `executeAITool` now drops that write, emits `ai-tool-read-only-mutation`, and returns a blocked `tool-not-allowed` result. Hosts that need the write must declare `mutating: true` and list the tool on `allowedMutatingTools`.
