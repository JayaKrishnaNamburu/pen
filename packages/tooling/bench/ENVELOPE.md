# Scale envelope

Generated from `packages/tooling/bench/baselines/envelope.json`. Do not edit by hand. Regenerate with `pnpm --filter @input/pen-bench exec tsx src/envelope/writeTable.ts`.

Rule: SCALE1 (`spec-v2/22-scale-envelope.md`). Grades: **verified** — a suite asserts behavior at this size on every run. **measured** — a benchmark records it, with harness floor subtracted, no pass/fail on the clock. **untested above** — the honest ceiling.

**Status: provisional.** Wall-clock medians are the 2026-08-20 macos-arm64 sample (n=21). Floors were recorded 2026-08-21 on the same class at load 7.87 on 14 CPUs while other lanes were running. Empty-timer floors are 0.00ms; the peer empty-sync floor is 0.02ms. A later isolated note recorded concurrentPeers-2 wall p50 at 0.198ms against this file's 1.49ms — that row is especially untrustworthy until a quiet-machine remeasure. This is not a quiet-machine envelope.

Wall-clock sample: 2026-08-20 on macos-arm64 (darwin 25, Apple Silicon). Not the CI runner (github-actions-ubuntu-latest). Median of 21. Floors: 2026-08-21. A row without a floor is not a measurement.

## Fixture audit

Claimed subject versus what the fixture actually does. The last two published defects lived here: a concurrent-peers row whose peer B never received peer A's insert, and a streaming "regression" whose clock was 100 `setTimeout(0)` yields.

| Fixture | Claimed | Actual | Verdict |
| ------- | ------- | ------ | ------- |
| `generateBlockSpecs(100)` / `createEnvelopeEditor` | one insert-text in a 100-block document | 100 mixed heading/code/paragraph blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock. | agrees |
| `generateBlockSpecs(1000)` / `createEnvelopeEditor` | one insert-text in a 1,000-block document | 1,000 mixed blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock. | agrees |
| `generateBlockSpecs(5000)` / `createEnvelopeEditor` | one insert-text in a 5,000-block document | 5,000 mixed blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock. | agrees |
| `generateLongBlockSpec` / `createEnvelopeEditor` | one insert-text at the end of a 100k-character block | One paragraph of 100,000 `A` characters. Timed work is one `insert-text` at offset 100000. | agrees |
| `buildNestingYDoc` / `createEnvelopeEditor` | one insert-text at nesting depth 10 | Ten nested callouts. Timed work is one `insert-text` on the innermost block. | agrees |
| `buildTableYDoc` / `createEnvelopeEditor` | one cell insert in a 50×20 table | A 50-row × 20-column table. Timed work is one `insert-table-cell-text` on the last cell. | agrees |
| `createEnvelopeCollaboration` → `createTwoPeerHarness` | concurrent 2-peer edit | Shared-seed fork so peer B can receive peer A's insert (the independently-populated fixture could not). Timed work is peer A `insert-text` plus `sync()`. Peer B does not write during the clock. | name-overstates |
| `streaming.bench.ts` 1000-part harness | 1000 gen-delta parts through `editor.apply` | 1000 `appendDelta` calls plus 100 `setTimeout(0)` yields. Same-run yield floor is ~115ms; coalesced no-yield work is ~0.13ms and one apply. The clock is the scheduler. | wrong-subject |
| `createScale3Editor` peer-count axis | keystroke with 8 remote peers | Eight `data-pen-remote-caret` decorations on the multiplayer stand-in. No second Y.Doc, no sync. | name-overstates |
| `createLargeDocument(n)` | n-block document (SCALE3 / CRDT / schema) | n blocks written with `adapter.transact` + `initBlockMap`, not `editor.apply`. Different generator than the SCALE1 envelope specs. | agrees |

## Envelope

