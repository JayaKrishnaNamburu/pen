---
"@input/pen-test": patch
---

Add a two-peer deterministic collaboration harness for COL4 structural concurrency tests.

`createTwoPeerHarness` forks two adapters from one encoded seed, exchanges incremental updates in a chosen interleaving, and asserts document snapshot convergence so split/move/table collision scenarios can be written without a live provider.
