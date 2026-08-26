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

This is the wave's centerpiece and it is a **migration before a deletion** — the planner is a live text-parsed mutation channel, not dead weight (`../01-channel.md` UC3 corrections, 2026-08-26). Forcing `plannerMode` to `"text"` without the migration was tried and reverted; it breaks `extension.part13.test.ts` and `extension.part8.test.ts`. Order:

1. **Migrate the block-plan paths onto `edit_document`.** `block_convert` becomes `set_block_props` with `blockType`; mark plans become `format_text` (both already exist per `EC18`). The two tests above are rewritten to drive the tool and keep asserting the same staged outcome — same observable behavior, one channel.
2. **Extract the executor.** `buildDocumentMutationPlanExecution` has two consumers that outlive the planner (`controller/reviewResolutionMethods.ts`, `controller/generationExecutionFinalize.ts`). It moves to a named module with its own tests; the PR names the module and both consumers.
3. **Delete the rest.** `runtime/structuredPlanner/`, `runtime/planValidation/`, the sibling entry modules, the residual `planExecutor` internals no longer reached, their barrel exports, their tests, and the `AIPlannerMode` / `AI_PLANNER_MODES` vocabulary with `reconcilePlannerModeWithPrompt`.

**Steps 1 and the vocabulary half of step 3 shipped early, 2026-08-26, out of wave order.** Justification for breaking WA11's sequencing: UC3 is a live UC2 violation, and every wave scheduled before it inherits the second channel. Waves 0–2 were not a prerequisite for closing the door — the door is three functions and one union. What shipped: `runtime/structuredPlanner/` and its barrel, `buildPlannerPrompt`, `parseStructuredPlanPreview`, `parseStructuredPlanResult`, and the whole `plannerMode` vocabulary including `reconcilePlannerModeWithPrompt` (18 files, 31 insertions, 1,438 deletions, 7 files deleted). `extension.part13.test.ts` drives `set_block_props` through `edit_document` and asserts the same staged-then-accepted conversion. What remains for this wave: **step 2** (extract `planExecutor`, 1,323 lines, under a non-planner name with its own tests) and the `planValidation` half of **step 3** (856 lines). Both are now reachable only from review resolution, never from a text stream.

- GATE 3.3 [grep]: `rg -n "structuredPlanner|planValidation|plannerMode|AIPlannerMode|AI_PLANNER_MODES" packages --type ts`
  expect: exit 1 — the planner, its validation, and its vocabulary are deleted, including type exports and test references. As of 2026-08-26 this population is down to `planValidation` alone; the other four terms already return nothing, so a reappearance of any of them means the text-parsed door was reopened. (`planExecutor` is excluded from the population on purpose: step 2 extracts it for review resolution. Its extracted module must not carry a planner-era name.)
- GATE 3.4 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc3.barrel.test.ts`
  expect: exit 0 — UC3 claimed: planner symbols are absent from the public API surface. (`AIPlannerMode` and `AI_PLANNER_MODES` already left `api-report.md` on 2026-08-26; the test generalizes that to the barrel.)
- GATE 3.5 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/extension.part13.test.ts src/__tests__/uc3.planReachability.test.ts`
  expect: exit 0 — the migrated block-plan path stages its outcome through `edit_document`, and no JSON plan is parsed out of a `text-delta` anywhere. The second file replaces `extension.part8.test.ts` in this gate: part8's plan case is deleted rather than migrated (see UC3's capability-removal correction), so the reachability test is what carries the claim.

## 2. The Vocabulary Folds (UC5)

`runtime/contracts.ts` keeps only unions whose every member has a production consumer, per the wave-0 reachability map: prompt intent, route lane, mutation preference, target kind. `AIApplyStrategy`, `AIPlannerMode`, and the planner-only lane members go; `AIMutationMode` keeps only members a route can still produce.

- GATE 3.6 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc5.routerProperty.test.ts`
  expect: exit 0 — UC5 claimed: over the corpus, every input resolves to exactly one route, and every surviving union member is produced by at least one corpus entry.
- GATE 3.7 [grep]: `rg -n "AIApplyStrategy|AI_APPLY_STRATEGIES|AIPlannerMode|AI_PLANNER_MODES" packages --type ts`
  expect: exit 1 — the strategy and planner-mode vocabularies are gone from source and types.

## 3. One Staleness Authority (UC4)

Fingerprints are the only edit gate; the revision counter leaves edit gating and tool payloads.

- GATE 3.8 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc4.staleness.test.ts`
  expect: exit 0 — UC4 claimed: stale edits refuse on fingerprint mismatch, and no edit-gating path consults a revision counter.
