---
"@input/pen-types": minor
"@input/pen-ai": patch
"@input/pen-dom": patch
---

Collapse generation streaming onto one sink (write-now, suggestion-splice, or review-preview) and drop the unstyled second review class taxonomy (`pen-ai-review-insert`, `pen-ai-review-delete`, `pen-suggestion-final-text-change`, `pen-ai-review-preview-original`). The exported sheet now styles every `REVIEW_SURFACE_CLASSES` name. The stranded structured-intent prompt helpers leave the `@input/pen-ai` public barrel.
