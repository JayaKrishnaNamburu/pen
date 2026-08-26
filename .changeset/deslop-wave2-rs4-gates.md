---
"@input/pen-react": patch
"@input/pen-ai": patch
---

Stop sharing the review-surface `pen-block-suggestion` class with the autocomplete ghost. The exported review stylesheet paints that class with insert chrome, so adopting it was styling a keystroke-gated completion as a proposed edit (RS1). Autocomplete preview blocks now carry only `pen-autocomplete-preview-block`.
