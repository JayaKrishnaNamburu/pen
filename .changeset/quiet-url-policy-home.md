---
"@input/pen-core": patch
"@input/pen-dom": patch
"@input/pen-export-html": patch
"@input/pen-export-markdown": patch
"@input/pen-export-xml": patch
---

Move the SEC1 URL admission policy into `@input/pen-core` so no exporter depends on a renderer.

`urlPolicy`, `UrlContext`, and `UrlPolicy` now live next to `urlPolicyFacet` in core; `@input/pen-dom` re-exports them, so host imports are unchanged. `@input/pen-export-html` and `@input/pen-export-markdown` drop their `@input/pen-dom` dependency and `@input/pen-export-xml` drops its verbatim copy of the policy, which removes the last `extension → rendering` edges from the dependency DAG (API1).
