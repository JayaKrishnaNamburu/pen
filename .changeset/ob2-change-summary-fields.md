---
"@input/pen-types": minor
"@input/pen-core": minor
---

Rewrite `ChangeSummary` to the v3 §1 field set. `text` is now `blockText`, `affectedBlockIds` is the deduplicated document-order union of those block ids, and `originType` / `isEmpty` are removed. Hosts that need the origin type should read `CommitEvent.origin`; emptiness is `blockText.length === 0 && structural.length === 0`.
