---
"@input/pen-react": patch
---

Forward host `extraAttributes` and `data-*` through numbered list items onto `ListItemLayout` so composed renderers can paint alignment and other attributes without dropping the ordered-list marker or `start` (HB8). Export `ListItemHostAttributes` as the host-facing shape for cloning a default list-item renderer.

`ListItemLayout` now writes host attributes before its own, so a host can no longer overwrite `data-block-type`, `data-indent`, `data-selected`, `data-pen-list-item-layout`, `data-counter`, or `data-checked`. This also fixes check list items, where a host `extraAttributes` replaced the renderer's prop wholesale and silently dropped `data-checked`.
