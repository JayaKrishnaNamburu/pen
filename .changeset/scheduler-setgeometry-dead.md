---
"@input/pen-dom": patch
---

Remove the unreachable `DomScheduler.setGeometry` setter.

A wiring census of `DomScheduler` found `setGeometry` had exactly one hit in the repository — its own definition — and no caller in product, tests, playground or tooling. The `geometry` field it wrote is still live and still populated by the constructor from `options.geometry`, so only the setter is gone. `paintOverlays` was left in place despite its empty body, because it is the reserved seam for the overlay work in Wave 05 step 5.7.
