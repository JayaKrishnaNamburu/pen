# Wave 3: Routing and Loop

Depends on: wave 2. Blocks: wave 5. Closes release 0.5.
Packages touched: `@input/pen-ai`, `@input/pen-document-ops` (mount lists and tool-surface docs), `.changeset/`.

Discharges UC3–UC8 and completes UC9. With the XML channel gone (wave 1) and the preview off the planner's parsing (wave 2), the brain shrinks to its real decision space: the planner lane is deleted, the vocabulary folds to the reachable set, staleness gets one authority, and the loop/tool boundary is drawn so the next tool cannot re-grow the loop. The wave ends with the coordinated 0.5 release and its single migration note.

Order of PRs (WA11): planner deletion first, vocabulary fold second, staleness third, boundary and mounting fourth, release last.

## Entry Gate

- GATE 3.1 [grep]: `rg -n "markdown-fast-apply|MARKDOWN_FAST_APPLY_OMISSION_MARKER|fastApplySupportMethods" packages --type ts`
  expect: exit 1 — wave 2 held and UC5's rename landed: the two telemetry surfaces and the method-bag filename no longer carry the deleted channel's name. A reappearance is the residue returning.
- GATE 3.2 [test]: `pnpm --filter @input/pen-ai test && pnpm --filter @input/pen-document-ops test`
  expect: exit 0 — green before the brain surgery.

## 1. The Planner Lane Is Deleted (UC3)

This is the wave's centerpiece and it is a **migration before a deletion** — the planner is a live text-parsed mutation channel, not dead weight (`../01-channel.md` UC3 corrections, 2026-08-26). Forcing `plannerMode` to `"text"` without the migration was tried and reverted; it breaks `extension.part13.test.ts` and `extension.part8.test.ts`. Order:

1. **Migrate the block-plan paths onto `edit_document`.** `block_convert` becomes `set_block_props` with `blockType`; mark plans become `format_text` (both already exist per `EC18`). The two tests above are rewritten to drive the tool and keep asserting the same staged outcome — same observable behavior, one channel.
2. **Extract the executor.** `buildDocumentMutationPlanExecution` has two consumers that outlive the planner (`controller/reviewResolutionMethods.ts`, `controller/generationExecutionFinalize.ts`). It moves to a named module with its own tests; the PR names the module and both consumers.
3. **Delete the rest.** `runtime/structuredPlanner/`, `runtime/planValidation/`, the sibling entry modules, the residual `planExecutor` internals no longer reached, their barrel exports, their tests, and the `AIPlannerMode` / `AI_PLANNER_MODES` vocabulary with `reconcilePlannerModeWithPrompt`.

**Steps 1 and the vocabulary half of step 3 shipped early, 2026-08-26, out of wave order.** Justification for breaking WA11's sequencing: UC3 is a live UC2 violation, and every wave scheduled before it inherits the second channel. Waves 0–2 were not a prerequisite for closing the door — the door is three functions and one union. What shipped: `runtime/structuredPlanner/` and its barrel, `buildPlannerPrompt`, `parseStructuredPlanPreview`, `parseStructuredPlanResult`, and the whole `plannerMode` vocabulary including `reconcilePlannerModeWithPrompt` (18 files, 31 insertions, 1,438 deletions, 7 files deleted). `extension.part13.test.ts` drives `set_block_props` through `edit_document` and asserts the same staged-then-accepted conversion. What remains for this wave: **step 2** (extract `planExecutor`, 1,323 lines, under a non-planner name with its own tests) and the `planValidation` half of **step 3** (856 lines). Both are now reachable only from review resolution, never from a text stream.

