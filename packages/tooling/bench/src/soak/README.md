# SCALE4 soak

Nightly heap-trend soak for `spec/rules/scale.md` SCALE4.

Session growth is a printed trend (CH8: do not fail CI on in-session heap). The only hard assertion is post teardown-and-recreate: `heapUsed` must stay within `TEARDOWN_HEAP_MULTIPLE` of the baseline sample. Exit code is non-zero only when that assertion fails.

## Workload

Headless only. Each iteration applies user inserts, undo/redo, and (on a schedule) a two-peer remote update, an `openTextStream` AI write, and an editor destroy/recreate. Y.Docs created by the harness are destroyed after `editor.destroy()` because `createTestEditor` passes an existing document (`ownsDocuments: false`).

## Heap bound

`TEARDOWN_HEAP_MULTIPLE` is 1.13 and stays there. The 1.159 nightly miss was the soak frame still rooting destroyed session + two-peer editors (yjs `Doc.destroy()` leaves `StructStore` intact; Pen creates those docs with `gc: false`). Retainer paths and the facet-registry check live in `CACHE-INVENTORY.md` (Lane 83 leftover). After sampling in child frames, quiet-machine `--expose-gc` runs measured 1.049 / 1.045 / 1.049 at 24 and 1.080 / 1.077 / 1.073 at 400. Session heap still grows monotonically; that trend is not gated.

`inspectRetainers.mjs` writes heap snapshots and prints retainer paths. It is not a gate.

```bash
node --expose-gc packages/tooling/bench/src/soak/run.mjs
SCALE4_SOAK_ITERATIONS=400 node --expose-gc packages/tooling/bench/src/soak/run.mjs
```

Without `--expose-gc` the script still runs and prints that GC was unavailable.

`.github/workflows/soak.yml` is `workflow_dispatch` + nightly cron. Isolated job; does not edit `ci.yml`. Nightly passes `SCALE4_SOAK_ITERATIONS=400`.

`destroyRetainsNothing.test.ts` asserts the public maps in `packages/core/CACHE-INVENTORY.md` that are reachable headlessly: destroy clears block revisions, listeners, session scopes, decorations, the summary log, `documentState` indexes, and the `undo:manager` slot. Field editors are not mounted headlessly. Module-lifetime caches (`Intl.Segmenter`, unwired direction/formatter factories) are not asserted from this package.