- GATE 3.9 [grep]: `rg -n "getBlockRevision" packages/extensions/ai/src`
  expect: exit 1 — the counter is deleted from the AI package, not bypassed.

## 4. The Boundary and the Mounts (UC6, UC7, UC8)

The loop knows the mutating tool's name and the forcing rule; payload shape, refusal payloads, and retry shaping live with the tool executor. The in-editor mount list is reads plus `edit_document`; the single-purpose mutating tools stay host-facing in document-ops, and its README states which surface each tool serves.

- GATE 3.10 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc6.loopBoundary.test.ts`
  expect: exit 0 — UC6 claimed: the loop's forcing decision carries only the tool name; payload-shape assertions live in tool-executor tests.
- GATE 3.11 [test]: `pnpm --filter @input/pen-document-ops test -- src/__tests__/uc7.mounts.test.ts`
  expect: exit 0 — UC7 claimed: the in-editor mount list is exactly reads plus `edit_document`; host-facing tools are not mounted into the loop.
- GATE 3.12 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc8.questionIntent.test.ts`
  expect: exit 0 — UC8 claimed: a question stages nothing, opens no review session, leaves the document hash unchanged — while the same fixture under an edit prompt stages an edit.

### Inherited from wave 2: the unapplied-edit report (RS3)

Added 2026-08-26. Wave 2 discharged RS3's posture half and could not discharge its reporting half; the remainder lands here because it needs exactly the distinction this section draws.

`isUnappliedEdit` in `controller/generationExecutionFinalize.ts` keys on `applyStrategy === "markdown-full-replace"` reaching `complete` with a `noop` receipt — the signature of a plan that failed to compile, which UC3 deletes outright. Once the planner lane is gone, that guard watches nothing. Two lanes that genuinely end with an edit proposed and nothing landing are uncovered:

The tool loop reaches `complete` with a `noop` receipt and non-empty text (measured in wave 2, not inferred). Reporting that as an unapplied edit would be wrong, because on this lane text with no document change is usually the answer to a question — which is UC8's whole subject. The condition that distinguishes them is whether the turn called the mutating tool, and UC6 puts the tool's name at the loop boundary, so the report becomes expressible here: an edit tool called, no receipt of an applied or staged result, is a lost edit; no tool call is an answer.

The requested-operation path (`controller/localOperationExecutionFinalize.ts`) can commit a `noop` and never consults the report at all.

- GATE 3.12a [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs3.unappliedEditReport.test.ts`
  expect: exit 0 — RS3 completed: a turn that calls the mutating tool and lands neither an applied nor a staged result reports the unapplied edit; a question turn on the same fixture does not, and the report no longer keys on a deleted apply strategy.

## 5. Release 0.5 (UC9)

One coordinated minor; one migration note covering the channel teardown, preview consolidation, planner deletion, vocabulary fold, and staleness change.

- GATE 3.13 [script]: `node -e "const fs=require('fs');const files=fs.readdirSync('.changeset').filter(f=>f.endsWith('.md')&&f!=='README.md');process.exit(files.length>0?0:1)"`
  expect: exit 0 — the release carries changesets; the coordinated bump is real, not implied.

## Exit Gate

- GATE 3.14 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.comparison.test.ts`
  expect: exit 0 — the corpus net holds through the brain shrink: same accuracy, no strategy regressions.
- GATE 3.15 [test]: `pnpm build && pnpm typecheck && pnpm test`
  expect: exit 0 — repo-wide green at release.
- GATE 3.16 [script]: `node scripts/coverage-rules.mjs`
  expect: exit 0 — with UC claims landed, the v5 unclaimed report has shrunk accordingly (reported set is monotonically smaller than wave 0's).

## Deletions

- `AIPlannerMode` and `AI_PLANNER_MODES` — the planner-mode vocabulary, shipped 2026-08-26, gone from the public API with the text-parsed plan channel it selected.
- `structuredPlanner` — the plan prompt, the plan parse, and the streamed plan preview, shipped 2026-08-26. A model that emits a JSON plan into the assistant text stream now gets no mutation.
- `planValidation` — the plan schema validator, deleted once the executor is extracted for review resolution.
- `AIApplyStrategy` and `AI_APPLY_STRATEGIES` — the strategy vocabulary, folded into mutation preference.
- `getBlockRevision` — the second staleness authority, deleted from edit gating and tool payloads in favor of working-set fingerprints.
