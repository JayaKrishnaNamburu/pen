# Wave 3: Routing and Loop

Depends on: wave 2. Blocks: wave 5. Closes release 0.5.
Packages touched: `@input/pen-ai`, `@input/pen-document-ops` (mount lists and tool-surface docs), `.changeset/`.

Discharges UC3–UC8 and completes UC9. With the XML channel gone (wave 1) and the preview off the planner's parsing (wave 2), the brain shrinks to its real decision space: the planner lane is deleted, the vocabulary folds to the reachable set, staleness gets one authority, and the loop/tool boundary is drawn so the next tool cannot re-grow the loop. The wave ends with the coordinated 0.5 release and its single migration note.

Order of PRs (WA11): planner deletion first, vocabulary fold second, staleness third, boundary and mounting fourth, release last.

## Entry Gate

- GATE 3.1 [grep]: `rg -n "markdown-fast-apply|MARKDOWN_FAST_APPLY_OMISSION_MARKER" packages --type ts`
  expect: exit 1 — wave 2 held; nothing in this wave depends on stranded preview plumbing.
- GATE 3.2 [test]: `pnpm --filter @input/pen-ai test && pnpm --filter @input/pen-document-ops test`
  expect: exit 0 — green before the brain surgery.

## 1. The Planner Lane Is Deleted (UC3)

Delete `packages/extensions/ai/src/runtime/structuredPlanner/`, `runtime/planExecutor/`, `runtime/planValidation/`, the sibling entry modules (`runtime/structuredPlanner.ts`, `runtime/planExecutor.ts`, `runtime/planValidation.ts`), their barrel exports, and their tests. Anything the review lane or local-operation execution provably still needs is extracted first as a named module with its own tests, and the extraction PR lists what moved and who consumes it.

- GATE 3.3 [grep]: `rg -n "structuredPlanner|planExecutor|planValidation" packages --type ts`
  expect: exit 1 — the lane is deleted, including type exports and test references.
- GATE 3.4 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc3.barrel.test.ts`
  expect: exit 0 — UC3 claimed: planner symbols are absent from the public API surface.

## 2. The Vocabulary Folds (UC5)

`runtime/contracts.ts` keeps only unions whose every member has a production consumer, per the wave-0 reachability map: prompt intent, route lane, mutation preference, target kind. `AIApplyStrategy`, `AIPlannerMode`, and the planner-only lane members go; `AIMutationMode` keeps only members a route can still produce.

- GATE 3.5 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc5.routerProperty.test.ts`
  expect: exit 0 — UC5 claimed: over the corpus, every input resolves to exactly one route, and every surviving union member is produced by at least one corpus entry.
- GATE 3.6 [grep]: `rg -n "AIApplyStrategy|AI_APPLY_STRATEGIES|AIPlannerMode|AI_PLANNER_MODES" packages --type ts`
  expect: exit 1 — the strategy and planner-mode vocabularies are gone from source and types.

## 3. One Staleness Authority (UC4)

Fingerprints are the only edit gate; the revision counter leaves edit gating and tool payloads.

- GATE 3.7 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc4.staleness.test.ts`
  expect: exit 0 — UC4 claimed: stale edits refuse on fingerprint mismatch, and no edit-gating path consults a revision counter.
- GATE 3.8 [grep]: `rg -n "getBlockRevision" packages/extensions/ai/src`
  expect: exit 1 — the counter is deleted from the AI package, not bypassed.

## 4. The Boundary and the Mounts (UC6, UC7, UC8)

The loop knows the mutating tool's name and the forcing rule; payload shape, refusal payloads, and retry shaping live with the tool executor. The in-editor mount list is reads plus `edit_document`; the single-purpose mutating tools stay host-facing in document-ops, and its README states which surface each tool serves.

- GATE 3.9 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc6.loopBoundary.test.ts`
  expect: exit 0 — UC6 claimed: the loop's forcing decision carries only the tool name; payload-shape assertions live in tool-executor tests.
- GATE 3.10 [test]: `pnpm --filter @input/pen-document-ops test -- src/__tests__/uc7.mounts.test.ts`
  expect: exit 0 — UC7 claimed: the in-editor mount list is exactly reads plus `edit_document`; host-facing tools are not mounted into the loop.
- GATE 3.11 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc8.questionIntent.test.ts`
  expect: exit 0 — UC8 claimed: a question stages nothing, opens no review session, leaves the document hash unchanged — while the same fixture under an edit prompt stages an edit.

## 5. Release 0.5 (UC9)

One coordinated minor; one migration note covering the channel teardown, preview consolidation, planner deletion, vocabulary fold, and staleness change.

- GATE 3.12 [script]: `node -e "const fs=require('fs');const files=fs.readdirSync('.changeset').filter(f=>f.endsWith('.md')&&f!=='README.md');process.exit(files.length>0?0:1)"`
  expect: exit 0 — the release carries changesets; the coordinated bump is real, not implied.

## Exit Gate

- GATE 3.13 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.comparison.test.ts`
  expect: exit 0 — the corpus net holds through the brain shrink: same accuracy, no strategy regressions.
- GATE 3.14 [test]: `pnpm build && pnpm typecheck && pnpm test`
  expect: exit 0 — repo-wide green at release.
- GATE 3.15 [script]: `node scripts/coverage-rules.mjs`
  expect: exit 0 — with UC claims landed, the v5 unclaimed report has shrunk accordingly (reported set is monotonically smaller than wave 0's).