**Steps 2 and 3 shipped 2026-08-26, and step 2 inverted: the executor was deleted, not extracted.** Step 2 says to extract `buildDocumentMutationPlanExecution` because it "has two consumers that outlive the planner". It has none. Wave 2a deleted the structured-intent resolution block in `controller/generationExecutionFinalize.ts`, which was the only thing that ever produced a `DocumentMutationPlan`; wave 2's own record anticipated the consequence ("wave 3's UC3 step 2/3 therefore finds the plan executor **stranded rather than live**"). The finalize consumer went with that block, and the surviving consumer — `controller/reviewResolutionMethods.ts` — gated every plan path on `planState === "validated"`, a value no producer writes. So the executor's "consumers" were themselves unreachable, and extracting a module to serve them would have preserved a subsystem that cannot run.

What that made deletable is larger than the 2,179 lines this section budgeted, because a plan was also the only source of **structural review items** — the second review presentation, distinct from the live suggestion one. Deleted: `runtime/planExecutor/` (1,318), `runtime/planValidation/` (856), `runtime/reviewArtifacts/` (421), `runtime/planTypes.ts` (118), seven test files (1,358), the plan branches of `acceptActiveGeneration` / `rejectActiveGeneration`, the whole `_applyReviewItems` / `acceptReviewItem(s)` / `rejectReviewItem(s)` family, `_commitStructuredPlan`, `resolveOrderedReviewItems` / `sortReviewItemsForRemoval`, the `plan` / `planState` / `reviewItems` fields on `GenerationState`, `reviewItemIds` on `AISessionTurn`, `pendingReviewItemIds` on `AISession`, `GenerationPlanState`, `FlowPatchAlignmentMetrics` with the `alignment` field it typed, and the fifteen plan and plan-validation names the public barrel exported. `@input/pen-react` and the playground lost the structural-review-item UI that read them (−942 lines): the change-list group tree, `groupStructuralReviewItems`, the four review-item actions on `useAIActions`, `pendingReviewItemCount`, `hasPendingPlan`, and the playground `ReviewSurface`'s review rows.

One live type sat in the deleted module: `PlanConfidence`, which `runtime/structuredIntent/` still uses. It moved there as `StructuredIntentConfidence` rather than keeping a planner-era name in a live path.

Two findings worth keeping. The change list's keyboard system — roving focus, arrow/Home/End navigation, `a`/`r` accept and reject, and the root `tabIndex` — turned out to serve **only** the review groups; the suggestion rows never pushed a focus target. With the groups gone it could not be reached at all, so it went too (about 150 lines plus five helpers). `spec/rules/accessibility.md` AX3 enumerates the shipped roving-tabindex surfaces and the AI change list is not among them, and no test covered it, so nothing obliged it to stay. If suggestion rows should be keyboard-navigable, that is a new AX3 subject to add deliberately, not a dead system to preserve. Separately, `"staged_review"` on `AIMutationReceiptStatus` lost its last producer here; folding the union is §2's job, recorded there. (This paragraph also named `"invalid"`, which was wrong: `controller/operationCommitMethods.ts` and `controller/bufferedBlockGenerationMethods.ts` write it from eight sites, and §2's report reads it.)

- GATE 3.3 [grep]: `rg -n "structuredPlanner|planValidation|plannerMode|AIPlannerMode|AI_PLANNER_MODES" packages --type ts`
  expect: exit 0 with matches only in `src/__tests__/uc3.barrel.test.ts` — the planner, its validation, and its vocabulary are deleted, including type exports and test references. (Amended 2026-08-26, same shape as wave 1's GATE 1.4 and wave 2's GATE 2.1: the last file naming these terms is the guard that asserts their absence, and a grep for silence would force the guard to spell its own population obliquely. Any path outside that test file is a reopened door. `planExecutor` left the population by being deleted rather than extracted, so its exclusion note no longer applies.)
- GATE 3.4 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc3.barrel.test.ts`
  expect: exit 0 — UC3 claimed: planner symbols are absent from the public API surface. (`AIPlannerMode` and `AI_PLANNER_MODES` already left `api-report.md` on 2026-08-26; the test generalizes that to the barrel.)
- GATE 3.5 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/extension.part13.test.ts src/__tests__/uc3.planReachability.test.ts`
  expect: exit 0 — the migrated block-plan path stages its outcome through `edit_document`, and no JSON plan is parsed out of a `text-delta` anywhere. The second file replaces `extension.part8.test.ts` in this gate: part8's plan case is deleted rather than migrated (see UC3's capability-removal correction), so the reachability test is what carries the claim.

