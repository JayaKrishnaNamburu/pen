---
"@input/pen-core": patch
---

Index blockOrder membership and child-to-parent links for each normalize pass so `normalizeAll` on envelope-sized documents stays linear instead of scanning the document per block.
