---
"@input/pen-ai": patch
---

Default-deny mutating tools when `executeAITool` is called without a turn.

A missing turn is no grant, not a trusted bypass: read-only tools still run, mutating and destructive tools return `{ ok: false, status: "blocked", reason: "tool-not-allowed" }`. Hosts that need writes must pass a turn from `createAIToolTurn({ allowedMutatingTools })`.
