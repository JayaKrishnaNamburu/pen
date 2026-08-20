---
"@input/pen-core": patch
"@input/pen-react": patch
"@input/pen-schema-default": patch
"@input/pen-types": patch
"@input/pen-vue": patch
---

Preserve unknown block types, props, and marks instead of treating them as missing.

Built-in schema registries now passthrough types the current schema does not register, emit one `schema-unknown-block` diagnostic per type per session, and keep apply's refusal to insert those types. Fallback renderers stay selectable and movable but are not editable.
