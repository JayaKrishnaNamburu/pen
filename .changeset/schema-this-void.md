---
"@input/pen-types": patch
---

Declare BlockSchema serialize, normalize, and validateProps as methods with `this: void` so hosts can detach them without an unbound-method lint error, without breaking BlockSchema assignability.
