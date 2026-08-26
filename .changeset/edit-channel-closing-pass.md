---
"@input/pen-ai": patch
---

End an edit-channel turn as soon as a mutating tool call succeeds with no refusals, so the document outcome no longer waits on a second model pass that only produces a closing sentence (`spec/packages/extensions/ai.md`, EC14). Read-only passes and any rejection still loop in-turn (EC10). The legacy multi-tool channel is unchanged: the loop takes the route's `applyStrategy` and the early exit applies only to `tool-edit`.
