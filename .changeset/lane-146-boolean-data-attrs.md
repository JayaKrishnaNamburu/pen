---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Emit boolean `data-*` attributes as valueless (`data-readonly=""`, not `data-readonly="true"`), matching the HTML boolean-attribute idiom and `buildDataAttributes`.
