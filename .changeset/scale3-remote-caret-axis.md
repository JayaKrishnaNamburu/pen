---
"@input/pen-bench": patch
---

Rename the SCALE3 peer-count axis to remote-caret-count so the published name matches the eight caret decorations it actually measures.

N-synced-peer scaling is not a SCALE3 measurement; SCALE1 already covers two concurrent peers. The renamed bench observes both the caret count and the keystroke so a no-op of either refuses to publish.
