---
"@input/pen-react": patch
---

Apply the AX3 caret-anchored popup contract to the React suggestion menu.

The menu keeps DOM focus in the editing field, exposes listbox and option ids for `aria-activedescendant`, and sets `aria-controls` plus `aria-expanded` on the field while open.
