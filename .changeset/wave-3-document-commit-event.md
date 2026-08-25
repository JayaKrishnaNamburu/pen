---
"@input/pen-types": minor
"@input/pen-core": minor
---

Remove the published `DocumentCommitEvent` type. The v1 `documentCommit` event is gone; hosts listen on `commit` (`CommitEvent`). Core keeps the old payload shape as an internal intermediate while it stamps revisions.
