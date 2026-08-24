---
"@input/pen-interop": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Filter HTML import styles in a DOMPurify hook and always attach the HTML importer on paste.

`sanitizeHTML` no longer rewrites markup with a style regex. `id` and undeclared `data-*` attributes are dropped. React and Vue default `importers.html` to `htmlImporter` so clipboard HTML cannot skip the sanitizer.
