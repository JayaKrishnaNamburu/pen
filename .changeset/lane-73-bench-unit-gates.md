---
"@input/pen-bench": patch
---

Make the bench unit suite able to fail, and measure the SCALE1 concurrent-peers row on a real two-peer sync.

The envelope fixture forks both editors from one encoded seed so the SCALE1 concurrent-peers row measures a real two-peer sync. Streaming and AI benches register `deltaStreamExtension()` now that core no longer ships that fallback. `test` runs the unit suite so a root `pnpm test` can report failure; the long `bench` / `bench:ci` / `bench:envelope` scripts stay off that graph.