| Axis | Verified | Measured | Untested above |
| ---- | -------- | -------- | -------------- |
| Block count | 5,000 (`@input/pen-test` SCALE1 `envelopeLadder`) | 100 blocks / 1,000 blocks / 5,000 blocks (`@input/pen-bench` SCALE1 `blocks-100`, `blocks-1000`, `blocks-5000`) | 5,000 blocks |
| Longest single block | 100,000 characters (`@input/pen-test` SCALE1 `envelopeLadder`) | 100,000 characters (`@input/pen-bench` SCALE1 `long-block`) | 100,000 characters |
| Nesting depth | 10 (`@input/pen-test` SCALE1 `envelopeLadder`) | depth 10 (`@input/pen-bench` SCALE1 `nesting-10`) | depth 10 |
| Table | 50 × 20 (`@input/pen-test` SCALE1 `envelopeLadder`) | 50 × 20 (`@input/pen-bench` SCALE1 `table-50x20`) | 50 × 20 |
| Concurrent peers | 2 (`@input/pen-test` `createTwoPeerHarness` + `assertPeerEditsSurvive`) | 2 peers (`@input/pen-bench` SCALE1 `concurrentPeers-2`, A insert + sync) | 2 peers |

Verification for the ladder is headless (`createTestEditor`). No renderer suite yet asserts these sizes. Concurrent peers is verified for *survival of both inserts* (`createTwoPeerHarness`); the measured clock is A insert + sync, not concurrent A+B.

## Fixture ladder (attributed)

Wall minus harness floor. The block-count rungs are the curve: a single point cannot show drift. `p95/p50` is same-run variance on the wall-clock sample.

| Rung | Size | Operation | Wall p50 (ms) | Floor p50 (ms) | Attributed p50 (ms) | p95/p50 | Grade |
| ---- | ---- | --------- | ------------- | -------------- | ------------------- | ------- | ----- |
| `blocks-100` | 100 blocks | insert-text | 0.21 | 0.00 (empty-timer) | 0.21 | 2.38 | measured (below signal) |
| `blocks-1000` | 1,000 blocks | insert-text | 0.86 | 0.00 (empty-timer) | 0.86 | 1.65 | measured (gated) |
| `blocks-5000` | 5,000 blocks | insert-text | 6.13 | 0.00 (empty-timer) | 6.13 | 1.35 | measured (gated) |
| `long-block` | 100,000 characters | insert-text | 0.03 | 0.00 (empty-timer) | 0.03 | 1.67 | measured (below signal) |
| `nesting-10` | depth 10 | insert-text | 0.05 | 0.00 (empty-timer) | 0.05 | 1.20 | measured (below signal) |
| `table-50x20` | 50 × 20 | insert-table-cell-text | 0.03 | 0.00 (empty-timer) | 0.03 | 1.33 | measured (below signal) |
| `concurrentPeers-2` | 2 peers | insert-text + sync | 1.49 | 0.02 (empty-sync) | 1.47 | 1.15 | measured (gated) |

Same-class timing gate: gated when attributedP50Ms >= 0.5; gateP50Ms = max(attributedP50Ms * 3, attributedP50Ms + 1). Same-run p95/p50 on the committed macos-arm64 sample (n=21) peaked at 2.38× (100-block). The same-class gate is 3× attributed median for rungs whose attributed p50 is at least 0.5ms. Below that the clock is inside timer noise and a ratio cannot be attributed to Pen. The +1ms term applies only above that signal. P95 and Max are trend-only (CH8). Gated rungs: `blocks-1000` gate 2.58ms; `blocks-5000` gate 18.39ms; `concurrentPeers-2` gate 4.41ms. Recorded, not gated: `blocks-100`, `long-block`, `nesting-10`, `table-50x20`. Timing is not compared across machine classes. macos-arm64 medians are not a ubuntu-latest budget; a ratio picked to absorb that gap cannot catch a regression.

## Past the ceiling

Past these sizes, per-commit decoration collection and full-document render degrade first — Pen does not virtualize (`spec-v2/07-dom-scheduling.md`). Hosts that need larger documents window blocks themselves (`packages/rendering/react/VIRTUALIZATION.md`, SCALE5).
