---
"@input/pen-core": patch
---

Add grapheme and word boundary helpers with a Segmenter fallback.

`Intl.Segmenter` is above the declared Firefox floor, so these queries feature-detect it and degrade to code-point / whitespace boundaries when it is missing. Fold-and-normalize lives beside them so search and filters share one case-fold.
