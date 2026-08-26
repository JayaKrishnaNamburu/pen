# Wave 4: Field-Editor Spine

Depends on: wave 0 only — runs in parallel with the AI arm (waves 1–3) by package boundary. Blocks: wave 5.
Packages touched: `@input/pen-dom`, `@input/pen-conformance` (scenarios and budgets). No `@input/pen-ai` changes.

Discharges FE1–FE5, FE7, FE8 (FE6, cell parity, lands in wave 5 with the other declared contracts). No user-visible behavior change anywhere in this wave; the conformance suites and the recorded typing budgets are the net. This is WA8 territory: consolidation, not redesign — every decision the selection reader, reconciler, and backends currently make is preserved.

Order of PRs (WA11): raf adjudication and deletions first (FE3), spine extraction second (FE1/FE2), scheduler wiring third (FE4), gesture split fourth (FE5), property tests and docs with their subjects (FE7/FE8).

## Entry Gate

- GATE 4.1 [test]: `pnpm --filter @input/pen-conformance test`
  expect: exit 0 — the net is green before the spine moves.
- GATE 4.2 [script]: `node -e "const t=require('fs').readFileSync('spec-v5/evidence/baseline.md','utf8');process.exit(t.includes('Frame authority list')?0:1)"`
  expect: exit 0 — the adjudication docket (raf sites, acceptCommit census) exists from wave 0.

## 1. Frame Authority (FE3, FE4)

Each of the four raf sites outside the scheduler is adjudicated in the PR: real next-paint scheduling moves onto a scheduler-owned callback; a selection retry in disguise is removed under the S4 fence. Then `DomScheduler.acceptCommit` joins the production apply path — editor commit → scheduler → reconcile under the frame budget — closing the gap the typing-budget scenario documents in its own annotations, and the scenario's harness-fed mode is retired: it measures the real path or nothing.

- GATE 4.3 [grep]: `rg -n "requestAnimationFrame" packages/rendering/dom/src --glob "!scheduler.ts" --glob "!**/__tests__/**"`
  expect: exit 1 — the scheduler is the only raf owner in production DOM code; this grep stays in CI so the count cannot creep back.
- GATE 4.4 [grep]: `rg -n "acceptCommit" packages/rendering/dom/src --glob "!scheduler.ts"`
  expect: exit 0 — a production caller exists; the commit path traverses the scheduler (the inverse gate of today's zero-caller census).
- GATE 4.5 [test]: `pnpm --filter @input/pen-conformance test -- scenarios/sch-typing-budget.record.spec.ts`
  expect: exit 0 — the typing-budget scenario runs against the wired path, and its recorded budgets hold against the wave-0 baseline (no keystroke-cost regression from scheduler wiring).

## 2. The Spine (FE1, FE2)

One lifecycle module owns attach/teardown/listener bookkeeping for the EditContext, contenteditable, and expanded backends; backends keep only their input-technology delta. Shared code found in two backends moves in the PR that finds it, with the move list in the PR description.

- GATE 4.6 [test]: `pnpm --filter @input/pen-dom test -- src/field-editor/__tests__/fe1.spineTeardown.test.ts`
  expect: exit 0 — FE1 claimed: attach, exercise, teardown leaves zero leaked listeners/observers, asserted identically across all three backends through the spine.
- GATE 4.7 [test]: `pnpm --filter @input/pen-conformance test`
  expect: exit 0 — backend behavior is unchanged through the extraction: the selection, IME, and typing scenarios pass on all engines.

## 3. The Gesture Split (FE5) and the Bridge (FE7)

`contentGestures.ts` (1,143 lines at adoption) splits into pointer-selection, drag, and region modules behind the existing attach entry. The offset bridge gains round-trip property tests over the fixture corpus, including atom-adjacent and grapheme-cluster cases.

- GATE 4.8 [script]: `node -e "const fs=require('fs');const p='packages/rendering/dom/src/field-editor/contentGestures.ts';const n=fs.existsSync(p)?fs.readFileSync(p,'utf8').split('\n').length:0;process.exit(n<400?0:1)"`
  expect: exit 0 — the entry file is a thin attach seam (under 400 lines) or renamed away entirely; the three gesture modules own the behavior.
- GATE 4.9 [test]: `pnpm --filter @input/pen-dom test -- src/field-editor/__tests__/fe7.offsetRoundTrip.test.ts`
  expect: exit 0 — FE7 claimed: model→DOM→model is identity and DOM→model→DOM lands in the same rendered position, over the fixture corpus.

## 4. Doc Truth (FE8)

`FIELD-EDITOR-BACKENDS.md` and `FIELD-EDITOR-TEARDOWN.md` are rewritten to describe the spine in the same PRs that land it.

- GATE 4.10 [script]: `node -e "const fs=require('fs');const a=fs.readFileSync('packages/rendering/dom/FIELD-EDITOR-TEARDOWN.md','utf8');const b=fs.readFileSync('packages/rendering/dom/FIELD-EDITOR-BACKENDS.md','utf8');process.exit(/spine/i.test(a)&&/spine/i.test(b)?0:1)"`
  expect: exit 0 — both docs describe the spine architecture, not three parallel implementations.

## Exit Gate

- GATE 4.11 [test]: `pnpm build && pnpm typecheck && pnpm test`
  expect: exit 0 — repo-wide green at wave close.
- GATE 4.12 [test]: `pnpm test:e2e`
  expect: exit 0 — the Playwright suite passes against the playground: real-browser selection, typing, and gesture behavior survived the spine.
