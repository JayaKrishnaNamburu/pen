---
"@input/pen-ai": minor
"@input/pen-react": minor
---

Delete the document-mutation-plan subsystem and the structural-review-item surface it fed (v5 wave 3, UC3/GATE 3.3/GATE 3.4/GATE 3.5).

The plan channel had already lost its producer. Nothing wrote `GenerationState.plan`, nothing set `planState` to `"validated"`, and nothing put an entry in `reviewItems` — so every path that read them was unreachable, including the plan executor, the plan validator, and the review-item accept/reject family. `acceptReviewItem`, `rejectReviewItem`, `acceptReviewItems`, and `rejectReviewItems` returned `false` on every call, and the change-list UI that rendered structural review items could not render one.

Removed from `@input/pen-ai`: the four review-item controller methods; `StructuralReviewItem`, `StructuralReviewComparisonRow`, `DocumentMutationPlan`, `DocumentMutationPlanKind`, `GenerationPlanState`, `FlowPatchAlignmentMetrics`, and the four `PlanValidation*` types; `DOCUMENT_MUTATION_PLAN_KINDS`, `PLAN_VALIDATION_SEVERITIES`, `isDocumentMutationPlan`, and `validateDocumentMutationPlanShape`; the `plan`, `planState`, and `reviewItems` fields on generation state; `reviewItemIds` on session turns and `pendingReviewItemIds` on sessions; and the `alignment` field on fast-apply debug state.

Removed from `@input/pen-react`: the four review-item actions on `useAIActions`, `pendingReviewItemCount` on `AIDebugLogState`, the `StructuralReviewItem` and `StructuralReviewComparisonRow` type re-exports, and the structural-review group tree inside `Pen.AI.ChangeList` along with its `data-review-item-count` attribute.

`Pen.AI.ChangeList` also loses its keyboard navigation — roving focus, arrow/Home/End movement, and the `a`/`r` accept and reject keys — because only the review groups ever registered focus targets; suggestion rows never did, so the navigation had nothing to move between. Suggestion rows, their accept and reject buttons, and `data-suggestion-count` are unchanged, and the suggestion review flow is unaffected.

Hosts that called the review-item methods should use the suggestion equivalents: `acceptSuggestion`, `rejectSuggestion`, `acceptAllSuggestions`, and `rejectAllSuggestions`. Staged AI edits have arrived as suggestions on every reachable lane, so there is no behavior to port — only names.
