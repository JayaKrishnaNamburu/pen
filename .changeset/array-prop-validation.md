---
"@input/pen-core": patch
---

Fix array props being discarded by schema validation

`generateValidator` compared `typeof value` against the declared prop type. `typeof`
never yields `"array"`, so every array-typed prop failed the check and was replaced by
its default — `columnWidths: [120, 240]` on a table was stored as `[]`, silently losing
the widths on every apply.

`validateOpProps` compared the incoming and validated values with `Object.is`. Schema
validation returns a fresh array or object for non-primitive props, so reference equality
never held and a `prop-invalid` diagnostic was emitted for every array value, valid or
not. The warning now fires only when the value actually changed.
