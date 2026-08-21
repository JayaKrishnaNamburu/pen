---
"@input/pen-vue": patch
"@input/pen-react": patch
---

Stop Vue from reimplementing click-to-activate and empty-content detection in the binding; both hosts now use the shared pen-dom helpers.
