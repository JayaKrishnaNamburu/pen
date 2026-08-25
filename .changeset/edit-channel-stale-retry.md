---
"@input/pen-ai": patch
---

Refuse a stale `edit_document` target in the agentic loop and retry inside the same turn instead of cancelling the generation (`spec-better-ai/01-edit-channel.md`, EC9). When a targeted block's rendered view changed between the working-set read and the call, the tool no longer runs: the model receives the live outline and a `stale-target: view-changed` rejection, and corrects on the next pass. A concurrent edit during an edit-channel generation therefore resolves `complete` rather than `cancelled`. The legacy multi-tool channel is unchanged and still raises `StaleWorkingSetError` when it cannot refresh.
