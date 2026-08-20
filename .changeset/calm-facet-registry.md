---
"@input/pen-core": patch
---

Add defineFacet and a facet registry that resolves providers by precedence.

The registry is standalone in core (API3) and is not wired to createEditor yet — editor.whenReady and the pipeline settle hook stay deferred.
