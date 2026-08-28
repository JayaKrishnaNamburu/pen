---
"@input/pen-dom": minor
---

Render all three colour marks (`textColor`, `backgroundColor`, `highlight`) through a `var()` fallback and `data-color`, so on-screen colour paints by default and hosts can remap opaque tokens without `!important` (RI7). `textColor` and `backgroundColor` previously fell through to the unknown-mark span and dropped the stored colour entirely.

This is a `minor` because the paint is an inline style: a host rule that set `color` or `background-color` on the mark itself used to apply and no longer does. Set `--pen-text-color`, `--pen-background-color`, or `--pen-highlight-color` on the mark instead — see `STYLING.md`. Export and clipboard HTML are unaffected; both come from `schema.serialize.toHTML` and still carry the stored value.
