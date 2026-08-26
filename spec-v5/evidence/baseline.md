# v5 Wave 0: Baseline

Recorded 2026-08-26 against `feature/pen-v0.2` at `f664d3f`, after Wave 1 (`bdcf4ec`) and the out-of-order first half of Wave 3's UC3. Every number below names the command that produced it. Regenerate rather than trust.

This document is the before-number for every later wave and the docket for two of them: the route reachability map is UC5's work order (Wave 3), and the frame authority list is FE3/FE4's adjudication list (Wave 4).

## Instrument State At Entry

Two instruments were red when the train started, both from drift that predates v5. Both were closed in this wave rather than recorded as known-red, because a baseline taken under a red instrument measures two things (WA7).

| Instrument          | State at entry                                             | Closed by                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-docs-coverage` | FAIL — 1810 undocumented vs ratchet 1775 (+35)             | TSDoc for three complete public surfaces: `@input/pen-vue` (15), `@input/pen-history` (12), `@input/pen-shortcuts` (8). Count returned to 1775; `MAX_UNDOCUMENTED` was **not** raised.                                                             |
| `size-limit`        | FAIL — `@input/pen-document-ops` 81629 B > 78171 B ceiling | Re-recorded 71065 → 81629 with a Wave-named note. Inherited drift: the package's own source moved 4 lines since the previous record, but `@input/pen-core` is not external in its tsup config and core drifted 405550 → 429672 over the same span. |

`pnpm check:instruments` — 17 of 17 ok at wave close. `pnpm lint` — 0 errors, 1478 warnings (warnings are the tree's standing state, not this wave's).

### Unclaimed v5 rules at wave 0

`node scripts/coverage-rules.mjs` — population 71 spec files (`spec` + `spec-v5`), 763 test files, 49 derived families. All four v5 families are derived and reporting. **30 v5 rules are unclaimed:**

```text
UC1 UC2 UC3 UC4 UC5 UC6 UC7 UC8 UC9
RS1 RS2 RS3 RS4 RS5 RS6
FE1 FE2 FE3 FE4 FE5 FE6 FE7 FE8
HB1 HB2 HB3 HB4 HB5 HB6 HB7
```

This list is the reference GATE 3.16 and GATE 5.14 measure against: the reported set must shrink monotonically per wave and be empty at train close. UC3 already appears under "claims outside claimed-scope" because `uc3.planReachability.test.ts` names it while `UC` is not yet in `scripts/claimed-scope.txt` — the expected posture, per `README.md`: families join claimed scope with their claiming tests, not at authoring time.

The 35 undocumented symbols were not a v5 regression: `packages/rendering/vue/api-report.md` was added by `7bb65fb`, which brought the whole Vue public surface into the ratchet's population for the first time. That the fix is exactly the Vue binding is convenient rather than accidental — HB1 wants Vue's column honest, and an undocumented public surface cannot be declared.

## Test counts

`pnpm --filter <pkg> test` per package, 2026-08-26.

| Package                   | Test files | Tests | Notes                                                                                                            |
| ------------------------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| `@input/pen-ai`           | 105        | 499   | GATE 0.4                                                                                                         |
| `@input/pen-document-ops` | 13         | 110   | GATE 0.4                                                                                                         |
| `@input/pen-dom`          | 92         | 494   | GATE 0.4                                                                                                         |
| `@input/pen-core`         | 102        | 658   | GATE 0.4                                                                                                         |
| `@input/pen-react`        | 150        | 492   | Wave 2 and Wave 5 re-measure                                                                                     |
| `@input/pen-vue`          | 15         | 65    | HB1 baseline                                                                                                     |
| `@input/pen-bench`        | 14         | 155   | Wave 4 perf net                                                                                                  |
| `@input/pen-conformance`  | —          | 84    | `node --test src/hosts/*.test.js`; Playwright specs are a separate population, as the suite asserts about itself |

All green. Two sandbox caveats worth recording so a later wave does not misread a red:

- Three `@input/pen-bench` tests (`anchors.pg1`, two in `checkDrift`) spawn a CLI subprocess and fail under a restricted sandbox with a `node:net` error rather than an assertion. They pass unsandboxed. A bench failure whose message is not an `AssertionError` is an environment artifact, not a regression.
- `@input/pen-conformance`'s `test` script is the Node host suite only. The Playwright scenarios (including `sch-typing-budget.record.spec.ts`, which Wave 4 rewires) run under `pnpm test:e2e` / `test:matrix`.

## Channel corpus results

The regression net for Waves 1–3. Both gates green.

| Gate     | File                                           | Files | Tests | What it pins                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GATE 0.6 | `src/__tests__/editChannel.bench.test.ts`      | 1     | 1     | The tool channel over the 11-prompt corpus (`p1`–`p11`) plus the off-contract control, in one assertion over the whole row set                                                                                                 |
| GATE 0.7 | `src/__tests__/editChannel.comparison.test.ts` | 1     | 3     | EC6 twice (off-contract assistant text changes the document zero times; the tool channel refuses the same output and changes nothing) and EC5 once (a refused call hands back the ids needed to retry, and the retry succeeds) |

Per-row metrics (`wallMs`, `firstFeedbackMs`, `documentChanged`, `postconditionReason`, refusal counts) are computed inside the bench and asserted there rather than printed. `BenchChannel` is now the single-member union `"tool"` — the comparison the harness was built to run has one side left, which is what Wave 1 winning looks like. Waves 2 and 3 re-run both files as exit gates (GATE 2.10, GATE 3.14); RS6 reads the fidelity assertions out of the same harness.

## Route reachability map

UC5's work order. For each union member in `packages/extensions/ai/src/runtime/contracts.ts`, the production consumers that name it, measured by string-literal census over `packages/extensions/ai/src` and `packages/extensions/document-ops/src`, excluding `__tests__`, `*.test.ts`, `contracts.ts` itself, and `fixtures/`.

Fourteen unions, not the fifteen recorded at adoption: `plannerMode` left with the planner on 2026-08-26.

**Read the negatives, not the positives.** `UNREACHED` is strong evidence — the literal appears nowhere in production source. A `reached` row for a short generic literal (`"text"`, `"markdown"`, `"review"`, `"table"`, `"flow"`, `"app"`, `"direct"`, `"suggestions"`) is weak: those strings occur in unrelated positions, so Wave 3 must confirm per member before keeping one on this evidence alone.

| Union                  | Member                   | Reached by                                                                                              |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `AIRouteLane`          | `selection-rewrite`      | `runtime/router.ts`, `runtime/mutationPolicy.ts`, 3 controller modules                                  |
| `AIRouteLane`          | `cursor-context`         | `runtime/router.ts`, 6 controller modules                                                               |
| `AIRouteLane`          | `tool-loop`              | `runtime/router.ts`, `runtime/mutationPolicy.ts`, `controller/localOperationExecution.ts`               |
| `AIRouteLane`          | `review`                 | 10 modules (generic literal — confirm)                                                                  |
| `AIMutationMode`       | `ephemeral-preview`      | `runtime/mutationPolicy.ts` only — single producer                                                      |
| `AIMutationMode`       | `direct-stream`          | `runtime/mutationPolicy.ts`, `runtime/generationTarget.ts`, 2 controller modules                        |
| `AIMutationMode`       | `persistent-suggestions` | 6 modules                                                                                               |
| `AIMutationMode`       | `streaming-suggestions`  | 6 modules                                                                                               |
| `AIMutationMode`       | `staged-review`          | 5 modules                                                                                               |
| `AIMutationPreference` | `suggestions`            | `extension.ts`, `egress.ts`, `suggestions/aiEgress.ts`, `types/session.ts`                              |
| `AIMutationPreference` | `direct`                 | `types/session.ts`, `runtime/mutationPolicy.ts`                                                         |
| `PromptIntent`         | `rewrite`                | `runtime/router.ts`, `helpers/operations.ts`, `helpers/types.ts`                                        |
| `PromptIntent`         | `continue`               | `runtime/router.ts`, `helpers/operations.ts`                                                            |
| `PromptIntent`         | `local-edit`             | `runtime/router.ts`, `helpers/operations.ts`                                                            |
| `PromptIntent`         | `structural`             | `runtime/router.ts`, `helpers/operations.ts`                                                            |
| `PromptIntent`         | `search`                 | `runtime/router.ts`, `helpers/operations.ts`                                                            |
| `PromptIntent`         | `review`                 | 10 modules (generic literal — confirm)                                                                  |
| `PromptIntent`         | `question`               | `runtime/router.ts`, `controller/generationExecutionLoop.ts` — UC8's subject                            |
| `PromptIntent`         | `unknown`                | `runtime/router.ts`, `agentic/loop.ts`, `runtime/flowMarkdown.ts`, `autocomplete/providers/builtins.ts` |
| `AIContentFormat`      | `text`                   | 33 modules (generic literal)                                                                            |
| `AIContentFormat`      | `markdown`               | 19 modules (generic literal)                                                                            |
| `AIApplyStrategy`      | `text-fast-apply`        | `runtime/router.ts` only — single producer; UC5 renames                                                 |
| `AIApplyStrategy`      | `markdown-full-replace`  | `runtime/router.ts`, 3 controller modules; UC5 renames                                                  |
| `AIApplyStrategy`      | `tool-edit`              | `runtime/router.ts`, `agentic/loop.ts`, 3 more                                                          |
| `AIWorkingSetViewMode` | `raw`                    | 7 modules, mostly document-ops read tools                                                               |
| `AIWorkingSetViewMode` | `resolved`               | 15 modules                                                                                              |
| `AIStructuredLane`     | `block-structure`        | **UNREACHED**                                                                                           |
| `AIStructuredLane`     | `table`                  | 12 modules (generic literal — confirm)                                                                  |
| `AIStructuredLane`     | `review`                 | 10 modules (generic literal — confirm)                                                                  |
| `AIExecutionMode`      | `direct-stream`          | 4 modules                                                                                               |
| `AIExecutionMode`      | `persistent-suggestions` | 6 modules                                                                                               |
| `AIExecutionMode`      | `staged-review`          | 5 modules                                                                                               |
| `AITargetKind`         | `text`                   | 33 modules (generic literal)                                                                            |
| `AITargetKind`         | `block`                  | 37 modules (generic literal)                                                                            |
| `AITargetKind`         | `table`                  | 12 modules (generic literal)                                                                            |
| `AIBlockClass`         | `flow`                   | 5 modules                                                                                               |
| `AIBlockClass`         | `app`                    | 4 modules                                                                                               |
| `AIBlockAdapterId`     | `flow-markdown`          | `runtime/blockAdapters.ts` + 5 — the only adapter id                                                    |
| `AITransportKind`      | `flow-text`              | `runtime/blockAdapters.ts` + 5                                                                          |
| `AITransportKind`      | `app-structured`         | **UNREACHED**                                                                                           |
| `AIQualityMetricId`    | all 8 members            | **UNREACHED** — no member of this union has a production consumer                                       |

### What the map decides

Three findings Wave 3 inherits as work rather than opinion:

1. **`AIQualityMetricId` is a union with no production consumer at all** — eight members, zero producers. `AI_QUALITY_METRIC_IDS` is not exported from `contracts.ts`; the type is. UC5's rule ("every union member must have a production consumer or it is deleted") deletes the union, not members of it.
2. **`AITransportKind.app-structured` is unreached, which is the same fact `uc3.planReachability.test.ts` proves from the other side.** Every registered block adapter carries `transportKind: "flow-text"`, so `useStructuredIntentTransport` can never be true. This is the evidence under Wave 2's GATE 2.5b: the structured-preview surface has no reachable producer.
3. **`AIStructuredLane.block-structure` is unreached**, leaving that union at two live members, both of which are generic literals needing per-member confirmation.

`AIApplyStrategy` has all three members reached, so UC5's treatment of it is a rename plus a fold into mutation preference, not a deletion for unreachability. `text-fast-apply` has exactly one producer (`resolveApplyStrategy` in `runtime/router.ts`), which is the whole surface a rename has to move.

## Presentation inventory

Wave 2's migration checklist. Six mechanisms were recorded at adoption (`00-concept.md` fact 5); fact 13 corrected that to five live plus one producer-less. Measured 2026-08-26.

| #   | Surface                         | Entry point                                                                                                                                                      | Signature                                                                                                                                                                                              | RS1 verdict                                              |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | Visible stream                  | `stream/streamingTarget.ts` (148 lines), via `editor.openTextStream`                                                                                             | No decoration — document text itself, written as it arrives                                                                                                                                            | **Kept** (RS1a)                                          |
| 2   | Autocomplete ghost              | `autocomplete.ts` barrel → `autocomplete/` subpath                                                                                                               | Inline overlay, keystroke-gated; not a proposed document edit                                                                                                                                          | **Kept** (RS1b)                                          |
| 3   | Tool-edit review surface        | `review/reviewPresentation.ts` (96 lines)                                                                                                                        | `suggestionDecorations.ts` (194) + `streamingPreviewDecorations.ts` (359) + `streamingPreviewDeleteDecorations.ts` (63) + `streamingPreviewVirtualDecorations.ts` (83) + `contextDecorations.ts` (160) | **Kept** (RS1c) — the target the others collapse onto    |
| 4   | Selection-rewrite decorations   | `suggestions/decorations.ts`, `suggestions/replacementPlan/`                                                                                                     | Own decoration stack and lifecycle                                                                                                                                                                     | **Migrates** onto #3 (RS2)                               |
| 5   | Buffered markdown block preview | `controller/bufferedBlockGenerationMethods.ts` (171 lines)                                                                                                       | Buffers a whole markdown block, renders, then stages                                                                                                                                                   | **Migrates** onto #3 as streaming preview blocks (RS2)   |
| 6   | Structured target preview       | `runtime/structuredPreview.ts` (379 lines); last producer `onStructuredData` in `controller/generationExecutionLoop.ts`, gated on `useStructuredIntentTransport` | `data-structured-preview-*` on `Pen.AI.Progress`; react: `hooks/useAIStructuredPreview.ts`, `primitives/ai/structuredTargetPreview.tsx`, `utils/structuredPreview.ts`                                  | **Deleted** — producer-less (see reachability finding 2) |

`structuredPreview` is referenced from 11 `@input/pen-ai` production modules and 9 `@input/pen-react` modules including `primitives/ai/progress.tsx`, `primitives/ai/changeList.tsx`, and `primitives/editor/content.tsx`. Wave 2's deletion is wider than the four files the wave file names; the `structuredPreview` field on session and generation state is what pulls the rest in.

### Styling seam

RS4's subject, measured: `review/reviewPresentationStyles.ts` is 22 lines of **inline-style strings**, not classes — `AI_REVIEW_INSERT_STYLE` and friends are `;`-joined CSS declaration lists built on `var(--pen-ai-review-*, <fallback>)`. So the custom-property seam already exists, but it is reachable only through inline `style` attributes, which is why hosts re-implement rule blocks instead of theming. Four constant sites consume it (`suggestionDecorations.ts`, `streamingPreviewVirtualDecorations.ts`, `streamingPreviewDeleteDecorations.ts`, `contextDecorations.ts`), and `playground/src/editor/editor.css` (787 lines) hand-writes its own review rules on top.

## Frame authority list

Wave 4's adjudication docket. Measured 2026-08-26.

`rg -n "requestAnimationFrame" packages/rendering/dom/src --glob '!scheduler.ts' --glob '!**/__tests__/**'`

| Site                                            | Line | Adjudication owed (FE3)                                                                                    |
| ----------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `field-editor/contentGestures.ts`               | 182  | Real next-paint scheduling, or an S4-fenced retry                                                          |
| `field-editor/contentGestures.ts`               | 244  | Real next-paint scheduling, or an S4-fenced retry                                                          |
| `field-editor/contentGestures.ts`               | 1113 | `requestAnimationFrame(completePointerSelection)` — the S4 question in its plainest form                   |
| `field-editor/inlineAtomWrapperInteractions.ts` | 334  | Stores its handle on `session.animationFrameId`, so this one is cancellable and looks like real scheduling |

The scheduler's own site is `scheduler.ts:174` (`globalThis.requestAnimationFrame`). Note one raf pair outside `@input/pen-dom` entirely: `controller/decorationControllerMethods.ts:69,77` in `@input/pen-ai` schedules and cancels `_streamingPreviewRaf`. FE3's grep is scoped to `packages/rendering/dom/src`, so that pair is out of the rule's population — recorded here so Wave 4 does not discover it and assume scope creep.

### `acceptCommit` caller census

`DomScheduler.acceptCommit` is declared at `scheduler.ts:90`. Production callers: **zero**.

| Caller                                                                    | Kind                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `packages/tooling/conformance/harness/src/geometry.ts:170`                | Harness — feeds commits the production path does not |
| `packages/rendering/dom/src/__tests__/scheduler.i9.test.ts`               | Test (6 call sites)                                  |
| `packages/rendering/dom/src/__tests__/geometry.g2.test.ts:135`            | Test                                                 |
| `packages/tooling/conformance/scenarios/sch-typing-budget.record.spec.ts` | Scenario, which annotates the gap in its own strings |

The scenario's recorded wiring string is the honest statement of the FE4 debt, quoted so the wave can delete it verbatim: `"harness-fed commits only: editor.on('commit') → acceptCommit. DomScheduler is not on the production apply path (Wave 2 still open). Unwired observation is the real typing path today."`

GATE 4.4 inverts this census: it expects a production caller to exist.

## Surface sizes

`rg --files <pkg>/src -g '*.ts' -g '*.tsx' -g '!**/__tests__/**' -g '!*.test.ts' -g '!*.test.tsx' | while read f; do wc -l "$f"; done | awk '{s+=$1; n++} END{print s, n}'`

| Package            | Lines  | Files | At adoption  |
| ------------------ | ------ | ----- | ------------ |
| `@input/pen-ai`    | 30,796 | 162   | 33,017 / 169 |
| `@input/pen-dom`   | 27,999 | 149   | 27,999 / 149 |
| `@input/pen-react` | 19,727 | 197   | 19,727 / 197 |
| `@input/pen-vue`   | 2,128  | 20    | 2,037 / 20   |
| `@input/pen-core`  | 21,962 | 125   | not recorded |
| `@input/pen-types` | 3,890  | 42    | not recorded |

`@input/pen-ai` is already 2,221 lines and 7 files below its adoption figure — that is Wave 1 plus UC3's first half, measured. The react/vue spread is 9.3× (was 9.7×); the vue rise is this wave's TSDoc, so the ratio moved without any behavior moving. HB2 re-measures react after Wave 2 deletes the AI surface it mirrors.

### Hotspot files

| File                                                         | Lines | At adoption  |
| ------------------------------------------------------------ | ----- | ------------ |
| `pen-dom/src/field-editor/contentGestures.ts`                | 1,143 | 1,143        |
| `document-ops/src/tools/editDocument.ts`                     | 856   | 856          |
| `pen-ai/src/agentic/loop.ts`                                 | 737   | 737          |
| `pen-ai/src/extension.ts`                                    | 735   | 747          |
| `pen-dom/src/field-editor/selectionBridgeOffsets.ts`         | 561   | 561          |
| `pen-dom/src/field-editor/expandedContentEditableBackend.ts` | 460   | 460          |
| `pen-ai/src/controller/aiControllerMethodHost.ts`            | 425   | 474          |
| `pen-ai/src/runtime/router.ts`                               | 405   | 551          |
| `pen-dom/src/scheduler.ts`                                   | 305   | not recorded |

`applyPipelineRunner.ts` is at `packages/core/src/editor/applyPipelineRunner.ts`, not the `pipeline/` path recorded at adoption. The router is already 146 lines below adoption (the `plannerMode` fold); UC5's job is what remains.

### Wave 3's remaining planner surface

| Module                            | Lines | Files | Status                                                                          |
| --------------------------------- | ----- | ----- | ------------------------------------------------------------------------------- |
| `runtime/structuredPlanner/`      | 0     | 0     | Deleted 2026-08-26                                                              |
| `runtime/planExecutor/` + entry   | 1,318 | 8     | Survives; UC3 step 2 extracts it under a non-planner name                       |
| `runtime/planValidation/` + entry | 856   | 4     | Survives; UC3 step 3 deletes it after the extraction                            |
| Their tests                       | 1,331 | 6     | `planExecutor.part1-3`, `planExecutor.test`, `testUtils`, `planValidation.test` |

Both survivors are reachable only from `controller/reviewResolutionMethods.ts` and `controller/generationExecutionFinalize.ts`, which import `buildDocumentMutationPlanExecution` to resolve already-staged review items. Nothing can hand them a plan from a text stream.

### API reports and budgets

`node scripts/api-reports.mjs` — 24 published manifests, report drift 0, missing `.d.ts` 0, outdated dist 0.

`node scripts/api-docs-coverage.mjs` — 1978 public symbols, 203 documented, 1775 undocumented, ratchet 1775, glob surfaces expanded 0.

`node scripts/size-limit.mjs` — 24 packages within +10%; every note names a Wave. The four entries closest to their ceiling, which later waves should watch:

| Package                   | Bytes   | Budget  | +10% ceiling | Headroom              |
| ------------------------- | ------- | ------- | ------------ | --------------------- |
| `@input/pen-vue`          | 1,153   | 1,054   | 1,159        | 6 B                   |
| `@input/pen-document-ops` | 81,629  | 81,629  | 89,791       | re-recorded this wave |
| `@input/pen-core`         | 429,672 | 405,550 | 446,105      | 16,433 B              |
| `@input/pen-ai`           | 597,428 | 607,722 | 668,494      | under budget          |

`@input/pen-vue` has 6 bytes of headroom on a 1,153-byte bundle. Its `index.mjs` only re-exports from a content-hashed chunk, so the measured entry is a barrel, not the package — a single added export can fail this budget. TSDoc does not count: comments are stripped from the bundle, verified on this wave's own change. Waves 1–3 are expected to shrink `@input/pen-ai`; it already sits 10,294 B under budget.

## After the train

_Wave 5 fills this in (GATE 5.10): package and hotspot line counts after the train, the react binding's size after the AI teardown, the final route-vocabulary census, and the presentation inventory at three surfaces, each recorded next to its baseline above._
