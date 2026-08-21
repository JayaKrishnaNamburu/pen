---
"@input/pen-document-ops": patch
---

Fold document-ops search and span retrieval with locale-aware case folding.

Case-insensitive `search_document` and `retrieve_document_spans` now fold both sides of each comparison with the LOC5 algorithm (`toLocaleLowerCase` + Greek final-sigma map + NFC), so Turkish ı/I matches the same way as the slash menu and `@input/pen-search`.
