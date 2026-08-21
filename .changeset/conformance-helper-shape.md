---
"@input/pen-conformance": patch
---

Expose the official `isCollapsed` helper on the conformance bridge and stop scenarios from reading the live selection property Wave 5.1 is removing. Node `pnpm test` is documented as host locks only; Playwright wrappers stay a separate gate.
