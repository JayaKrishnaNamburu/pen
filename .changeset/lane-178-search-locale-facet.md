---
"@input/pen-search": patch
---

Fold document search with the editor `pen.locale` facet when `options.locale` is omitted.

Case-insensitive matching already used `foldAndNormalize`, but the locale defaulted to `"en"` instead of `editor.facet(localeFacet)`. Turkish ı/I now follows the editor locale the same way as document-ops and suggestions.
