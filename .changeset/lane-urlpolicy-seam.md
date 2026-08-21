---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Require `editor` or `urlPolicy` on full-reconcile so omitting the host `pen.urlPolicy` is a type error instead of a silent default (SEC1 / Wave S).
