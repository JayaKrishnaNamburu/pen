# SCALE4 soak (F.4 stub)

Nightly heap-trend soak for `spec-v2/22-scale-envelope.md` SCALE4. Not enforcing yet.

F.1 owns the fixture ladder in `@input/pen-test`. This directory is the bench-side harness: a placeholder runner and the post-teardown assertion sketch. Do not invent a pass/fail memory gate for in-session growth (SCALE4 / CH8).

## What will run

A long session (thousands of edits, undo/redo, remote updates, AI streams, mount/unmount) with heap sampled as a trend. After full teardown-and-recreate, one hard assertion: heap returns within a stated multiple of baseline. Growth that survives `editor.destroy()` is a leak.

`editor.destroy()` is awaitable (H.6). The standing “destroyed editor retains nothing” check covers the maps in `packages/core/CACHE-INVENTORY.md` (caches, indexes, decoration sets, undo stacks, field editors).

## Now

- `.github/workflows/soak.yml` — `workflow_dispatch` + nightly cron. Runs `run.mjs`, which exits 0 and writes `soak not yet enforcing` to the step summary.
- `destroyRetainsNothing.test.ts` — skipped (CH3: SCALE4 / F.4, restored after H.6). Documents the post-teardown multiple; does not sample heap.

```bash
node packages/tooling/bench/src/soak/run.mjs
```
