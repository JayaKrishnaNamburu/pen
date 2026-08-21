---
"@input/pen-test": patch
---

Fix `createTestCollaboration` so both peers fork from one encoded seed.

Independent `populateYDoc` calls gave each peer its own `Y.Text` for the same block. `sync()` then resolved the map entry wholesale and dropped one side's concurrent insert. The helper now reuses `createTwoPeerHarness`, and the AC 22 suite asserts that both peer edits survive the merge.
