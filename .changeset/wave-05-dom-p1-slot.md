---
"@input/pen-dom": patch
---

Queue selection projection (P1) in the DomScheduler write-phase slot.

When the selection record version is newer than lastProjectedVersion, the field editor queues P1 for the next flush — after queued writes, before overlay paints. `syncDomSelectionOnce` is that slot's sync write. The v1 `onSelectionChange` backend write still runs in that turn; it is skipped only after the slot has already run in the current write phase, so an echo cannot loop and a host that never pumps rAF still gets a caret. Session switch does not reset lastProjectedVersion; stamps, peek/restore, and the Firefox attach-first history path stay.
