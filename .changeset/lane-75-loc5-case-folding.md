---
"@input/pen-ai": patch
---

Fold AI reusable-text alignment with locale-aware case folding.

Block-reuse comparison now runs both sides through `foldAndNormalize` with the `pen.locale` facet, so Turkish ı/I matches the same way as search and document-ops. The `pen/no-bare-case-folding` rule now recognizes identifier and display folds instead of relying on per-site disables.
