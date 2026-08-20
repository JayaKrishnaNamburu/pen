---
"@input/pen-core": patch
"@input/pen-dom": patch
"@input/pen-vue": patch
---

Bind `pen.urlPolicy` so hosts can admit extra URL schemes without forking render sinks.

`urlPolicyExtension` provides the default policy and passes it into an optional wrap function. Field-editor reconciliation, Vue image fallback, transfer, and clipboard HTML read the facet when an editor is present.
