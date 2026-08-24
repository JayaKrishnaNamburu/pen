---
"@input/pen-types": minor
"@input/pen-core": minor
---

Ship `mapOffsetThroughSplices` from `@input/pen-types` and delete `ChangeSummary.mapOffset` / `mapPoint` / `mapRange` / `compose`. Single-commit offset shifts stay clamp-only; positions that must survive more than one commit use an anchor.
