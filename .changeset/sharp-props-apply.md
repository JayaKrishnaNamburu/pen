---
"@input/pen-core": patch
---

Validate insert-block and update-block props at the apply boundary.

Declared props are coerced, clamped, or replaced with the schema default and a `prop-invalid` diagnostic. Props the schema does not declare still pass through, and a single-prop update still validates only that prop.
