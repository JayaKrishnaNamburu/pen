# @input/pen-bench

Performance benchmarks for Pen.

## CH8

Blocking budgets do not run on the shared `pnpm test` / `turbo run test` graph. They live on a dedicated serial job so a red check is a regression, not machine load (`09-reliability-testing.md` CH8, `11-audit.md` F38).

- `pnpm test` / `test:unit` run the fast correctness suite only. They do not enforce critical budgets.
- `pnpm --filter @input/pen-bench bench` runs `src/cli.ts` with target enforcement.
- `pnpm --filter @input/pen-bench bench:ci` runs the runner unit tests, then `src/cli.ts`, serially.

Critical budgets are judged on the **median of 50 measured iterations** (`BENCH_GATE_SAMPLE_SIZE`). P95 and Max are printed and stored as trend data. They are not gate inputs.

## SCALE1

The published envelope table lives in `@input/pen-test` (`ENVELOPE.md`, generated from fixture metadata). This package measures the same axes (`blockCount`, `longestBlock`, `nestingDepth`, `table`, `concurrentPeers`) and writes medians to `baselines/envelope.json`. It does not render a second table.

The concurrent-peers row is a count (2), not a clock. It is verified by `assertPeerEditsSurvive` on a shared-seed two-peer harness. An earlier verified grade cited `createTestCollaboration` while that helper independently populated two Y.Docs, so `sync()` dropped one side and equality still passed. See the correction note in `packages/tooling/test/ENVELOPE.md`.

- `pnpm --filter @input/pen-bench bench:envelope` runs the ladder (median of 21) and fails if a rung exceeds the committed gate.
- `pnpm --filter @input/pen-bench bench:envelope:write` regenerates `baselines/envelope.json` from a fresh run.
- Gates are `max(measured × 4, measured + 15ms)` on the median. P95 is recorded, not gated (CH8). Numbers are macos-arm64; they are not CI measurements.
- `.github/workflows/bench.yml` runs `bench:envelope` after `bench:ci` so measurement drift is a red check, not a printed table. The published size table (`packages/tooling/test/ENVELOPE.md`) is a separate generator-diff job.

## SCALE3

The SCALE3 suite measures one user keystroke in an envelope-sized document with the stack hosts ship: the default preset (`document-ops`, `delta-stream`, `undo`, `rich-text-shortcuts`) plus no-op stand-ins for AI, suggestions, autocomplete, search, and multiplayer. The stand-ins keep those extension names and the observe/decoration hooks; they do not import the AI packages, so the number is commit-dispatch cost rather than model runtime.

Each bench isolates one axis at a declared point. The set covers document size (100 / 1000 blocks), extension count (shipped 9 / shipped+8), decoration count (0 / 256), and peer count (0 / 8). The 1000-block shipped stack is the shared second point on the last three axes.

SCALE2's eight no-op decorating extensions are the plus8 point. `bench:ci` compares that median to the same-run 1000-block shipped-stack median (`max(base × 2, base + 15ms)`). That is a dispatch-cost bound, not a decoration-identity proof.

Baselines live in `src/constants/scale3.ts` with the machine class that produced them. The isolated job compares the median to `gateP50Ms` (measured median plus CI slack), not to an invented frame budget.

Waivers are the committed empty document at `spec/benchWaivers.json` (API10). `run.ts` loads that file via `--waivers`, a cwd walk, or the package-local path. `test` joins the workspace suite for the unit checks; the long `bench` / `bench:ci` / `bench:envelope` runs stay on their own scripts.

## SCALE4

`src/soak/run.mjs` samples `heapUsed` across a headless session (edits, undo/redo, two-peer remote updates, `openTextStream`, create/destroy). The trend is printed. The only hard assertion is post teardown-and-recreate vs baseline (`TEARDOWN_HEAP_MULTIPLE`, derived from measured 24-iteration `--expose-gc` runs). Nightly: `.github/workflows/soak.yml` with `SCALE4_SOAK_ITERATIONS=400`.

## Install

```bash
pnpm add @input/pen-bench
```

## Usage

Hosts do not import this package into an editor. Run it from the workspace:

```bash
pnpm --filter @input/pen-bench bench
```

```ts
import { BENCH_GATE_SAMPLE_SIZE } from "@input/pen-bench";

void BENCH_GATE_SAMPLE_SIZE;
```

Critical budgets use the median of `BENCH_GATE_SAMPLE_SIZE` (50) measured iterations.

## Options

This package has no editor options. The CLI reads committed baselines and `spec/benchWaivers.json`; those are not create-function defaults.

## Documentation

The docs site (the `@input/pen-docs` package) covers runtime floor notes on the Browser and Node page (`#/support`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
