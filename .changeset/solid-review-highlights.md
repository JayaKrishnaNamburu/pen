---
"@input/pen-ai": patch
"@input/pen-react": patch
---

Keep AI review and contextual-prompt highlights visible without CSS `color-mix`.

Unsupported browsers now paint a solid first-mix-color background before the `color-mix` declaration, so the highlight does not disappear.
