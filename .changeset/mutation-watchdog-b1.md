---
"@input/pen-dom": patch
---

Demote the contenteditable MutationObserver to a watchdog.

A foreign text-node rewrite no longer applies as user input. The observer emits `dom-divergence` and restores the field from the document so both the model and the visible DOM stay authoritative.