**Both green 2026-08-26.** GATE 3.4 checks three surfaces, because a type export is invisible to a runtime check and the recorded report is a separate promise from the barrel: the barrel's runtime export names, the barrel source (for type-only re-exports), and `api-report.md`. GATE 3.5's reachability test streams three plan kinds — `text_edit`, `block_convert`, `review_bundle` — split across two `text-delta` events so a parser accumulating across deltas would still see complete JSON, and asserts the document is untouched and nothing staged. It also drives the `direct` mutation preference: under `suggestions` a refusal could mean the staging step rejected the ops rather than the parse being gone, and the direct lane has no staging step to hide behind. Each case asserts the plan text actually reached the turn, so the pass cannot come from a stream that emitted nothing.

## 2. The Vocabulary Folds (UC5)

`runtime/contracts.ts` keeps only unions whose every member has a production consumer, per the wave-0 reachability map: prompt intent, route lane, mutation preference, target kind. `AIApplyStrategy`, `AIPlannerMode`, and the planner-only lane members go; `AIMutationMode` keeps only members a route can still produce.

- GATE 3.6 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc5.routerProperty.test.ts`
  expect: exit 0 — UC5 claimed: over the corpus, every input resolves to exactly one route, and every surviving union member is produced by at least one corpus entry.
- GATE 3.7 [grep]: `rg -n "AIApplyStrategy|AI_APPLY_STRATEGIES|AIPlannerMode|AI_PLANNER_MODES" packages --type ts`
  expect: exit 0 with matches only in `src/__tests__/uc3.barrel.test.ts` and `src/__tests__/uc5.routerProperty.test.ts` — the strategy and planner-mode vocabularies are gone from source and types. (Amended 2026-08-26, third instance of the same shape as GATE 1.4, 2.1, and 3.3: the guard asserting a name's absence is the last file that may name it.)

**Shipped 2026-08-26, and `AIApplyStrategy` did not fold where this section said it would.** "Folded into mutation preference" describes a merge of two decisions. There was no merge available, because the strategy was not a decision: `router.ts` derived all three members from values it had already chosen — `text-fast-apply` and `markdown-full-replace` from the flow lane's `contentFormat`, `tool-edit` from the tool lane — so no input could select a strategy that its lane, target, and content format did not already determine. Merging a derived value into one of its own inputs is not a fold; it is a rename that keeps the restatement.

What the six consumers actually read is one bit. `flowMarkdown.ts` and `blockAdapters.ts` branch the prompt on whether to describe the edit tool; `streamingSink.ts` gates streaming on whether durable edits are expected elsewhere; `loop.ts` computed `isEditChannel` from it; `generationExecutionFinalize.ts` gated commits on it. Every one of them asks the same question, so the union became `editsArriveAsToolCalls: boolean` on `RequestRouterDecision` and `GenerationState`. The name states the question rather than making each reader re-derive it from a member list, and a boolean cannot grow a fourth member that two readers handle and three do not.

The router property test then found three declared members that no input produces: `ephemeral-preview` on `AIMutationMode`, `app` on `AI_BLOCK_CLASSES`, and `app-structured` on `AI_TRANSPORT_KINDS` — the app-block vocabulary the deleted planner was the only route toward. All three are deleted, along with `"staged_review"` from §1, and `AIStructuredLane` (including `block-structure`) and `AIQualityMetricId` went the same way. `shouldStreamDirectAIOutput` lost its `ephemeral-preview` arm, which was the one place a caller could still ask for a mode nothing assigned.

One addition, not a subtraction: `AI_EDIT_DOCUMENT_TOOL_NAME`. Three readers key on the literal `"edit_document"` — the loop's forced tool choice, its preview gating, and §4's unapplied-edit report — and with the strategy enum gone, that string is what identifies the channel. Naming it once is what makes a rename fail loudly in all three rather than silently in two.

GATE 3.6's test asserts three properties over a cross-product corpus of router inputs: `routeAIRequest` is pure, `refineRouteWithNavigator` is a fixed point under repetition, and each union's produced set equals its declared set in both directions — an unproduced member fails as dead vocabulary, an unexpected value fails as an undeclared route.

### The `fast-apply` names (UC5, second half)

`../01-channel.md` UC5 also requires renaming the names that survived wave 1 pointing at the deleted XML channel: `controller/fastApplySupportMethods.ts` and the `ai-markdown-fast-apply` telemetry surfaces. GATE 3.1 deferred the labels here. Shipped 2026-08-26, and the population was wider than those two: the debug and metrics vocabulary carried `fast-apply` through 27 files and four public types across two packages.

Reading it before renaming changed the target name. The module's five methods parse markdown and build ops that insert the parsed blocks and delete the target's — they are the path from generated text to document ops, which this codebase already calls a **commit**. So the fold is onto `commit`, matching `operationCommitMethods.ts` next door, rather than onto a third synonym: `markdownCommitMethods.ts`, `CommitDebugState`, `CommitFallbackMetrics`, `AISessionCommitMetrics`, `AIDebugLogCommitMetrics`, `debug.commit`, `metrics.commit`, and `ai-markdown-commit` / `ai-markdown-commit-verify` on the wire.

The `executionPath` union needed the same reading. Two of its three members already described what they do (`scoped-replacement`, `plain-markdown`); only `native-fast-apply` named the channel, and its two writers pass `contextChars: selectedText.length` — it is the path that replaces a selection's text directly, so it becomes `selection-replacement`, and `nativeFastApplyCount` becomes `selectionReplacementCount`. Worth stating because "native fast apply" reads like the deleted XML lane and is not: this path is live, and a mechanical rename would have preserved a name that misdirects.

Three fields on `CommitDebugState` had no writer and are deleted with the rename: `confidence`, `verificationFailureReason`, and `untouchedBlockMutationCount`. The last two are the diff-verification telemetry the XML channel reported; wave 1 removed the producer and left the shape.

## 3. One Staleness Authority (UC4)

Fingerprints are the only edit gate; the revision counter leaves edit gating and tool payloads.

**Shipped 2026-08-26.** `getBlockRevision` is gone from `@input/pen-ai`. Working-set envelopes no longer carry `blockRevisions`; local-operation provenance stamps `syncedGeneration`; suggestion scopes keep `documentGeneration`. GATE 3.8 / GATE 3.9 green.

- GATE 3.8 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/uc4.staleness.test.ts`
  expect: exit 0 — UC4 claimed: stale edits refuse on fingerprint mismatch, and no edit-gating path consults a revision counter.
