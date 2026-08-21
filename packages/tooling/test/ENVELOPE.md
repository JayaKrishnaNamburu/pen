# Scale envelope

Generated from `packages/tooling/test/src/fixtures/envelope/metadata.json`. Do not edit by hand. Regenerate with `node scripts/envelope-table.mjs`.

Published next to the HOST3 runtime floor (`spec-v2/15-host-integration.md`). Rule: SCALE1 (`spec-v2/22-scale-envelope.md`).

## Envelope

| Axis | Verified | Measured | Untested above |
| ---- | -------- | -------- | -------------- |
| Block count | 5,000 (`@input/pen-test` SCALE1 `envelopeLadder`) | 1,000 (`@input/pen-bench` `createLargeDocument`) | 5,000 |
| Longest single block | 100,000 characters (`@input/pen-test` SCALE1 `envelopeLadder`) | — | 100,000 characters |
| Nesting depth | 10 (`@input/pen-test` SCALE1 `envelopeLadder`) | — | 10 |
| Table | 50 × 20 (`@input/pen-test` SCALE1 `envelopeLadder`) | — | 50 × 20 |
| Concurrent peers | 2 (`@input/pen-test` `createTestCollaboration` + `assertPeerEditsSurvive`) | — | 2 |

Grades: **verified** — a suite asserts behavior at this size on every run. **measured** — a benchmark records it, no pass/fail gate. **untested above** — the honest ceiling.

Verification for the ladder is headless (`createTestEditor`). No renderer suite yet asserts these sizes.

## Fixture ladder

| Rung | Size | Storage |
| ---- | ---- | ------- |
| `blocks-100` | 100 blocks | committed `src/fixtures/envelope/committed/blocks-100.json` |
| `blocks-1000` | 1,000 blocks | generated at runtime |
| `blocks-5000` | 5,000 blocks | generated at runtime |
| `long-block` | 100,000 characters | generated at runtime |
| `nesting-10` | depth 10 | generated at runtime |
| `table-50x20` | 50 × 20 | generated at runtime |

5,000-block and 1,000-row fixtures are generated at runtime rather than committed: a Yjs dump of those sizes is large and adds nothing beyond the generator plus this table. The committed 100-block JSON is the checked-in rung; every other size is produced by the same scripts.

## Past the ceiling

Past these sizes, per-commit decoration collection and full-document render degrade first — Pen does not virtualize (`spec-v2/07-dom-scheduling.md`). Hosts that need larger documents window blocks themselves (`packages/rendering/react/VIRTUALIZATION.md`, SCALE5).

## Correction notes

- 2026-08-21: Concurrent peers stayed at **2**, but the earlier verified grade did not measure collaboration. `createTestCollaboration` independently populated two Y.Docs; `sync()` then merged unrelated histories and dropped peer B's concurrent insert. `assertDocEquals` still passed because both sides converged on A's text. The helper now forks both peers from one encoded seed (`createTwoPeerHarness`). The grade is re-verified by `assertPeerEditsSurvive`, which fails on that independently-seeded fixture and passes on the shared-seed harness. Re-measured the bench row on that harness: published path (A insert + sync) p50 0.198 ms versus the committed 1.49 ms; concurrent A+B insert + sync p50 0.434 ms; empty-timer floor p50 0.000 ms (n=21). The table number is the peer count, not the clock.
