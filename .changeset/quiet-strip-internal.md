---
"@input/pen-core": patch
---

Strip createTextStreamWriter and attachA11y from the published type surface. Hosts use editor.openTextStream and defineBlock(...).a11y instead.