- GATE 3.9 [grep]: `rg -l "getBlockRevision" packages/extensions/ai/src`
  expect: exit 0 with exactly one path — `packages/extensions/ai/src/__tests__/uc4.staleness.test.ts`, the guard that asserts edit-gating source does not consult the counter. Any other path is the counter returning.

## 4. The Boundary and the Mounts (UC6, UC7, UC8)

The loop knows the mutating tool's name and the forcing rule; payload shape, refusal payloads, and retry shaping live with the tool executor. The in-editor mount list is reads plus `edit_document`; the single-purpose mutating tools stay host-facing in document-ops, and its README states which surface each tool serves.

**Shipped 2026-08-26.** Forcing is `{ type: "tool", name: AI_EDIT_DOCUMENT_TOOL_NAME }`. The document-ops README's tool-surfaces table is the declaration GATE 3.11 diffs against. Question intent (`editIntent: route.intent !== "question"`) stages nothing. GATE 3.10 / GATE 3.11 / GATE 3.12 green.

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

**Shipped 2026-08-26, with one correction to the condition above.** This section proposed "an edit tool called, no receipt of an applied or staged result, is a lost edit". Implemented literally, that reported thirteen turns that were not lost edits, and the tests that broke are the argument: EC5's refusal cases, EC10's in-turn retry, EC13's authority denial, and EC9's stale-target refusal all call the tool, land nothing, and finish `noop`. They are not silent — each one tells the model what was rejected and why, which is the behavior those rules require. A report that fires on them says "edit not applied" about a turn that already explained itself, and trains hosts to ignore it.

