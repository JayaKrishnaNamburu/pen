---
"@input/pen-core": patch
"@input/pen-ai": patch
---

Make every production `switch (op.type)` fail compilation when a DocumentOp variant is added, and translate the frozen v2 op-equality corpus at replay time so the coming primitive rewrite cannot silently drop a case or look like a corpus regression.
