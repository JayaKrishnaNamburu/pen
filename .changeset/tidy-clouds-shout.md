---
"@input/pen-ai": patch
"@input/pen-ai-autocomplete": patch
"@input/pen-ai-skills": patch
"@input/pen-ai-tools": patch
"@input/pen-assets-memory": patch
"@input/pen-bench": patch
"@input/pen-content-ops": patch
"@input/pen-core": patch
"@input/pen-crdt-yjs": patch
"@input/pen-delta-stream": patch
"@input/pen-document-ops": patch
"@input/pen-dom": patch
"@input/pen-export-html": patch
"@input/pen-export-json": patch
"@input/pen-export-markdown": patch
"@input/pen-export-xml": patch
"@input/pen-history": patch
"@input/pen-import-html": patch
"@input/pen-import-markdown": patch
"@input/pen-input-rules": patch
"@input/pen-markdown-serialization": patch
"@input/pen-multiplayer": patch
"@input/pen-preset-default": patch
"@input/pen-react": patch
"@input/pen-schema-default": patch
"@input/pen-search": patch
"@input/pen-shortcuts": patch
"@input/pen-test": patch
"@input/pen-transport-direct": patch
"@input/pen-transport-sse": patch
"@input/pen-types": patch
"@input/pen-undo": patch
"@input/pen-vue": patch
---

Standardize public package release metadata across the monorepo.

This refreshes package manifests for public npm publishing, adds package-local README and license files where needed, marks scoped packages for public access, and keeps test-only source files out of published tarballs while preserving source-based type resolution inside the workspace.
