---
"@input/pen-schema-default": minor
"@input/pen-react": patch
"@input/pen-vue": patch
"@input/pen-input-rules": patch
---

Rename the callout block's severity prop from `type` to `severity` so `set-props` can convert a block to callout and set severity in the same op. HTML class names (`callout-warning`) and markdown prefixes (`> **Warning:**`) are unchanged.
