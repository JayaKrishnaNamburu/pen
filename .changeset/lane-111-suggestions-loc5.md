---
"@input/pen-ai-suggestions": patch
---

Fold suggestion no-op detection and dismiss fingerprints with locale-aware case folding.

Comparable-text sanitizing and dismiss-memory fingerprints now run both sides through `foldAndNormalize` with the editor `pen.locale` facet, so Turkish ı/I matches the same way as search and AI alignment.
