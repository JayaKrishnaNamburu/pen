---
"@input/pen-types": patch
"@input/pen-core": patch
"@input/pen-react": patch
"@input/pen-vue": patch
"@input/pen-dom": patch
"@input/pen-search": patch
"@input/pen-ai": patch
"@input/pen-multiplayer": patch
"@input/pen-schema-default": patch
---

Wire pen.a11yLabel, the AX1 focus sink, the AX2 announcer, and schema a11y specs so the editing surface, selection, atoms, and library events are labeled for assistive tech. Convert the Wave X aria-hidden and unstyled-focus greps to ESLint, add axe-core WCAG 2.2 AA after every conformance scenario, and add keyboard-only AX3 conformance for slash, autocomplete, handle reorder, and table add-row.
