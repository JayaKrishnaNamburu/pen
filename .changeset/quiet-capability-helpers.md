---
"@input/pen-core": patch
"@input/pen-types": patch
"@input/pen-content-ops": patch
---

Move block-capability helpers and selection-target render/resolve helpers out of @input/pen-types. Import them from @input/pen-core (hosts) or @input/pen-content-ops (packages that cannot depend on core yet).
