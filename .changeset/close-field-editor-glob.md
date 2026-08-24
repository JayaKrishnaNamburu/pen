---
"@input/pen-dom": minor
---

Stop publishing every file under `src/field-editor/` as a host-reachable subpath. The curated `./field-editor` barrel and the 18 importer-backed subpaths stay; a new field-editor file is no longer public API.
