---
"@input/pen-ai": patch
"@input/pen-types": patch
---

Widen `BlockSuggestion` to the runtime review-item action set and re-export the remaining class vocabulary from `@input/pen-ai`.

`split-block` and `format-text` are host-reachable suggestions. The published `BlockSuggestion` now matches `PersistentBlockSuggestion`, so an exhaustive host switch cannot miss them. A host that already wrote an exhaustive `switch` over the old four-member union must handle those two members to keep type-checking. `REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES` is re-exported from `@input/pen-ai` with the other RS4 tokens. `PEN_REVIEW_STYLESHEET` stays on `@input/pen-dom` (API1).
