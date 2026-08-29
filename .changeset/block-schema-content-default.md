---
"@input/pen-types": patch
"@input/pen-core": patch
"@input/pen-schema": patch
---

Widen `BlockSchema`'s `Content` default from `"inline"` to `ContentType` so nested, `none`, `table`, and `subdocument` blocks are bare `BlockSchema` values and belong in `SchemaRegistry.extend` without a cast (API10). `DefinedBlockSchema.a11y` is now the resolved spec intersected with the AX4 fluent attach, so `defineBlock()` is assignable to `BlockSchema`. Serialize/normalize callbacks on `BlockSchema` use method syntax so a specific `Type` remains assignable to the wide schema.

This is graded patch, not minor: existing call sites that passed a correct `BlockSchema` still type-check, and hosts that already cast (the previous workaround) can delete the cast. The inference change is that `BlockSchema["content"]` is the `ContentType` union instead of the `"inline"` literal — that is the truthful type, not a break of a documented contract. Same grading as HOST8/HOST9, which shipped a real behavior change as patch with the reason written down; this change is types-only.
