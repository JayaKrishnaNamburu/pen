---
"@input/pen-core": patch
"@input/pen-types": patch
"@input/pen-preset-default": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Stop shipping the default block schema from createEditor(). Hosts pass a schema or defaultPreset(); React and Vue useEditor still install the default schema.
