---
"@input/pen-dom": minor
---

Empty inline-content fields render a `<br data-pen-empty="">` caret target (EM2). `extractTextFromDOM` and geometry treat it as a rendering artifact, not content; host-visible empty-block reads stay `""` / offset `0`.
