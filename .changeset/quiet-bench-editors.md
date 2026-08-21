---
"@input/pen-bench": patch
---

Give the autocomplete bench editors a schema so the AI suites actually measure something.

`createAutocompleteBenchEditor` and `createAutocompleteCancelChurnBenchEditor` built their editor with `createEditor({ extensions })` and no schema, so the seeded paragraph was dropped as an unknown block type and `editor.firstBlock()` returned null — every AI autocomplete bench threw before reaching `b.start()`. They now build on `createTestEditor`, which supplies the default schema and a seeded first block. This package has no `test` script by design (CH8 keeps benchmarks on their own runner), so the failure was invisible to `pnpm test`.

Also declares the `engines.node` floor the HOST3 inventory expects, and renames the SCALE4 destroy suite to `destroy retention inventory` — it pins which caches `destroy()` releases and which four it still retains, which is the opposite of what "retains nothing" claimed.
