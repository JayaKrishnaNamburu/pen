---
"@input/pen-types": minor
"@input/pen-core": minor
"@input/pen-schema-default": minor
"@input/pen-crdt-yjs": minor
"@input/pen-content-ops": minor
"@input/pen-markdown-serialization": minor
"@input/pen-import-html": minor
"@input/pen-import-json": minor
"@input/pen-import-markdown": patch
"@input/pen-export-html": minor
"@input/pen-export-markdown": minor
"@input/pen-export-json": minor
"@input/pen-export-xml": minor
"@input/pen-document-ops": minor
"@input/pen-ai": minor
"@input/pen-ai-autocomplete": patch
"@input/pen-search": minor
"@input/pen-dom": minor
"@input/pen-react": minor
"@input/pen-test": patch
---

Remove the abandoned database block, its ops, and the `@input/pen-database` package.

Tables stay. Documents that still contain `database` blocks will no longer resolve that type in the default schema.
