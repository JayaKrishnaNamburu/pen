---
"@input/pen-core": patch
"@input/pen-bench": patch
---

Stop the SCALE4 soak from measuring destroyed two-peer documents it still held.

The four public destroy caches were already released. Nightly 400-iteration runs still failed at 1.159× because `run()` sampled post-teardown while the session and harness locals rooted `gc: false` Y.Docs whose `StructStore` survives `Doc.destroy()`. Baseline, session, and recreate now sample in child frames so those handles are gone; the 1.13 bound is unchanged. The inventory names the retainer path and records that the facet process-state global holds no per-editor data.
