---
"@input/pen-tools": patch
---

Export planEditDocument, executeEditDocument, and editDocumentTool so hosts can reuse the edit_document compiler with a custom apply origin. Applied results follow opaque compiled-op owner tokens observed at the apply boundary, not string fingerprints.
