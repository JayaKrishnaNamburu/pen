---
"@input/pen-core": patch
---

Copy enumerable own symbol keys when snapshotting ops for onBeforeApply so opaque owner tokens survive the apply pipeline.
