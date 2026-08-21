---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Emit boolean `data-*` attributes as the valueless HTML form (`data-readonly=""`) and omit them when false. Hosts style with `[data-readonly]`; `[data-readonly="true"]` does not match. ARIA booleans stay the strings `"true"` / `"false"`.
