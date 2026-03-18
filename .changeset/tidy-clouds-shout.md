---
"@pen/ai": patch
"@pen/ai-autocomplete": patch
"@pen/ai-skills": patch
"@pen/ai-tools": patch
"@pen/assets-memory": patch
"@pen/bench": patch
"@pen/content-ops": patch
"@pen/core": patch
"@pen/crdt-yjs": patch
"@pen/database": patch
"@pen/delta-stream": patch
"@pen/document-ops": patch
"@pen/dom": patch
"@pen/export-html": patch
"@pen/export-json": patch
"@pen/export-markdown": patch
"@pen/export-xml": patch
"@pen/history": patch
"@pen/import-html": patch
"@pen/import-markdown": patch
"@pen/input-rules": patch
"@pen/markdown-serialization": patch
"@pen/multiplayer": patch
"@pen/preset-default": patch
"@pen/react": patch
"@pen/schema-default": patch
"@pen/search": patch
"@pen/shortcuts": patch
"@pen/test": patch
"@pen/transport-direct": patch
"@pen/transport-sse": patch
"@pen/types": patch
"@pen/undo": patch
"@pen/vue": patch
---

Standardize public package release metadata across the monorepo.

This refreshes package manifests for public npm publishing, adds package-local README and license files where needed, marks scoped packages for public access, and keeps test-only source files out of published tarballs while preserving source-based type resolution inside the workspace.