So the predicate needs a third input beyond _called_ and _no receipt_: whether the call **accounted for** its outcome. `controller/unappliedEdit.ts` holds all three — `calledEditTool`, `editToolAccountedForEdit`, `isUnappliedEdit` — as functions over steps and a receipt, not controller methods, because both finalize paths need them and neither owns the other.

Accounting has two forms, and reading them took the loop's shape rather than the tool's. Landed operations count, including a partial apply, since the user can see and undo what arrived and the model is told what to retry (EC5). A refusal counts, whether it arrives as `{ ok: false }` or as an errored step. But the two are recorded in **different places**: a refusal is written back onto the `tool-call` step and the pass continues, while only a call that got past the refusal checks ever pushes a `tool-result`. Reading the `tool-result` step alone — the obvious implementation — sees no refusals at all and reports every one of them as a lost edit. The predicate reads any step naming the tool.

Staged suggestions are also an accounting: they are an outcome the host can act on, so a non-zero suggestion count is not a lost edit even with a `noop` receipt.

Both finalize paths now consult the report. `controller/localOperationExecutionFinalize.ts`, which this section noted "never consults the report at all", gained the same `EDIT_NOT_APPLIED_REASON` status the generation path uses.

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
- `planValidation` — the plan schema validator, shipped 2026-08-26. Deleted outright rather than "once the executor is extracted", because the executor was deleted too.
- `planExecutor` — the plan-to-ops compiler, shipped 2026-08-26. Listed here rather than extracted (see §1): its consumers were gated on a `planState` no producer wrote.
- `reviewArtifacts` and the structural-review-item surface — shipped 2026-08-26. `StructuralReviewItem`, `StructuralReviewComparisonRow`, `acceptReviewItem(s)` / `rejectReviewItem(s)`, the `reviewItems` / `reviewItemIds` / `pendingReviewItemIds` state, and the React and playground UI that rendered them. A plan was their only producer, so they became a second review presentation that could never be shown. The live review surface is the suggestion one (RS1–RS4).
- `AIApplyStrategy` and `AI_APPLY_STRATEGIES` — the strategy vocabulary, shipped 2026-08-26. Replaced by `editsArriveAsToolCalls` rather than folded into mutation preference (see §2): it was derived from the lane, target, and content format the router had already chosen, and every consumer read it as one bit.
- `ephemeral-preview` on `AIMutationMode`, `app` on `AI_BLOCK_CLASSES`, `app-structured` on `AI_TRANSPORT_KINDS`, and `"staged_review"` on `AIMutationReceiptStatus` — shipped 2026-08-26. Four declared members no input produces, found by GATE 3.6's property test rather than by grep.
- `confidence`, `verificationFailureReason`, and `untouchedBlockMutationCount` on the commit debug state — shipped 2026-08-26. Writer-less fields, the last two being the XML channel's diff-verification telemetry.
- The `fast-apply` naming — shipped 2026-08-26. `FastApplyDebugState`, `FastApplyFallbackMetrics`, `AISessionFastApplyMetrics`, `AIDebugLogFastApplyMetrics`, `debug.fastApply`, `metrics.fastApply`, `nativeFastApplyCount`, the `native-fast-apply` execution path, `controller/fastApplySupportMethods.ts`, and the `ai-markdown-fast-apply` telemetry surfaces. Renamed onto `commit`, not deleted; the release note carries the wire-visible surface names.
- `getBlockRevision` — the second staleness authority, deleted from edit gating and tool payloads in favor of working-set fingerprints.
