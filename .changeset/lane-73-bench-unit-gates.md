---
"@input/pen-bench": patch
---

Make the bench unit suite able to fail, and measure the SCALE1 concurrent-peers row on a real two-peer sync.

`createTestCollaboration` still seeds two independent Y.Docs, so `sync()` merged unrelated histories and peer B never received A's insert. The envelope fixture now forks both editors from one encoded seed. Streaming and AI benches register `deltaStreamExtension()` now that core no longer ships that fallback. `test` runs the unit suite so a root `pnpm test` can report failure; the long `bench` / `bench:ci` / `bench:envelope` scripts stay off that graph.
