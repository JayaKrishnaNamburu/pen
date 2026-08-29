---
"@input/pen-ai": patch
---

Re-export `REVIEW_SURFACE_CLASSES` and `REVIEW_SURFACE_CUSTOM_PROPERTIES` from `@input/pen-ai` so hosts following the review APIs do not have to import the contract layer separately. `PEN_REVIEW_STYLESHEET` stays on `@input/pen-dom` because an extension cannot depend on a renderer (API1).
