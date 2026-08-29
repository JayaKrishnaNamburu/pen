---
"@input/pen-react": patch
---

Mount inline-atom portal renderers with `createElement` so host renderers that call hooks keep a stable hook order when an atom appears after the first paint.
