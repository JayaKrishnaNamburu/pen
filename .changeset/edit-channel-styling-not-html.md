---
"@input/pen-document-ops": patch
"@input/pen-ai": patch
---

Refuse raw HTML in `edit_document` text and markdown payloads, and name the live schema's marks on `format_text`, so a request like "make the title purple" is corrected to a mark instead of written as a `<span>` string.
