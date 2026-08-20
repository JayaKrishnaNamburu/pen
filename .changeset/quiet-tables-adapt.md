---
"@input/pen-core": patch
"@input/pen-types": patch
---

Add BlockHandle.as() capability accessors for table surfaces.

`block.as("table")` returns a typed capability handle or null when the block schema does not declare that capability. Existing table methods stay on the universal handle until call sites migrate.
