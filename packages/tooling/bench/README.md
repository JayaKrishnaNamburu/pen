# @input/pen-bench

Performance benchmarks for Pen.

## CH8

Blocking budgets do not run on the shared `pnpm test` / `turbo run test` graph. They live on a dedicated serial job so a red check is a regression, not machine load (`09-reliability-testing.md` CH8, `11-audit.md` F38).

- `pnpm test` does not run this package.
- `pnpm --filter @input/pen-bench bench` runs `src/cli.ts` with target enforcement.
- `pnpm --filter @input/pen-bench bench:ci` runs the runner unit tests, then `src/cli.ts`, serially.

Critical budgets are judged on the **median of 50 measured iterations** (`BENCH_GATE_SAMPLE_SIZE`). P95 and Max are printed and stored as trend data. They are not gate inputs.

## SCALE3

The SCALE3 suite measures one user keystroke in an envelope-sized document with the stack hosts ship: the default preset (`document-ops`, `delta-stream`, `undo`, `rich-text-shortcuts`) plus no-op stand-ins for AI, suggestions, autocomplete, search, and multiplayer. The stand-ins keep those extension names and the observe/decoration hooks; they do not import the AI packages, so the number is commit-dispatch cost rather than model runtime.

Each bench isolates one axis at a declared point. The set covers document size (100 / 1000 blocks), extension count (shipped 9 / shipped+8), decoration count (0 / 256), and peer count (0 / 8). The 1000-block shipped stack is the shared second point on the last three axes.

Baselines live in `src/constants/scale3.ts` with the machine class that produced them. The isolated job compares the median to `gateP50Ms` (measured median plus CI slack), not to an invented frame budget.

Waivers are the committed empty document at `spec/benchWaivers.json` (API10). Do not add a `test` script — this package stays off `turbo run test`.

## Install

```bash
pnpm add @input/pen-bench
```

## Notes

This package is part of the Pen monorepo. Pair it with the relevant core, schema, rendering, or extension packages for your editor setup.
