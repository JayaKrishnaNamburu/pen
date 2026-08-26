# Wave 0: Evidence and Net

Completed 2026-08-26: `spec-v5/evidence/baseline.md` written with all six sections; gates 0.1–0.9 green. Two instruments were red at entry from drift predating v5 and were closed rather than recorded as known-red — `api-docs-coverage` (1810 undocumented vs ratchet 1775; closed by documenting the `@input/pen-vue`, `@input/pen-history` and `@input/pen-shortcuts` public surfaces, 35 symbols, ratchet unchanged) and `size-limit` (`@input/pen-document-ops` over its ceiling on inherited `@input/pen-core` growth; re-recorded with a Wave-named note). The wave also produced three findings the later waves inherit as work rather than opinion: `AIQualityMetricId` has no production consumer for any of its eight members, `AITransportKind.app-structured` and `AIStructuredLane.block-structure` are unreached, and `DomScheduler.acceptCommit` has zero production callers. The "no production source changes" boundary held for behavior; the TSDoc and the budget re-record are evidence work, and both are listed in the wave's changeset.

Depends on: nothing. Blocks: every other v5 wave.
Packages touched: none — this wave writes `spec-v5/evidence/`, verifies instruments, and records baselines. No production source changes.

Before anything is deleted, the tree's current behavior is pinned so every later wave has a before-number and a regression net. This is the WA10 posture the better-ai train proved: criteria written after the change runs are not criteria. The wave is small and boring on purpose; its product is a single evidence document plus green instruments.

## Entry Gate

- GATE 0.1 [script]: `pnpm check:instruments`
  expect: exit 0 — instruments honest before the train starts (WA7).
- GATE 0.2 [script]: `node -e "const r=require('fs').readFileSync('spec/charter/rule-ids.md','utf8'); process.exit(/\|\s*UC\s*\|/.test(r)&&/\|\s*RS\s*\|/.test(r)&&/\|\s*FE\s*\|/.test(r)&&/\|\s*HB\s*\|/.test(r)?0:1)"`
  expect: exit 0 — all four v5 families reserved in the registry before any claiming test is written (v4 RC2).
- GATE 0.3 [script]: `node scripts/coverage-rules.mjs`
  expect: exit 0 — `spec-v5` is in `SPEC_ROOTS`/`DERIVED_SPEC_ROOTS`, v5 families report as unclaimed without failing (the derived-root posture).
- GATE 0.4 [test]: `pnpm --filter @input/pen-ai test && pnpm --filter @input/pen-document-ops test && pnpm --filter @input/pen-dom test && pnpm --filter @input/pen-core test`
  expect: exit 0 — a baseline must be green or every later comparison measures two things.

## 1. The Baseline Document

Write `spec-v5/evidence/baseline.md` with dated, command-stamped sections:

- **Test counts** per package from GATE 0.4 output.
- **Channel corpus results**: the comparison harness and bench numbers for the tool channel as shipped (accuracy, latency, pass counts), so waves 1–3 can show no-regression.
- **Route reachability map**: for each union member in `runtime/contracts.ts`, the production consumer that reaches it or `unreached` — this map is UC5's work order and the source of truth for what wave 3 deletes.
- **Presentation inventory**: the six mechanisms of `00-concept.md` §2 fact 5, each with its entry point and decoration/DOM signature — wave 2's migration checklist.
- **Frame authority list**: the four raf sites outside the scheduler and the `acceptCommit` caller census — wave 4's adjudication docket.
- **Surface sizes**: line counts for the hotspot files and the four packages (`00-concept.md` §2 facts 1 and 7 regenerated), plus current `api-report.md` states and the size-limit baseline — the numbers waves re-measure at close.

- GATE 0.5 [script]: `node -e "const t=require('fs').readFileSync('spec-v5/evidence/baseline.md','utf8'); process.exit(['Test counts','Channel corpus results','Route reachability map','Presentation inventory','Frame authority list','Surface sizes'].every(s=>t.includes(s))?0:1)"`
  expect: exit 0 — the baseline document exists with all six sections.

## 2. The Net

- GATE 0.6 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.bench.test.ts`
  expect: exit 0 — the channel bench runs and its numbers are recorded in the baseline.
- GATE 0.7 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.comparison.test.ts`
  expect: exit 0 — the corpus comparison harness is alive; it is the regression net for waves 1–3.
- GATE 0.8 [script]: `node scripts/v3-gates.mjs --waves-dir spec-v5/waves --scope-lint`
  expect: exit 0 — this train's own wave files carry no cannot-fail gates.

## Exit Gate

- GATE 0.9 [script]: `pnpm lint`
  expect: exit 0 — formatting and lint clean with the new spec tree in place.

## Deletions

None. This wave only adds — the evidence document, the corpus, and the instrument wiring. A wave that measures before it subtracts has nothing to document in `MIGRATION.md`.
